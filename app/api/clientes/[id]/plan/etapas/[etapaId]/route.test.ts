import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_VERSION_NO_VIGENTE } from "@/lib/edicion-del-plan"
import { APROBADA_EL, conParams, escenarioDental, sesionesDentales as sesiones } from "../../../../_pruebas/clinica-dental"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const ruta = () => import("./route")
const url = (id: string, etapaId: string) => `http://localhost/api/clientes/${id}/plan/etapas/${etapaId}`

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

async function editar(sesion: unknown, id: string, etapaId: string, cuerpo: unknown) {
  const { PATCH } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PATCH(pedido(url(id, etapaId), cuerpo), conParams({ id, etapaId }))
}

async function borrar(sesion: unknown, id: string, etapaId: string) {
  const { DELETE } = await ruta()
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return DELETE(pedido(url(id, etapaId)), conParams({ id, etapaId }))
}

const etapa = (id: string) => base.buscar("etapaDelPlan", { id })[0]

/** Los casos de aislamiento, iguales para PATCH y DELETE. */
const AJENOS = [
  ["una etapa de otro paciente de la misma clínica", sesiones.dueña, "p-camila", "et-beto", 404],
  ["una etapa de otra clínica", sesiones.dueña, "p-camila", "et-ajena", 404],
  ["la etapa ajena, pidiéndola por su propio paciente", sesiones.dueña, "p-ajena", "et-ajena", 404],
  ["una etapa que no existe", sesiones.dueña, "p-camila", "et-no-existe", 404],
  ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila", "et-rehabilitacion", 404],
  ["un salón", sesiones.salon, "p-salon", "et-rehabilitacion", 404],
  ["una sesión sin rubro", sesiones.sinRubro, "p-camila", "et-rehabilitacion", 404],
  ["el encargado", sesiones.encargado, "p-camila", "et-rehabilitacion", 401],
  ["sin sesión", null, "p-camila", "et-rehabilitacion", 401],
] as const

describe("PATCH /api/clientes/[id]/plan/etapas/[etapaId]", () => {
  it("cambia el nombre", async () => {
    const res = await editar(sesiones.perez, "p-camila", "et-rehabilitacion", { nombre: "Rehabilitación oral" })

    expect(res.status).toBe(200)
    expect((await res.json()).plan.etapas[1].nombre).toBe("Rehabilitación oral")
  })

  it("mueve una etapa y corre las demás", async () => {
    const res = await editar(sesiones.perez, "p-camila", "et-rehabilitacion", { orden: 1 })

    const { plan } = await res.json()
    expect(plan.etapas.map((e: { id: string; orden: number }) => [e.id, e.orden])).toEqual([
      ["et-rehabilitacion", 1],
      ["et-higiene", 2],
    ])
  })

  it("presentar sólo registra cuándo: no la aprueba ni manda nada", async () => {
    const res = await editar(sesiones.perez, "p-camila", "et-rehabilitacion", { accion: "presentar" })

    expect(res.status).toBe(200)
    expect((await res.json()).plan.etapas[1]).toMatchObject({
      estado: "por-aprobar",
      presentadaEn: AHORA.toISOString(),
      aprobadaEn: null,
    })
  })

  it("aprobar deja cuándo y quién (el nombre de quien la registra, desde la base)", async () => {
    const res = await editar(sesiones.perez, "p-camila", "et-rehabilitacion", { accion: "aprobar" })

    const { plan } = await res.json()
    expect(plan.etapas[1]).toMatchObject({ estado: "aprobada", aprobadaEn: AHORA.toISOString(), aprobadaPorNombre: "Diego Pérez" })
    expect(plan.totales.aprobadoCents).toBe(8_300_000 + 93_500_000)
  })

  it("volver a por aprobar borra la aprobación y la presentación", async () => {
    const res = await editar(sesiones.dueña, "p-camila", "et-higiene", { accion: "volver-a-por-aprobar" })

    expect((await res.json()).plan.etapas[0]).toMatchObject({
      estado: "por-aprobar",
      presentadaEn: null,
      aprobadaEn: null,
      aprobadaPorNombre: null,
    })
  })

  it.each([
    ["aprobar una aprobada", "et-higiene", { accion: "aprobar" }],
    ["presentar una aprobada", "et-higiene", { accion: "presentar" }],
    ["volver a por aprobar una por aprobar", "et-rehabilitacion", { accion: "volver-a-por-aprobar" }],
  ])("%s: 409 y nada cambia", async (_caso, etapaId, cuerpo) => {
    const antes = base.volcado()

    const res = await editar(sesiones.dueña, "p-camila", etapaId, cuerpo)

    expect(res.status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it("una etapa sin prestaciones no se aprueba: 409", async () => {
    base.reiniciar({ ...escenarioDental(), prestacionDelPlan: [] })

    const res = await editar(sesiones.dueña, "p-camila", "et-rehabilitacion", { accion: "aprobar" })

    expect(res.status).toBe(409)
  })

  it("una etapa de una versión vieja no se edita: 409", async () => {
    const res = await editar(sesiones.dueña, "p-camila", "et-vieja", { nombre: "Otra" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_VERSION_NO_VIGENTE })
    expect(etapa("et-vieja").nombre).toBe("Etapa de la versión 1")
  })

  it("sin nada que cambiar: 400", async () => {
    const res = await editar(sesiones.dueña, "p-camila", "et-rehabilitacion", {})

    expect(res.status).toBe(400)
  })

  it.each(AJENOS)("%s: 404 (o 401 sin permiso) y nada cambia", async (_caso, sesion, id, etapaId, status) => {
    const antes = base.volcado()

    const res = await editar(sesion, id, etapaId, { nombre: "Cambiada", accion: "aprobar" })

    expect(res.status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })
})

describe("DELETE /api/clientes/[id]/plan/etapas/[etapaId]", () => {
  it("borra una etapa por aprobar sin nada agendado, con sus prestaciones, y renumera", async () => {
    base.reiniciar({
      ...escenarioDental(),
      etapaDelPlan: [
        ...escenarioDental().etapaDelPlan,
        { id: "et-cirugia", businessId: "clinica-aurora", planId: "plan-v2", orden: 3, nombre: "Cirugía" },
      ],
    })

    const res = await borrar(sesiones.perez, "p-camila", "et-rehabilitacion")

    expect(res.status).toBe(200)
    const { plan } = await res.json()
    expect(plan.etapas.map((e: { id: string; orden: number }) => [e.id, e.orden])).toEqual([
      ["et-higiene", 1],
      ["et-cirugia", 2],
    ])
    expect(base.buscar("prestacionDelPlan", { etapaId: "et-rehabilitacion" })).toEqual([])
  })

  it("una etapa aprobada no se borra: 409", async () => {
    const antes = base.volcado()

    const res = await borrar(sesiones.dueña, "p-camila", "et-higiene")

    expect(res.status).toBe(409)
    expect(base.volcado()).toEqual(antes)
    expect(etapa("et-higiene").aprobadaEn).toEqual(APROBADA_EL)
  })

  it("una etapa con algo agendado o realizado no se borra: 409", async () => {
    const datos = escenarioDental()
    datos.prestacionDelPlan = datos.prestacionDelPlan.map((p) =>
      p.id === "pr-46" ? { ...p, estado: "agendada", appointmentId: "cita-perez" } : p
    )
    base.reiniciar(datos)
    const antes = base.volcado()

    const res = await borrar(sesiones.dueña, "p-camila", "et-rehabilitacion")

    expect(res.status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it("una etapa de una versión vieja no se borra: 409", async () => {
    expect((await borrar(sesiones.dueña, "p-camila", "et-vieja")).status).toBe(409)
    expect(etapa("et-vieja")).toBeDefined()
  })

  it.each(AJENOS)("%s: 404 (o 401 sin permiso) y nada se borra", async (_caso, sesion, id, etapaId, status) => {
    const antes = base.volcado()

    const res = await borrar(sesion, id, etapaId)

    expect(res.status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })
})
