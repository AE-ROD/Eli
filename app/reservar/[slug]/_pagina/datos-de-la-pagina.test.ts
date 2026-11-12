import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"

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

/**
 * Qué servicios hace cada integrante del equipo: lo que la mini página y el
 * primer paso de la reserva usan para mostrar y filtrar. `null` es "hace todos"
 * (sin filas en `member_services`); con filas, sólo servicios ACTIVOS de este
 * negocio.
 */
describe("leerPaginaDelNegocio: qué servicios hace cada integrante del equipo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const fila = (negocio: string, memberId: string, serviceId: string) => ({
    id: `ms-${negocio}-${memberId}-${serviceId}`,
    businessId: negocio,
    memberId,
    serviceId,
  })

  async function equipoDe(slug = "salon-uno") {
    const { leerPaginaDelNegocio } = await import("./datos-de-la-pagina")
    const pagina = await leerPaginaDelNegocio(slug)
    return pagina?.equipo ?? []
  }

  it("sin servicios acotados hace todos (null); con filas, sólo esos, en el orden del catálogo", async () => {
    escenario({
      memberService: [fila(NEGOCIO, "m-carla", "s-color"), fila(NEGOCIO, "m-carla", "s-corte")],
    })

    expect(await equipoDe()).toEqual([
      expect.objectContaining({ id: "m-carla", servicioIds: ["s-corte", "s-color"] }),
      expect.objectContaining({ id: "m-pedro", servicioIds: null }),
    ])
  })

  it("nunca trae el id de un servicio inactivo ni el de otro negocio, aunque haya una fila que lo apunte", async () => {
    escenario({
      memberService: [
        fila(NEGOCIO, "m-carla", "s-corte"),
        // Inactivo, del mismo negocio.
        fila(NEGOCIO, "m-carla", "s-viejo"),
        // Una fila rota de este negocio que apunta a un servicio de otro.
        fila(NEGOCIO, "m-carla", "s-ajeno"),
        // Una fila de otro negocio sobre este miembro.
        fila(OTRO_NEGOCIO, "m-carla", "s-color"),
        // Lo propio del otro negocio.
        fila(OTRO_NEGOCIO, "m-ajeno", "s-ajeno"),
      ],
    })

    const equipo = await equipoDe()
    expect(equipo.find((profesional) => profesional.id === "m-carla")?.servicioIds).toEqual(["s-corte"])
    const publicado = JSON.stringify(equipo)
    expect(publicado).not.toContain("s-viejo")
    expect(publicado).not.toContain("s-ajeno")
    // Y el equipo del otro negocio no trae a nadie de éste.
    expect(equipo.map((profesional) => profesional.id)).not.toContain("m-ajeno")
  })

  it("quien tiene filas pero ninguna activa no hace ninguno (lista vacía), no 'hace todos'", async () => {
    escenario({ memberService: [fila(NEGOCIO, "m-carla", "s-viejo")] })

    const equipo = await equipoDe()
    expect(equipo.find((profesional) => profesional.id === "m-carla")?.servicioIds).toEqual([])
    expect(equipo.find((profesional) => profesional.id === "m-pedro")?.servicioIds).toBeNull()
  })

  it("el otro negocio ve sólo lo suyo", async () => {
    escenario({
      memberService: [fila(NEGOCIO, "m-carla", "s-corte"), fila(OTRO_NEGOCIO, "m-ajeno", "s-ajeno")],
    })

    const equipo = await equipoDe("salon-dos")
    expect(equipo).toEqual([expect.objectContaining({ id: "m-ajeno", servicioIds: ["s-ajeno"] })])
    expect(JSON.stringify(equipo)).not.toContain("s-corte")
  })

  it("el encargado no aparece en el equipo", async () => {
    escenario({})

    expect((await equipoDe()).map((profesional) => profesional.id)).toEqual(["m-carla", "m-pedro"])
  })
})

/**
 * `horaValle` dice si la mini página anuncia precios más bajos en horas valle:
 * encendida y con alguna franja. Una clínica dental no tiene hora valle, aunque
 * la bandera y las franjas sigan guardadas.
 */
describe("leerPaginaDelNegocio: hora valle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const franjaDeValle = (businessId: string) => ({ id: `f-${businessId}`, businessId, dayOfWeek: LUNES, desde: "10:00", hasta: "12:00", porcentaje: 20 })

  async function anunciaHoraValle({ type, activa = true, franjas = true }: { type?: string; activa?: boolean; franjas?: boolean }) {
    const datos = datosBase()
    base.reiniciar({
      ...datos,
      business: datos.business.map((negocio) => ({
        ...negocio,
        ...CAMPOS_DE_LA_PAGINA,
        ...(negocio.id === NEGOCIO ? { horaValleActiva: activa, ...(type ? { type } : {}) } : {}),
      })),
      service: datos.service.map((servicio) => ({ description: null, category: null, duration: 60, ...servicio })),
      franjaDeHoraValle: franjas ? [franjaDeValle(NEGOCIO)] : [],
    })
    const { leerPaginaDelNegocio } = await import("./datos-de-la-pagina")
    return (await leerPaginaDelNegocio("salon-uno"))?.horaValle
  }

  it.each(["salon", "barberia", "spa-de-unas", undefined])("%s: encendida y con franjas, la anuncia", async (type) => {
    expect(await anunciaHoraValle({ type })).toBe(true)
  })

  it("sin franjas o apagada, no la anuncia", async () => {
    expect(await anunciaHoraValle({ type: "salon", franjas: false })).toBe(false)
    expect(await anunciaHoraValle({ type: "salon", activa: false })).toBe(false)
  })

  it("clínica dental: no la anuncia, aunque esté encendida y con franjas guardadas", async () => {
    expect(await anunciaHoraValle({ type: "odontologia" })).toBe(false)
  })
})

describe("leerPaginaDelNegocio: el rubro", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("trae el rubro del negocio del slug (`Business.type`), y no el de otro negocio", async () => {
    const datos = datosBase()
    escenario({
      business: datos.business.map((negocio) => ({
        ...negocio,
        ...CAMPOS_DE_LA_PAGINA,
        type: negocio.id === NEGOCIO ? "odontologia" : "barberia",
      })),
    })
    const { leerPaginaDelNegocio } = await import("./datos-de-la-pagina")

    expect((await leerPaginaDelNegocio("salon-uno"))?.rubro).toBe("odontologia")
    expect((await leerPaginaDelNegocio("salon-dos"))?.rubro).toBe("barberia")
  })
})
