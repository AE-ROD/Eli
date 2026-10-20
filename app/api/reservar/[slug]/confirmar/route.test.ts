import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

vi.mock("@/lib/email", () => ({
  enviarConfirmacionCliente: vi.fn(async () => null),
  enviarAvisoProfesional: vi.fn(async () => null),
}))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Un lunes lejano. */
const FECHA = "2030-01-07"

/** Escritos a mano, nunca con la misma cuenta que el endpoint: el 7 de enero de 2030 es lunes. */
const DIA = 1
const OTRO_DIA = 2

const pedidoFalso = (cuerpo: unknown): NextRequest =>
  ({ headers: new Headers(), json: async () => cuerpo }) as unknown as NextRequest

const conSlug = { params: Promise.resolve({ slug: "salon-uno" }) }

const reserva = (hora: string, fecha = FECHA) => ({ servicioId: "s-corte", fecha, hora, nombre: "Lucía", apellido: "Pérez" })

let siguiente = 1
type Fila = { memberId?: string | null; startTime: string; endTime: string; dayOfWeek?: number; active?: boolean; businessId?: string }
const franja = ({ memberId = null, dayOfWeek = DIA, businessId = NEGOCIO, ...resto }: Fila) => ({
  id: `h-${siguiente++}`,
  businessId,
  memberId,
  dayOfWeek,
  ...resto,
})

function escenario(horarios: ReturnType<typeof franja>[]) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    // Corte de 60 minutos.
    service: datos.service.map((s) => (s.id === "s-corte" ? { ...s, duration: 60 } : s)),
    workSchedule: horarios,
  })
}

async function confirmar(hora: string, fecha = FECHA) {
  const { POST } = await import("./route")
  const res = await POST(pedidoFalso(reserva(hora, fecha)), conSlug)
  return { status: res.status, cuerpo: await res.json() }
}

const citasCreadas = () => base.buscar("appointment")

/**
 * El reloj del servidor, fijo: confirmar rechaza horas que ya pasaron y
 * fechas a más de 90 días, así que cada grupo de tests fija un "ahora" cerca
 * de las fechas que usa. Sólo se finge `Date`: las promesas siguen reales.
 */
function relojEn(instante: string) {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(instante))
}

afterEach(() => {
  vi.useRealTimers()
})

describe("POST /api/reservar/[slug]/confirmar: la hora tiene que caer en el horario de atención", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Seis días antes del lunes 7 de enero de 2030.
    relojEn("2030-01-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
  })

  it("dentro del horario general: crea la cita", async () => {
    escenario([franja({ startTime: "09:00", endTime: "13:00" })])

    const { status, cuerpo } = await confirmar("12:00")

    expect(status).toBe(201)
    expect(cuerpo).toMatchObject({ mensaje: "Reserva confirmada" })
    expect(citasCreadas()).toHaveLength(1)
    expect(citasCreadas()[0]).toMatchObject({ businessId: NEGOCIO, serviceId: "s-corte", status: "pendiente" })
  })

  it.each([
    ["antes de abrir", "08:00"],
    ["empezando dentro pero terminando después del cierre", "12:30"],
    ["después de cerrar", "14:00"],
    ["una hora que no existe", "99:00"],
  ])("fuera del horario (%s): 409 sin crear nada", async (_caso, hora) => {
    escenario([franja({ startTime: "09:00", endTime: "13:00" })])

    const { status, cuerpo } = await confirmar(hora)

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/fuera de la atención/)
    expect(citasCreadas()).toHaveLength(0)
    expect(base.buscar("customer", { name: "Lucía" })).toHaveLength(0)
  })

  it("con horario general, una hora que sólo cubre el horario de un profesional se rechaza", async () => {
    escenario([
      franja({ startTime: "09:00", endTime: "13:00" }),
      franja({ memberId: "m-carla", startTime: "15:00", endTime: "19:00" }),
    ])

    expect((await confirmar("16:00")).status).toBe(409)
    expect(citasCreadas()).toHaveLength(0)
  })

  it("sin horario general ese día, vale el de los profesionales", async () => {
    escenario([
      franja({ memberId: "m-carla", startTime: "15:00", endTime: "19:00" }),
      franja({ dayOfWeek: OTRO_DIA, startTime: "09:00", endTime: "13:00" }),
    ])

    expect((await confirmar("16:00")).status).toBe(201)
    expect((await confirmar("10:00")).status).toBe(409)
  })

  it("con dos franjas el mismo día, acepta en la segunda y rechaza en el hueco entre ambas", async () => {
    escenario([
      franja({ startTime: "09:00", endTime: "13:00" }),
      franja({ startTime: "15:00", endTime: "19:00" }),
    ])

    expect((await confirmar("13:30")).status).toBe(409)
    expect((await confirmar("18:00")).status).toBe(201)
  })

  it("un día sin atención: 409", async () => {
    escenario([franja({ dayOfWeek: OTRO_DIA, startTime: "09:00", endTime: "19:00" })])

    expect((await confirmar("10:00")).status).toBe(409)
  })

  it("no cuentan las franjas inactivas ni las de otro negocio", async () => {
    escenario([
      franja({ startTime: "09:00", endTime: "13:00", active: false }),
      franja({ businessId: OTRO_NEGOCIO, startTime: "09:00", endTime: "13:00" }),
    ])

    expect((await confirmar("10:00")).status).toBe(409)
    expect(citasCreadas()).toHaveLength(0)
  })

  it("dentro del horario pero con la hora ocupada: sigue respondiendo el 409 de siempre", async () => {
    escenario([franja({ startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00")).status).toBe(201)
    const { status, cuerpo } = await confirmar("10:00")

    expect(status).toBe(409)
    expect(cuerpo.error).toBe("El horario ya no está disponible")
    expect(citasCreadas()).toHaveLength(1)
  })
})

/**
 * El día de la semana y el instante de la cita salen de la zona del negocio.
 * Todo esperado está escrito a mano: la suite corre con TZ=UTC,
 * TZ=America/Santiago y TZ=Asia/Tokyo.
 */
describe("POST /api/reservar/[slug]/confirmar: el día y la hora del negocio", () => {
  const LUNES = 1
  const DOMINGO = 0

  beforeEach(() => {
    vi.clearAllMocks()
    // 1 de octubre de 2026: el 19 está 18 días después.
    relojEn("2026-10-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
  })

  function conZona(zona: string) {
    const volcado = base.volcado()
    base.reiniciar({
      ...volcado,
      business: volcado.business.map((n) => (n.id === NEGOCIO ? { ...n, timezone: zona } : n)),
    })
  }

  it("2026-10-19 es lunes: con atención sólo el lunes, acepta", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00", "2026-10-19")).status).toBe(201)
  })

  it("2026-10-19 es lunes: con atención sólo el domingo, rechaza", async () => {
    escenario([franja({ dayOfWeek: DOMINGO, startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00", "2026-10-19")).status).toBe(409)
    expect(citasCreadas()).toHaveLength(0)
  })

  it("guarda la cita en el instante UTC de las 10:00 de Santiago (UTC-3 en octubre)", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00", "2026-10-19")).status).toBe(201)

    const [cita] = citasCreadas()
    expect((cita.startTime as Date).toISOString()).toBe("2026-10-19T13:00:00.000Z")
    expect((cita.endTime as Date).toISOString()).toBe("2026-10-19T14:00:00.000Z")
  })

  it("en invierno Santiago está en UTC-4: las 10:00 del 13/7/2026 (lunes) son las 14:00 UTC", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])
    relojEn("2026-07-01T12:00:00.000Z")

    expect((await confirmar("10:00", "2026-07-13")).status).toBe(201)
    expect((citasCreadas()[0].startTime as Date).toISOString()).toBe("2026-07-13T14:00:00.000Z")
  })

  it("con otra zona guardada (Asia/Tokyo), las 10:00 del negocio son las 01:00 UTC", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])
    conZona("Asia/Tokyo")

    expect((await confirmar("10:00", "2026-10-19")).status).toBe(201)
    expect((citasCreadas()[0].startTime as Date).toISOString()).toBe("2026-10-19T01:00:00.000Z")
  })

  it("una cita existente a las 13:00 UTC ocupa las 10:00 del negocio en Santiago", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])
    base.reiniciar({
      ...base.volcado(),
      appointment: [
        {
          id: "cita-1",
          businessId: NEGOCIO,
          title: "Corte",
          status: "confirmada",
          startTime: new Date("2026-10-19T13:00:00.000Z"),
          endTime: new Date("2026-10-19T14:00:00.000Z"),
        },
      ],
    })

    const { status, cuerpo } = await confirmar("10:00", "2026-10-19")
    expect(status).toBe(409)
    expect(cuerpo.error).toBe("El horario ya no está disponible")
    expect((await confirmar("11:00", "2026-10-19")).status).toBe(201)
  })

  it("un día que no existe (2026-02-30): 409 sin crear nada", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00", "2026-02-30")).status).toBe(409)
    expect(citasCreadas()).toHaveLength(0)
  })
})

/** Fechas aceptadas: años 1900 a 9998 (lib/zona-horaria.ts). Fuera de eso, el mismo 409 que una fecha imposible. */
describe("POST /api/reservar/[slug]/confirmar: fechas fuera del rango de años", () => {
  const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6]

  beforeEach(() => {
    vi.clearAllMocks()
    // Un mes antes del último día aceptado: así 9998-12-31 cae dentro de los 90 días.
    relojEn("9998-12-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
    escenario(TODOS_LOS_DIAS.map((dayOfWeek) => franja({ dayOfWeek, startTime: "09:00", endTime: "13:00" })))
  })

  it.each(["0000-01-01", "0050-06-15", "0999-12-31", "1899-12-31", "9999-12-31"])("%s: 409 fuera de la atención, sin crear nada", async (fecha) => {
    const { status, cuerpo } = await confirmar("10:00", fecha)

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/fuera de la atención/)
    expect(citasCreadas()).toHaveLength(0)
    expect(base.buscar("customer", { name: "Lucía" })).toHaveLength(0)
  })

  it("9998-12-31 (jueves, último día aceptado): crea la cita a las 13:00 UTC (10:00 en Santiago, UTC-3 en diciembre)", async () => {
    escenario([franja({ dayOfWeek: 4, startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00", "9998-12-31")).status).toBe(201)
    expect((citasCreadas()[0].startTime as Date).toISOString()).toBe("9998-12-31T13:00:00.000Z")
  })
})

describe("POST /api/reservar/[slug]/confirmar: el día del salto del horario de verano", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    relojEn("2026-09-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
    // Domingo 2026-09-06 en Santiago: de 00:00 a 00:59 el reloj no pasa.
    escenario([franja({ dayOfWeek: 0, startTime: "00:00", endTime: "02:00" })])
  })

  it("00:00 no existe ese día: 409 fuera de la atención, sin crear nada", async () => {
    const { status, cuerpo } = await confirmar("00:00", "2026-09-06")

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/fuera de la atención/)
    expect(citasCreadas()).toHaveLength(0)
  })

  it("01:00 sí existe: crea la cita a las 04:00 UTC (UTC-3 desde el salto)", async () => {
    expect((await confirmar("01:00", "2026-09-06")).status).toBe(201)
    expect((citasCreadas()[0].startTime as Date).toISOString()).toBe("2026-09-06T04:00:00.000Z")
  })
})

/**
 * Sólo se reserva desde ahora hasta 90 días después, en el reloj del negocio
 * (A3). Antes se aceptaba cualquier fecha del año 1900 al 9998: se podían
 * cargar citas en el pasado o llenar la agenda de años futuros.
 * Esperados a mano: el 19/10/2026 a las 13:30 UTC son las 10:30 en Santiago
 * (UTC-3); del 1/10/2026 al 30/12/2026 hay 90 días (30 + 30 + 30).
 */
describe("POST /api/reservar/[slug]/confirmar: ni en el pasado ni a más de 90 días", () => {
  const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6]
  const todaLaSemana = () => escenario(TODOS_LOS_DIAS.map((dayOfWeek) => franja({ dayOfWeek, startTime: "09:00", endTime: "13:00" })))

  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
    todaLaSemana()
  })

  describe("hoy, lunes 19/10/2026 a las 10:30 del negocio", () => {
    beforeEach(() => relojEn("2026-10-19T13:30:00.000Z"))

    it.each([
      ["una hora de hoy que ya pasó", "10:00", "2026-10-19"],
      ["la hora en curso", "10:30", "2026-10-19"],
      ["ayer", "11:00", "2026-10-18"],
      ["hace años", "11:00", "2020-01-06"],
    ])("%s: 409 'ya pasó', sin crear nada", async (_caso, hora, fecha) => {
      const { status, cuerpo } = await confirmar(hora, fecha)

      expect(status).toBe(409)
      expect(cuerpo.error).toMatch(/ya pasó/)
      expect(citasCreadas()).toHaveLength(0)
      expect(base.buscar("customer", { name: "Lucía" })).toHaveLength(0)
    })

    it("una hora de hoy que todavía no llega (11:00): crea la cita", async () => {
      expect((await confirmar("11:00", "2026-10-19")).status).toBe(201)
      expect((citasCreadas()[0].startTime as Date).toISOString()).toBe("2026-10-19T14:00:00.000Z")
    })

    it("lo que ofrece disponibilidad hoy es exactamente lo que acepta confirmar", async () => {
      const { GET } = await import("../disponibilidad/route")
      const respuesta = await GET(
        {
          url: "http://localhost/api/reservar/salon-uno/disponibilidad?fecha=2026-10-19&servicioId=s-corte",
          headers: new Headers(),
        } as unknown as NextRequest,
        conSlug
      )
      const { slots } = await respuesta.json()
      expect(slots).toEqual(["11:00", "12:00"])

      for (const hora of ["09:00", "10:00", "10:30", "11:00", "12:00"]) {
        todaLaSemana()
        const { status } = await confirmar(hora, "2026-10-19")
        expect({ hora, status }).toEqual({ hora, status: slots.includes(hora) ? 201 : 409 })
      }
    })
  })

  describe("hoy, 1/10/2026", () => {
    beforeEach(() => relojEn("2026-10-01T12:00:00.000Z"))

    it("a 90 días justos (30/12/2026): crea la cita", async () => {
      expect((await confirmar("10:00", "2026-12-30")).status).toBe(201)
    })

    it.each([
      ["a 91 días", "2026-12-31"],
      ["años después", "2030-01-07"],
    ])("%s: 409 con el límite de 90 días, sin crear nada", async (_caso, fecha) => {
      const { status, cuerpo } = await confirmar("10:00", fecha)

      expect(status).toBe(409)
      expect(cuerpo.error).toMatch(/90 días/)
      expect(citasCreadas()).toHaveLength(0)
      expect(base.buscar("customer", { name: "Lucía" })).toHaveLength(0)
    })
  })
})

/**
 * Topes de la reserva pública (A3/M7). El límite por IP no alcanza: con IPs
 * rotativas se podía llenar la agenda de un negocio. Una reserva pública es
 * una cita con `serviceId` (el panel crea citas sin servicio; ver
 * `lib/reserva-publica.ts`).
 * Reloj: 1/10/2026 a las 12:00 UTC (09:00 en Santiago).
 */
describe("POST /api/reservar/[slug]/confirmar: topes anti-abuso", () => {
  const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6]
  const AHORA = "2026-10-01T12:00:00.000Z"

  let numero = 1
  /** Una cita del negocio 1 del cliente `customerId`, por defecto pública, futura y pendiente. */
  const cita = (customerId: string, datos: Record<string, unknown> = {}) => ({
    id: `cita-tope-${numero++}`,
    businessId: NEGOCIO,
    customerId,
    serviceId: "s-corte",
    title: "Corte",
    status: "pendiente",
    startTime: new Date("2026-10-20T13:00:00.000Z"),
    endTime: new Date("2026-10-20T14:00:00.000Z"),
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    ...datos,
  })

  function conDatos(customer: Record<string, unknown>[], appointment: Record<string, unknown>[]) {
    const volcado = base.volcado()
    base.reiniciar({ ...volcado, customer: [...volcado.customer, ...customer], appointment })
  }

  async function reservarCon(contacto: { email?: string; telefono?: string }, hora = "10:00", fecha = "2026-10-15") {
    const { POST } = await import("./route")
    const res = await POST(pedidoFalso({ ...reserva(hora, fecha), ...contacto }), conSlug)
    return { status: res.status, cuerpo: await res.json() }
  }

  const LUCIA = { id: "c-lucia", businessId: NEGOCIO, name: "Lucía", lastName: "Pérez", email: "lucia@correo.test", phone: "+56 9 1234 5678" }

  beforeEach(() => {
    vi.clearAllMocks()
    relojEn(AHORA)
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
    escenario(TODOS_LOS_DIAS.map((dayOfWeek) => franja({ dayOfWeek, startTime: "09:00", endTime: "13:00" })))
  })

  describe("por contacto: 3 reservas futuras como máximo", () => {
    it("el tope es 3", async () => {
      const { MAX_RESERVAS_FUTURAS_POR_CONTACTO } = await import("@/lib/reserva-publica")
      expect(MAX_RESERVAS_FUTURAS_POR_CONTACTO).toBe(3)
    })

    it("con 3 futuras del mismo email (escrito distinto): 429, sin crear nada", async () => {
      conDatos([LUCIA], [cita("c-lucia"), cita("c-lucia"), cita("c-lucia")])
      const clientesAntes = base.buscar("customer").length

      const { status, cuerpo } = await reservarCon({ email: "Lucia@Correo.TEST" })

      expect(status).toBe(429)
      expect(cuerpo.error).toMatch(/3 reservas/)
      expect(citasCreadas()).toHaveLength(3)
      expect(base.buscar("customer")).toHaveLength(clientesAntes)
    })

    it("con 3 futuras del mismo teléfono (escrito distinto, sin código de país): 429", async () => {
      conDatos([LUCIA], [cita("c-lucia"), cita("c-lucia"), cita("c-lucia")])

      const { status } = await reservarCon({ telefono: "9 1234-5678" })

      expect(status).toBe(429)
      expect(citasCreadas()).toHaveLength(3)
    })

    it("con 2 futuras: la tercera pasa", async () => {
      conDatos([LUCIA], [cita("c-lucia"), cita("c-lucia")])

      expect((await reservarCon({ email: "lucia@correo.test" })).status).toBe(201)
      expect(citasCreadas()).toHaveLength(3)
    })

    it("no cuentan las canceladas, las pasadas, las del panel (sin servicio) ni las de otro negocio", async () => {
      const AJENA = { ...LUCIA, id: "c-lucia-ajena", businessId: OTRO_NEGOCIO }
      conDatos(
        [LUCIA, AJENA],
        [
          cita("c-lucia", { status: "cancelada" }),
          cita("c-lucia", { startTime: new Date("2026-09-20T13:00:00.000Z"), endTime: new Date("2026-09-20T14:00:00.000Z") }),
          cita("c-lucia", { serviceId: null }),
          cita("c-lucia-ajena", { businessId: OTRO_NEGOCIO, serviceId: "s-ajeno" }),
          cita("c-lucia-ajena", { businessId: OTRO_NEGOCIO, serviceId: "s-ajeno" }),
          cita("c-lucia-ajena", { businessId: OTRO_NEGOCIO, serviceId: "s-ajeno" }),
        ]
      )

      expect((await reservarCon({ email: "lucia@correo.test", telefono: "+56912345678" })).status).toBe(201)
    })

    it("otro contacto no se ve afectado", async () => {
      conDatos([LUCIA], [cita("c-lucia"), cita("c-lucia"), cita("c-lucia")])

      expect((await reservarCon({ email: "otra@correo.test", telefono: "+56 9 8765 4321" })).status).toBe(201)
    })
  })

  describe("por negocio: 50 reservas públicas en 24 horas como máximo", () => {
    /** `cantidad` reservas públicas de distintos clientes, creadas `horasAtras` horas antes de AHORA. */
    function reservasCreadasHace(cantidad: number, horasAtras: number) {
      const creada = new Date(new Date(AHORA).getTime() - horasAtras * 3_600_000)
      return Array.from({ length: cantidad }, () => cita("c-maria", { createdAt: creada, status: "cancelada" }))
    }

    it("el tope es 50", async () => {
      const { MAX_RESERVAS_PUBLICAS_POR_DIA } = await import("@/lib/reserva-publica")
      expect(MAX_RESERVAS_PUBLICAS_POR_DIA).toBe(50)
    })

    it("con 50 creadas en las últimas 24 h (aunque estén canceladas): 429, sin crear nada", async () => {
      conDatos([], reservasCreadasHace(50, 23))

      const { status, cuerpo } = await reservarCon({ email: "nueva@correo.test" })

      expect(status).toBe(429)
      expect(cuerpo.error).toMatch(/demasiadas reservas/i)
      expect(citasCreadas()).toHaveLength(50)
    })

    it("con 49 en las últimas 24 h y otras de hace 25 h: pasa", async () => {
      conDatos([], [...reservasCreadasHace(49, 23), ...reservasCreadasHace(10, 25)])

      expect((await reservarCon({ email: "nueva@correo.test" })).status).toBe(201)
    })

    it("no cuentan las citas del panel (sin servicio) ni las de otro negocio", async () => {
      conDatos(
        [],
        [
          ...reservasCreadasHace(30, 1).map((c) => ({ ...c, serviceId: null })),
          ...reservasCreadasHace(30, 1).map((c) => ({ ...c, businessId: OTRO_NEGOCIO, serviceId: "s-ajeno", customerId: "c-ajeno" })),
        ]
      )

      expect((await reservarCon({ email: "nueva@correo.test" })).status).toBe(201)
    })
  })
})

/**
 * Doble reserva por carrera (A4). El chequeo de choque y la creación del
 * cliente y la cita iban sueltos: dos confirmaciones al mismo tiempo veían
 * las dos el horario libre y creaban las dos su cita.
 *
 * La base falsa corre las transacciones a la vez, sin aislamiento. Postgres
 * con `Serializable` hace que dos transacciones concurrentes den lo mismo que
 * una detrás de la otra (y aborta con P2034 a la que no puede ordenar). El
 * test de carrera lo modela poniendo en fila las transacciones: si el chequeo
 * o la creación quedaran fuera de la transacción, la fila no los protegería y
 * las dos reservas pasarían. Que el nivel pedido sea `Serializable` y que el
 * P2034 se reintente se prueba aparte.
 */
describe("POST /api/reservar/[slug]/confirmar: dos confirmaciones al mismo tiempo", () => {
  const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6]

  type FuncionDeTransaccion = (tx: unknown) => Promise<unknown>
  type Transaccion = (fn: FuncionDeTransaccion, opciones?: unknown) => Promise<unknown>
  const transaccion = base.prisma.$transaction as unknown as ReturnType<typeof vi.fn<Transaccion>>
  const original = transaccion.getMockImplementation() as Transaccion

  const errorDeSerializacion = () =>
    new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock. Please retry your transaction", {
      code: "P2034",
      clientVersion: "test",
    })

  beforeEach(() => {
    vi.clearAllMocks()
    relojEn("2026-10-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
    escenario(TODOS_LOS_DIAS.map((dayOfWeek) => franja({ dayOfWeek, startTime: "09:00", endTime: "13:00" })))
  })

  afterEach(() => {
    transaccion.mockImplementation(original)
  })

  it("con las transacciones en fila (lo que garantiza Serializable), sólo una de las dos reserva", async () => {
    let fila: Promise<unknown> = Promise.resolve()
    transaccion.mockImplementation((fn, opciones) => {
      const turno = fila.then(() => original(fn, opciones))
      fila = turno.catch(() => undefined)
      return turno
    })
    const { POST } = await import("./route")

    const respuestas = await Promise.all([
      POST(pedidoFalso({ ...reserva("10:00", "2026-10-15"), email: "una@correo.test" }), conSlug),
      POST(pedidoFalso({ ...reserva("10:00", "2026-10-15"), nombre: "Marta", email: "otra@correo.test" }), conSlug),
    ])

    expect(respuestas.map((respuesta) => respuesta.status).sort()).toEqual([201, 409])
    const rechazada = respuestas.find((respuesta) => respuesta.status === 409)!
    expect((await rechazada.json()).error).toBe("El horario ya no está disponible")
    expect(citasCreadas()).toHaveLength(1)
    // La rechazada tampoco deja un cliente suelto.
    expect(base.buscar("customer", { email: "una@correo.test" }).length + base.buscar("customer", { email: "otra@correo.test" }).length).toBe(1)
  })

  it("pide el nivel Serializable, y el chequeo y las escrituras van por el cliente de la transacción", async () => {
    const porLaTransaccion: string[] = []
    transaccion.mockImplementation((fn, opciones) =>
      original((tx) => {
        const espia = new Proxy(tx as Record<string, Record<string, (...args: unknown[]) => unknown>>, {
          get(destino, modelo: string) {
            const delegado = destino[modelo]
            return new Proxy(delegado, {
              get(objetivo, operacion: string) {
                return (...args: unknown[]) => {
                  porLaTransaccion.push(`${modelo}.${operacion}`)
                  return objetivo[operacion](...args)
                }
              },
            })
          },
        })
        return fn(espia)
      }, opciones)
    )

    expect((await confirmar("10:00", "2026-10-15")).status).toBe(201)

    expect(transaccion).toHaveBeenCalledTimes(1)
    expect(transaccion).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" })
    expect(porLaTransaccion).toEqual(
      expect.arrayContaining(["appointment.findFirst", "appointment.count", "customer.create", "appointment.create"])
    )
  })

  it("un conflicto de serialización (P2034) se reintenta: al segundo intento, reserva", async () => {
    transaccion.mockImplementationOnce(async () => {
      throw errorDeSerializacion()
    })

    expect((await confirmar("10:00", "2026-10-15")).status).toBe(201)
    expect(transaccion).toHaveBeenCalledTimes(2)
    expect(citasCreadas()).toHaveLength(1)
  })

  it("si el conflicto persiste, se rinde a los 3 intentos con 409 'El horario ya no está disponible'", async () => {
    transaccion.mockImplementation(async () => {
      throw errorDeSerializacion()
    })

    const { status, cuerpo } = await confirmar("10:00", "2026-10-15")

    expect(status).toBe(409)
    expect(cuerpo.error).toBe("El horario ya no está disponible")
    expect(transaccion).toHaveBeenCalledTimes(3)
    expect(citasCreadas()).toHaveLength(0)
  })

  it("otro error de la base no se reintenta: 500", async () => {
    transaccion.mockImplementation(async () => {
      throw new Error("se cayó la conexión")
    })

    expect((await confirmar("10:00", "2026-10-15")).status).toBe(500)
    expect(transaccion).toHaveBeenCalledTimes(1)
  })
})

/**
 * Con qué cliente queda la reserva (M6). Antes se colgaba de cualquier
 * cliente del negocio con el mismo email O la misma cédula, sin mirar el
 * nombre: con la cédula de otra persona, la reserva (y el historial) quedaba
 * a su nombre. Ahora sólo se reutiliza un cliente si coinciden el email
 * (sin mayúsculas ni espacios) Y el nombre completo (sin tildes ni
 * mayúsculas). La cédula sola nunca vincula.
 */
describe("POST /api/reservar/[slug]/confirmar: con qué cliente queda la reserva", () => {
  const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6]
  const LUCIA = { id: "c-lucia", businessId: NEGOCIO, name: "Lucía", lastName: "Pérez", email: "Lucia@Correo.test", cedula: "11.111.111-1", phone: null }

  beforeEach(() => {
    vi.clearAllMocks()
    relojEn("2026-10-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
    escenario(TODOS_LOS_DIAS.map((dayOfWeek) => franja({ dayOfWeek, startTime: "09:00", endTime: "13:00" })))
    const volcado = base.volcado()
    base.reiniciar({ ...volcado, customer: [...volcado.customer, LUCIA] })
  })

  async function reservarComo(persona: Record<string, string>) {
    const { POST } = await import("./route")
    const res = await POST(pedidoFalso({ ...reserva("10:00", "2026-10-15"), ...persona }), conSlug)
    expect(res.status).toBe(201)
    const [cita] = citasCreadas()
    return cita.customerId as string
  }

  const clientesDelNegocio = () => base.buscar("customer", { businessId: NEGOCIO })

  it("el mismo email (con otras mayúsculas) y el mismo nombre (sin tildes, en mayúsculas): reutiliza el cliente", async () => {
    const antes = clientesDelNegocio().length

    const clienteId = await reservarComo({ nombre: "LUCIA", apellido: "perez", email: "lucia@correo.TEST" })

    expect(clienteId).toBe("c-lucia")
    expect(clientesDelNegocio()).toHaveLength(antes)
  })

  it("el mismo email (escrito igual) con otro nombre: crea un cliente nuevo y no toca el existente", async () => {
    const clienteId = await reservarComo({ nombre: "Marta", apellido: "Rojas", email: "Lucia@Correo.test" })

    expect(clienteId).not.toBe("c-lucia")
    expect(base.buscar("customer", { id: clienteId })[0]).toMatchObject({ name: "Marta", lastName: "Rojas", businessId: NEGOCIO })
    expect(base.buscar("customer", { id: "c-lucia" })[0]).toMatchObject({ name: "Lucía", lastName: "Pérez", email: "Lucia@Correo.test" })
  })

  it("la misma cédula y el mismo nombre, sin email: crea un cliente nuevo (la cédula sola nunca vincula)", async () => {
    const clienteId = await reservarComo({ nombre: "Lucía", apellido: "Pérez", cedula: "11.111.111-1" })

    expect(clienteId).not.toBe("c-lucia")
    expect(base.buscar("customer", { id: clienteId })[0]).toMatchObject({ name: "Lucía", cedula: "11.111.111-1" })
  })

  it("la misma cédula con otro email: crea un cliente nuevo", async () => {
    const clienteId = await reservarComo({ nombre: "Lucía", apellido: "Pérez", cedula: "11.111.111-1", email: "otra@correo.test" })

    expect(clienteId).not.toBe("c-lucia")
  })

  it("un cliente de otro negocio con el mismo email y nombre nunca se reutiliza", async () => {
    const volcado = base.volcado()
    base.reiniciar({
      ...volcado,
      customer: volcado.customer.filter((c) => c.id !== "c-lucia").concat({ ...LUCIA, id: "c-lucia-ajena", businessId: OTRO_NEGOCIO }),
    })

    const clienteId = await reservarComo({ nombre: "Lucía", apellido: "Pérez", email: "lucia@correo.test" })

    expect(clienteId).not.toBe("c-lucia-ajena")
    expect(base.buscar("customer", { id: clienteId })[0]).toMatchObject({ businessId: NEGOCIO })
  })
})

/**
 * Datos inválidos en la reserva pública: un `error` legible y nada más.
 * Antes iban los issues crudos de zod en `detalles` (M10/F-06).
 */
describe("POST /api/reservar/[slug]/confirmar: datos inválidos", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    relojEn("2026-10-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
    escenario([franja({ dayOfWeek: 4, startTime: "09:00", endTime: "13:00" })])
  })

  it.each([
    ["un nombre de más de 100 caracteres", { nombre: "a".repeat(101) }, /nombre/i],
    ["comentarios de más de 1000 caracteres", { comentarios: "a".repeat(1001) }, /comentarios/i],
    ["un email inválido", { email: "no-es-un-email" }, /email|correo/i],
  ])("%s: 400 con un error legible, sin detalles crudos ni crear nada", async (_caso, cambio, mensaje) => {
    const { POST } = await import("./route")

    const respuesta = await POST(pedidoFalso({ ...reserva("10:00", "2026-10-15"), ...cambio }), conSlug)
    const cuerpo = await respuesta.json()

    expect(respuesta.status).toBe(400)
    expect(Object.keys(cuerpo)).toEqual(["error"])
    expect(cuerpo.error).toMatch(mensaje)
    expect(citasCreadas()).toHaveLength(0)
  })
})
