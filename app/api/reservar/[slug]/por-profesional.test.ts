import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"

/**
 * La reserva pública por profesional (P5): la lista pública de quiénes
 * atienden, las horas con un profesional o con "cualquiera", y la asignación
 * al confirmar. Lo que `disponibilidad` ofrece, `confirmar` lo acepta (#46).
 */

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

/** El lunes 7 de enero de 2030; Santiago en enero está en UTC-3. */
const FECHA = "2030-01-07"
const LUNES = 1
const aLas = (hora: string) => new Date(`${FECHA}T${hora}:00.000-03:00`)

const conSlug = (slug = "salon-uno") => ({ params: Promise.resolve({ slug }) })

type Registro = Record<string, unknown>

/**
 * Carla y Pedro atienden de 9 a 12 (el horario general); el encargado no
 * atiende. Corte de 60 minutos.
 */
function escenario(extra: { appointment?: Registro[]; timeBlock?: Registro[]; memberService?: Registro[]; workSchedule?: Registro[]; businessMember?: Registro[] } = {}) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    businessMember: extra.businessMember ?? datos.businessMember,
    service: datos.service.map((servicio) => (servicio.id === "s-corte" ? { ...servicio, duration: 60 } : servicio)),
    workSchedule: extra.workSchedule ?? [
      { id: "h-general", businessId: NEGOCIO, memberId: null, dayOfWeek: LUNES, startTime: "09:00", endTime: "12:00" },
      { id: "h-ajeno", businessId: OTRO_NEGOCIO, memberId: null, dayOfWeek: LUNES, startTime: "09:00", endTime: "12:00" },
    ],
    appointment: extra.appointment ?? [],
    timeBlock: extra.timeBlock ?? [],
    memberService: extra.memberService ?? [],
  })
}

const cita = (id: string, memberId: string | null, hora: string, datos: Registro = {}): Registro => ({
  id,
  businessId: NEGOCIO,
  memberId,
  title: "Corte",
  startTime: aLas(hora),
  endTime: new Date(aLas(hora).getTime() + 60 * 60000),
  ...datos,
})

async function horas(consulta: string, slug = "salon-uno") {
  const { GET } = await import("./disponibilidad/route")
  const respuesta = await GET(
    { url: `http://localhost/api/reservar/${slug}/disponibilidad?fecha=${FECHA}&servicioId=s-corte${consulta}`, headers: new Headers() } as unknown as NextRequest,
    conSlug(slug)
  )
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function confirmar(hora: string, extra: Registro = {}) {
  const { POST } = await import("./confirmar/route")
  const cuerpo = { servicioId: "s-corte", fecha: FECHA, hora, nombre: "Lucía", apellido: "Pérez", ...extra }
  const respuesta = await POST({ headers: new Headers(), json: async () => cuerpo } as unknown as NextRequest, conSlug())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function profesionales(slug = "salon-uno") {
  const { GET } = await import("./profesionales/route")
  const respuesta = await GET({ headers: new Headers() } as unknown as NextRequest, conSlug(slug))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const creadas = () => base.buscar("appointment", { title: "Corte", source: "reserva-publica" })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2030-01-01T12:00:00.000Z"))
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET /api/reservar/[slug]/profesionales", () => {
  it("sólo los que atienden, con lo que se muestra y nada más", async () => {
    escenario({ memberService: [{ id: "ms-1", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-color" }] })

    const { status, cuerpo } = await profesionales()

    expect(status).toBe(200)
    expect(cuerpo).toEqual({
      profesionales: [
        { id: "m-carla", nombre: "Carla Profesional", especialidad: null, fotoUrl: null, servicioIds: null },
        { id: "m-pedro", nombre: "Pedro Profesional", especialidad: null, fotoUrl: null, servicioIds: ["s-color"] },
      ],
    })
    // Ni correos ni roles en la respuesta.
    expect(JSON.stringify(cuerpo)).not.toMatch(/@|worker|admin/)
  })

  it("la foto sale saneada: sólo rutas del mismo sitio", async () => {
    const datos = datosBase()
    escenario({
      businessMember: datos.businessMember.map((miembro) =>
        miembro.id === "m-carla" ? { ...miembro, fotoUrl: "https://ajeno.test/carla.jpg" } : miembro.id === "m-pedro" ? { ...miembro, fotoUrl: "/fotos/pedro.jpg" } : miembro
      ),
    })

    const { cuerpo } = await profesionales()

    expect(cuerpo.profesionales.map((profesional: { fotoUrl: string | null }) => profesional.fotoUrl)).toEqual([null, "/fotos/pedro.jpg"])
  })

  it("no muestra a los de otro negocio", async () => {
    escenario()
    const { cuerpo } = await profesionales("salon-dos")
    expect(cuerpo.profesionales.map((profesional: { id: string }) => profesional.id)).toEqual(["m-ajeno"])
  })

  it("un negocio que no existe: 404; pasado el límite: 429", async () => {
    escenario()
    expect((await profesionales("no-existe")).status).toBe(404)
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
    expect((await profesionales()).status).toBe(429)
  })
})

describe("disponibilidad por profesional", () => {
  it("con un profesional: sólo sus horas libres", async () => {
    escenario({ appointment: [cita("c-1", "m-carla", "10:00")] })

    expect((await horas("&profesionalId=m-carla")).cuerpo).toEqual({ slots: ["09:00", "11:00"] })
    expect((await horas("&profesionalId=m-pedro")).cuerpo).toEqual({ slots: ["09:00", "10:00", "11:00"] })
  })

  it("con cualquiera: la hora sigue libre mientras uno esté libre", async () => {
    escenario({ appointment: [cita("c-1", "m-carla", "10:00"), cita("c-2", "m-pedro", "11:00")] })

    expect((await horas("")).cuerpo).toEqual({ slots: ["09:00", "10:00", "11:00"] })
  })

  it("con cualquiera: la hora se va cuando todos están ocupados", async () => {
    escenario({ appointment: [cita("c-1", "m-carla", "10:00"), cita("c-2", "m-pedro", "10:00")] })

    expect((await horas("")).cuerpo).toEqual({ slots: ["09:00", "11:00"] })
  })

  it("una cita sin asignar ocupa a todos (las reservas de antes no tienen profesional)", async () => {
    escenario({ appointment: [cita("c-1", null, "10:00")] })

    expect((await horas("")).cuerpo).toEqual({ slots: ["09:00", "11:00"] })
    expect((await horas("&profesionalId=m-pedro")).cuerpo).toEqual({ slots: ["09:00", "11:00"] })
  })

  it("las citas canceladas no ocupan", async () => {
    escenario({ appointment: [cita("c-1", "m-carla", "10:00", { status: "cancelada" })] })

    expect((await horas("&profesionalId=m-carla")).cuerpo).toEqual({ slots: ["09:00", "10:00", "11:00"] })
  })

  it("respeta el bloqueo del profesional y el de todo el negocio", async () => {
    escenario({
      timeBlock: [
        { id: "b-carla", businessId: NEGOCIO, memberId: "m-carla", startTime: aLas("09:00"), endTime: aLas("10:00") },
        { id: "b-negocio", businessId: NEGOCIO, memberId: null, startTime: aLas("11:00"), endTime: aLas("12:00") },
      ],
    })

    expect((await horas("&profesionalId=m-carla")).cuerpo).toEqual({ slots: ["10:00"] })
    expect((await horas("&profesionalId=m-pedro")).cuerpo).toEqual({ slots: ["09:00", "10:00"] })
  })

  it("sólo los que hacen el servicio: Pedro, que sólo hace color, no ofrece corte", async () => {
    escenario({
      appointment: [cita("c-1", "m-carla", "10:00")],
      memberService: [{ id: "ms-1", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-color" }],
    })

    expect((await horas("")).cuerpo).toEqual({ slots: ["09:00", "11:00"] })
    const conPedro = await horas("&profesionalId=m-pedro")
    expect(conPedro.status).toBe(404)
  })

  it("el horario propio del profesional manda sobre el general", async () => {
    escenario({
      workSchedule: [
        { id: "h-general", businessId: NEGOCIO, memberId: null, dayOfWeek: LUNES, startTime: "09:00", endTime: "12:00" },
        { id: "h-carla", businessId: NEGOCIO, memberId: "m-carla", dayOfWeek: LUNES, startTime: "15:00", endTime: "17:00" },
      ],
    })

    expect((await horas("&profesionalId=m-carla")).cuerpo).toEqual({ slots: ["15:00", "16:00"] })
  })

  it("aislamiento: un profesional de otro negocio, el encargado o uno inventado son 404 indistinguibles", async () => {
    escenario()

    for (const id of ["m-ajeno", "m-encargado", "no-existe"]) {
      const { status, cuerpo } = await horas(`&profesionalId=${id}`)
      expect(status).toBe(404)
      expect(cuerpo).toEqual({ error: "Ese profesional no está disponible para este servicio" })
    }
  })

  it("las citas de otro negocio no ocupan", async () => {
    escenario({ appointment: [{ ...cita("c-ajena", "m-ajeno", "10:00"), businessId: OTRO_NEGOCIO }] })

    expect((await horas("&profesionalId=m-carla")).cuerpo).toEqual({ slots: ["09:00", "10:00", "11:00"] })
  })
})

describe("negocio sin profesionales (el dueño solo): como siempre", () => {
  const soloElEncargado = () => datosBase().businessMember.filter((miembro) => miembro.role !== "worker")

  it("un solo carril: cualquier cita del negocio ocupa la hora, y la reserva queda sin asignar", async () => {
    escenario({ businessMember: soloElEncargado(), appointment: [cita("c-1", "m-encargado", "10:00")] })

    expect((await horas("")).cuerpo).toEqual({ slots: ["09:00", "11:00"] })
    const { status, cuerpo } = await confirmar("09:00")
    expect(status).toBe(201)
    expect(cuerpo.profesional).toBeNull()
    expect(creadas()[0].memberId).toBeNull()
    expect((await confirmar("09:00")).status).toBe(409)
  })

  it("respeta los bloqueos de todo el negocio", async () => {
    escenario({
      businessMember: soloElEncargado(),
      timeBlock: [{ id: "b", businessId: NEGOCIO, memberId: null, startTime: aLas("09:00"), endTime: aLas("11:00") }],
    })
    expect((await horas("")).cuerpo).toEqual({ slots: ["11:00"] })
    expect((await confirmar("09:00")).status).toBe(409)
  })
})

describe("confirmar por profesional", () => {
  it("con profesional elegido, la cita queda a su nombre", async () => {
    escenario()
    const { status, cuerpo } = await confirmar("10:00", { profesionalId: "m-pedro" })

    expect(status).toBe(201)
    expect(cuerpo.profesional).toEqual({ id: "m-pedro", nombre: "Pedro Profesional" })
    expect(creadas()[0].memberId).toBe("m-pedro")
  })

  it("con cualquiera, va al que tiene menos citas ese día; si empatan, al de id menor", async () => {
    escenario({ appointment: [cita("c-1", "m-carla", "09:00")] })

    expect((await confirmar("10:00")).cuerpo.profesional.id).toBe("m-pedro")
    // Ahora empatan (una cada uno): gana m-carla, que va antes por id.
    expect((await confirmar("11:00")).cuerpo.profesional.id).toBe("m-carla")
  })

  it("con cualquiera, si el único libre es uno, va a ése", async () => {
    escenario({ appointment: [cita("c-1", "m-pedro", "10:00")] })

    expect((await confirmar("10:00")).cuerpo.profesional.id).toBe("m-carla")
  })

  it("si nadie queda libre: 409 con mensaje claro y sin crear nada", async () => {
    escenario({ appointment: [cita("c-1", "m-carla", "10:00"), cita("c-2", "m-pedro", "10:00")] })

    const { status, cuerpo } = await confirmar("10:00")
    expect(status).toBe(409)
    expect(cuerpo.error).toBe("El horario ya no está disponible")
    expect(creadas()).toHaveLength(0)
    expect(base.buscar("customer", { name: "Lucía" })).toHaveLength(0)
  })

  it("el profesional elegido ocupado: 409 aunque otro esté libre", async () => {
    escenario({ appointment: [cita("c-1", "m-carla", "10:00")] })

    expect((await confirmar("10:00", { profesionalId: "m-carla" })).status).toBe(409)
  })

  it("un bloqueo del profesional o del negocio rechaza", async () => {
    escenario({
      timeBlock: [{ id: "b", businessId: NEGOCIO, memberId: "m-carla", startTime: aLas("10:00"), endTime: aLas("11:00") }],
    })
    expect((await confirmar("10:00", { profesionalId: "m-carla" })).status).toBe(409)
    expect((await confirmar("10:00")).cuerpo.profesional.id).toBe("m-pedro")
  })

  it("aislamiento: un profesional de otro negocio es 404 y no crea nada", async () => {
    escenario()
    const antes = base.volcado()

    expect((await confirmar("10:00", { profesionalId: "m-ajeno" })).status).toBe(404)
    expect((await confirmar("10:00", { profesionalId: "m-encargado" })).status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("lo que disponibilidad ofrece, confirmar lo acepta (#46)", async () => {
    escenario({
      appointment: [cita("c-1", "m-carla", "09:00"), cita("c-2", null, "11:00")],
      timeBlock: [{ id: "b", businessId: NEGOCIO, memberId: "m-pedro", startTime: aLas("09:00"), endTime: aLas("10:00") }],
    })

    for (const profesionalId of ["", "m-carla", "m-pedro"]) {
      const ofrecidas: string[] = (await horas(profesionalId ? `&profesionalId=${profesionalId}` : "")).cuerpo.slots
      for (const hora of ["09:00", "10:00", "11:00"]) {
        if (ofrecidas.includes(hora)) continue
        expect((await confirmar(hora, { profesionalId })).status, `${profesionalId || "cualquiera"} ${hora}`).toBe(409)
      }
    }
    // Y una ofrecida se acepta.
    const [primera] = (await horas("")).cuerpo.slots
    expect((await confirmar(primera)).status).toBe(201)
  })
})
