import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"

/**
 * Sacar a alguien del equipo (`lib/sacar-del-equipo.ts`): quién saca a quién,
 * lo que bloquea (horas por delante, atenciones abiertas), lo que sólo avisa
 * (plata pendiente), lo que se limpia y el aislamiento entre negocios.
 */

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return base.prisma
  },
}))

const AHORA = new Date("2026-11-21T15:00:00Z")
const MAÑANA = new Date("2026-11-22T15:00:00Z")
const AYER = new Date("2026-11-20T15:00:00Z")
const hora = (inicio: Date) => new Date(inicio.getTime() + 60 * 60 * 1000)

function datos(extra: Record<string, unknown[]> = {}) {
  const base = datosBase() as Record<string, unknown[]>
  return { ...base, ...Object.fromEntries(Object.entries(extra).map(([tabla, filas]) => [tabla, [...(base[tabla] ?? []), ...filas]])) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] })
  base.reiniciar(datos())
})

async function revisar(sesion: unknown, id: string) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await GET(new Request("http://x") as never, { params: Promise.resolve({ id }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function sacar(sesion: unknown, id: string) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await POST(new Request("http://x", { method: "POST" }) as never, { params: Promise.resolve({ id }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const miembro = (id: string) => base.buscar("businessMember", { id })[0]

const cita = (id: string, memberId: string, inicio: Date, status = "confirmada") => ({
  id,
  businessId: NEGOCIO,
  memberId,
  customerId: "c-maria",
  title: "Corte",
  startTime: inicio,
  endTime: hora(inicio),
  status,
})

describe("quién saca a quién", () => {
  it("la dueña saca a un profesional y al encargado", async () => {
    expect((await sacar(sesiones.dueña, "m-carla")).status).toBe(200)
    expect((await sacar(sesiones.dueña, "m-encargado")).status).toBe(200)
    expect(miembro("m-carla")?.archivadoEn).toEqual(AHORA)
    expect(miembro("m-encargado")?.archivadoEn).toEqual(AHORA)
  })

  it("el encargado saca a un profesional, pero no a otro encargado ni a sí mismo", async () => {
    base.reiniciar(
      datos({
        user: [{ id: "u-encargada-2", name: "Eva Encargada", email: "eva@uno.test" }],
        businessMember: [{ id: "m-encargado-2", businessId: NEGOCIO, userId: "u-encargada-2", role: "admin" }],
      })
    )
    expect((await sacar(sesiones.encargado, "m-carla")).status).toBe(200)
    expect((await sacar(sesiones.encargado, "m-encargado-2")).status).toBe(403)
    expect((await sacar(sesiones.encargado, "m-encargado")).status).toBe(403)
    expect(miembro("m-encargado-2")?.archivadoEn).toBeNull()
    expect(miembro("m-encargado")?.archivadoEn).toBeNull()
  })

  it("el profesional no saca a nadie, ni a un colega ni a sí mismo: 401", async () => {
    expect((await sacar(sesiones.carla, "m-pedro")).status).toBe(401)
    expect((await sacar(sesiones.carla, "m-carla")).status).toBe(401)
    expect((await revisar(sesiones.carla, "m-pedro")).status).toBe(401)
    expect(miembro("m-pedro")?.archivadoEn).toBeNull()
  })

  it("sin sesión: 401", async () => {
    expect((await sacar(null, "m-carla")).status).toBe(401)
  })
})

describe("aislamiento entre negocios (404, nunca 403)", () => {
  it("un integrante de otro negocio es 404 y no se toca", async () => {
    expect((await revisar(sesiones.dueña, "m-ajeno")).status).toBe(404)
    expect((await sacar(sesiones.dueña, "m-ajeno")).status).toBe(404)
    expect((await sacar(sesiones.dueñoAjeno, "m-carla")).status).toBe(404)
    expect(miembro("m-ajeno")?.archivadoEn).toBeNull()
    expect(miembro("m-carla")?.archivadoEn).toBeNull()
  })

  it("quien ya no está en el equipo es 404: no se saca dos veces", async () => {
    expect((await sacar(sesiones.dueña, "m-carla")).status).toBe(200)
    expect((await sacar(sesiones.dueña, "m-carla")).status).toBe(404)
  })

  it("el candado de la fila lleva el negocio de la sesión", async () => {
    await sacar(sesiones.dueña, "m-carla")
    const [, ...valores] = base.prisma.$queryRaw.mock.calls[0]
    expect(valores).toEqual(["m-carla", NEGOCIO])
  })
})

describe("lo que bloquea y lo que avisa", () => {
  it("con horas por delante no se la saca: 409 con cuántas y qué hacer", async () => {
    base.reiniciar(datos({ appointment: [cita("a-1", "m-carla", MAÑANA), cita("a-2", "m-carla", MAÑANA, "pendiente")] }))

    const revision = await revisar(sesiones.dueña, "m-carla")
    expect(revision.cuerpo).toMatchObject({ citasPorDelante: 2, atencionesAbiertas: 0 })
    expect(revision.cuerpo.motivoParaNoSacar).toContain("2 horas por delante")

    const { status, cuerpo } = await sacar(sesiones.dueña, "m-carla")
    expect(status).toBe(409)
    expect(cuerpo.error).toContain("Muévelas a otra persona o cancélalas")
    expect(miembro("m-carla")?.archivadoEn).toBeNull()
  })

  it("las horas pasadas, canceladas o de otra persona no bloquean", async () => {
    base.reiniciar(
      datos({
        appointment: [
          cita("a-1", "m-carla", AYER),
          cita("a-2", "m-carla", MAÑANA, "cancelada"),
          cita("a-3", "m-carla", MAÑANA, "no-asistio"),
          cita("a-4", "m-pedro", MAÑANA),
        ],
      })
    )
    expect((await revisar(sesiones.dueña, "m-carla")).cuerpo.citasPorDelante).toBe(0)
    expect((await sacar(sesiones.dueña, "m-carla")).status).toBe(200)
  })

  it("con una atención abierta en el Tablero no se la saca", async () => {
    base.reiniciar(
      datos({
        visit: [{ id: "v-1", businessId: NEGOCIO, status: "por-cobrar" }],
        visitService: [{ id: "l-1", businessId: NEGOCIO, visitId: "v-1", memberId: "m-carla", name: "Corte", priceCents: 800000 }],
      })
    )
    const { status, cuerpo } = await sacar(sesiones.dueña, "m-carla")
    expect(status).toBe(409)
    expect(cuerpo.error).toContain("atención abierta")
  })

  it("la plata pendiente avisa, no bloquea, y la persona sigue en Liquidaciones", async () => {
    base.reiniciar(
      datos({
        movimientoDeLiquidacion: [
          { id: "mov-1", businessId: NEGOCIO, memberId: "m-carla", tipo: "adelanto", montoCents: 1000000, fecha: AYER, creadoPorId: "u-duena", creadoPorNombre: "Dueña" },
        ],
      })
    )
    expect((await revisar(sesiones.dueña, "m-carla")).cuerpo.tienePlataPendiente).toBe(true)
    const { status, cuerpo } = await sacar(sesiones.dueña, "m-carla")
    expect(status).toBe(200)
    expect(cuerpo.tienePlataPendiente).toBe(true)
  })
})

describe("al sacarla", () => {
  it("se borran su horario y sus bloqueos por delante; los pasados quedan; su lista de espera pasa a cualquiera", async () => {
    base.reiniciar(
      datos({
        workSchedule: [
          { id: "h-carla", businessId: NEGOCIO, memberId: "m-carla", dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
          { id: "h-pedro", businessId: NEGOCIO, memberId: "m-pedro", dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
        ],
        timeBlock: [
          { id: "b-futuro", businessId: NEGOCIO, memberId: "m-carla", startTime: MAÑANA, endTime: hora(MAÑANA) },
          { id: "b-pasado", businessId: NEGOCIO, memberId: "m-carla", startTime: AYER, endTime: hora(AYER) },
        ],
        inscripcionEnEspera: [
          {
            id: "e-1",
            businessId: NEGOCIO,
            memberId: "m-carla",
            serviceId: "s-corte",
            fecha: "2026-11-22",
            nombre: "Ana",
            apellido: "Pérez",
            email: "ana@x.cl",
            tokenHash: "t",
          },
        ],
      })
    )
    expect((await sacar(sesiones.dueña, "m-carla")).status).toBe(200)
    expect(base.buscar("workSchedule").map((fila) => fila.id)).toEqual(["h-pedro"])
    expect(base.buscar("timeBlock").map((fila) => fila.id)).toEqual(["b-pasado"])
    expect(base.buscar("inscripcionEnEspera")[0].memberId).toBeNull()
  })

  it("deja de aparecer en el selector de la agenda", async () => {
    await sacar(sesiones.dueña, "m-carla")
    const { GET } = await import("../../route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const cuerpo = await (await GET()).json()
    expect(cuerpo.miembros.map((fila: { id: string }) => fila.id)).toEqual(["m-pedro"])
  })

  it("no toca a nadie del otro negocio", async () => {
    await sacar(sesiones.dueña, "m-carla")
    expect(base.buscar("businessMember", { businessId: OTRO_NEGOCIO }).every((fila) => fila.archivadoEn === null)).toBe(
      true
    )
  })
})
