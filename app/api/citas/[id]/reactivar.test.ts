import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, conId, datosBase, linea, pedido, sesiones } from "@/pruebas/datos"
import {
  MENSAJE_CANCELADA_A_OTRO,
  MENSAJE_CANCELADA_PASADA,
  MENSAJE_CERRADA_A_OTRO,
  MENSAJE_CON_ATENCION,
  MENSAJE_EN_CAJA,
  MENSAJE_EN_LIQUIDACION,
  MENSAJE_SIN_PERMISO,
} from "@/lib/reactivar-cita"

/**
 * Reactivar una cita (sacarla de cancelada, completada o "no vino"): sólo
 * dueña y encargado. El profesional ya no puede, aunque la cita sea suya.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const PASADA = { startTime: new Date("2026-10-20T13:00:00.000Z"), endTime: new Date("2026-10-20T14:00:00.000Z") }
const FUTURA = { startTime: new Date("2099-10-20T13:00:00.000Z"), endTime: new Date("2099-10-20T14:00:00.000Z") }
const PAGADA_EN = new Date("2026-10-20T15:00:00.000Z")

const cita = (id: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  status: "pendiente",
  ...PASADA,
  ...datos,
})

const cancelada = { status: "cancelada", canceladaPor: "cliente", canceladaEn: new Date("2026-10-01T12:00:00.000Z") }

function escenario() {
  base.reiniciar({
    ...datosBase(),
    appointment: [
      cita("cancelada-futura", { ...FUTURA, ...cancelada }),
      cita("cancelada-pasada", cancelada),
      // Pedro tiene otra cita a la misma hora que ésta.
      cita("cancelada-con-choque", { ...FUTURA, ...cancelada, memberId: "m-pedro" }),
      cita("de-pedro-activa", { ...FUTURA, memberId: "m-pedro", status: "confirmada" }),
      cita("completada", { status: "completada" }),
      cita("no-vino", { status: "no-asistio" }),
      cita("cobrada", { status: "completada" }),
      cita("cobrada-y-anulada", { status: "completada" }),
      cita("en-caja", { status: "completada" }),
      cita("liquidada", { status: "completada" }),
      cita("pendiente"),
      { ...cita("ajena", { status: "cancelada", ...FUTURA }), businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno" },
    ],
    visit: [
      // Pagada después del cierre de caja: no la bloquea la caja.
      atencion("v-cobrada", { appointmentId: "cobrada", status: "finalizada", paidAt: new Date("2026-10-20T20:00:00.000Z"), totalCents: 800000 }),
      atencion("v-anulada", { appointmentId: "cobrada-y-anulada", status: "anulada", paidAt: PAGADA_EN }),
      atencion("v-en-caja", { appointmentId: "en-caja", status: "finalizada", paidAt: PAGADA_EN, totalCents: 800000 }),
      atencion("v-liquidada", { appointmentId: "liquidada", status: "finalizada", paidAt: new Date("2026-09-10T15:00:00.000Z"), totalCents: 800000 }),
    ],
    visitService: [
      linea("l-cobrada", "v-cobrada"),
      linea("l-en-caja", "v-en-caja"),
      linea("l-liquidada", "v-liquidada", { liquidacionId: "liq-1" }),
    ],
    liquidacion: [
      {
        id: "liq-1",
        businessId: NEGOCIO,
        memberId: "m-carla",
        memberName: "Carla Profesional",
        periodo: "mensual",
        desde: new Date("2026-09-01"),
        hasta: new Date("2026-09-30"),
        zona: "America/Santiago",
        estado: "cerrada",
        comisionServiciosCents: 0,
        comisionProductosCents: 0,
        propinasCents: 0,
        adelantosCents: 0,
        ajustesCents: 0,
        brutoCents: 0,
        totalCents: 0,
        cerradaPorId: "u-duena",
        cerradaPorNombre: "Ana Dueña",
      },
    ],
    cierreDeCaja: [
      {
        id: "cierre-1",
        businessId: NEGOCIO,
        desde: new Date("2026-10-20T03:00:00.000Z"),
        hasta: new Date("2026-10-20T18:00:00.000Z"),
        fecha: new Date("2026-10-20"),
        zona: "America/Santiago",
        fondoInicialCents: 0,
        efectivoCobradoCents: 800000,
        propinasEfectivoCents: 0,
        efectivoEsperadoCents: 800000,
        efectivoContadoCents: 800000,
        diferenciaCents: 0,
        cerradoPorId: "u-duena",
        cerradoPorNombre: "Ana Dueña",
      },
    ],
  })
}

async function cambiar(sesion: unknown, id: string, cuerpo: Record<string, unknown>) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(`http://localhost/api/citas/${id}`, cuerpo), conId(id))
}

const estadoDe = (id: string) => base.buscar("appointment", { id })[0]

describe("PUT /api/citas/[id] — reactivar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  describe("el profesional no saca una cita de un estado cerrado", () => {
    it.each(["cancelada-futura", "completada", "no-vino"])("%s: 401 y no cambia nada", async (id) => {
      const antes = base.volcado()
      const res = await cambiar(sesiones.carla, id, { status: "confirmada" })
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe(MENSAJE_SIN_PERMISO)
      expect(base.volcado()).toEqual(antes)
    })

    it("tampoco la pasa de completada a cancelada", async () => {
      const res = await cambiar(sesiones.carla, "completada", { status: "cancelada" })
      expect(res.status).toBe(401)
      expect(estadoDe("completada").status).toBe("completada")
    })

    it("sí sigue cancelando una cita suya pendiente", async () => {
      const res = await cambiar(sesiones.carla, "pendiente", { status: "cancelada" })
      expect(res.status).toBe(200)
      expect(estadoDe("pendiente").status).toBe("cancelada")
    })

    it("guardar el mismo estado no es reactivar", async () => {
      const res = await cambiar(sesiones.carla, "completada", { status: "completada" })
      expect(res.status).toBe(200)
    })
  })

  describe("cancelada", () => {
    it.each([
      ["la dueña", sesiones.dueña, "confirmada"],
      ["el encargado", sesiones.encargado, "pendiente"],
    ])("%s la reactiva si es futura, y se borra quién la canceló", async (_quien, sesion, estado) => {
      const res = await cambiar(sesion, "cancelada-futura", { status: estado })
      expect(res.status).toBe(200)
      const guardada = estadoDe("cancelada-futura")
      expect(guardada.status).toBe(estado)
      expect(guardada.canceladaPor).toBeNull()
      expect(guardada.canceladaEn).toBeNull()
    })

    it("pasada no se reactiva: 409", async () => {
      const res = await cambiar(sesiones.dueña, "cancelada-pasada", { status: "confirmada" })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe(MENSAJE_CANCELADA_PASADA)
      expect(estadoDe("cancelada-pasada").status).toBe("cancelada")
    })

    it.each(["completada", "no-asistio", "en-progreso"])("no pasa a %s: 409", async (estado) => {
      const res = await cambiar(sesiones.dueña, "cancelada-futura", { status: estado })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe(MENSAJE_CANCELADA_A_OTRO)
    })

    it("si choca con otra cita, avisa con 409 y no guarda; confirmando, guarda", async () => {
      const res = await cambiar(sesiones.dueña, "cancelada-con-choque", { status: "confirmada" })
      expect(res.status).toBe(409)
      const cuerpo = await res.json()
      expect(cuerpo.advertencias.map((a: { tipo: string }) => a.tipo)).toEqual(["choque"])
      expect(estadoDe("cancelada-con-choque").status).toBe("cancelada")

      const confirmada = await cambiar(sesiones.dueña, "cancelada-con-choque", {
        status: "confirmada",
        confirmarAdvertencias: true,
      })
      expect(confirmada.status).toBe(200)
      expect(estadoDe("cancelada-con-choque").status).toBe("confirmada")
    })

    it("reactivar y mover a la vez no se puede: primero se reactiva", async () => {
      const res = await cambiar(sesiones.dueña, "cancelada-futura", {
        status: "confirmada",
        startTime: "2099-10-21T13:00:00.000Z",
        endTime: "2099-10-21T14:00:00.000Z",
      })
      expect(res.status).toBe(409)
      expect(estadoDe("cancelada-futura").status).toBe("cancelada")
    })
  })

  describe("completada o no vino", () => {
    it.each(["completada", "no-vino"])("%s sin atención vuelve a confirmada", async (id) => {
      const res = await cambiar(sesiones.encargado, id, { status: "confirmada" })
      expect(res.status).toBe(200)
      expect(estadoDe(id).status).toBe("confirmada")
    })

    it.each(["pendiente", "cancelada", "en-progreso"])("no vuelve a %s: 409", async (estado) => {
      const res = await cambiar(sesiones.dueña, "completada", { status: estado })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe(MENSAJE_CERRADA_A_OTRO)
    })

    it("con una atención cobrada: 409, hay que anularla primero", async () => {
      const res = await cambiar(sesiones.dueña, "cobrada", { status: "confirmada" })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe(MENSAJE_CON_ATENCION)
      expect(estadoDe("cobrada").status).toBe("completada")
    })

    it("con la atención anulada, sí", async () => {
      const res = await cambiar(sesiones.dueña, "cobrada-y-anulada", { status: "confirmada" })
      expect(res.status).toBe(200)
    })

    it("con la atención en un cierre de caja: 409 corrígelo con un ajuste", async () => {
      const antes = base.volcado()
      const res = await cambiar(sesiones.dueña, "en-caja", { status: "confirmada" })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe(MENSAJE_EN_CAJA)
      expect(base.volcado()).toEqual(antes)
    })

    it("con la atención en una liquidación cerrada: 409 corrígelo con un ajuste", async () => {
      const res = await cambiar(sesiones.dueña, "liquidada", { status: "confirmada" })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe(MENSAJE_EN_LIQUIDACION)
    })

    it("si la liquidación se anuló, ya no la bloquea la liquidación (sigue la atención viva)", async () => {
      await base.prisma.liquidacion.update({ where: { id: "liq-1" }, data: { estado: "anulada", anuladaAt: new Date() } })
      const res = await cambiar(sesiones.dueña, "liquidada", { status: "confirmada" })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe(MENSAJE_CON_ATENCION)
    })
  })

  describe("aislamiento", () => {
    it("la cita de otro negocio es 404", async () => {
      const res = await cambiar(sesiones.dueña, "ajena", { status: "confirmada" })
      expect(res.status).toBe(404)
    })

    it("el dueño de otro negocio no llega a una cita de éste: 404", async () => {
      const res = await cambiar(sesiones.dueñoAjeno, "cancelada-futura", { status: "confirmada" })
      expect(res.status).toBe(404)
      expect(estadoDe("cancelada-futura").status).toBe("cancelada")
    })
  })
})
