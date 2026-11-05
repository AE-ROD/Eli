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
 * El horario publicado calza con lo que la reserva ofrece: sólo se suma el
 * horario propio de quien `leerProfesionalesQueAtienden` devuelve (rol que
 * atiende, con su tope) y hace algún servicio activo.
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

    expect(await horarioDelLunes()).toEqual([{ dayOfWeek: LUNES, startTime: "09:00", endTime: "20:00" }])
  })

  it("publica el de quien hace al menos un servicio activo", async () => {
    escenario({
      memberService: [
        { businessId: NEGOCIO, memberId: "m-carla", serviceId: "s-viejo" },
        { businessId: NEGOCIO, memberId: "m-carla", serviceId: "s-corte" },
      ],
      workSchedule: [franja(null, "09:00", "18:00"), franja("m-carla", "06:00", "08:00")],
    })

    expect(await horarioDelLunes()).toEqual([
      { dayOfWeek: LUNES, startTime: "06:00", endTime: "08:00" },
      { dayOfWeek: LUNES, startTime: "09:00", endTime: "18:00" },
    ])
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
