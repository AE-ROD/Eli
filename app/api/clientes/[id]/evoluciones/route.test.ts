import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { EVOLUCIONES_POR_PAGINA } from "@/lib/ficha-clinica"
import { CLINICA, conParams, escenarioDental, sesionesDentales as sesiones } from "../../_pruebas/clinica-dental"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const ruta = () => import("./route")
const url = (id: string, query = "") => `http://localhost/api/clientes/${id}/evoluciones${query}`
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

async function leer(sesion: unknown, id: string, query = "") {
  const { GET } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(url(id, query)), con(id))
}

async function anotar(sesion: unknown, id: string, cuerpo: unknown) {
  const { POST } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(url(id), cuerpo), con(id))
}

const ids = (cuerpo: { evoluciones: { id: string }[] }) => cuerpo.evoluciones.map((evolucion) => evolucion.id)

describe("GET /api/clientes/[id]/evoluciones", () => {
  it.each([
    ["la dueña", sesiones.dueña],
    ["un odontólogo que no las escribió", sesiones.nunez],
  ])("%s las ve de la más nueva a la más vieja, con fecha y autor", async (_quien, sesion) => {
    const res = await leer(sesion, "p-camila")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      evoluciones: [
        {
          id: "ev-2",
          texto: "Destartraje y profilaxis de boca completa.",
          autorNombre: "Diego Pérez",
          createdAt: "2026-10-28T14:00:00.000Z",
          appointmentId: "cita-perez",
        },
        {
          id: "ev-1",
          texto: "Evaluación inicial y registro del odontograma.",
          autorNombre: "Valentina Soto",
          createdAt: "2026-09-12T14:00:00.000Z",
          appointmentId: null,
        },
      ],
      siguiente: null,
    })
  })

  it("pagina con ?antes=: cada página sigue donde terminó la anterior, sin repetir ni saltar", async () => {
    const muchas = Array.from({ length: EVOLUCIONES_POR_PAGINA + 5 }, (_, i) => ({
      id: `ev-x${String(i).padStart(3, "0")}`,
      businessId: CLINICA,
      customerId: "p-beto",
      texto: `Evolución ${i}`,
      autorNombre: "Diego Pérez",
      // Dos con la misma hora: el id desempata.
      createdAt: new Date(Date.UTC(2026, 9, 1, 12, Math.floor(i / 2))),
    }))
    base.reiniciar({ ...escenarioDental(), evolucion: muchas })

    const primera = await (await leer(sesiones.dueña, "p-beto")).json()
    expect(primera.evoluciones).toHaveLength(EVOLUCIONES_POR_PAGINA)
    expect(primera.siguiente).toBe(primera.evoluciones[EVOLUCIONES_POR_PAGINA - 1].id)

    const segunda = await (await leer(sesiones.dueña, "p-beto", `?antes=${primera.siguiente}`)).json()
    expect(segunda.evoluciones).toHaveLength(5)
    expect(segunda.siguiente).toBeNull()

    const todas = [...ids(primera), ...ids(segunda)]
    const esperadas = [...muchas]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .map((evolucion) => evolucion.id)
    expect(todas).toEqual(esperadas)
  })

  it("?antes= con una evolución de otro paciente es 404", async () => {
    const res = await leer(sesiones.dueña, "p-camila", "?antes=ev-ajena")

    expect(res.status).toBe(404)
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
    expect(base.prisma.evolucion.findMany).not.toHaveBeenCalled()
  })
})

describe("POST /api/clientes/[id]/evoluciones", () => {
  it("el odontólogo anota en su cita: autor, usuario y miembro salen de la sesión", async () => {
    const res = await anotar(sesiones.perez, "p-camila", { texto: "  Restauración en 16 (OM). ", appointmentId: "cita-perez" })

    expect(res.status).toBe(201)
    const evolucion = await res.json()
    expect(evolucion).toEqual({
      id: expect.any(String),
      texto: "Restauración en 16 (OM).",
      autorNombre: "Diego Pérez",
      createdAt: AHORA.toISOString(),
      appointmentId: "cita-perez",
    })
    expect(base.buscar("evolucion", { id: evolucion.id })[0]).toMatchObject({
      businessId: CLINICA,
      customerId: "p-camila",
      autorUserId: "u-perez",
      memberId: "m-perez",
    })
  })

  it("la dueña anota sin cita: sin memberId, con su nombre", async () => {
    const res = await anotar(sesiones.dueña, "p-camila", { texto: "Llamó por sensibilidad al frío." })

    expect(res.status).toBe(201)
    const evolucion = await res.json()
    expect(evolucion).toMatchObject({ autorNombre: "Valentina Soto", appointmentId: null })
    expect(base.buscar("evolucion", { id: evolucion.id })[0]).toMatchObject({ autorUserId: "u-duena", memberId: null })
  })

  it("lo que mande el cuerpo como autor, miembro o negocio no cuenta", async () => {
    const res = await anotar(sesiones.perez, "p-camila", {
      texto: "Control.",
      autorNombre: "Otra persona",
      memberId: "m-nunez",
      businessId: "clinica-dos",
    })

    const evolucion = await res.json()
    expect(base.buscar("evolucion", { id: evolucion.id })[0]).toMatchObject({
      autorNombre: "Diego Pérez",
      memberId: "m-perez",
      businessId: CLINICA,
    })
  })

  it.each([
    ["una cita de otro paciente", sesiones.perez, "cita-beto", 404],
    ["una cita de otra clínica", sesiones.perez, "cita-ajena", 404],
    ["la cita de un colega (el odontólogo ve sólo sus citas)", sesiones.perez, "cita-nunez", 404],
    ["una cita que no existe", sesiones.perez, "cita-no-existe", 404],
    ["una cita cancelada", sesiones.dueña, "cita-cancelada", 409],
  ])("con %s: responde el código que corresponde y no anota nada", async (_caso, sesion, appointmentId, status) => {
    const antes = base.volcado()

    const res = await anotar(sesion, "p-camila", { texto: "Control.", appointmentId })

    expect(res.status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })

  it("la dueña, que ve toda la agenda, sí anota en la cita de cualquier odontólogo", async () => {
    const res = await anotar(sesiones.dueña, "p-camila", { texto: "Control.", appointmentId: "cita-nunez" })

    expect(res.status).toBe(201)
  })

  it("sin texto: 400 legible", async () => {
    const res = await anotar(sesiones.dueña, "p-camila", { texto: "   " })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Escribe la evolución" })
  })

  it.each([
    ["el encargado", sesiones.encargado, "p-camila"],
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila"],
    ["la dueña, con un paciente de otra clínica", sesiones.dueña, "p-ajena"],
    ["un salón", sesiones.salon, "p-salon"],
    ["la dueña, con un paciente eliminado", sesiones.dueña, "p-eliminado"],
  ])("%s: 404 y no anota nada", async (_caso, sesion, id) => {
    const antes = base.volcado()

    const res = await anotar(sesion, id, { texto: "Control." })

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin sesión: 401", async () => {
    const res = await anotar(null, "p-camila", { texto: "Control." })

    expect(res.status).toBe(401)
  })

  it("no hay PUT ni DELETE: una evolución no se edita ni se borra", async () => {
    const modulo: Record<string, unknown> = await ruta()

    expect(modulo.PUT).toBeUndefined()
    expect(modulo.PATCH).toBeUndefined()
    expect(modulo.DELETE).toBeUndefined()
  })
})
