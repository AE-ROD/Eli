import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"
import { MENSAJE_CITA_CERRADA, MENSAJE_CITA_CON_ATENCION } from "@/lib/mover-cita"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/citas/x"

/**
 * Las horas son de Santiago, que en octubre de 2026 está en UTC-3: las 10:00
 * de allá son las 13:00Z. El 20 de octubre de 2026 es martes.
 */
const santiago = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`)

const cita = (id: string, memberId: string | null, fecha: string, inicio: string, fin: string, datos = {}) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId,
  title: "Corte",
  status: "pendiente",
  startTime: santiago(fecha, inicio),
  endTime: santiago(fecha, fin),
  ...datos,
})

function escenario() {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    appointment: [
      cita("cita-carla", "m-carla", "2026-10-20", "10:00", "10:30"),
      cita("cita-pedro", "m-pedro", "2026-10-20", "11:00", "12:00"),
      // Otra de Carla, el miércoles de 10 a 11: contra ésta choca.
      cita("cita-carla-miercoles", "m-carla", "2026-10-21", "10:00", "11:00"),
      // Cancelada el miércoles de 15 a 16: no ocupa el horario.
      cita("cita-carla-cancelada", "m-carla", "2026-10-21", "15:00", "16:00", { status: "cancelada" }),
      cita("cita-completada", "m-carla", "2026-10-19", "10:00", "10:30", { status: "completada" }),
      cita("cita-con-atencion", "m-carla", "2026-10-22", "10:00", "10:30"),
      cita("cita-con-atencion-anulada", "m-carla", "2026-10-23", "10:00", "10:30"),
      {
        ...cita("cita-ajena", "m-ajeno", "2026-10-20", "10:00", "10:30"),
        businessId: OTRO_NEGOCIO,
        customerId: "c-ajeno",
      },
    ],
    visit: [
      atencion("v-en-curso", { appointmentId: "cita-con-atencion", status: "en-atencion" }),
      atencion("v-anulada", { appointmentId: "cita-con-atencion-anulada", status: "anulada" }),
    ],
    workSchedule: [
      // El negocio atiende de lunes a viernes, de 9 a 19.
      ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
        id: `h-general-${dayOfWeek}`,
        businessId: NEGOCIO,
        memberId: null,
        dayOfWeek,
        startTime: "09:00",
        endTime: "19:00",
      })),
      // Pedro cargó su propio horario: los martes, sólo de 15 a 19.
      { id: "h-pedro", businessId: NEGOCIO, memberId: "m-pedro", dayOfWeek: 2, startTime: "15:00", endTime: "19:00" },
    ],
  })
}

const mover = (fecha: string, inicio: string, fin: string, extra: Record<string, unknown> = {}) => ({
  startTime: santiago(fecha, inicio).toISOString(),
  endTime: santiago(fecha, fin).toISOString(),
  ...extra,
})

async function put(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(URL, cuerpo), conId(id))
}

const guardada = (id: string) => base.buscar("appointment", { id })[0]

describe("PUT /api/citas/[id]: mover una cita", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  describe("permisos", () => {
    it("la dueña mueve cualquier cita del negocio", async () => {
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-21", "12:00", "12:30"))

      expect(res.status).toBe(200)
      expect(guardada("cita-carla").startTime).toEqual(santiago("2026-10-21", "12:00"))
      expect(guardada("cita-carla").endTime).toEqual(santiago("2026-10-21", "12:30"))
    })

    it("el profesional mueve su propia cita", async () => {
      const res = await put(sesiones.carla, "cita-carla", mover("2026-10-20", "12:00", "12:30"))

      expect(res.status).toBe(200)
      expect(guardada("cita-carla").startTime).toEqual(santiago("2026-10-20", "12:00"))
    })

    it("el profesional no mueve la cita de un colega: 404, no 403, y no se escribe nada", async () => {
      const antes = base.volcado()
      const res = await put(sesiones.carla, "cita-pedro", mover("2026-10-20", "16:00", "17:00"))

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Cita no encontrada" })
      expect(base.volcado()).toEqual(antes)
    })

    it("el profesional no reasigna: pida a quien pida, la cita sigue siendo suya", async () => {
      const res = await put(sesiones.carla, "cita-carla", mover("2026-10-20", "12:00", "12:30", { memberId: "m-pedro" }))

      expect(res.status).toBe(200)
      expect(guardada("cita-carla").memberId).toBe("m-carla")
    })

    it("el profesional tampoco la deja sin asignar", async () => {
      const res = await put(sesiones.carla, "cita-carla", mover("2026-10-20", "12:00", "12:30", { memberId: null }))

      expect(res.status).toBe(200)
      expect(guardada("cita-carla").memberId).toBe("m-carla")
    })

    it("el encargado reasigna a otro profesional del negocio", async () => {
      const res = await put(sesiones.encargado, "cita-carla", mover("2026-10-20", "16:00", "16:30", { memberId: "m-pedro" }))

      expect(res.status).toBe(200)
      expect(guardada("cita-carla").memberId).toBe("m-pedro")
    })

    it("la dueña la deja sin asignar con el string vacío", async () => {
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-20", "10:00", "10:30", { memberId: "" }))

      expect(res.status).toBe(200)
      expect(guardada("cita-carla").memberId).toBeNull()
    })

    it("un profesional sin memberId no llega a ninguna cita (falla cerrado)", async () => {
      const res = await put(sesiones.sinMiembro, "cita-carla", mover("2026-10-20", "12:00", "12:30"))

      expect(res.status).toBe(404)
    })
  })

  describe("aislamiento entre negocios", () => {
    it("el dueño de otro negocio no mueve una cita de este: 404 y nada cambia", async () => {
      const antes = base.volcado()
      const res = await put(sesiones.dueñoAjeno, "cita-carla", mover("2026-10-20", "12:00", "12:30"))

      expect(res.status).toBe(404)
      expect(base.volcado()).toEqual(antes)
    })

    it("la dueña no mueve una cita de otro negocio: 404", async () => {
      const res = await put(sesiones.dueña, "cita-ajena", mover("2026-10-20", "12:00", "12:30"))

      expect(res.status).toBe(404)
      expect(guardada("cita-ajena").startTime).toEqual(santiago("2026-10-20", "10:00"))
    })

    it("no se asigna a un profesional de otro negocio: 404 y nada cambia", async () => {
      const antes = base.volcado()
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-20", "12:00", "12:30", { memberId: "m-ajeno" }))

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Miembro no encontrado" })
      expect(base.volcado()).toEqual(antes)
    })

    it("una cita de otro negocio no cuenta como choque, aunque diga el mismo profesional", async () => {
      // Dato sucio a propósito: sólo el `businessId` la separa de las de Carla.
      base.reiniciar({
        ...base.volcado(),
        appointment: [
          ...base.volcado().appointment,
          {
            ...cita("cita-ajena-con-carla", "m-carla", "2026-10-21", "17:00", "18:00"),
            businessId: OTRO_NEGOCIO,
            customerId: "c-ajeno",
          },
        ],
      })

      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-21", "17:00", "18:00"))

      expect(res.status).toBe(200)
    })
  })

  describe("advertencias", () => {
    it("avisa del choque con otra cita del mismo profesional, sin guardar", async () => {
      const antes = base.volcado()
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-21", "10:30", "11:30"))

      expect(res.status).toBe(409)
      const cuerpo = await res.json()
      expect(cuerpo.advertencias).toEqual([
        { tipo: "choque", mensaje: "Carla Profesional ya tiene una cita de 10:00 a 11:00." },
      ])
      expect(cuerpo.error).toBe("Carla Profesional ya tiene una cita de 10:00 a 11:00.")
      expect(base.volcado()).toEqual(antes)
    })

    it("con el segundo envío confirmado, guarda igual", async () => {
      const res = await put(
        sesiones.dueña,
        "cita-carla",
        mover("2026-10-21", "10:30", "11:30", { confirmarAdvertencias: true })
      )

      expect(res.status).toBe(200)
      expect(guardada("cita-carla").startTime).toEqual(santiago("2026-10-21", "10:30"))
    })

    it("tocarse no es chocar: terminar a las 10:00 y que la otra empiece a las 10:00", async () => {
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-21", "09:30", "10:00"))

      expect(res.status).toBe(200)
    })

    it("una cita cancelada no ocupa el horario", async () => {
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-21", "15:00", "16:00"))

      expect(res.status).toBe(200)
    })

    it("al reasignar, el choque se mira contra las citas del nuevo profesional", async () => {
      // Pedro tiene el martes de 11 a 12, y los martes atiende de 15 a 19.
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-20", "11:30", "12:00", { memberId: "m-pedro" }))

      expect(res.status).toBe(409)
      const { advertencias } = await res.json()
      expect(advertencias.map((a: { tipo: string }) => a.tipo)).toEqual(["choque", "fuera-de-horario"])
      expect(advertencias[0].mensaje).toBe("Pedro Profesional ya tiene una cita de 11:00 a 12:00.")
    })

    it("avisa si queda fuera del horario del negocio", async () => {
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-20", "08:00", "08:30"))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([
        { tipo: "fuera-de-horario", mensaje: "La cita queda fuera del horario de atención del negocio (09:00 a 19:00)." },
      ])
    })

    it("avisa si termina después del cierre aunque empiece dentro", async () => {
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-20", "18:30", "19:30"))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias[0].tipo).toBe("fuera-de-horario")
    })

    it("avisa si ese día el negocio no atiende", async () => {
      // 25 de octubre de 2026: domingo.
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-25", "10:00", "10:30"))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([
        { tipo: "fuera-de-horario", mensaje: "El negocio no atiende ese día." },
      ])
    })

    it("con horario propio, manda el del profesional", async () => {
      // Martes a las 13: el negocio atiende, Pedro no.
      const res = await put(sesiones.dueña, "cita-pedro", mover("2026-10-20", "13:00", "14:00"))

      expect(res.status).toBe(409)
      expect((await res.json()).advertencias).toEqual([
        {
          tipo: "fuera-de-horario",
          mensaje: "La cita queda fuera del horario de atención de Pedro Profesional (15:00 a 19:00).",
        },
      ])
    })

    it("si el negocio no cargó ningún horario, no hay contra qué advertir", async () => {
      const datos = base.volcado()
      base.reiniciar({ ...datos, workSchedule: [] })

      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-25", "06:00", "06:30"))

      expect(res.status).toBe(200)
    })

    it("un cambio de estado no se mueve ni advierte", async () => {
      base.reiniciar({
        ...base.volcado(),
        appointment: [cita("cita-domingo", "m-carla", "2026-10-25", "10:00", "10:30")],
      })

      // Está un domingo, fuera de horario: cambiarle el estado no pregunta nada.
      const res = await put(sesiones.dueña, "cita-domingo", { status: "confirmada" })

      expect(res.status).toBe(200)
      expect(guardada("cita-domingo").status).toBe("confirmada")
    })

    it("mandar el mismo horario que ya tiene no cuenta como mover", async () => {
      // El sábado no se atiende; si contara como mover, advertiría.
      base.reiniciar({
        ...base.volcado(),
        appointment: [cita("cita-sabado", "m-carla", "2026-10-24", "10:00", "10:30")],
      })

      const res = await put(sesiones.dueña, "cita-sabado", mover("2026-10-24", "10:00", "10:30", { notes: "llamar antes" }))

      expect(res.status).toBe(200)
    })
  })

  describe("qué citas se mueven", () => {
    it.each(["cita-carla-cancelada", "cita-completada"])("%s no se mueve: 409", async (id) => {
      const antes = base.volcado()
      const res = await put(sesiones.dueña, id, mover("2026-10-20", "12:00", "12:30", { confirmarAdvertencias: true }))

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_CITA_CERRADA })
      expect(base.volcado()).toEqual(antes)
    })

    it("una cita con atención en curso en el Tablero no se mueve, ni confirmando", async () => {
      const antes = base.volcado()
      const res = await put(
        sesiones.dueña,
        "cita-con-atencion",
        mover("2026-10-22", "12:00", "12:30", { confirmarAdvertencias: true })
      )

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: MENSAJE_CITA_CON_ATENCION })
      expect(base.volcado()).toEqual(antes)
    })

    it("una atención anulada ya no la ata: se mueve", async () => {
      const res = await put(sesiones.dueña, "cita-con-atencion-anulada", mover("2026-10-23", "12:00", "12:30"))

      expect(res.status).toBe(200)
    })

    it("no queda terminando antes de empezar", async () => {
      const res = await put(sesiones.dueña, "cita-carla", mover("2026-10-20", "12:00", "11:00"))

      expect(res.status).toBe(400)
    })
  })
})
