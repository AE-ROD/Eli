import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_SEDE_DESACTIVADA_AL_AGENDAR } from "@/lib/rechazo-de-sede-inactiva"

/**
 * Agendar una hora desde el panel cuando la dueña desactiva la sede a mitad
 * de camino (etapa 9, plan Independiente). El panel lee las sedes activas, las
 * revisa y recién después escribe: entre una cosa y la otra la sede puede
 * desactivarse (otra pestaña, otra persona del negocio). La rechaza el trigger
 * de la base (`citas_exigen_sede_activa`, bajo el candado del negocio) y la
 * ruta responde 409 con un mensaje claro, sin guardar nada.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const SOLO = "negocio-solo"

const dueñaSola = { user: { id: "u-sofia", role: "owner", businessId: SOLO, businessName: "Estudio Sofía", memberId: null } }

const sede = (id: string, nombre: string, orden: number) => ({
  id,
  businessId: SOLO,
  nombre,
  direccion: `Calle ${nombre} 123`,
  comuna: "Santiago",
  orden,
})

function escenario() {
  base.reiniciar({
    user: [{ id: "u-sofia", name: "Sofía Sola", email: "sofia@solo.test" }],
    business: [{ id: SOLO, name: "Estudio Sofía", slug: "estudio-sofia", userId: "u-sofia", plan: "independiente", timezone: "America/Santiago" }],
    customer: [{ id: "c-ana", businessId: SOLO, name: "Ana", lastName: "Pérez", email: "ana@correo.test" }],
    sede: [sede("sede-centro", "Centro", 0), sede("sede-providencia", "Providencia", 1)],
  })
}

/** Una hora por delante (2099) y `confirmarAdvertencias`: lo que se prueba es la sede, no el horario de atención. */
const nueva = (extra: Record<string, unknown> = {}) => ({
  title: "Corte",
  customerId: "c-ana",
  startTime: "2099-10-20T13:00:00.000Z",
  endTime: "2099-10-20T14:00:00.000Z",
  confirmarAdvertencias: true,
  ...extra,
})

async function crear(cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(dueñaSola)
  return POST(pedido("http://localhost/api/citas", cuerpo))
}

/**
 * La sede se desactiva justo después de que la ruta lee las sedes del negocio
 * (`leerSedesParaAgendar`, que las trae con el negocio): la ruta ya decidió con
 * la sede activa. Sólo esa lectura: la que trae `sedes`.
 */
function desactivarCuandoLaRutaLeeLasSedes(sedeId: string) {
  const leer = base.prisma.business.findUnique.bind(base.prisma.business) as (args: { select?: { sedes?: unknown } }) => Promise<unknown>
  return vi.spyOn(base.prisma.business, "findUnique").mockImplementation(((args: { select?: { sedes?: unknown } }) =>
    leer(args).then(async (negocio) => {
      if (args.select?.sedes) await base.prisma.sede.update({ where: { id: sedeId }, data: { activo: false } })
      return negocio
    })) as never)
}

const citasDeAna = () => base.buscar("appointment", { customerId: "c-ana" })

describe("POST /api/citas con la sede desactivada a mitad de camino", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    escenario()
  })

  it("control: sin carrera, la hora se crea en esa sede", async () => {
    const res = await crear(nueva({ sedeId: "sede-providencia" }))

    expect(res.status).toBe(201)
    expect(citasDeAna()[0]).toMatchObject({ sedeId: "sede-providencia" })
  })

  it("si la sede se desactiva entre la lectura y la escritura: 409 claro y no se crea nada", async () => {
    desactivarCuandoLaRutaLeeLasSedes("sede-providencia")

    const res = await crear(nueva({ sedeId: "sede-providencia" }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_SEDE_DESACTIVADA_AL_AGENDAR })
    expect(base.buscar("sede", { id: "sede-providencia" })[0]).toMatchObject({ activo: false })
    expect(citasDeAna()).toHaveLength(0)
  })

  it("la respuesta no deja ver nada de la base", async () => {
    desactivarCuandoLaRutaLeeLasSedes("sede-providencia")

    const res = await crear(nueva({ sedeId: "sede-providencia" }))

    expect(JSON.stringify(await res.json())).not.toMatch(/23514|citas |sede-providencia|trigger/)
  })
})
