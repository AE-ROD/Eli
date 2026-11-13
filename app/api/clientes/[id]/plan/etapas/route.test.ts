import { beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_SIN_PLAN } from "@/lib/edicion-del-plan"
import { CLINICA, conParams, escenarioDental, sesionesDentales as sesiones } from "../../../_pruebas/clinica-dental"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const url = (id: string) => `http://localhost/api/clientes/${id}/plan/etapas`

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenarioDental())
})

async function agregar(sesion: unknown, id: string, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(url(id), cuerpo), conParams({ id }))
}

describe("POST /api/clientes/[id]/plan/etapas", () => {
  it.each([
    ["la dueña", sesiones.dueña],
    ["un odontólogo", sesiones.nunez],
  ])("%s agrega una etapa al final del plan vigente, por aprobar", async (_quien, sesion) => {
    const res = await agregar(sesion, "p-camila", { nombre: "  Cirugía " })

    expect(res.status).toBe(201)
    const { plan } = await res.json()
    expect(plan.etapas.map((etapa: { nombre: string }) => etapa.nombre)).toEqual(["Higiene y urgencia", "Rehabilitación", "Cirugía"])
    expect(plan.etapas[2]).toMatchObject({ orden: 3, estado: "por-aprobar", prestaciones: [], subtotalCents: 0 })
    expect(base.buscar("etapaDelPlan", { nombre: "Cirugía" })).toEqual([
      expect.objectContaining({ businessId: CLINICA, planId: "plan-v2", orden: 3 }),
    ])
  })

  it("sin plan vigente: 409 con un mensaje que dice qué hacer", async () => {
    const res = await agregar(sesiones.dueña, "p-nadia", { nombre: "Cirugía" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_SIN_PLAN })
  })

  it("sin nombre: 400", async () => {
    const res = await agregar(sesiones.dueña, "p-camila", { nombre: "  " })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Escribe el nombre de la etapa" })
  })

  it("lo que mande el cuerpo como plan o negocio no cuenta: va al plan vigente de este paciente", async () => {
    await agregar(sesiones.dueña, "p-camila", { nombre: "Cirugía", planId: "plan-beto", businessId: "clinica-dos" })

    expect(base.buscar("etapaDelPlan", { nombre: "Cirugía" })[0]).toMatchObject({ planId: "plan-v2", businessId: CLINICA })
  })

  it("el encargado no edita el plan: 401 y nada escrito", async () => {
    const antes = base.volcado()

    const res = await agregar(sesiones.encargado, "p-camila", { nombre: "Cirugía" })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["la dueña de otra clínica", sesiones.dueñaAjena, "p-camila"],
    ["la dueña, con un paciente de otra clínica", sesiones.dueña, "p-ajena"],
    ["un salón", sesiones.salon, "p-salon"],
    ["una sesión sin rubro", sesiones.sinRubro, "p-camila"],
  ])("%s: 404 y nada escrito", async (_caso, sesion, id) => {
    const antes = base.volcado()

    const res = await agregar(sesion, id, { nombre: "Cirugía" })

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin sesión: 401", async () => {
    expect((await agregar(null, "p-camila", { nombre: "Cirugía" })).status).toBe(401)
  })
})
