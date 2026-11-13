import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { datosBase, NEGOCIO, pedido, sesiones } from "@/pruebas/datos"
import { MENSAJE_ELEGIR_LA_SEDE, MENSAJE_SEDE_DESACTIVADA, MENSAJE_SEDE_NO_ENCONTRADA } from "@/lib/sede-de-la-cita"

/**
 * Crear una hora desde el panel con sedes (etapa 9, plan Independiente):
 * - con varias sedes activas la sede es obligatoria y tiene que ser una sede
 *   ACTIVA del negocio de la sesión (400 si falta o está desactivada; 404, sin
 *   decir si existe, si es de otro negocio);
 * - con una sola, se estampa esa; sin sedes, queda sin sede (NULL), como siempre;
 * - el horario de atención que se advierte es el de la sede elegida, y el
 *   resto de lo que ocupa el tiempo (bloqueos) es del negocio entero.
 * Las listas devuelven `sede: { id, nombre } | null` por cita.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Dos negocios Independiente (la dueña sola: la base no deja equipo en ese plan). */
const SOLO = "negocio-solo"
const AJENO = "negocio-ajeno"

const dueñaSola = { user: { id: "u-sofia", role: "owner", businessId: SOLO, businessName: "Estudio Sofía", memberId: null } }

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

/** Lunes a viernes: Centro de mañana, Providencia de tarde (no se pisan, como exige la base). */
const horarioDeLasSedes = () =>
  [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
    { id: `h-centro-${dayOfWeek}`, businessId: SOLO, sedeId: "sede-centro", memberId: null, dayOfWeek, startTime: "09:00", endTime: "13:00" },
    { id: `h-prov-${dayOfWeek}`, businessId: SOLO, sedeId: "sede-providencia", memberId: null, dayOfWeek, startTime: "14:00", endTime: "19:00" },
  ])

interface Arreglos {
  sedes?: Record<string, unknown>[]
  workSchedule?: Record<string, unknown>[]
  timeBlock?: Record<string, unknown>[]
  appointment?: Record<string, unknown>[]
}

function escenario({ sedes, workSchedule, timeBlock, appointment }: Arreglos = {}) {
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
    timeBlock: timeBlock ?? [],
    appointment: appointment ?? [],
  })
}

const nueva = (inicio: string, fin: string, extra: Record<string, unknown> = {}) => ({
  title: "Corte",
  customerId: "c-ana",
  startTime: santiago("2026-10-20", inicio).toISOString(),
  endTime: santiago("2026-10-20", fin).toISOString(),
  ...extra,
})

async function crear(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido("http://localhost/api/citas", cuerpo))
}

const citasDeAna = () => base.buscar("appointment", { customerId: "c-ana" })

describe("POST /api/citas con sedes: la sede de la hora", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  describe("con varias sedes activas", () => {
    it("la sede es obligatoria: sin ella, 400 y no se crea nada", async () => {
      const res = await crear(dueñaSola, nueva("10:00", "11:00"))

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: MENSAJE_ELEGIR_LA_SEDE })
      expect(citasDeAna()).toHaveLength(0)
    })

    it.each([[null], [""], ["   "]])("una sede vacía (%j) tampoco vale: 400", async (sedeId) => {
      const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId }))

      expect(res.status).toBe(400)
      expect(citasDeAna()).toHaveLength(0)
    })

    it("una sede que no es un texto, o enorme, es un pedido mal armado: 400 sin llegar a la base", async () => {
      for (const sedeId of [123, { id: "sede-centro" }, "x".repeat(500)]) {
        const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId }))
        expect(res.status).toBe(400)
      }
      expect(citasDeAna()).toHaveLength(0)
    })

    it("con una sede activa del negocio se crea, queda estampada y la respuesta trae `sede: { id, nombre }`", async () => {
      const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-centro" }))

      expect(res.status).toBe(201)
      expect(citasDeAna()).toHaveLength(1)
      expect(citasDeAna()[0]).toMatchObject({ businessId: SOLO, sedeId: "sede-centro" })
      expect(await res.json()).toMatchObject({ sede: { id: "sede-centro", nombre: "Centro" } })
    })

    it("la respuesta de la sede no trae la dirección ni el teléfono", async () => {
      const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-centro" }))

      expect(Object.keys((await res.json()).sede).sort()).toEqual(["id", "nombre"])
    })

    it("una sede de OTRO negocio: 404 y no se crea nada; el mismo mensaje que un id que no existe (no se filtra la existencia)", async () => {
      const ajena = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-ajena" }))
      const inexistente = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-que-no-existe" }))

      expect(ajena.status).toBe(404)
      expect(inexistente.status).toBe(404)
      expect(await ajena.json()).toEqual({ error: MENSAJE_SEDE_NO_ENCONTRADA })
      expect(await inexistente.json()).toEqual({ error: MENSAJE_SEDE_NO_ENCONTRADA })
      expect(citasDeAna()).toHaveLength(0)
    })

    it("una sede desactivada del negocio: 400 y no se crea nada", async () => {
      escenario({
        sedes: [
          sede("sede-centro", SOLO, "Centro"),
          sede("sede-providencia", SOLO, "Providencia"),
          sede("sede-vieja", SOLO, "Vieja", { activo: false }),
        ],
      })

      const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-vieja" }))

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: MENSAJE_SEDE_DESACTIVADA })
      expect(citasDeAna()).toHaveLength(0)
    })

    it("el dueño de otro negocio no puede usar las sedes de éste", async () => {
      const dueñoAjeno = { user: { id: "u-ajena", role: "owner", businessId: AJENO, businessName: "Estudio Ajeno", memberId: null } }
      // El negocio ajeno tiene una sola sede: con la de éste, 404; sin elegir, se estampa la suya.
      const conLaNuestra = await crear(dueñoAjeno, { ...nueva("10:00", "11:00", { sedeId: "sede-centro" }), customerId: "c-ajena" })

      expect(conLaNuestra.status).toBe(404)
      expect(base.buscar("appointment", { customerId: "c-ajena" })).toHaveLength(0)
    })

    it("nunca se estampa lo que no se validó: la sede de la cita es la que decidió el servidor", async () => {
      const res = await crear(dueñaSola, nueva("15:00", "16:00", { sedeId: "sede-providencia", businessId: AJENO }))

      expect(res.status).toBe(201)
      expect(citasDeAna()[0]).toMatchObject({ businessId: SOLO, sedeId: "sede-providencia" })
    })
  })

  describe("el horario de atención es el de la sede elegida", () => {
    it("a las 10:00 Centro atiende (09:00 a 13:00): se crea sin advertencias", async () => {
      const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-centro" }))

      expect(res.status).toBe(201)
    })

    it("a las 10:00 Providencia no atiende (14:00 a 19:00): 409 con la advertencia, que nombra la sede, y no se crea", async () => {
      const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-providencia" }))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([
        { tipo: "fuera-de-horario", mensaje: "La cita queda fuera del horario de atención de la sede Providencia (14:00 a 19:00)." },
      ])
      expect(citasDeAna()).toHaveLength(0)
    })

    it("con el segundo envío confirmado, se crea igual, y en la sede elegida", async () => {
      const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-providencia", confirmarAdvertencias: true }))

      expect(res.status).toBe(201)
      expect(citasDeAna()[0]).toMatchObject({ sedeId: "sede-providencia" })
    })

    it("un día en que la sede no atiende (aunque otra sí) lo dice con su nombre", async () => {
      escenario({
        workSchedule: [
          // Centro atiende el martes; Providencia sólo los jueves.
          { id: "h1", businessId: SOLO, sedeId: "sede-centro", memberId: null, dayOfWeek: 2, startTime: "09:00", endTime: "13:00" },
          { id: "h2", businessId: SOLO, sedeId: "sede-providencia", memberId: null, dayOfWeek: 4, startTime: "09:00", endTime: "13:00" },
        ],
      })

      const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-providencia" }))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([{ tipo: "fuera-de-horario", mensaje: "La sede Providencia no atiende ese día." }])
    })

    it("un bloqueo de todo el negocio vale en todas las sedes: la persona está en un solo lugar a la vez", async () => {
      escenario({
        timeBlock: [
          { id: "b-negocio", businessId: SOLO, memberId: null, startTime: santiago("2026-10-20", "10:00"), endTime: santiago("2026-10-20", "11:00"), motivo: "Trámite" },
        ],
      })

      const enCentro = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-centro" }))

      expect(enCentro.status).toBe(409)
      expect((await enCentro.json()).advertencias).toEqual([
        { tipo: "bloqueo", mensaje: "El negocio tiene bloqueado de 10:00 a 11:00 (Trámite)." },
      ])
    })
  })

  describe("con una sola sede activa: como siempre", () => {
    const unaSola = () =>
      escenario({
        sedes: [
          sede("sede-centro", SOLO, "Centro"),
          sede("sede-vieja", SOLO, "Vieja", { activo: false }),
          sede("sede-ajena", AJENO, "Ajena"),
        ],
        workSchedule: [{ id: "h1", businessId: SOLO, sedeId: "sede-centro", memberId: null, dayOfWeek: 2, startTime: "09:00", endTime: "13:00" }],
      })

    it("sin elegir, se estampa esa", async () => {
      unaSola()

      const res = await crear(dueñaSola, nueva("10:00", "11:00"))

      expect(res.status).toBe(201)
      expect(citasDeAna()[0]).toMatchObject({ sedeId: "sede-centro" })
    })

    it("eligiéndola, también", async () => {
      unaSola()

      const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-centro" }))

      expect(res.status).toBe(201)
      expect(citasDeAna()[0]).toMatchObject({ sedeId: "sede-centro" })
    })

    it("una sede desactivada, ajena o inexistente no vale ni siquiera con una sola", async () => {
      unaSola()

      const desactivada = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-vieja" }))
      const ajena = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-ajena" }))

      expect(desactivada.status).toBe(400)
      expect(ajena.status).toBe(404)
      expect(citasDeAna()).toHaveLength(0)
    })

    it("las advertencias son las de siempre: el horario vigente, sin nombrar la sede", async () => {
      unaSola()

      const res = await crear(dueñaSola, nueva("15:00", "16:00"))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([
        { tipo: "fuera-de-horario", mensaje: "La cita queda fuera del horario de atención del negocio (09:00 a 13:00)." },
      ])
    })
  })

  describe("sin sedes: todo igual que hoy", () => {
    const sinSedes = () => escenario({ sedes: [], workSchedule: [] })

    it("la cita queda sin sede (NULL) y la respuesta trae `sede: null`", async () => {
      sinSedes()

      const res = await crear(dueñaSola, nueva("10:00", "11:00"))

      expect(res.status).toBe(201)
      expect(citasDeAna()[0].sedeId).toBeNull()
      expect((await res.json()).sede).toBeNull()
    })

    it("una sede que llegue se ignora: ni se guarda ni se valida (no hay con qué)", async () => {
      sinSedes()

      const res = await crear(dueñaSola, nueva("10:00", "11:00", { sedeId: "sede-ajena" }))

      expect(res.status).toBe(201)
      expect(citasDeAna()[0].sedeId).toBeNull()
    })

    it("un negocio Equipo (con equipo, sin sedes) crea como siempre y la cita queda sin sede", async () => {
      base.reiniciar(datosBase())

      const res = await crear(sesiones.dueña, {
        title: "Corte",
        customerId: "c-maria",
        memberId: "m-carla",
        startTime: santiago("2026-10-20", "10:00").toISOString(),
        endTime: santiago("2026-10-20", "11:00").toISOString(),
      })

      expect(res.status).toBe(201)
      expect(base.buscar("appointment", { businessId: NEGOCIO })[0].sedeId).toBeNull()
    })
  })
})

describe("GET /api/citas: cada cita trae su sede", () => {
  const cita = (id: string, sedeId: string | null, businessId = SOLO) => ({
    id,
    businessId,
    customerId: businessId === SOLO ? "c-ana" : "c-ajena",
    title: "Corte",
    status: "pendiente",
    startTime: santiago("2026-10-20", "10:00"),
    endTime: santiago("2026-10-20", "11:00"),
    sedeId,
  })

  async function listar(sesion: unknown) {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion)
    return GET(pedido("http://localhost/api/citas?fecha=2026-10-20"))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    escenario({
      appointment: [
        cita("en-centro", "sede-centro"),
        cita("en-providencia", "sede-providencia"),
        cita("sin-sede", null),
        cita("de-otro-negocio", "sede-ajena", AJENO),
      ],
    })
  })

  it("`sede: { id, nombre }` con sede, o `null` sin ella; sólo las del negocio de la sesión", async () => {
    const res = await listar(dueñaSola)
    const citas = (await res.json()) as { id: string; sede: unknown }[]

    expect(res.status).toBe(200)
    expect(Object.fromEntries(citas.map((c) => [c.id, c.sede]))).toEqual({
      "en-centro": { id: "sede-centro", nombre: "Centro" },
      "en-providencia": { id: "sede-providencia", nombre: "Providencia" },
      "sin-sede": null,
    })
  })

  it("la sede de una cita trae sólo su id y su nombre", async () => {
    const citas = (await (await listar(dueñaSola)).json()) as { sede: object | null }[]

    for (const { sede: deLaCita } of citas) if (deLaCita) expect(Object.keys(deLaCita).sort()).toEqual(["id", "nombre"])
  })

  it("el dueño de otro negocio no ve las citas ni las sedes de éste", async () => {
    const dueñoAjeno = { user: { id: "u-ajena", role: "owner", businessId: AJENO, businessName: "Estudio Ajeno", memberId: null } }

    const citas = (await (await listar(dueñoAjeno)).json()) as { id: string; sede: { nombre: string } | null }[]

    expect(citas.map((c) => c.id)).toEqual(["de-otro-negocio"])
    expect(citas[0].sede).toEqual({ id: "sede-ajena", nombre: "Ajena" })
  })
})
