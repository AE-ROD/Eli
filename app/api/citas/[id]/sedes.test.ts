import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { conId, pedido } from "@/pruebas/datos"

/**
 * Mover y leer una hora con sedes (etapa 9, plan Independiente):
 * - mover o reagendar desde el panel NO cambia la sede de la hora (para eso se
 *   cancela y se crea otra): un `sedeId` en el pedido no cuenta;
 * - con varias sedes activas, el horario de atención que se advierte es el de
 *   ESA sede; con una sola o sin sedes, el de siempre;
 * - el detalle y lo que devuelve guardar traen `sede: { id, nombre } | null`.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const SOLO = "negocio-solo"
const AJENO = "negocio-ajeno"
const URL = "http://localhost/api/citas/x"

const dueñaSola = { user: { id: "u-sofia", role: "owner", businessId: SOLO, businessName: "Estudio Sofía", memberId: null } }
const dueñoAjeno = { user: { id: "u-ajena", role: "owner", businessId: AJENO, businessName: "Estudio Ajeno", memberId: null } }

/** Santiago en octubre de 2026 está en UTC-3. El 20 de octubre de 2026 es martes. */
const santiago = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`)

const sede = (id: string, businessId: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id,
  businessId,
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
  startTime: santiago("2026-10-20", "10:00"),
  endTime: santiago("2026-10-20", "11:00"),
  sedeId,
  ...extra,
})

interface Arreglos {
  sedes?: Record<string, unknown>[]
  workSchedule?: Record<string, unknown>[]
  appointment?: Record<string, unknown>[]
}

/** Lunes a viernes: Centro de mañana, Providencia de tarde (no se pisan, como exige la base). */
const horarioDeLasSedes = () =>
  [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
    { id: `h-centro-${dayOfWeek}`, businessId: SOLO, sedeId: "sede-centro", memberId: null, dayOfWeek, startTime: "09:00", endTime: "13:00" },
    { id: `h-prov-${dayOfWeek}`, businessId: SOLO, sedeId: "sede-providencia", memberId: null, dayOfWeek, startTime: "14:00", endTime: "19:00" },
  ])

function escenario({ sedes, workSchedule, appointment }: Arreglos = {}) {
  base.reiniciar({
    user: [
      { id: "u-sofia", name: "Sofía Sola", email: "sofia@solo.test" },
      { id: "u-ajena", name: "Dueña Ajena", email: "ajena@ajeno.test" },
    ],
    business: [
      { id: SOLO, name: "Estudio Sofía", slug: "estudio-sofia", userId: "u-sofia", plan: "independiente", timezone: "America/Santiago" },
      { id: AJENO, name: "Estudio Ajeno", slug: "estudio-ajeno", userId: "u-ajena", plan: "independiente", timezone: "America/Santiago" },
    ],
    customer: [
      { id: "c-ana", businessId: SOLO, name: "Ana", lastName: "Pérez", email: "ana@correo.test" },
      { id: "c-ajena", businessId: AJENO, name: "Ana", lastName: "Pérez" },
    ],
    sede: sedes ?? [
      sede("sede-centro", SOLO, "Centro", { orden: 0 }),
      sede("sede-providencia", SOLO, "Providencia", { orden: 1 }),
      sede("sede-ajena", AJENO, "Ajena"),
    ],
    workSchedule: workSchedule ?? horarioDeLasSedes(),
    appointment: appointment ?? [
      cita("en-centro", "sede-centro", { startTime: santiago("2026-10-20", "10:00"), endTime: santiago("2026-10-20", "11:00") }),
      cita("en-providencia", "sede-providencia", { startTime: santiago("2026-10-20", "15:00"), endTime: santiago("2026-10-20", "16:00") }),
      cita("sin-sede", null, { startTime: santiago("2026-10-20", "12:00"), endTime: santiago("2026-10-20", "12:30") }),
    ],
  })
}

const mover = (inicio: string, fin: string, extra: Record<string, unknown> = {}, fecha = "2026-10-20") => ({
  startTime: santiago(fecha, inicio).toISOString(),
  endTime: santiago(fecha, fin).toISOString(),
  ...extra,
})

async function put(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(URL, cuerpo), conId(id))
}

async function get(sesion: unknown, id: string) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(URL), conId(id))
}

const guardada = (id: string) => base.buscar("appointment", { id })[0]

describe("PUT /api/citas/[id] con sedes: mover no cambia la sede", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  it("mover la hora deja la cita en su sede", async () => {
    const res = await put(dueñaSola, "en-centro", mover("11:00", "12:00"))

    expect(res.status).toBe(200)
    expect(guardada("en-centro")).toMatchObject({ startTime: santiago("2026-10-20", "11:00"), sedeId: "sede-centro" })
    expect(await res.json()).toMatchObject({ sede: { id: "sede-centro", nombre: "Centro" } })
  })

  it("un `sedeId` en el pedido no la cambia: para eso se cancela y se crea otra", async () => {
    const otraSede = await put(dueñaSola, "en-centro", mover("11:00", "12:00", { sedeId: "sede-providencia" }))
    const sedeAjena = await put(dueñaSola, "en-centro", mover("11:30", "12:30", { sedeId: "sede-ajena" }))
    const sedeNula = await put(dueñaSola, "en-centro", mover("11:45", "12:45", { sedeId: null }))

    expect([otraSede.status, sedeAjena.status, sedeNula.status]).toEqual([200, 200, 200])
    expect(guardada("en-centro").sedeId).toBe("sede-centro")
  })

  it("tampoco la cambia cuando sólo se edita otra cosa (notas, precio)", async () => {
    const res = await put(dueñaSola, "en-providencia", { notes: "Trae fotos", price: 15000, sedeId: "sede-centro" })

    expect(res.status).toBe(200)
    expect(guardada("en-providencia")).toMatchObject({ sedeId: "sede-providencia", notes: "Trae fotos", price: 15000 })
  })

  it("una cita sin sede (de antes de tener sedes) sigue sin sede, aunque se mande una; su horario es el vigente de todas", async () => {
    // El miércoles a las 15:00 atiende Providencia: para una cita sin sede alcanza con que atienda alguna.
    const res = await put(dueñaSola, "sin-sede", mover("15:00", "15:30", { sedeId: "sede-centro" }, "2026-10-21"))

    expect(res.status).toBe(200)
    expect(guardada("sin-sede")).toMatchObject({ sedeId: null, startTime: santiago("2026-10-21", "15:00") })
  })

  describe("respeta el horario de ESA sede", () => {
    it("Centro atiende de 09:00 a 13:00: moverla a las 15:00 avisa, con el nombre de la sede, y no se mueve", async () => {
      const res = await put(dueñaSola, "en-centro", mover("15:00", "16:00"))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([
        { tipo: "fuera-de-horario", mensaje: "La cita queda fuera del horario de atención de la sede Centro (09:00 a 13:00)." },
      ])
      expect(guardada("en-centro").startTime).toEqual(santiago("2026-10-20", "10:00"))
    })

    it("Providencia atiende de 14:00 a 19:00: esa misma hora (15:00) le sirve", async () => {
      const res = await put(dueñaSola, "en-providencia", mover("16:00", "17:00"))

      expect(res.status).toBe(200)
      expect(guardada("en-providencia").startTime).toEqual(santiago("2026-10-20", "16:00"))
    })

    it("y a las 10:00, que a Centro le sirve, a Providencia no", async () => {
      const res = await put(dueñaSola, "en-providencia", mover("10:00", "11:00"))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([
        { tipo: "fuera-de-horario", mensaje: "La cita queda fuera del horario de atención de la sede Providencia (14:00 a 19:00)." },
      ])
    })

    it("con el segundo envío confirmado, se mueve igual y sigue en su sede", async () => {
      const res = await put(dueñaSola, "en-centro", mover("15:00", "16:00", { confirmarAdvertencias: true }))

      expect(res.status).toBe(200)
      expect(guardada("en-centro")).toMatchObject({ startTime: santiago("2026-10-20", "15:00"), sedeId: "sede-centro" })
    })

    it("un día en que su sede no atiende lo dice: 'La sede X no atiende ese día'", async () => {
      const res = await put(dueñaSola, "en-centro", mover("10:00", "11:00", {}, "2026-10-24")) // sábado

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([{ tipo: "fuera-de-horario", mensaje: "La sede Centro no atiende ese día." }])
    })

    it("una cita cuya sede se desactivó después no revienta: no hay horario de esa sede con qué comparar", async () => {
      escenario({
        sedes: [
          sede("sede-centro", SOLO, "Centro"),
          sede("sede-sur", SOLO, "Sur"),
          sede("sede-providencia", SOLO, "Providencia", { activo: false }),
        ],
        workSchedule: [{ id: "h-sur", businessId: SOLO, sedeId: "sede-sur", memberId: null, dayOfWeek: 2, startTime: "09:00", endTime: "18:00" }],
        appointment: [cita("en-providencia", "sede-providencia")],
      })

      const res = await put(dueñaSola, "en-providencia", mover("19:00", "20:00"))

      expect(res.status).toBe(200)
      expect(guardada("en-providencia").sedeId).toBe("sede-providencia")
    })
  })

  describe("con una sola sede activa, como siempre", () => {
    beforeEach(() => {
      escenario({
        sedes: [sede("sede-centro", SOLO, "Centro"), sede("sede-vieja", SOLO, "Vieja", { activo: false })],
        workSchedule: [{ id: "h1", businessId: SOLO, sedeId: "sede-centro", memberId: null, dayOfWeek: 2, startTime: "09:00", endTime: "13:00" }],
        appointment: [cita("en-centro", "sede-centro")],
      })
    })

    it("la advertencia es la de siempre: el horario del negocio, sin nombrar la sede", async () => {
      const res = await put(dueñaSola, "en-centro", mover("15:00", "16:00"))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([
        { tipo: "fuera-de-horario", mensaje: "La cita queda fuera del horario de atención del negocio (09:00 a 13:00)." },
      ])
    })

    it("y mover tampoco cambia la sede", async () => {
      const res = await put(dueñaSola, "en-centro", mover("11:00", "12:00", { sedeId: "sede-vieja" }))

      expect(res.status).toBe(200)
      expect(guardada("en-centro").sedeId).toBe("sede-centro")
    })
  })

  describe("sin sedes, como siempre", () => {
    it("mover una cita sin sede avisa del horario del negocio, sin sede", async () => {
      escenario({
        sedes: [],
        workSchedule: [{ id: "h1", businessId: SOLO, sedeId: null, memberId: null, dayOfWeek: 2, startTime: "09:00", endTime: "13:00" }],
        appointment: [cita("sin-sede", null)],
      })

      const res = await put(dueñaSola, "sin-sede", mover("15:00", "16:00", { sedeId: "sede-ajena" }))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([
        { tipo: "fuera-de-horario", mensaje: "La cita queda fuera del horario de atención del negocio (09:00 a 13:00)." },
      ])
      expect(guardada("sin-sede").sedeId).toBeNull()
    })
  })

  it("una cita de otro negocio es un 404 aunque se le mande su sede", async () => {
    escenario({ appointment: [cita("en-centro", "sede-centro"), cita("de-otro", "sede-ajena", { businessId: AJENO, customerId: "c-ajena" })] })

    const res = await put(dueñaSola, "de-otro", mover("11:00", "12:00", { sedeId: "sede-centro" }))

    expect(res.status).toBe(404)
    expect(guardada("de-otro")).toMatchObject({ sedeId: "sede-ajena", startTime: santiago("2026-10-20", "10:00") })
  })
})

describe("GET /api/citas/[id]: el detalle trae la sede", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario({
      appointment: [
        cita("en-centro", "sede-centro"),
        cita("sin-sede", null),
        cita("de-otro", "sede-ajena", { businessId: AJENO, customerId: "c-ajena" }),
      ],
    })
  })

  it("`sede: { id, nombre }` con sede, y sólo eso de ella", async () => {
    const res = await get(dueñaSola, "en-centro")
    const datos = await res.json()

    expect(res.status).toBe(200)
    expect(datos.sede).toEqual({ id: "sede-centro", nombre: "Centro" })
  })

  it("`sede: null` sin ella", async () => {
    const datos = await (await get(dueñaSola, "sin-sede")).json()

    expect(datos.sede).toBeNull()
  })

  it("la cita de otro negocio es un 404, con su sede y todo", async () => {
    const res = await get(dueñaSola, "de-otro")

    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toContain("Ajena")
  })

  it("el dueño de otro negocio ve la suya, no la de éste", async () => {
    expect((await get(dueñoAjeno, "en-centro")).status).toBe(404)
    expect((await (await get(dueñoAjeno, "de-otro")).json()).sede).toEqual({ id: "sede-ajena", nombre: "Ajena" })
  })
})
