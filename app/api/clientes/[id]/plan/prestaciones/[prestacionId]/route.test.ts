import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_ETAPA_APROBADA, MENSAJE_VERSION_NO_VIGENTE } from "@/lib/edicion-del-plan"
import { REALIZADA_EL, conParams, escenarioDental, sesionesDentales as sesiones } from "../../../../_pruebas/clinica-dental"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const ruta = () => import("./route")
const url = (id: string, prestacionId: string) => `http://localhost/api/clientes/${id}/plan/prestaciones/${prestacionId}`

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

async function editar(sesion: unknown, id: string, prestacionId: string, cuerpo: unknown) {
  const { PATCH } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PATCH(pedido(url(id, prestacionId), cuerpo), conParams({ id, prestacionId }))
}

async function borrar(sesion: unknown, id: string, prestacionId: string) {
  const { DELETE } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return DELETE(pedido(url(id, prestacionId)), conParams({ id, prestacionId }))
}

const prestacion = (id: string) => base.buscar("prestacionDelPlan", { id })[0]

const AJENOS = [
  ["una prestación de otro paciente de la misma clínica", sesiones.dueña, "p-camila", "pr-beto", 404],
  ["una prestación de otra clínica", sesiones.dueña, "p-camila", "pr-ajena", 404],
  ["la prestación ajena, por su propio paciente", sesiones.dueña, "p-ajena", "pr-ajena", 404],
  ["una prestación que no existe", sesiones.dueña, "p-camila", "pr-no-existe", 404],
  ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila", "pr-46", 404],
  ["un salón", sesiones.salon, "p-salon", "pr-46", 404],
  ["una sesión sin rubro", sesiones.sinRubro, "p-camila", "pr-46", 404],
  ["el encargado", sesiones.encargado, "p-camila", "pr-46", 401],
  ["sin sesión", null, "p-camila", "pr-46", 401],
] as const

describe("PATCH /api/clientes/[id]/plan/prestaciones/[prestacionId]: estados", () => {
  it("agendar exige una cita de este paciente que quien escribe vea en su agenda", async () => {
    // A las 08:00 en Santiago: la cita (10:30) todavía está por delante.
    vi.setSystemTime(new Date("2026-11-06T11:00:00.000Z"))
    const res = await editar(sesiones.perez, "p-camila", "pr-46", { estado: "agendada", appointmentId: "cita-perez" })

    expect(res.status).toBe(200)
    const { plan } = await res.json()
    expect(plan.etapas[1].prestaciones[0]).toMatchObject({
      estado: "agendada",
      appointmentId: "cita-perez",
      cita: { id: "cita-perez", startTime: "2026-11-06T13:30:00.000Z", status: "confirmada" },
    })
  })

  it("agendar en una cita que ya pasó: 409 y nada cambia", async () => {
    // AHORA es 12:00 en Santiago: la cita de las 10:30 ya terminó.
    const antes = base.volcado()

    const res = await editar(sesiones.perez, "p-camila", "pr-46", { estado: "agendada", appointmentId: "cita-perez" })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/ya pasó/)
    expect(base.volcado()).toEqual(antes)
  })

  it("volver a agendada revisa de nuevo la cita que tenía: si ya pasó, 409", async () => {
    vi.setSystemTime(new Date("2026-11-06T11:00:00.000Z"))
    expect((await editar(sesiones.perez, "p-camila", "pr-46", { estado: "agendada", appointmentId: "cita-perez" })).status).toBe(200)
    expect((await editar(sesiones.perez, "p-camila", "pr-46", { estado: "realizada" })).status).toBe(200)
    // Al día siguiente quiere volverla a agendada en la misma cita, que ya pasó.
    vi.setSystemTime(new Date("2026-11-07T15:00:00.000Z"))

    const res = await editar(sesiones.perez, "p-camila", "pr-46", { estado: "agendada" })

    expect(res.status).toBe(409)
    expect(base.buscar("prestacionDelPlan", { id: "pr-46" })[0].estado).toBe("realizada")
  })

  it("el profesional de la prestación es la dueña o un odontólogo: el encargado (recepción) no, 400", async () => {
    const res = await editar(sesiones.dueña, "p-camila", "pr-46", { memberId: "m-recepcion" })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no atiende/)
    expect((await editar(sesiones.dueña, "p-camila", "pr-46", { memberId: "m-nunez" })).status).toBe(200)
  })

  it("agendada sin cita: 400 y nada cambia", async () => {
    const antes = base.volcado()

    const res = await editar(sesiones.perez, "p-camila", "pr-46", { estado: "agendada" })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Para marcarla como agendada hay que elegir la cita." })
    expect(base.volcado()).toEqual(antes)
  })

  it("una cita en una prestación por agendar sin marcarla agendada: 400", async () => {
    const res = await editar(sesiones.perez, "p-camila", "pr-46", { appointmentId: "cita-perez" })

    expect(res.status).toBe(400)
  })

  it.each([
    ["una cita de otro paciente", sesiones.perez, "cita-beto", 404],
    ["una cita de otra clínica", sesiones.perez, "cita-ajena", 404],
    ["la cita de un colega (el odontólogo ve sólo las suyas)", sesiones.perez, "cita-nunez", 404],
    ["una cita cancelada", sesiones.dueña, "cita-cancelada", 409],
    ["una cita a la que no vino", sesiones.dueña, "cita-no-vino", 409],
  ] as const)("con %s: no se agenda y nada cambia", async (_caso, sesion, appointmentId, status) => {
    const antes = base.volcado()

    const res = await editar(sesion, "p-camila", "pr-46", { estado: "agendada", appointmentId })

    expect(res.status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })

  it("la dueña, que ve toda la agenda, agenda en la cita de cualquier odontólogo", async () => {
    const res = await editar(sesiones.dueña, "p-camila", "pr-46", { estado: "agendada", appointmentId: "cita-nunez" })

    expect(res.status).toBe(200)
    expect(prestacion("pr-46")).toMatchObject({ estado: "agendada", appointmentId: "cita-nunez" })
  })

  it("en una etapa aprobada sí se cambia el estado: realizada fija cuándo y conserva la cita", async () => {
    const res = await editar(sesiones.perez, "p-camila", "pr-16", { estado: "realizada" })

    expect(res.status).toBe(200)
    expect(prestacion("pr-16")).toMatchObject({ estado: "realizada", appointmentId: "cita-perez", realizadaEn: AHORA })
    expect((await res.json()).plan.totales.realizadoCents).toBe(3_500_000 + 4_800_000)
  })

  it("volver a por agendar limpia la cita (y la fecha de realizada)", async () => {
    await editar(sesiones.perez, "p-camila", "pr-16", { estado: "por-agendar" })
    await editar(sesiones.dueña, "p-camila", "pr-destartraje", { estado: "por-agendar" })

    expect(prestacion("pr-16")).toMatchObject({ estado: "por-agendar", appointmentId: null, realizadaEn: null })
    expect(prestacion("pr-destartraje")).toMatchObject({ estado: "por-agendar", appointmentId: null, realizadaEn: null })
  })

  it("una que ya estaba realizada no cambia su fecha al guardarla de nuevo", async () => {
    await editar(sesiones.dueña, "p-camila", "pr-destartraje", { estado: "realizada" })

    expect(prestacion("pr-destartraje").realizadaEn).toEqual(REALIZADA_EL)
  })
})

describe("PATCH /api/clientes/[id]/plan/prestaciones/[prestacionId]: lo demás", () => {
  it("en una etapa aprobada se cambia el profesional", async () => {
    const res = await editar(sesiones.dueña, "p-camila", "pr-16", { memberId: "m-nunez" })

    expect(res.status).toBe(200)
    expect(prestacion("pr-16")).toMatchObject({ memberId: "m-nunez", profesionalNombre: "Laura Núñez" })
  })

  it.each([
    ["el valor", { valorCents: 1 }],
    ["el nombre", { nombre: "Otra cosa" }],
    ["la pieza", { pieza: 17 }],
    ["el servicio", { serviceId: "s-exodoncia" }],
    ["la posición", { orden: 1 }],
    ["el estado junto con el valor", { estado: "realizada", valorCents: 1 }],
  ])("en una etapa aprobada no se cambia %s: 409 y nada cambia", async (_caso, cuerpo) => {
    const antes = base.volcado()

    const res = await editar(sesiones.dueña, "p-camila", "pr-16", cuerpo)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_ETAPA_APROBADA })
    expect(base.volcado()).toEqual(antes)
  })

  it("en una etapa por aprobar se cambia todo: pieza, caras, nombre, valor y profesional", async () => {
    const res = await editar(sesiones.perez, "p-camila", "pr-27", {
      pieza: 26,
      caras: ["D", "O"],
      nombre: "Incrustación",
      valorCents: 12_000_000,
      delDueño: true,
    })

    expect(res.status).toBe(200)
    expect(prestacion("pr-27")).toMatchObject({
      pieza: 26,
      caras: ["O", "D"],
      nombre: "Incrustación",
      valorCents: 12_000_000,
      memberId: null,
      profesionalNombre: "Valentina Soto",
    })
  })

  it("cambiar el servicio copia su nombre y su precio, salvo lo que venga escrito", async () => {
    await editar(sesiones.perez, "p-camila", "pr-46", { serviceId: "s-exodoncia" })
    expect(prestacion("pr-46")).toMatchObject({ serviceId: "s-exodoncia", nombre: "Exodoncia simple", valorCents: 6_000_000 })

    await editar(sesiones.perez, "p-camila", "pr-46", { serviceId: "s-resina", valorCents: 1_000 })
    expect(prestacion("pr-46")).toMatchObject({ serviceId: "s-resina", nombre: "Restauración resina compuesta", valorCents: 1_000 })

    await editar(sesiones.perez, "p-camila", "pr-46", { serviceId: null })
    expect(prestacion("pr-46")).toMatchObject({ serviceId: null, nombre: "Restauración resina compuesta" })
  })

  it("pasar a boca completa exige quitar las caras", async () => {
    const res = await editar(sesiones.perez, "p-camila", "pr-27", { pieza: null })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Una prestación de boca completa no lleva caras." })

    const bien = await editar(sesiones.perez, "p-camila", "pr-27", { pieza: null, caras: [] })
    expect(bien.status).toBe(200)
    expect(prestacion("pr-27")).toMatchObject({ pieza: null, caras: [] })
  })

  it.each([
    ["caras que no son de la pieza", { caras: ["P"] }, 400],
    ["una pieza que no existe", { pieza: 99 }, 400],
    ["un servicio de otra clínica", { serviceId: "s-ajeno" }, 404],
    ["un profesional de otra clínica", { memberId: "m-ajeno" }, 404],
    ["dos profesionales", { memberId: "m-nunez", delDueño: true }, 400],
  ])("rechaza %s y nada cambia", async (_caso, cuerpo, status) => {
    const antes = base.volcado()

    // pr-46 es la 46: inferior, sin cara palatina.
    const res = await editar(sesiones.perez, "p-camila", "pr-46", cuerpo)

    expect(res.status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })

  it("mueve una prestación dentro de su etapa y corre las demás", async () => {
    const res = await editar(sesiones.perez, "p-camila", "pr-27", { orden: 1 })

    const { plan } = await res.json()
    expect(plan.etapas[1].prestaciones.map((p: { id: string; orden: number }) => [p.id, p.orden])).toEqual([
      ["pr-27", 1],
      ["pr-46", 2],
    ])
  })

  it("una prestación de una versión vieja no se edita: 409", async () => {
    const res = await editar(sesiones.dueña, "p-camila", "pr-vieja", { valorCents: 1 })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_VERSION_NO_VIGENTE })
  })

  it.each(AJENOS)("%s: 404 (o 401 sin permiso) y nada cambia", async (_caso, sesion, id, prestacionId, status) => {
    const antes = base.volcado()

    const res = await editar(sesion, id, prestacionId, { valorCents: 1 })

    expect(res.status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })
})

describe("DELETE /api/clientes/[id]/plan/prestaciones/[prestacionId]", () => {
  it("borra una por agendar de una etapa por aprobar, y renumera", async () => {
    const res = await borrar(sesiones.perez, "p-camila", "pr-46")

    expect(res.status).toBe(200)
    const { plan } = await res.json()
    expect(plan.etapas[1].prestaciones.map((p: { id: string; orden: number }) => [p.id, p.orden])).toEqual([["pr-27", 1]])
    expect(prestacion("pr-46")).toBeUndefined()
  })

  it.each([
    ["una de una etapa aprobada", "pr-destartraje"],
    ["una de una versión vieja", "pr-vieja"],
  ])("no borra %s: 409", async (_caso, prestacionId) => {
    const antes = base.volcado()

    const res = await borrar(sesiones.dueña, "p-camila", prestacionId)

    expect(res.status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it("no borra una agendada aunque su etapa esté por aprobar: 409", async () => {
    vi.setSystemTime(new Date("2026-11-06T11:00:00.000Z"))
    await editar(sesiones.perez, "p-camila", "pr-46", { estado: "agendada", appointmentId: "cita-perez" })
    const antes = base.volcado()

    const res = await borrar(sesiones.perez, "p-camila", "pr-46")

    expect(res.status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it.each(AJENOS)("%s: 404 (o 401 sin permiso) y nada se borra", async (_caso, sesion, id, prestacionId, status) => {
    const antes = base.volcado()

    const res = await borrar(sesion, id, prestacionId)

    expect(res.status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })
})
