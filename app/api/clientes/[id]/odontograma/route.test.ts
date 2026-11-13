import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { CLINICA, OTRA_CLINICA, conParams, escenarioDental, sesionesDentales as sesiones } from "../../_pruebas/clinica-dental"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const ruta = () => import("./route")
const url = (id: string) => `http://localhost/api/clientes/${id}/odontograma`
const con = (id: string) => conParams({ id })

const AHORA = new Date("2026-11-06T15:00:00.000Z")

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenarioDental())
})

afterEach(() => {
  vi.useRealTimers()
})

async function leer(sesion: unknown, id: string) {
  const { GET } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(url(id)), con(id))
}

async function guardar(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(url(id), cuerpo), con(id))
}

/** Las marcas de un paciente en la base, sin id ni fecha, en orden. */
const marcasEnLaBase = (customerId: string) =>
  base
    .buscar("marcaDental", { customerId })
    .map(({ pieza, cara, tipo, businessId }) => ({ pieza, cara, tipo, businessId }))
    .sort((a, b) => Number(a.pieza) - Number(b.pieza) || String(a.cara).localeCompare(String(b.cara)))

describe("GET /api/clientes/[id]/odontograma", () => {
  it.each([
    ["la dueña", sesiones.dueña],
    ["un odontólogo", sesiones.perez],
  ])("%s ve las marcas en orden y quién y cuándo lo actualizó", async (_quien, sesion) => {
    const res = await leer(sesion, "p-camila")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      marcas: [
        { pieza: 16, cara: "O", tipo: "caries" },
        { pieza: 16, cara: "M", tipo: "caries" },
        { pieza: 18, cara: null, tipo: "extraccion" },
        { pieza: 21, cara: null, tipo: "corona" },
        { pieza: 24, cara: "O", tipo: "sellante" },
        { pieza: 46, cara: null, tipo: "ausente" },
      ],
      odontogramaActualizadoEn: "2026-10-28T15:00:00.000Z",
      odontogramaActualizadoPor: "Valentina Soto",
    })
  })

  it("un paciente sin marcar: lista vacía, sin quién ni cuándo", async () => {
    const res = await leer(sesiones.dueña, "p-beto")

    expect(await res.json()).toEqual({ marcas: [], odontogramaActualizadoEn: null, odontogramaActualizadoPor: null })
  })

  it.each([
    ["el encargado", sesiones.encargado, "p-camila"],
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila"],
    ["la dueña, con un paciente de otra clínica", sesiones.dueña, "p-ajena"],
    ["un salón", sesiones.salon, "p-salon"],
    ["una sesión sin rubro", sesiones.sinRubro, "p-camila"],
  ])("%s: 404", async (_caso, sesion, id) => {
    const res = await leer(sesion, id)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Paciente no encontrado" })
  })

  it("sin sesión: 401 y no toca la base", async () => {
    const res = await leer(null, "p-camila")

    expect(res.status).toBe(401)
    expect(base.prisma.marcaDental.findMany).not.toHaveBeenCalled()
  })
})

describe("PUT /api/clientes/[id]/odontograma", () => {
  const nuevas = [
    // Sigue igual.
    { pieza: 16, cara: "O", tipo: "caries" },
    // Cambia de tipo en la misma cara: la vieja se borra antes de crear la nueva.
    { pieza: 16, cara: "M", tipo: "obturacion" },
    { pieza: 21, tipo: "corona" },
    { pieza: 21, tipo: "endodoncia" },
    // Temporal.
    { pieza: 55, cara: "P", tipo: "sellante" },
  ]

  it("reemplaza el conjunto completo: borra lo que no viene, crea lo nuevo y deja quién y cuándo", async () => {
    const res = await guardar(sesiones.perez, "p-camila", { marcas: nuevas })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      marcas: [
        { pieza: 16, cara: "O", tipo: "caries" },
        { pieza: 16, cara: "M", tipo: "obturacion" },
        { pieza: 21, cara: null, tipo: "corona" },
        { pieza: 21, cara: null, tipo: "endodoncia" },
        { pieza: 55, cara: "P", tipo: "sellante" },
      ],
      odontogramaActualizadoEn: AHORA.toISOString(),
      odontogramaActualizadoPor: "Diego Pérez",
    })
    expect(marcasEnLaBase("p-camila")).toEqual([
      { pieza: 16, cara: "M", tipo: "obturacion", businessId: CLINICA },
      { pieza: 16, cara: "O", tipo: "caries", businessId: CLINICA },
      { pieza: 21, cara: null, tipo: "corona", businessId: CLINICA },
      { pieza: 21, cara: null, tipo: "endodoncia", businessId: CLINICA },
      { pieza: 55, cara: "P", tipo: "sellante", businessId: CLINICA },
    ])
    // Lo que no cambió conserva su fila.
    expect(base.buscar("marcaDental", { id: "mk-16o" })).toHaveLength(1)
    expect(base.buscar("marcaDental", { id: "mk-21" })).toHaveLength(1)
    expect(base.buscar("fichaClinica", { id: "f-camila" })[0]).toMatchObject({
      actualizadaPor: "Diego Pérez",
      odontogramaActualizadoPor: "Diego Pérez",
      odontogramaActualizadoEn: AHORA,
      // Los antecedentes no se tocan.
      alergias: "Penicilina",
    })
  })

  it("no toca las marcas de otro paciente ni de otra clínica", async () => {
    await guardar(sesiones.dueña, "p-camila", { marcas: [] })

    expect(base.buscar("marcaDental", { customerId: "p-camila" })).toEqual([])
    expect(marcasEnLaBase("p-ajena")).toEqual([{ pieza: 11, cara: "V", tipo: "caries", businessId: OTRA_CLINICA }])
  })

  it("en un paciente sin ficha, la crea para dejar quién y cuándo", async () => {
    const res = await guardar(sesiones.dueña, "p-beto", { marcas: [{ pieza: 36, cara: "L", tipo: "caries" }] })

    expect(res.status).toBe(200)
    expect(base.buscar("fichaClinica", { customerId: "p-beto" })[0]).toMatchObject({
      businessId: CLINICA,
      actualizadaPor: "Valentina Soto",
      odontogramaActualizadoEn: AHORA,
      odontogramaActualizadoPor: "Valentina Soto",
      alergias: null,
    })
  })

  it("guardar lo mismo no es una actualización: no cambia quién ni cuándo", async () => {
    const { marcas } = await (await leer(sesiones.dueña, "p-camila")).json()
    const antes = base.volcado()

    const res = await guardar(sesiones.perez, "p-camila", { marcas })

    expect(res.status).toBe(200)
    expect((await res.json()).odontogramaActualizadoPor).toBe("Valentina Soto")
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["una pieza que no existe", [{ pieza: 19, cara: "O", tipo: "caries" }], "Esa pieza no existe en el odontograma."],
    ["una pieza que no es número", [{ pieza: "16", cara: "O", tipo: "caries" }], "Esa pieza no existe en el odontograma."],
    ["palatina en la mandíbula", [{ pieza: 36, cara: "P", tipo: "caries" }], "La pieza 36 no tiene cara palatina."],
    ["incisal en un molar", [{ pieza: 16, cara: "I", tipo: "caries" }], "La pieza 16 no tiene cara incisal."],
    ["una marca de pieza con cara", [{ pieza: 21, cara: "V", tipo: "corona" }], "Corona es de la pieza entera, sin cara."],
    ["una marca de cara sin cara", [{ pieza: 21, tipo: "caries" }], "Caries va en una cara de la pieza."],
    ["un tipo que no existe", [{ pieza: 21, tipo: "implante" }], "Esa marca no existe en el odontograma."],
    [
      "dos marcas en la misma cara",
      [
        { pieza: 16, cara: "O", tipo: "caries" },
        { pieza: 16, cara: "O", tipo: "sellante" },
      ],
      "La cara oclusal de la pieza 16 tiene dos marcas: una cara lleva una sola.",
    ],
    [
      "la misma marca de pieza dos veces",
      [
        { pieza: 21, tipo: "corona" },
        { pieza: 21, cara: null, tipo: "corona" },
      ],
      "La pieza 21 tiene dos veces Corona.",
    ],
  ])("rechaza %s con un 400 legible y no escribe nada", async (_caso, marcas, mensaje) => {
    const antes = base.volcado()

    const res = await guardar(sesiones.dueña, "p-camila", { marcas })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(base.volcado()).toEqual(antes)
  })

  it("rechaza más marcas de las que caben en una boca", async () => {
    const marcas = Array.from({ length: 500 }, () => ({ pieza: 11, cara: "V", tipo: "caries" }))

    const res = await guardar(sesiones.dueña, "p-camila", { marcas })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no puede tener más de \d+ marcas/)
  })

  it.each([
    ["el encargado", sesiones.encargado, "p-camila"],
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila"],
    ["la dueña, con un paciente de otra clínica", sesiones.dueña, "p-ajena"],
    ["un salón", sesiones.salon, "p-salon"],
  ])("%s: 404 y no escribe nada", async (_caso, sesion, id) => {
    const antes = base.volcado()

    const res = await guardar(sesion, id, { marcas: [] })

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin sesión: 401 y no escribe nada", async () => {
    const antes = base.volcado()

    const res = await guardar(null, "p-camila", { marcas: [] })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })
})
