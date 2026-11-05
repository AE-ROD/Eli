import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, centavos, datosBase, pago, pedido, propina, sesiones } from "@/pruebas/datos"
import { atencionBloqueada } from "@/lib/bloqueos-de-dinero"
import { MENSAJE_CAJA_CAMBIO, MENSAJE_NOTA_OBLIGATORIA } from "@/lib/caja"

/**
 * Cierre de caja (#71): cada cierre cubre (fin del anterior, ahora], sin
 * hueco ni solape. Lo cierran dueña y encargado; el profesional, 401.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Santiago en octubre de 2026 es UTC-3: el día 20 empieza a las 03:00Z. */
const INICIO_DEL_DIA = "2026-10-20T03:00:00.000Z"
const AHORA = new Date("2026-10-20T20:00:00.000Z")
const URL = "http://localhost/api/caja"

function escenario() {
  base.reiniciar({
    ...datosBase(),
    visit: [
      atencion("v-hoy", { status: "finalizada", paidAt: new Date("2026-10-20T13:00:00.000Z"), totalCents: centavos(13000) }),
      atencion("v-anulada", {
        status: "anulada",
        paidAt: new Date("2026-10-20T14:00:00.000Z"),
        voidedAt: new Date("2026-10-20T15:00:00.000Z"),
      }),
      atencion("v-ayer", { status: "finalizada", paidAt: new Date("2026-10-20T02:00:00.000Z"), totalCents: centavos(4000) }),
      atencion("v-abierta", { status: "por-cobrar" }),
      atencion("v-ajena", {
        businessId: OTRO_NEGOCIO,
        customerId: "c-ajeno",
        status: "finalizada",
        paidAt: new Date("2026-10-20T13:00:00.000Z"),
      }),
    ],
    visitPayment: [
      pago("p-1", "v-hoy", "efectivo", 8000),
      pago("p-2", "v-hoy", "tarjeta-debito", 5000),
      pago("p-3", "v-anulada", "efectivo", 3000),
      pago("p-4", "v-ayer", "efectivo", 4000),
      pago("p-5", "v-ajena", "efectivo", 9999),
    ],
    propinaDeAtencion: [
      propina("t-1", "v-hoy"),
      propina("t-2", "v-hoy", { method: "transferencia", amountCents: centavos(1000) }),
      propina("t-3", "v-anulada"),
      propina("t-ajena", "v-ajena", { businessId: OTRO_NEGOCIO, memberId: "m-ajeno" }),
    ],
    cierreDeCaja: [
      {
        id: "cierre-ajeno",
        businessId: OTRO_NEGOCIO,
        desde: new Date("2026-10-20T03:00:00.000Z"),
        hasta: new Date("2026-10-20T19:00:00.000Z"),
        fecha: new Date("2026-10-20"),
        zona: "America/Santiago",
        fondoInicialCents: 0,
        efectivoCobradoCents: 999_900,
        propinasEfectivoCents: 0,
        efectivoEsperadoCents: 999_900,
        efectivoContadoCents: 999_900,
        diferenciaCents: 0,
        cerradoPorId: "u-otro",
        cerradoPorNombre: "Otro Dueño",
      },
    ],
  })
}

async function leer(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(URL))
}

async function cerrar(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, cuerpo))
}

const cierresDelNegocio = () => base.buscar("cierreDeCaja", { businessId: NEGOCIO })

describe("/api/caja", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(AHORA)
    escenario()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("quién", () => {
    it.each([
      ["un profesional", sesiones.carla],
      ["un profesional sin miembro", sesiones.sinMiembro],
      ["sin sesión", null],
    ])("%s: 401 al leer y al cerrar, sin escribir nada", async (_quien, sesion) => {
      const antes = base.volcado()
      expect((await leer(sesion)).status).toBe(401)
      expect((await cerrar(sesion, { desde: INICIO_DEL_DIA, fondoInicial: 0, contado: 0 })).status).toBe(401)
      expect(base.volcado()).toEqual(antes)
    })

    it("un cierre no se edita ni se borra: la ruta sólo tiene GET y POST", async () => {
      const ruta = await import("./route")
      expect(Object.keys(ruta).filter((clave) => /^[A-Z]+$/.test(clave)).sort()).toEqual(["GET", "POST"])
    })
  })

  describe("GET", () => {
    it("la caja abierta: desde el inicio del día, sólo lo cobrado y no anulado del negocio", async () => {
      const res = await leer(sesiones.encargado)
      expect(res.status).toBe(200)
      const cuerpo = await res.json()
      expect(cuerpo.puedeCerrar).toBe(true)
      expect(cuerpo.abierta).toEqual({
        desde: INICIO_DEL_DIA,
        hasta: AHORA.toISOString(),
        efectivoCobrado: 8000,
        propinasEfectivo: 2000,
        desglose: {
          otrosMedios: [{ medio: "tarjeta-debito", nombre: "Tarjeta de débito", monto: 5000 }],
          propinasOtrosMedios: [{ medio: "transferencia", nombre: "Transferencia", monto: 1000 }],
        },
        cobrosDesde: null,
      })
      // El cierre del otro negocio no aparece.
      expect(cuerpo.cierres).toEqual([])
    })

    describe("aviso de días sin cerrar (#120)", () => {
      /** Un cierre anterior de este negocio que terminó en `hasta`. */
      const cerradoHasta = (hasta: string) =>
        base.prisma.cierreDeCaja.create({
          data: {
            businessId: NEGOCIO,
            desde: new Date("2026-10-17T03:00:00.000Z"),
            hasta: new Date(hasta),
            fecha: new Date(hasta.slice(0, 10)),
            zona: "America/Santiago",
            fondoInicialCents: 0,
            efectivoCobradoCents: 0,
            propinasEfectivoCents: 0,
            efectivoEsperadoCents: 0,
            efectivoContadoCents: 0,
            diferenciaCents: 0,
            cerradoPorId: "u-duena",
            cerradoPorNombre: "Ana Dueña",
          },
        })

      it("si la caja arrastra cobros de días anteriores, dice desde cuál; el cálculo cubre todo igual", async () => {
        // Cerrada el 18 a las 20:00 (Santiago); `v-ayer` se cobró el 19 a las 23:00.
        await cerradoHasta("2026-10-18T23:00:00.000Z")
        const cuerpo = await (await leer(sesiones.dueña)).json()
        expect(cuerpo.abierta.cobrosDesde).toBe("2026-10-20T02:00:00.000Z")
        expect(cuerpo.abierta.desde).toBe("2026-10-18T23:00:00.000Z")
        expect(cuerpo.abierta.efectivoCobrado).toBe(12000)
      })

      it("quien cierra de noche y no vende hasta el otro día no recibe aviso", async () => {
        // Cerrada el 19 a las 23:30, después de `v-ayer`: lo abierto es sólo de hoy.
        await cerradoHasta("2026-10-20T02:30:00.000Z")
        const cuerpo = await (await leer(sesiones.dueña)).json()
        expect(cuerpo.abierta.cobrosDesde).toBeNull()
      })

      it("no cuentan los cobros anulados ni los de otro negocio", async () => {
        await cerradoHasta("2026-10-20T02:30:00.000Z")
        await base.prisma.visit.create({
          data: atencion("v-ajena-ayer", {
            businessId: OTRO_NEGOCIO,
            customerId: "c-ajeno",
            status: "finalizada",
            paidAt: new Date("2026-10-20T02:45:00.000Z"),
          }),
        })
        await base.prisma.visit.create({
          data: atencion("v-anulada-ayer", {
            status: "anulada",
            paidAt: new Date("2026-10-20T02:50:00.000Z"),
            voidedAt: new Date("2026-10-20T13:00:00.000Z"),
          }),
        })
        const cuerpo = await (await leer(sesiones.dueña)).json()
        expect(cuerpo.abierta.cobrosDesde).toBeNull()
      })
    })
  })

  describe("POST", () => {
    it("cierra con esperado = fondo + efectivo + propinas en efectivo y diferencia 0", async () => {
      const res = await cerrar(sesiones.dueña, { desde: INICIO_DEL_DIA, fondoInicial: 10000, contado: 20000 })
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({
        desde: INICIO_DEL_DIA,
        hasta: AHORA.toISOString(),
        fecha: "2026-10-20",
        fondoInicial: 10000,
        efectivoCobrado: 8000,
        propinasEfectivo: 2000,
        esperado: 20000,
        contado: 20000,
        diferencia: 0,
        nota: null,
        cerradoPor: "Ana Dueña",
      })
      const [guardado] = cierresDelNegocio()
      expect(guardado).toMatchObject({
        efectivoEsperadoCents: centavos(20000),
        diferenciaCents: 0,
        zona: "America/Santiago",
        desglose: { otrosMedios: { "tarjeta-debito": centavos(5000) }, propinasOtrosMedios: { transferencia: centavos(1000) } },
      })
    })

    it("pide el candado del negocio dentro de la transacción", async () => {
      await cerrar(sesiones.dueña, { desde: INICIO_DEL_DIA, fondoInicial: 10000, contado: 20000 })
      expect(base.prisma.$transaction).toHaveBeenCalledTimes(1)
      const [partes, ...valores] = base.prisma.$executeRaw.mock.calls[0]
      // Exclusivo, con la misma clave que cobrar y anular toman compartida.
      expect(partes.join("?")).toBe("SELECT pg_advisory_xact_lock(hashtext(?))")
      expect(valores).toEqual([`caja:${NEGOCIO}`])
    })

    it("el hasta es la hora de la base, leída después del candado, no la de esta instancia", async () => {
      // Esta instancia atrasa: la base dice 20:00:07Z y el proceso, 20:00Z.
      const deLaBase = new Date("2026-10-20T20:00:07.000Z")
      base.prisma.$queryRaw.mockImplementationOnce(async () => [{ ahora: deLaBase }])
      const res = await cerrar(sesiones.dueña, { desde: INICIO_DEL_DIA, fondoInicial: 10000, contado: 20000 })
      expect(res.status).toBe(201)
      expect((await res.json()).hasta).toBe(deLaBase.toISOString())
      expect(cierresDelNegocio()[0].hasta).toEqual(deLaBase)
      const [partes] = base.prisma.$queryRaw.mock.calls[0]
      expect(partes.join("?")).toBe("SELECT clock_timestamp() AS ahora")
      expect(base.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeGreaterThan(
        base.prisma.$executeRaw.mock.invocationCallOrder[0]
      )
    })

    it("con diferencia y sin nota: 400; con nota, se guarda", async () => {
      const sinNota = await cerrar(sesiones.encargado, { desde: INICIO_DEL_DIA, fondoInicial: 10000, contado: 19500 })
      expect(sinNota.status).toBe(400)
      expect((await sinNota.json()).error).toBe(MENSAJE_NOTA_OBLIGATORIA)
      expect(cierresDelNegocio()).toEqual([])

      const conNota = await cerrar(sesiones.encargado, {
        desde: INICIO_DEL_DIA,
        fondoInicial: 10000,
        contado: 19500,
        nota: "  Faltó vuelto  ",
      })
      expect(conNota.status).toBe(201)
      expect(await conNota.json()).toMatchObject({ diferencia: -500, nota: "Faltó vuelto", cerradoPor: "Bruno Encargado" })
    })

    it("dos cierres con el mismo período: el primero 201, el segundo 409", async () => {
      const cuerpo = { desde: INICIO_DEL_DIA, fondoInicial: 10000, contado: 20000 }
      expect((await cerrar(sesiones.dueña, cuerpo)).status).toBe(201)
      vi.setSystemTime(new Date(AHORA.getTime() + 1000))
      const segundo = await cerrar(sesiones.encargado, cuerpo)
      expect(segundo.status).toBe(409)
      expect((await segundo.json()).error).toBe(MENSAJE_CAJA_CAMBIO)
      expect(cierresDelNegocio()).toHaveLength(1)
    })

    it("un período que no es el vigente (visto antes de otro cierre) es 409", async () => {
      const res = await cerrar(sesiones.dueña, { desde: "2026-10-19T03:00:00.000Z", fondoInicial: 0, contado: 0 })
      expect(res.status).toBe(409)
    })

    it("dos cierres en el mismo instante: el único (negocio, hasta) responde 409", async () => {
      expect((await cerrar(sesiones.dueña, { desde: INICIO_DEL_DIA, fondoInicial: 10000, contado: 20000 })).status).toBe(201)
      // Mismo reloj: el siguiente período estaría vacío (desde = hasta).
      const res = await cerrar(sesiones.dueña, { desde: AHORA.toISOString(), fondoInicial: 0, contado: 0 })
      expect(res.status).toBe(409)
      expect(cierresDelNegocio()).toHaveLength(1)
    })

    it("cierres consecutivos sin hueco ni solape: un pago justo en el límite cae en uno solo", async () => {
      // Pagada exactamente en el instante del primer cierre: es de ese cierre.
      await base.prisma.visit.update({ where: { id: "v-abierta" }, data: { status: "finalizada", paidAt: AHORA } })
      await base.prisma.visitPayment.create({ data: { visitId: "v-abierta", method: "efectivo", amountCents: centavos(700) } })

      const primero = await cerrar(sesiones.dueña, { desde: INICIO_DEL_DIA, fondoInicial: 0, contado: 10700 })
      expect(primero.status).toBe(201)
      expect((await primero.json()).efectivoCobrado).toBe(8700)

      // Una hora después, un cobro nuevo.
      const despues = new Date(AHORA.getTime() + 60 * 60 * 1000)
      vi.setSystemTime(despues)
      await base.prisma.visit.create({
        data: {
          id: "v-tarde",
          businessId: NEGOCIO,
          customerName: "Beto",
          status: "finalizada",
          paidAt: new Date(AHORA.getTime() + 30 * 60 * 1000),
        },
      })
      await base.prisma.visitPayment.create({ data: { visitId: "v-tarde", method: "efectivo", amountCents: centavos(300) } })

      const abierta = (await (await leer(sesiones.dueña)).json()).abierta
      expect(abierta.desde).toBe(AHORA.toISOString())
      expect(abierta.efectivoCobrado).toBe(300)

      const segundo = await cerrar(sesiones.dueña, { desde: AHORA.toISOString(), fondoInicial: 0, contado: 300 })
      expect(segundo.status).toBe(201)
      expect(await segundo.json()).toMatchObject({ desde: AHORA.toISOString(), hasta: despues.toISOString(), efectivoCobrado: 300 })

      const cierres = cierresDelNegocio().sort((a, b) => (a.hasta as Date).getTime() - (b.hasta as Date).getTime())
      expect((cierres[1].desde as Date).getTime()).toBe((cierres[0].hasta as Date).getTime())

      // Y el historial los trae del más nuevo al más viejo.
      const lista = (await (await leer(sesiones.dueña)).json()).cierres
      expect(lista.map((c: { hasta: string }) => c.hasta)).toEqual([despues.toISOString(), AHORA.toISOString()])
    })

    it("una atención incluida en un cierre queda bloqueada (anularla da 409)", async () => {
      await cerrar(sesiones.dueña, { desde: INICIO_DEL_DIA, fondoInicial: 10000, contado: 20000 })
      expect(await atencionBloqueada(base.prisma as never, NEGOCIO, "v-hoy")).toEqual({ motivo: "caja" })
      expect(await atencionBloqueada(base.prisma as never, NEGOCIO, "v-ayer")).toBeNull()
    })

    it.each([
      ["fondo negativo", { desde: INICIO_DEL_DIA, fondoInicial: -1, contado: 0 }],
      ["tres decimales", { desde: INICIO_DEL_DIA, fondoInicial: 0, contado: 10.005 }],
      ["un texto", { desde: INICIO_DEL_DIA, fondoInicial: "10", contado: 0 }],
      ["sin desde", { fondoInicial: 0, contado: 0 }],
      ["sin contado", { desde: INICIO_DEL_DIA, fondoInicial: 0 }],
      ["nota de más de 500", { desde: INICIO_DEL_DIA, fondoInicial: 0, contado: 0, nota: "x".repeat(501) }],
      ["sin cuerpo", undefined],
    ])("%s: 400 y nada guardado", async (_caso, cuerpo) => {
      const res = await cerrar(sesiones.dueña, cuerpo)
      expect(res.status).toBe(400)
      expect(cierresDelNegocio()).toEqual([])
    })

    it("el dueño de otro negocio cierra su caja, sin nada de ésta", async () => {
      const res = await cerrar(sesiones.dueñoAjeno, {
        desde: "2026-10-20T19:00:00.000Z",
        fondoInicial: 0,
        contado: 0,
      })
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ efectivoCobrado: 0, propinasEfectivo: 0 })
      expect(cierresDelNegocio()).toEqual([])
    })
  })
})
