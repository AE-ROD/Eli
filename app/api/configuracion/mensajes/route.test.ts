import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/mensajes"
const ENLACE = "https://g.page/r/salon-uno/review"

async function leer(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await GET()
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function guardar(sesion: unknown, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido(URL, cuerpo))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const negocio = (id: string) => base.buscar("business", { id })[0]

/** Un envío registrado del negocio, en ese instante. */
let siguiente = 1
const envio = (businessId: string, tipo: string, canal: string, categoria: string, enviadoAt: string) => ({
  id: `e-${siguiente++}`,
  businessId,
  tipo,
  canal,
  categoria,
  referencia: `ref-${siguiente}`,
  enviadoAt: new Date(enviadoAt),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  // 28/10/2026, 10:00 en Santiago.
  vi.setSystemTime(new Date("2026-10-28T13:00:00.000Z"))
  base.reiniciar(datosBase())
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET /api/configuracion/mensajes", () => {
  it("dueña: los interruptores con sus valores por defecto, sin enlace y el mes vacío", async () => {
    const { status, cuerpo } = await leer(sesiones.dueña)

    expect(status).toBe(200)
    expect(cuerpo).toEqual({
      interruptores: { listaDeEsperaActiva: true, avisoDeVueltaActivo: false, pideResenas: false },
      tieneEnlaceDeResenas: false,
      puedeCambiar: true,
      mes: {
        mes: "2026-10",
        total: 0,
        porCategoria: { servicio: 0, promocional: 0 },
        porTipo: { "lista-de-espera": 0, "te-toca": 0, resena: 0, "contacto-manual": 0 },
        porCanal: { correo: 0, whatsapp: 0, manual: 0 },
      },
    })
  })

  it("el encargado lo ve, pero sin poder cambiarlo", async () => {
    const { status, cuerpo } = await leer(sesiones.encargado)
    expect(status).toBe(200)
    expect(cuerpo.puedeCambiar).toBe(false)
  })

  it.each([
    ["el profesional", sesiones.carla],
    ["sin memberId", sesiones.sinMiembro],
    ["sin sesión", null],
  ])("%s recibe 401", async (_quien, sesion) => {
    expect((await leer(sesion)).status).toBe(401)
  })

  it("cuenta lo del mes en la zona del negocio, por tipo, categoría y canal, y sólo de su negocio", async () => {
    base.reiniciar({
      ...datosBase(),
      business: datosBase().business.map((fila) => (fila.id === NEGOCIO ? { ...fila, enlaceResenas: ENLACE, pideResenas: true } : fila)),
      envioAClientes: [
        envio(NEGOCIO, "resena", "correo", "promocional", "2026-10-27T15:00:00.000Z"),
        envio(NEGOCIO, "te-toca", "correo", "promocional", "2026-10-02T15:00:00.000Z"),
        envio(NEGOCIO, "lista-de-espera", "correo", "servicio", "2026-10-15T15:00:00.000Z"),
        envio(NEGOCIO, "contacto-manual", "manual", "promocional", "2026-10-20T15:00:00.000Z"),
        // 1/10 00:30 en Santiago (UTC-3): ya es octubre.
        envio(NEGOCIO, "resena", "correo", "promocional", "2026-10-01T03:30:00.000Z"),
        // 30/9 23:30 en Santiago: septiembre, no cuenta.
        envio(NEGOCIO, "resena", "correo", "promocional", "2026-10-01T02:30:00.000Z"),
        // De otro negocio: no cuenta.
        envio(OTRO_NEGOCIO, "resena", "correo", "promocional", "2026-10-27T15:00:00.000Z"),
      ],
    })

    const { cuerpo } = await leer(sesiones.dueña)

    expect(cuerpo.tieneEnlaceDeResenas).toBe(true)
    expect(cuerpo.interruptores.pideResenas).toBe(true)
    expect(cuerpo.mes).toEqual({
      mes: "2026-10",
      total: 5,
      porCategoria: { servicio: 1, promocional: 4 },
      porTipo: { "lista-de-espera": 1, "te-toca": 1, resena: 2, "contacto-manual": 1 },
      porCanal: { correo: 4, whatsapp: 0, manual: 1 },
    })
  })

  it("un enlace guardado que no es de Google no cuenta como enlace", async () => {
    await base.prisma.business.update({ where: { id: NEGOCIO }, data: { enlaceResenas: "https://evil.com/maps" } })
    expect((await leer(sesiones.dueña)).cuerpo.tieneEnlaceDeResenas).toBe(false)
  })
})

describe("PUT /api/configuracion/mensajes", () => {
  it("la dueña enciende y apaga en su negocio, y sólo en el suyo", async () => {
    const { status, cuerpo } = await guardar(sesiones.dueña, { avisoDeVueltaActivo: true, listaDeEsperaActiva: false })

    expect(status).toBe(200)
    expect(cuerpo).toEqual({ interruptores: { listaDeEsperaActiva: false, avisoDeVueltaActivo: true, pideResenas: false } })
    expect(negocio(NEGOCIO)).toMatchObject({ listaDeEsperaActiva: false, avisoDeVueltaActivo: true })
    expect(negocio(OTRO_NEGOCIO)).toMatchObject({ listaDeEsperaActiva: true, avisoDeVueltaActivo: false })
  })

  it("lo que no viene no se toca", async () => {
    await guardar(sesiones.dueña, { avisoDeVueltaActivo: true })
    expect(negocio(NEGOCIO)).toMatchObject({ listaDeEsperaActiva: true, avisoDeVueltaActivo: true, pideResenas: false })
  })

  it.each([
    ["el encargado", sesiones.encargado],
    ["el profesional", sesiones.carla],
    ["sin sesión", null],
  ])("%s recibe 401 y no cambia nada", async (_quien, sesion) => {
    const antes = negocio(NEGOCIO)
    expect((await guardar(sesion, { avisoDeVueltaActivo: true })).status).toBe(401)
    expect(negocio(NEGOCIO)).toEqual(antes)
  })

  it("encender 'pedir reseña' sin enlace da 400 con un mensaje claro", async () => {
    const { status, cuerpo } = await guardar(sesiones.dueña, { pideResenas: true })

    expect(status).toBe(400)
    expect(cuerpo.error).toContain("primero agrega el enlace de reseñas de Google")
    expect(negocio(NEGOCIO).pideResenas).toBe(false)
  })

  it("con un enlace guardado que no es de Google, tampoco", async () => {
    await base.prisma.business.update({ where: { id: NEGOCIO }, data: { enlaceResenas: "http://g.page/r/x" } })
    expect((await guardar(sesiones.dueña, { pideResenas: true })).status).toBe(400)
  })

  it("con enlace válido se enciende; apagarlo nunca pide enlace", async () => {
    await base.prisma.business.update({ where: { id: NEGOCIO }, data: { enlaceResenas: ENLACE } })

    expect((await guardar(sesiones.dueña, { pideResenas: true })).status).toBe(200)
    expect(negocio(NEGOCIO).pideResenas).toBe(true)

    await base.prisma.business.update({ where: { id: NEGOCIO }, data: { enlaceResenas: null } })
    expect((await guardar(sesiones.dueña, { pideResenas: false })).status).toBe(200)
    expect(negocio(NEGOCIO).pideResenas).toBe(false)
  })

  it("el enlace que cuenta es el del negocio de la sesión, no el de otro", async () => {
    await base.prisma.business.update({ where: { id: OTRO_NEGOCIO }, data: { enlaceResenas: ENLACE } })
    expect((await guardar(sesiones.dueña, { pideResenas: true })).status).toBe(400)
  })

  it("un businessId en el cuerpo no cambia el negocio sobre el que se escribe", async () => {
    await guardar(sesiones.dueña, { avisoDeVueltaActivo: true, businessId: OTRO_NEGOCIO, id: OTRO_NEGOCIO })
    expect(negocio(NEGOCIO).avisoDeVueltaActivo).toBe(true)
    expect(negocio(OTRO_NEGOCIO).avisoDeVueltaActivo).toBe(false)
  })

  it.each([
    ["un cuerpo vacío", {}, "No hay nada que cambiar"],
    ["un valor que no es sí o no", { avisoDeVueltaActivo: "true" }, "tiene que ser sí o no"],
    ["una lista", [true], "Datos inválidos"],
  ])("rechaza %s con 400", async (_caso, cuerpo, mensaje) => {
    const respuesta = await guardar(sesiones.dueña, cuerpo)
    expect(respuesta.status).toBe(400)
    expect(respuesta.cuerpo.error).toContain(mensaje)
  })

  it("un cuerpo que no es JSON da 400, no 500", async () => {
    expect((await guardar(sesiones.dueña, undefined)).status).toBe(400)
  })
})
