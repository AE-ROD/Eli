import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { CLINICA, conParams, escenarioDental, sesionesDentales as sesiones } from "../../_pruebas/clinica-dental"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const ruta = () => import("./route")
const url = (id: string) => `http://localhost/api/clientes/${id}/ficha`
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

describe("GET /api/clientes/[id]/ficha", () => {
  it.each([
    ["la dueña", sesiones.dueña],
    ["un odontólogo, aunque no la haya atendido", sesiones.nunez],
  ])("%s ve los antecedentes, con la edad calculada en la zona del negocio", async (_quien, sesion) => {
    const res = await leer(sesion, "p-camila")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      fechaNacimiento: "1992-03-15",
      edad: 34,
      prevision: "isapre",
      alergias: "Penicilina",
      antecedentes: "Sin enfermedades crónicas declaradas",
      actualizadaPor: "Valentina Soto",
      updatedAt: "2026-10-28T15:00:00.000Z",
    })
  })

  it("un paciente sin ficha todavía: todo en null, no un 404", async () => {
    const res = await leer(sesiones.perez, "p-beto")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      fechaNacimiento: null,
      edad: null,
      prevision: null,
      alergias: null,
      antecedentes: null,
      actualizadaPor: null,
      updatedAt: null,
    })
  })

  it.each([
    ["el encargado (la recepción no ve la ficha)", sesiones.encargado, "p-camila"],
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila"],
    ["la dueña, con un paciente de otra clínica", sesiones.dueña, "p-ajena"],
    ["un salón, con su propio cliente", sesiones.salon, "p-salon"],
    ["una sesión sin rubro", sesiones.sinRubro, "p-camila"],
    ["la dueña, con un paciente eliminado", sesiones.dueña, "p-eliminado"],
    ["la dueña, con un id que no existe", sesiones.dueña, "p-no-existe"],
  ])("%s: 404, igual que un paciente que no existe", async (_caso, sesion, id) => {
    const res = await leer(sesion, id)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Paciente no encontrado" })
  })

  it("lo ajeno no se filtra: la dueña de la otra clínica ve la ficha de su paciente, no la de esta", async () => {
    const res = await leer(sesiones.dueñaAjena, "p-ajena")

    expect(res.status).toBe(200)
    const ficha = await res.json()
    expect(ficha.alergias).toBe("Látex")
    expect(JSON.stringify(ficha)).not.toContain("Penicilina")
  })

  it("sin sesión: 401 y no toca la base", async () => {
    const res = await leer(null, "p-camila")

    expect(res.status).toBe(401)
    expect(base.prisma.customer.findFirst).not.toHaveBeenCalled()
    expect(base.prisma.fichaClinica.findFirst).not.toHaveBeenCalled()
  })
})

describe("PUT /api/clientes/[id]/ficha", () => {
  it("la primera escritura crea la ficha, con el nombre de quien escribe copiado desde la base", async () => {
    const res = await guardar(sesiones.perez, "p-beto", {
      fechaNacimiento: "2010-11-07",
      prevision: "fonasa",
      alergias: "  Látex ",
      antecedentes: "",
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      fechaNacimiento: "2010-11-07",
      // Cumple mañana.
      edad: 15,
      prevision: "fonasa",
      alergias: "Látex",
      antecedentes: null,
      actualizadaPor: "Diego Pérez",
      updatedAt: AHORA.toISOString(),
    })
    const [ficha] = base.buscar("fichaClinica", { customerId: "p-beto" })
    expect(ficha).toMatchObject({
      businessId: CLINICA,
      fechaNacimiento: new Date("2010-11-07T00:00:00.000Z"),
      actualizadaPor: "Diego Pérez",
      odontogramaActualizadoEn: null,
    })
  })

  it("cambia sólo lo que viene; null o vacío lo borra", async () => {
    const res = await guardar(sesiones.dueña, "p-camila", { alergias: "Penicilina y látex", antecedentes: null })

    expect(res.status).toBe(200)
    const ficha = await res.json()
    expect(ficha).toMatchObject({
      fechaNacimiento: "1992-03-15",
      prevision: "isapre",
      alergias: "Penicilina y látex",
      antecedentes: null,
      actualizadaPor: "Valentina Soto",
    })
    // El odontograma no se toca al guardar los antecedentes.
    expect(base.buscar("fichaClinica", { id: "f-camila" })[0]).toMatchObject({
      odontogramaActualizadoEn: new Date("2026-10-28T15:00:00.000Z"),
      odontogramaActualizadoPor: "Valentina Soto",
    })
  })

  it("escribe sólo la ficha de este paciente: la de la otra clínica queda igual", async () => {
    const antes = base.buscar("fichaClinica", { id: "f-ajena" })

    await guardar(sesiones.dueña, "p-camila", { alergias: "Ninguna" })

    expect(base.buscar("fichaClinica", { id: "f-ajena" })).toEqual(antes)
  })

  it.each([
    ["una fecha futura", { fechaNacimiento: "2026-11-07" }, "La fecha de nacimiento no puede ser futura"],
    ["una previsión fuera de la lista", { prevision: "capredena" }, "La previsión tiene que ser Fonasa, Isapre, Particular u Otra"],
    ["alergias demasiado largas", { alergias: "x".repeat(501) }, "Las alergias no pueden tener más de 500 caracteres"],
  ])("rechaza %s con un 400 legible y no escribe nada", async (_caso, cuerpo, mensaje) => {
    const antes = base.volcado()

    const res = await guardar(sesiones.dueña, "p-camila", cuerpo)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(base.volcado()).toEqual(antes)
  })

  it("un JSON roto es un 400, no un 500", async () => {
    const res = await guardar(sesiones.dueña, "p-camila", "{no es json")

    expect(res.status).toBe(400)
  })

  it.each([
    ["el encargado", sesiones.encargado, "p-camila"],
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila"],
    ["la dueña, con un paciente de otra clínica", sesiones.dueña, "p-ajena"],
    ["un salón", sesiones.salon, "p-salon"],
    ["la dueña, con un paciente eliminado", sesiones.dueña, "p-eliminado"],
  ])("%s: 404 y no escribe nada", async (_caso, sesion, id) => {
    const antes = base.volcado()

    const res = await guardar(sesion, id, { alergias: "Nada" })

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin sesión: 401 y no toca la base", async () => {
    const res = await guardar(null, "p-camila", { alergias: "Nada" })

    expect(res.status).toBe(401)
    expect(base.prisma.customer.findFirst).not.toHaveBeenCalled()
  })

  it("sin id de usuario en la sesión no hay a quién firmar: 401 y nada escrito", async () => {
    const antes = base.volcado()

    const res = await guardar(sesiones.sinUsuario, "p-camila", { alergias: "Nada" })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it("traba al paciente en la transacción antes de escribir", async () => {
    await guardar(sesiones.dueña, "p-camila", { alergias: "Nada" })

    expect(base.prisma.$queryRaw).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining("FOR UPDATE")]), "p-camila", CLINICA)
  })
})
