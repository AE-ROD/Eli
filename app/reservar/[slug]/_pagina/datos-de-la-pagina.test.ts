import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase } from "@/pruebas/datos"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const LUNES = 1
let siguiente = 1
const franja = (memberId: string | null, startTime: string, endTime: string) => ({
  id: `h-${siguiente++}`,
  businessId: NEGOCIO,
  memberId,
  dayOfWeek: LUNES,
  startTime,
  endTime,
})

/** Los campos de la página que el negocio de prueba no trae (sin default en el esquema). */
const CAMPOS_DE_LA_PAGINA = {
  address: null,
  comuna: null,
  whatsapp: null,
  instagram: null,
  color: null,
  logoUrl: null,
  coverUrl: null,
  mediosDePago: [],
}

function escenario(extra: Partial<ReturnType<typeof datosBase>> & Record<string, unknown[]>) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => ({ ...negocio, ...CAMPOS_DE_LA_PAGINA })),
    service: datos.service.map((servicio) => ({ description: null, category: null, duration: 60, ...servicio })),
    ...extra,
  })
}

async function horarioDelLunes() {
  const { leerPaginaDelNegocio } = await import("./datos-de-la-pagina")
  const pagina = await leerPaginaDelNegocio("salon-uno")
  return pagina?.horario.filter((dia) => dia.dayOfWeek === LUNES)
}

/**
 * El horario publicado calza con lo que la reserva ofrece: con profesionales,
 * la unión del horario efectivo (el propio, o si no el del negocio) de quien
 * `leerProfesionalesQueAtienden` devuelve (rol que atiende, con su tope) y
 * hace algún servicio activo; sin ellos, el del negocio.
 */
describe("leerPaginaDelNegocio: de quiénes se publica el horario", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("no publica el horario de quien atiende pero no hace ningún servicio activo", async () => {
    escenario({
      // Carla sólo hace el alisado, que ya no está activo; Pedro hace todo.
      memberService: [{ businessId: NEGOCIO, memberId: "m-carla", serviceId: "s-viejo" }],
      workSchedule: [
        franja(null, "09:00", "18:00"),
        franja("m-carla", "06:00", "08:00"),
        franja("m-pedro", "17:00", "20:00"),
      ],
    })

    // Pedro atiende en su horario propio; el del negocio no se suma aparte.
    expect(await horarioDelLunes()).toEqual([{ dayOfWeek: LUNES, startTime: "17:00", endTime: "20:00" }])
  })

  it("publica el de quien hace al menos un servicio activo; sin horario propio, el del negocio en que atiende", async () => {
    escenario({
      memberService: [
        { businessId: NEGOCIO, memberId: "m-carla", serviceId: "s-viejo" },
        { businessId: NEGOCIO, memberId: "m-carla", serviceId: "s-corte" },
      ],
      workSchedule: [franja(null, "09:00", "18:00"), franja("m-carla", "06:00", "08:00")],
    })

    // Carla en el suyo; Pedro, sin horario propio, en el del negocio.
    expect(await horarioDelLunes()).toEqual([
      { dayOfWeek: LUNES, startTime: "06:00", endTime: "08:00" },
      { dayOfWeek: LUNES, startTime: "09:00", endTime: "18:00" },
    ])
  })

  it("QA#4: la única profesional con horario propio L–M–X 14–20 publica eso, no el horario del negocio", async () => {
    const datos = datosBase()
    const fila = (memberId: string | null, dayOfWeek: number, startTime: string, endTime: string) => ({
      ...franja(memberId, startTime, endTime),
      dayOfWeek,
    })
    escenario({
      // Sin Pedro: Carla es la única profesional.
      businessMember: datos.businessMember.filter((miembro) => miembro.id !== "m-pedro"),
      workSchedule: [
        ...[1, 2, 3, 4, 5].map((dia) => fila(null, dia, "09:00", "18:00")),
        fila(null, 6, "10:00", "14:00"),
        ...[1, 2, 3].map((dia) => fila("m-carla", dia, "14:00", "20:00")),
      ],
    })

    const { leerPaginaDelNegocio } = await import("./datos-de-la-pagina")
    const pagina = await leerPaginaDelNegocio("salon-uno")
    expect(pagina?.horario).toEqual([1, 2, 3].map((dayOfWeek) => ({ dayOfWeek, startTime: "14:00", endTime: "20:00" })))
  })

  it("sin profesionales, publica el horario del negocio", async () => {
    const datos = datosBase()
    escenario({
      businessMember: datos.businessMember.filter((miembro) => miembro.role !== "worker"),
      workSchedule: [franja(null, "09:00", "18:00"), franja("m-encargado", "06:00", "08:00")],
    })

    expect(await horarioDelLunes()).toEqual([{ dayOfWeek: LUNES, startTime: "09:00", endTime: "18:00" }])
  })

  it("#168: un día sin horario general no hereda el del encargado (con o sin profesionales)", async () => {
    const datos = datosBase()
    escenario({ workSchedule: [franja("m-encargado", "06:00", "08:00")] })
    expect(await horarioDelLunes()).toEqual([])

    escenario({
      businessMember: datos.businessMember.filter((miembro) => miembro.role !== "worker"),
      workSchedule: [franja("m-encargado", "06:00", "08:00")],
    })
    expect(await horarioDelLunes()).toEqual([])
  })

  it("no publica el del encargado ni el de profesionales más allá del tope que lee la reserva", async () => {
    const datos = datosBase()
    // 99 profesionales más, entrados después de Carla y Pedro: son 101 y el
    // último queda fuera de los cien que lee la reserva.
    const extra = Array.from({ length: 99 }, (_, i) => ({
      id: `m-extra-${String(i).padStart(3, "0")}`,
      businessId: NEGOCIO,
      userId: `u-extra-${i}`,
      role: "worker",
      createdAt: new Date(Date.UTC(2026, 1, 1, 0, i)),
    }))
    const ultimo = extra[extra.length - 1].id
    escenario({
      user: [...datos.user, ...extra.map((miembro, i) => ({ id: miembro.userId, name: `Extra ${i}`, email: `extra${i}@uno.test` }))],
      businessMember: [...datos.businessMember, ...extra],
      workSchedule: [franja(null, "09:00", "18:00"), franja("m-encargado", "06:00", "08:00"), franja(ultimo, "19:00", "21:00")],
    })

    expect(await horarioDelLunes()).toEqual([{ dayOfWeek: LUNES, startTime: "09:00", endTime: "18:00" }])
  })
})
