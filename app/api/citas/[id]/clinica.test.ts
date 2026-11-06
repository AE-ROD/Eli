import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"
import { citaDental, datosDeLaClinica, santiago, sesionesDentales } from "@/pruebas/clinica-con-sillones"
import {
  CODIGO_SILLON_OCUPADO,
  MENSAJE_SILLON_DE_CITA_CERRADA,
  MENSAJE_SILLON_INACTIVO,
  MENSAJE_SILLON_NO_ENCONTRADO,
} from "@/lib/sillones"

/**
 * Una cita de la clínica dental: el sillón al editarla y moverla, la alerta
 * de alergias en el detalle, y qué le pasa a lo clínico (prestaciones del plan
 * y evoluciones) al cancelarla o borrarla.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

// Liberar una hora avisa a la lista de espera después de responder: acá no interesa.
vi.mock("@/lib/lista-de-espera", () => ({ programarAvisoDeHoraLiberada: vi.fn() }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/citas/x"
/** El martes 20 a las 08:00 de Santiago: todas las citas de prueba son de más tarde. */
const AHORA = santiago("2026-10-20", "08:00")

const prestacion = (id: string, datos: Record<string, unknown>) => ({
  id,
  businessId: NEGOCIO,
  etapaId: "et-1",
  orden: 1,
  nombre: "Obturación",
  valorCents: 3_500_000,
  estado: "por-agendar",
  ...datos,
})

function escenario() {
  base.reiniciar({
    ...datosDeLaClinica(),
    appointment: [
      citaDental("cita-carla", "2026-10-20", "10:00", "11:00", { sillonId: "sl-1" }),
      citaDental("cita-pedro", "2026-10-20", "11:00", "12:00", { memberId: "m-pedro", customerId: "c-beto", sillonId: "sl-2" }),
      citaDental("cita-sin-sillon", "2026-10-20", "12:00", "12:30"),
      // De Pedro, sin sillón, pisándose con la de Carla en el sillón 1.
      citaDental("cita-beto", "2026-10-20", "10:30", "11:00", { memberId: "m-pedro", customerId: "c-beto" }),
      citaDental("cita-en-espera", "2026-10-20", "13:00", "13:30", { status: "confirmada" }),
      citaDental("cita-cancelada", "2026-10-20", "10:30", "11:30", { sillonId: "sl-2", status: "cancelada" }),
      citaDental("cita-completada", "2026-10-19", "10:00", "10:30", { status: "completada" }),
      citaDental("cita-por-confirmar", "2026-10-21", "09:00", "09:30", { confirmacionPorFaltas: true }),
      { ...citaDental("cita-ajena", "2026-10-20", "10:00", "11:00"), businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno", sillonId: "sl-ajeno" },
    ],
    visit: [atencion("v-espera", { appointmentId: "cita-en-espera" })],
    fichaClinica: [
      { id: "f-maria", businessId: NEGOCIO, customerId: "c-maria", alergias: "Penicilina", antecedentes: "Hipertensa", actualizadaPor: "Ana" },
      { id: "f-ajena", businessId: OTRO_NEGOCIO, customerId: "c-ajeno", alergias: "Látex", actualizadaPor: "Otro" },
    ],
    evolucion: [
      { id: "ev-1", businessId: NEGOCIO, customerId: "c-maria", texto: "Caries en 16", autorNombre: "Carla", memberId: "m-carla", appointmentId: "cita-carla" },
    ],
    planDeTratamiento: [{ id: "plan-1", businessId: NEGOCIO, customerId: "c-maria", version: 1, creadoPorNombre: "Carla" }],
    etapaDelPlan: [{ id: "et-1", businessId: NEGOCIO, planId: "plan-1", orden: 1, nombre: "Urgencia" }],
    prestacionDelPlan: [
      prestacion("pr-agendada", { estado: "agendada", appointmentId: "cita-carla", pieza: 16, caras: ["O"] }),
      prestacion("pr-realizada", { orden: 2, estado: "realizada", appointmentId: "cita-carla", realizadaEn: santiago("2026-10-20", "10:30") }),
      prestacion("pr-por-confirmar", { orden: 3, estado: "agendada", appointmentId: "cita-por-confirmar" }),
    ],
  })
}

async function put(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(URL, cuerpo), conId(id))
}

async function get(sesion: unknown, id: string) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(URL), conId(id))
}

async function borrar(sesion: unknown, id: string) {
  const { DELETE } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return DELETE(pedido(URL), conId(id))
}

const mover = (fecha: string, inicio: string, fin: string, extra: Record<string, unknown> = {}) => ({
  startTime: santiago(fecha, inicio).toISOString(),
  endTime: santiago(fecha, fin).toISOString(),
  ...extra,
})

const cita = (id: string) => base.buscar("appointment", { id })[0]
const fila = (modelo: "prestacionDelPlan" | "evolucion", id: string) => base.buscar(modelo, { id })[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  escenario()
})

afterEach(() => vi.useRealTimers())

describe("PUT /api/citas/[id]: el sillón", () => {
  it("se asigna, se cambia y se quita", async () => {
    expect((await put(sesionesDentales.encargado, "cita-sin-sillon", { sillonId: "sl-2" })).status).toBe(200)
    expect(cita("cita-sin-sillon").sillonId).toBe("sl-2")

    expect((await put(sesionesDentales.encargado, "cita-sin-sillon", { sillonId: "sl-1" })).status).toBe(200)
    expect(cita("cita-sin-sillon").sillonId).toBe("sl-1")

    expect((await put(sesionesDentales.encargado, "cita-sin-sillon", { sillonId: null })).status).toBe(200)
    expect(cita("cita-sin-sillon").sillonId).toBeNull()
  })

  it("editar otra cosa no le toca el sillón", async () => {
    const res = await put(sesionesDentales.dueña, "cita-carla", { notes: "Trae radiografía" })

    expect(res.status).toBe(200)
    expect(cita("cita-carla")).toMatchObject({ sillonId: "sl-1", notes: "Trae radiografía" })
  })

  it("el sillón de otra clínica es 404 y no se escribe nada", async () => {
    const antes = base.volcado()
    const res = await put(sesionesDentales.dueña, "cita-sin-sillon", { sillonId: "sl-ajeno" })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: MENSAJE_SILLON_NO_ENCONTRADO })
    expect(base.volcado()).toEqual(antes)
  })

  it("un sillón desactivado es 400", async () => {
    const res = await put(sesionesDentales.dueña, "cita-sin-sillon", { sillonId: "sl-viejo" })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: MENSAJE_SILLON_INACTIVO })
    expect(cita("cita-sin-sillon").sillonId).toBeNull()
  })

  it("un sillón ocupado a esa hora es 409 con su código, aunque se confirmen las advertencias", async () => {
    const res = await put(sesionesDentales.dueña, "cita-beto", { sillonId: "sl-1", confirmarAdvertencias: true })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: "Sillón 1 ya tiene una cita de 10:00 a 11:00. Elige otro sillón u otra hora.",
      codigo: CODIGO_SILLON_OCUPADO,
    })
    expect(cita("cita-beto").sillonId).toBeNull()
  })

  it("se cambia con el paciente ya en la sala de espera (no es mover)", async () => {
    const res = await put(sesionesDentales.encargado, "cita-en-espera", { sillonId: "sl-1" })

    expect(res.status).toBe(200)
    expect(cita("cita-en-espera").sillonId).toBe("sl-1")
  })

  it("una cita cerrada no cambia de sillón", async () => {
    const res = await put(sesionesDentales.dueña, "cita-completada", { sillonId: "sl-1" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_SILLON_DE_CITA_CERRADA })
  })

  it("la odontóloga no llega a la cita de un colega: 404", async () => {
    const res = await put(sesionesDentales.carla, "cita-pedro", { sillonId: "sl-1" })

    expect(res.status).toBe(404)
    expect(cita("cita-pedro").sillonId).toBe("sl-2")
  })

  it("en un salón el sillón se ignora: no se guarda ni se valida", async () => {
    base.reiniciar({
      ...datosBase(),
      appointment: [citaDental("cita-carla", "2026-10-20", "10:00", "11:00")],
    })
    const res = await put(sesiones.dueña, "cita-carla", { sillonId: "sl-ajeno", notes: "Ok" })

    expect(res.status).toBe(200)
    expect(cita("cita-carla")).toMatchObject({ sillonId: null, notes: "Ok" })
  })
})

describe("PUT /api/citas/[id]: mover conserva el sillón y revisa el choque", () => {
  it("a una hora libre del sillón, se mueve y lo conserva", async () => {
    const res = await put(sesionesDentales.dueña, "cita-carla", mover("2026-10-20", "14:00", "15:00"))

    expect(res.status).toBe(200)
    expect(cita("cita-carla")).toMatchObject({ sillonId: "sl-1", startTime: santiago("2026-10-20", "14:00") })
  })

  it("a una hora en que el sillón está tomado, 409 y no se mueve", async () => {
    // cita-pedro ocupa el sillón 2 de 11 a 12.
    base.reiniciar({
      ...datosDeLaClinica(),
      appointment: [
        citaDental("cita-carla", "2026-10-20", "10:00", "11:00", { sillonId: "sl-2" }),
        citaDental("cita-pedro", "2026-10-20", "11:00", "12:00", { memberId: "m-pedro", sillonId: "sl-2" }),
      ],
    })
    const res = await put(sesionesDentales.dueña, "cita-carla", mover("2026-10-20", "11:30", "12:30", { confirmarAdvertencias: true }))

    expect(res.status).toBe(409)
    expect((await res.json()).codigo).toBe(CODIGO_SILLON_OCUPADO)
    expect(cita("cita-carla").startTime).toEqual(santiago("2026-10-20", "10:00"))
  })

  it("mover y cambiar de sillón a la vez revisa el sillón nuevo", async () => {
    const res = await put(sesionesDentales.dueña, "cita-sin-sillon", mover("2026-10-20", "10:30", "11:00", { sillonId: "sl-1" }))

    expect(res.status).toBe(409)
    expect(cita("cita-sin-sillon")).toMatchObject({ sillonId: null, startTime: santiago("2026-10-20", "12:00") })
  })

  it("reactivar una cancelada cuyo sillón ya está tomado es 409; sin choque, vuelve", async () => {
    // cita-cancelada era del sillón 2 de 10:30 a 11:30; cita-pedro lo ocupa de 11 a 12.
    const res = await put(sesionesDentales.dueña, "cita-cancelada", { status: "confirmada", confirmarAdvertencias: true })

    expect(res.status).toBe(409)
    expect((await res.json()).codigo).toBe(CODIGO_SILLON_OCUPADO)
    expect(cita("cita-cancelada").status).toBe("cancelada")

    await put(sesionesDentales.dueña, "cita-pedro", { sillonId: null })
    const otra = await put(sesionesDentales.dueña, "cita-cancelada", { status: "confirmada", confirmarAdvertencias: true })
    expect(otra.status).toBe(200)
    expect(cita("cita-cancelada")).toMatchObject({ status: "confirmada", sillonId: "sl-2" })
  })
})

describe("GET /api/citas/[id]: la alerta de alergias", () => {
  it.each([
    ["la dueña", sesionesDentales.dueña],
    ["el encargado", sesionesDentales.encargado],
    ["la odontóloga", sesionesDentales.carla],
  ])("%s ve las alergias del paciente, y nada más de la ficha", async (_quien, sesion) => {
    const res = await get(sesion, "cita-carla")
    const detalle = await res.json()

    expect(res.status).toBe(200)
    expect(detalle).toMatchObject({ id: "cita-carla", alergias: "Penicilina", sillon: { id: "sl-1", nombre: "Sillón 1" } })
    expect(JSON.stringify(detalle)).not.toContain("Hipertensa")
  })

  it("sin ficha, null", async () => {
    const res = await get(sesionesDentales.dueña, "cita-pedro")

    expect((await res.json()).alergias).toBeNull()
  })

  it("en un salón la clave no viaja", async () => {
    const res = await get(sesiones.dueña, "cita-carla")
    const detalle = await res.json()

    expect(res.status).toBe(200)
    expect(detalle).not.toHaveProperty("alergias")
    expect(detalle).not.toHaveProperty("sillon")
  })

  it("la cita de otra clínica es 404", async () => {
    expect((await get(sesionesDentales.dueña, "cita-ajena")).status).toBe(404)
  })
})

describe("cancelar o borrar una cita con lo clínico ligado", () => {
  it("cancelar: la prestación agendada vuelve a por agendar; la realizada y la evolución quedan", async () => {
    const res = await put(sesionesDentales.dueña, "cita-carla", { status: "cancelada" })

    expect(res.status).toBe(200)
    expect(cita("cita-carla").status).toBe("cancelada")
    expect(fila("prestacionDelPlan", "pr-agendada")).toMatchObject({ estado: "por-agendar", appointmentId: null })
    expect(fila("prestacionDelPlan", "pr-realizada")).toMatchObject({ estado: "realizada", appointmentId: "cita-carla" })
    expect(fila("evolucion", "ev-1")).toMatchObject({ appointmentId: "cita-carla" })
  })

  it("cancelar una por confirmar también la suelta", async () => {
    const res = await put(sesionesDentales.encargado, "cita-por-confirmar", { status: "cancelada" })

    expect(res.status).toBe(200)
    expect(fila("prestacionDelPlan", "pr-por-confirmar")).toMatchObject({ estado: "por-agendar", appointmentId: null })
  })

  it("si la cancelación no pasa (el paciente ya llegó), no se suelta nada", async () => {
    base.reiniciar({
      ...datosDeLaClinica(),
      appointment: [citaDental("cita-carla", "2026-10-20", "10:00", "11:00")],
      visit: [atencion("v-1", { appointmentId: "cita-carla" })],
      planDeTratamiento: [{ id: "plan-1", businessId: NEGOCIO, customerId: "c-maria", version: 1, creadoPorNombre: "Carla" }],
      etapaDelPlan: [{ id: "et-1", businessId: NEGOCIO, planId: "plan-1", orden: 1, nombre: "Urgencia" }],
      prestacionDelPlan: [prestacion("pr-agendada", { estado: "agendada", appointmentId: "cita-carla" })],
    })
    const res = await put(sesionesDentales.dueña, "cita-carla", { status: "cancelada" })

    expect(res.status).toBe(409)
    expect(fila("prestacionDelPlan", "pr-agendada")).toMatchObject({ estado: "agendada", appointmentId: "cita-carla" })
  })

  it("marcar que no vino no toca el plan", async () => {
    vi.setSystemTime(santiago("2026-10-20", "11:30"))
    const res = await put(sesionesDentales.dueña, "cita-carla", { status: "no-asistio" })

    expect(res.status).toBe(200)
    expect(fila("prestacionDelPlan", "pr-agendada")).toMatchObject({ estado: "agendada", appointmentId: "cita-carla" })
  })

  it("borrar: no revienta, suelta prestaciones y evoluciones, y conserva lo realizado", async () => {
    const res = await borrar(sesionesDentales.dueña, "cita-carla")

    expect(res.status).toBe(200)
    expect(cita("cita-carla")).toBeUndefined()
    expect(fila("prestacionDelPlan", "pr-agendada")).toMatchObject({ estado: "por-agendar", appointmentId: null })
    expect(fila("prestacionDelPlan", "pr-realizada")).toMatchObject({ estado: "realizada", appointmentId: null })
    expect(fila("evolucion", "ev-1")).toMatchObject({ appointmentId: null, texto: "Caries en 16" })
  })

  it("si algo clínico sigue ligado (sesión sin el rubro todavía), 409 en vez de 500 y no se borra", async () => {
    const sesionVieja = { user: { ...sesionesDentales.dueña.user, rubro: undefined } }
    const res = await borrar(sesionVieja, "cita-carla")

    expect(res.status).toBe(409)
    expect(cita("cita-carla")).toBeDefined()
  })

  it("la cita de otra clínica no se borra: 404", async () => {
    const antes = base.volcado()

    expect((await borrar(sesionesDentales.dueña, "cita-ajena")).status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })
})
