import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

async function guardar(sesion: unknown, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido("http://localhost/api/configuracion/hora-valle", cuerpo))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function excluir(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./servicios/[id]/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido(`http://localhost/api/configuracion/hora-valle/servicios/${id}`, cuerpo), {
    params: Promise.resolve({ id }),
  })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const activaEn = (id: string) => base.buscar("business", { id })[0].horaValleActiva
const franjasDe = (businessId: string) => base.buscar("franjaDeHoraValle", { businessId })
const excluido = (id: string) => base.buscar("service", { id })[0].excluidoDeHoraValle

const FRANJA = { dayOfWeek: 1, desde: "10:00", hasta: "12:00", porcentaje: 20 }
const FRANJA_AJENA = { id: "f-ajena", businessId: OTRO_NEGOCIO, dayOfWeek: 1, desde: "09:00", hasta: "10:00", porcentaje: 50 }

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({ ...datosBase(), franjaDeHoraValle: [FRANJA_AJENA] })
})

describe("PUT /api/configuracion/hora-valle (#89c)", () => {
  it("viene apagada y sin franjas", () => {
    expect(activaEn(NEGOCIO)).toBe(false)
    expect(franjasDe(NEGOCIO)).toHaveLength(0)
  })

  it("la dueña la enciende con sus franjas, las reemplaza y la apaga; sólo en su negocio", async () => {
    const encendida = await guardar(sesiones.dueña, { activa: true, franjas: [FRANJA, { ...FRANJA, dayOfWeek: 2 }] })
    expect(encendida.status).toBe(200)
    expect(encendida.cuerpo).toEqual({ activa: true, franjas: [FRANJA, { ...FRANJA, dayOfWeek: 2 }] })
    expect(activaEn(NEGOCIO)).toBe(true)
    expect(franjasDe(NEGOCIO)).toHaveLength(2)

    const reemplazo = await guardar(sesiones.dueña, { activa: true, franjas: [{ ...FRANJA, porcentaje: 30 }] })
    expect(reemplazo.cuerpo.franjas).toEqual([{ ...FRANJA, porcentaje: 30 }])
    expect(franjasDe(NEGOCIO)).toHaveLength(1)

    const apagada = await guardar(sesiones.dueña, { activa: false, franjas: [] })
    expect(apagada.cuerpo).toEqual({ activa: false, franjas: [] })

    // Lo del otro negocio, intacto.
    expect(activaEn(OTRO_NEGOCIO)).toBe(false)
    expect(franjasDe(OTRO_NEGOCIO)).toEqual([expect.objectContaining(FRANJA_AJENA)])
  })

  it("el dueño de otro negocio sólo toca el suyo", async () => {
    expect((await guardar(sesiones.dueñoAjeno, { activa: true, franjas: [FRANJA] })).status).toBe(200)
    expect(activaEn(OTRO_NEGOCIO)).toBe(true)
    expect(franjasDe(OTRO_NEGOCIO)).toHaveLength(1)
    expect(activaEn(NEGOCIO)).toBe(false)
    expect(franjasDe(NEGOCIO)).toHaveLength(0)
  })

  it.each([
    ["el encargado", sesiones.encargado],
    ["el profesional", sesiones.carla],
    ["sin sesión", null],
  ])("%s: 401 sin cambiar nada", async (_quien, sesion) => {
    const antes = base.volcado()
    expect((await guardar(sesion, { activa: true, franjas: [FRANJA] })).status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["solape en el mismo día", { activa: true, franjas: [FRANJA, { ...FRANJA, desde: "11:00", hasta: "13:00" }] }, /se pisan/],
    ["porcentaje fuera de 5–90", { activa: true, franjas: [{ ...FRANJA, porcentaje: 95 }] }, /de 5% a 90%/],
    ["desde después de hasta", { activa: true, franjas: [{ ...FRANJA, desde: "12:00", hasta: "10:00" }] }, /terminar después/],
    ["24:00", { activa: true, franjas: [{ ...FRANJA, hasta: "24:00" }] }, /HH:MM/],
    ["más de 21", { activa: true, franjas: Array.from({ length: 22 }, (_, i) => ({ ...FRANJA, dayOfWeek: i % 7, desde: `0${Math.floor(i / 7)}:00`, hasta: `0${Math.floor(i / 7)}:30` })) }, /Hasta 21/],
    ["sin activa", { franjas: [] }, /Faltan datos/],
    ["sin cuerpo", undefined, /Faltan datos/],
  ])("%s: 400 sin escribir", async (_caso, cuerpo, mensaje) => {
    const antes = base.volcado()
    const { status, cuerpo: respuesta } = await guardar(sesiones.dueña, cuerpo)
    expect(status).toBe(400)
    expect(respuesta.error).toMatch(mensaje)
    expect(base.volcado()).toEqual(antes)
  })
})

describe("PUT /api/configuracion/hora-valle/servicios/[id] (#89c)", () => {
  it("la dueña excluye y vuelve a incluir un servicio de su negocio", async () => {
    expect(await excluir(sesiones.dueña, "s-corte", { excluido: true })).toEqual({
      status: 200,
      cuerpo: { id: "s-corte", excluido: true },
    })
    expect(excluido("s-corte")).toBe(true)
    expect((await excluir(sesiones.dueña, "s-corte", { excluido: false })).status).toBe(200)
    expect(excluido("s-corte")).toBe(false)
  })

  it("aislamiento: un servicio de otro negocio o inventado es 404 y no se toca", async () => {
    const ajeno = await excluir(sesiones.dueña, "s-ajeno", { excluido: true })
    const inventado = await excluir(sesiones.dueña, "s-no-existe", { excluido: true })
    expect([ajeno.status, inventado.status]).toEqual([404, 404])
    expect(ajeno.cuerpo).toEqual(inventado.cuerpo)
    expect(excluido("s-ajeno")).toBe(false)
  })

  it.each([
    ["el encargado", sesiones.encargado],
    ["el profesional", sesiones.carla],
    ["sin sesión", null],
  ])("%s: 401 sin cambiar nada", async (_quien, sesion) => {
    expect((await excluir(sesion, "s-corte", { excluido: true })).status).toBe(401)
    expect(excluido("s-corte")).toBe(false)
  })

  it("cuerpo inválido: 400", async () => {
    expect((await excluir(sesiones.dueña, "s-corte", { excluido: "si" })).status).toBe(400)
    expect((await excluir(sesiones.dueña, "s-corte", undefined)).status).toBe(400)
    expect(excluido("s-corte")).toBe(false)
  })
})
