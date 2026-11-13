import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { conId, pedido } from "@/pruebas/datos"
import { MENSAJE_SEDE_DE_LA_HORA_DESACTIVADA } from "@/lib/rechazo-de-sede-inactiva"

/**
 * Editar una hora cuya sede está desactivada (etapa 9, plan Independiente).
 * El trigger de la base (`citas_exigen_sede_activa`) no deja volver a poner en
 * pie una hora en una sede que ya no atiende: reactivar una cancelada o mover
 * una pasada al futuro es un 409 claro. Lo que sigue andando en una hora vieja
 * de esa sede: cancelarla, completarla, marcar "no vino", confirmarla, editarla.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

// El aviso a la lista de espera sale después de responder (`after`): fuera de un pedido real no corre.
vi.mock("@/lib/lista-de-espera", () => ({ programarAvisoDeHoraLiberada: vi.fn() }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const SOLO = "negocio-solo"
const URL = "http://localhost/api/citas/x"

const dueñaSola = { user: { id: "u-sofia", role: "owner", businessId: SOLO, businessName: "Estudio Sofía", memberId: null } }

const FUTURA = { startTime: new Date("2099-10-20T13:00:00.000Z"), endTime: new Date("2099-10-20T14:00:00.000Z") }
const OTRA_HORA = { startTime: new Date("2099-10-21T13:00:00.000Z"), endTime: new Date("2099-10-21T14:00:00.000Z") }
const CANCELADA = { status: "cancelada", canceladaPor: "negocio", canceladaEn: new Date("2026-10-01T12:00:00.000Z") }

const sede = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id,
  businessId: SOLO,
  nombre,
  direccion: `Calle ${nombre} 123`,
  comuna: "Santiago",
  ...extra,
})

const cita = (id: string, sedeId: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  businessId: SOLO,
  customerId: "c-ana",
  memberId: null,
  title: "Corte",
  status: "pendiente",
  sedeId,
  ...FUTURA,
  ...extra,
})

/** Centro está activa; Antigua la desactivó la dueña (con estas horas adentro, de antes de desactivarla). */
function escenario() {
  base.reiniciar({
    user: [{ id: "u-sofia", name: "Sofía Sola", email: "sofia@solo.test" }],
    business: [{ id: SOLO, name: "Estudio Sofía", slug: "estudio-sofia", userId: "u-sofia", plan: "independiente", timezone: "America/Santiago" }],
    customer: [{ id: "c-ana", businessId: SOLO, name: "Ana", lastName: "Pérez", email: "ana@correo.test" }],
    sede: [sede("sede-centro", "Centro", { orden: 0 }), sede("sede-antigua", "Antigua", { orden: 1, activo: false })],
    appointment: [
      cita("cancelada-en-antigua", "sede-antigua", CANCELADA),
      cita("cancelada-en-centro", "sede-centro", CANCELADA),
      cita("viva-en-antigua", "sede-antigua"),
      cita("pasada-en-antigua", "sede-antigua", { startTime: new Date("2020-10-20T13:00:00.000Z"), endTime: new Date("2020-10-20T14:00:00.000Z") }),
      cita("sin-sede", null, CANCELADA),
    ],
  })
}

async function editar(id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(dueñaSola)
  return PUT(pedido(URL, cuerpo), conId(id))
}

const guardada = (id: string) => base.buscar("appointment", { id })[0]

describe("PUT /api/citas/[id] con la sede de la hora desactivada", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  it("reactivar una cancelada de una sede desactivada: 409 claro y la hora sigue cancelada", async () => {
    const res = await editar("cancelada-en-antigua", { status: "pendiente", confirmarAdvertencias: true })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_SEDE_DE_LA_HORA_DESACTIVADA })
    expect(guardada("cancelada-en-antigua")).toMatchObject({ status: "cancelada", canceladaPor: "negocio" })
  })

  it("el 409 no revela nada de la base", async () => {
    const res = await editar("cancelada-en-antigua", { status: "confirmada", confirmarAdvertencias: true })

    expect(JSON.stringify(await res.json())).not.toMatch(/23514|citas |sede-antigua|trigger/)
  })

  it("control: reactivar una cancelada de una sede ACTIVA sí se puede", async () => {
    const res = await editar("cancelada-en-centro", { status: "pendiente", confirmarAdvertencias: true })

    expect(res.status).toBe(200)
    expect(guardada("cancelada-en-centro")).toMatchObject({ status: "pendiente", canceladaPor: null })
  })

  it("una hora SIN sede se reactiva como siempre (el trigger no mira lo que no tiene sede)", async () => {
    const res = await editar("sin-sede", { status: "pendiente", confirmarAdvertencias: true })

    expect(res.status).toBe(200)
  })

  it("mover al futuro una hora pasada de una sede desactivada: 409 claro y no se mueve", async () => {
    const res = await editar("pasada-en-antigua", { ...{ startTime: OTRA_HORA.startTime.toISOString(), endTime: OTRA_HORA.endTime.toISOString() }, confirmarAdvertencias: true })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_SEDE_DE_LA_HORA_DESACTIVADA })
    expect(guardada("pasada-en-antigua").startTime).toEqual(new Date("2020-10-20T13:00:00.000Z"))
  })

  it("lo que sigue andando en una hora viva de una sede desactivada: confirmarla, cambiarle la hora y editarla", async () => {
    expect((await editar("viva-en-antigua", { status: "confirmada" })).status).toBe(200)
    expect(
      (await editar("viva-en-antigua", { startTime: OTRA_HORA.startTime.toISOString(), endTime: OTRA_HORA.endTime.toISOString(), notes: "Trae fotos", confirmarAdvertencias: true })).status
    ).toBe(200)
    expect(guardada("viva-en-antigua")).toMatchObject({ status: "confirmada", notes: "Trae fotos" })
  })

  it("y cerrarla: cancelarla o completarla", async () => {
    expect((await editar("viva-en-antigua", { status: "cancelada" })).status).toBe(200)
    expect(guardada("viva-en-antigua")).toMatchObject({ status: "cancelada" })

    escenario()
    expect((await editar("viva-en-antigua", { status: "completada" })).status).toBe(200)
    expect(guardada("viva-en-antigua")).toMatchObject({ status: "completada" })
  })
})
