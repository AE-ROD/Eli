import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_PROTESIS_ANULADA, MENSAJE_YA_EN_EL_PLAN, type AlPlanRespuesta } from "@/lib/edicion-de-protesis"
import { MENSAJE_ETAPA_APROBADA, MENSAJE_SIN_PLAN } from "@/lib/edicion-del-plan"
import { CLINICA, conParams, sesionesDentales as sesiones } from "../../../../_pruebas/clinica-dental"
import { escenarioDeProtesis, protesis } from "../../../../_pruebas/protesis"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenarioDeProtesis())
})

afterEach(() => {
  vi.useRealTimers()
})

async function alPlan(sesion: unknown, protesisId: string, cuerpo?: unknown, id = "p-camila") {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(`http://localhost/api/clientes/${id}/protesis/${protesisId}/al-plan`, cuerpo), conParams({ id, protesisId }))
}

async function nuevaVersion(sesion: unknown, desde: string) {
  const { POST } = await import("../../../plan/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido("http://localhost/api/clientes/p-camila/plan", { desde }), conParams({ id: "p-camila" }))
}

const ligadas = (protesisId: string) => base.buscar("prestacionDelPlan", { protesisId })

describe("POST /api/clientes/[id]/protesis/[protesisId]/al-plan", () => {
  it("crea una prestación de Boca en la última etapa por aprobar del plan vigente, con nombre armado, valor y tratante", async () => {
    const res = await alPlan(sesiones.perez, "pt-removible")

    expect(res.status).toBe(201)
    const cuerpo = (await res.json()) as AlPlanRespuesta
    expect(cuerpo.etapaId).toBe("et-rehabilitacion")
    expect(cuerpo.protesis).toMatchObject({ id: "pt-removible", enElPlan: true })
    const [prestacion] = ligadas("pt-removible")
    expect(prestacion).toMatchObject({
      id: cuerpo.prestacionId,
      businessId: CLINICA,
      etapaId: "et-rehabilitacion",
      orden: 3,
      pieza: null,
      caras: [],
      serviceId: null,
      nombre: "Removible parcial · Acrílico termocurado (45, 46, 47)",
      memberId: "m-perez",
      profesionalNombre: "Diego Pérez",
      estado: "por-agendar",
      valorCents: 18_000_000,
    })
  })

  it("una segunda vez es 409, también después de copiar el plan en una versión nueva (la copia conserva el vínculo)", async () => {
    expect((await alPlan(sesiones.dueña, "pt-removible")).status).toBe(201)
    const otra = await alPlan(sesiones.dueña, "pt-removible")
    expect(otra.status).toBe(409)
    expect(await otra.json()).toEqual({ error: MENSAJE_YA_EN_EL_PLAN })

    expect((await nuevaVersion(sesiones.dueña, "copia")).status).toBe(201)
    expect(ligadas("pt-removible")).toHaveLength(2)
    expect((await alPlan(sesiones.dueña, "pt-removible")).status).toBe(409)

    // Una versión vacía ya no la tiene: se puede volver a agregar.
    expect((await nuevaVersion(sesiones.dueña, "vacio")).status).toBe(201)
    expect((await alPlan(sesiones.dueña, "pt-removible")).status).toBe(201)
  })

  it("en la etapa pedida si está por aprobar; aprobada es 409; de otro plan o de otra clínica, 404", async () => {
    expect((await alPlan(sesiones.dueña, "pt-removible", { etapaId: "et-higiene" })).status).toBe(409)
    expect(await (await alPlan(sesiones.dueña, "pt-removible", { etapaId: "et-higiene" })).json()).toEqual({ error: MENSAJE_ETAPA_APROBADA })
    expect((await alPlan(sesiones.dueña, "pt-removible", { etapaId: "et-vieja" })).status).toBe(404)
    expect((await alPlan(sesiones.dueña, "pt-removible", { etapaId: "et-beto" })).status).toBe(404)
    expect((await alPlan(sesiones.dueña, "pt-removible", { etapaId: "et-ajena" })).status).toBe(404)
    expect(ligadas("pt-removible")).toEqual([])
  })

  it("sin etapas por aprobar, crea la etapa Prótesis al final", async () => {
    const escenario = escenarioDeProtesis()
    base.reiniciar({
      ...escenario,
      etapaDelPlan: escenario.etapaDelPlan.map((etapa) => (etapa.id === "et-rehabilitacion" ? { ...etapa, estado: "aprobada" } : etapa)),
    })
    const res = await alPlan(sesiones.dueña, "pt-removible")

    expect(res.status).toBe(201)
    const { etapaId } = (await res.json()) as AlPlanRespuesta
    expect(base.buscar("etapaDelPlan", { id: etapaId })[0]).toMatchObject({ planId: "plan-v2", orden: 3, nombre: "Prótesis", estado: "por-aprobar" })
  })

  it("sin plan vigente, 409; una prótesis anulada, 409", async () => {
    const escenario = escenarioDeProtesis()
    base.reiniciar({
      ...escenario,
      protesis: [...escenario.protesis, protesis("pt-nadia", { customerId: "p-nadia" }), protesis("pt-anulada", { estado: "anulada", anuladaEn: new Date(), anuladaPorNombre: "X" })],
    })
    const sinPlan = await alPlan(sesiones.dueña, "pt-nadia", undefined, "p-nadia")
    expect(sinPlan.status).toBe(409)
    expect(await sinPlan.json()).toEqual({ error: MENSAJE_SIN_PLAN })
    const anulada = await alPlan(sesiones.dueña, "pt-anulada")
    expect(anulada.status).toBe(409)
    expect(await anulada.json()).toEqual({ error: MENSAJE_PROTESIS_ANULADA })
  })

  it.each([
    ["una prótesis de otro paciente", sesiones.dueña, "pt-beto", "p-camila"],
    ["una prótesis de otra clínica", sesiones.dueña, "pt-ajena", "p-camila"],
    ["el encargado (ve el plan, no las prótesis)", sesiones.encargado, "pt-removible", "p-camila"],
    ["fuera de una clínica dental", sesiones.salon, "pt-removible", "p-salon"],
  ])("%s: 404 y no escribe nada", async (_caso, sesion, protesisId, id) => {
    const antes = base.volcado()
    expect((await alPlan(sesion, protesisId, undefined, id)).status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin sesión, 401", async () => {
    expect((await alPlan(null, "pt-removible")).status).toBe(401)
  })
})
