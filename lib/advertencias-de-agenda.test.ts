import { describe, it, expect, beforeEach } from "vitest"
import type { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { advertenciasDeAgenda } from "./advertencias-de-agenda"

/** Santiago en octubre de 2026 está en UTC-3. El 20 de octubre de 2026 es martes. */
const santiago = (hora: string, fecha = "2026-10-20") => new Date(`${fecha}T${hora}:00.000-03:00`)
const tramo = (inicio: string, fin: string) => ({ startTime: santiago(inicio), endTime: santiago(fin) })

const base = crearBaseFalsa()
const db = base.prisma as unknown as Prisma.TransactionClient

beforeEach(() => {
  base.reiniciar({
    ...datosBase(),
    appointment: [
      { id: "cita", businessId: NEGOCIO, memberId: "m-carla", title: "Corte", startTime: santiago("10:00"), endTime: santiago("11:00") },
    ],
    timeBlock: [
      { id: "b", businessId: NEGOCIO, memberId: "m-carla", startTime: santiago("10:30"), endTime: santiago("12:00"), motivo: "Trámite" },
      { id: "b-ajeno", businessId: OTRO_NEGOCIO, memberId: null, startTime: santiago("00:00"), endTime: santiago("23:00") },
    ],
    workSchedule: [{ id: "h", businessId: NEGOCIO, memberId: null, dayOfWeek: 2, startTime: "09:00", endTime: "19:00" }],
  })
})

describe("advertenciasDeAgenda", () => {
  it("junta choque, bloqueo y horario, en ese orden", async () => {
    const advertencias = await advertenciasDeAgenda(db, {
      businessId: NEGOCIO,
      citaId: null,
      tramo: { startTime: santiago("10:45"), endTime: santiago("19:30") },
      memberId: "m-carla",
    })

    expect(advertencias.map((a) => a.tipo)).toEqual(["choque", "bloqueo", "fuera-de-horario"])
    expect(advertencias[1].mensaje).toBe("Carla Profesional tiene bloqueado de 10:30 a 12:00 (Trámite).")
  })

  it("la cita que se mueve no choca consigo misma", async () => {
    const advertencias = await advertenciasDeAgenda(db, {
      businessId: NEGOCIO,
      citaId: "cita",
      tramo: tramo("10:00", "10:30"),
      memberId: "m-carla",
    })

    expect(advertencias).toEqual([])
  })

  it("un día sin horario general, el horario personal del encargado no cuenta como atención del negocio (#168)", async () => {
    // El 21 de octubre de 2026 es miércoles: sólo el encargado cargó horario.
    base.reiniciar({
      ...datosBase(),
      workSchedule: [
        { id: "h", businessId: NEGOCIO, memberId: null, dayOfWeek: 2, startTime: "09:00", endTime: "19:00" },
        { id: "h-enc", businessId: NEGOCIO, memberId: "m-encargado", dayOfWeek: 3, startTime: "09:00", endTime: "19:00" },
      ],
    })
    const miercoles = { startTime: santiago("10:00", "2026-10-21"), endTime: santiago("11:00", "2026-10-21") }

    const advertencias = await advertenciasDeAgenda(db, { businessId: NEGOCIO, citaId: null, tramo: miercoles, memberId: null })

    expect(advertencias).toEqual([{ tipo: "fuera-de-horario", mensaje: "El negocio no atiende ese día." }])
  })

  it("nada de otro negocio cuenta: su bloqueo de todo el día no se advierte", async () => {
    const advertencias = await advertenciasDeAgenda(db, {
      businessId: NEGOCIO,
      citaId: null,
      tramo: tramo("15:00", "16:00"),
      memberId: null,
    })

    expect(advertencias).toEqual([])
  })
})

describe("advertenciasDeAgenda con sedes (plan Independiente)", () => {
  // El 20 de octubre de 2026 es martes y el 21, miércoles. Centro atiende el
  // martes de 09:00 a 13:00; Norte, el martes de 14:00 a 19:00 y el miércoles
  // de 10:00 a 12:00. "Vieja" está desactivada y conserva su horario.
  const fila = (id: string, sedeId: string | null, dayOfWeek: number, startTime: string, endTime: string, extra: Record<string, unknown> = {}) => ({
    id,
    businessId: NEGOCIO,
    memberId: null,
    sedeId,
    dayOfWeek,
    startTime,
    endTime,
    ...extra,
  })
  const sede = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
    id,
    businessId: NEGOCIO,
    nombre,
    direccion: "Calle 1",
    comuna: "Ñuñoa",
    ...extra,
  })

  beforeEach(() => {
    base.reiniciar({
      ...datosBase(),
      business: datosBase().business.map((negocio) => (negocio.id === NEGOCIO ? { ...negocio, plan: "independiente" } : negocio)),
      businessMember: [],
      sede: [
        sede("centro", "Centro"),
        sede("norte", "Norte"),
        sede("vieja", "Vieja", { activo: false }),
        { ...sede("de-otro", "Del otro"), businessId: OTRO_NEGOCIO },
      ],
      workSchedule: [
        fila("c-mar", "centro", 2, "09:00", "13:00"),
        fila("n-mar", "norte", 2, "14:00", "19:00"),
        fila("n-mie", "norte", 3, "10:00", "12:00"),
        fila("v-mar", "vieja", 2, "09:00", "19:00"),
        { ...fila("o-mar", "de-otro", 2, "00:00", "23:00"), businessId: OTRO_NEGOCIO },
      ],
    })
  })

  const consulta = (hora: string, fin: string, sedeId?: string | null, fecha = "2026-10-20", memberId: string | null = null) => ({
    businessId: NEGOCIO,
    citaId: null,
    tramo: { startTime: santiago(hora, fecha), endTime: santiago(fin, fecha) },
    memberId,
    sedeId,
  })

  it("con sede, el fuera de horario se compara con el horario de ESA sede y la nombra", async () => {
    // 15:00 está en el horario de Norte pero no en el de Centro.
    expect(await advertenciasDeAgenda(db, consulta("15:00", "16:00", "norte"))).toEqual([])
    expect(await advertenciasDeAgenda(db, consulta("15:00", "16:00", "centro"))).toEqual([
      { tipo: "fuera-de-horario", mensaje: "La cita queda fuera del horario de atención de la sede Centro (09:00 a 13:00)." },
    ])
    expect(await advertenciasDeAgenda(db, consulta("10:00", "11:00", "norte"))).toEqual([
      { tipo: "fuera-de-horario", mensaje: "La cita queda fuera del horario de atención de la sede Norte (14:00 a 19:00)." },
    ])
  })

  it("con sede, un día en que ella no atiende (aunque otra sí): 'La sede X no atiende ese día'", async () => {
    // El miércoles sólo atiende Norte con horario cargado.
    const miercoles = (sedeId: string) => consulta("10:00", "11:00", sedeId, "2026-10-21")

    expect(await advertenciasDeAgenda(db, miercoles("norte"))).toEqual([])
    expect(await advertenciasDeAgenda(db, miercoles("centro"))).toEqual([
      { tipo: "fuera-de-horario", mensaje: "La sede Centro no atiende ese día." },
    ])
  })

  it("sin sede (undefined o null), contra el horario vigente de todas las sedes activas, sin nombrar ninguna", async () => {
    for (const sedeId of [undefined, null]) {
      // 10:00 cae en el de Centro y 15:00 en el de Norte: en alguna sede atiende.
      expect(await advertenciasDeAgenda(db, consulta("10:00", "11:00", sedeId))).toEqual([])
      expect(await advertenciasDeAgenda(db, consulta("15:00", "16:00", sedeId))).toEqual([])
      // 13:30 no cae en ninguno. La sede desactivada (09:00 a 19:00) y el otro negocio (00:00 a 23:00) no cuentan.
      expect(await advertenciasDeAgenda(db, consulta("13:30", "14:00", sedeId))).toEqual([
        {
          tipo: "fuera-de-horario",
          mensaje: "La cita queda fuera del horario de atención del negocio (09:00 a 13:00 y 14:00 a 19:00).",
        },
      ])
    }
  })

  it("una sede desactivada, de otro negocio o que no existe no tiene horario contra el que comparar: no inventa advertencias", async () => {
    for (const sedeId of ["vieja", "de-otro", "no-existe"]) {
      expect(await advertenciasDeAgenda(db, consulta("23:00", "23:30", sedeId))).toEqual([])
    }
  })

  it("el choque y el bloqueo no dependen de la sede: quien atiende no está en dos lugares a la vez", async () => {
    // Carla (sin horario propio) tiene una cita en Centro y el negocio un bloqueo.
    base.reiniciar({
      ...base.volcado(),
      businessMember: datosBase().businessMember,
      appointment: [
        { id: "cita-centro", businessId: NEGOCIO, memberId: "m-carla", sedeId: "centro", title: "Corte", startTime: santiago("15:00"), endTime: santiago("16:00") },
      ],
      timeBlock: [{ id: "b", businessId: NEGOCIO, memberId: null, startTime: santiago("17:00"), endTime: santiago("18:00"), motivo: "Trámite" }],
    })

    // Una cita nueva de Carla en Norte a la hora de su cita de Centro choca igual.
    const choque = await advertenciasDeAgenda(db, consulta("15:30", "16:30", "norte", "2026-10-20", "m-carla"))
    expect(choque).toEqual([{ tipo: "choque", mensaje: "Carla Profesional ya tiene una cita de 15:00 a 16:00." }])

    // Y el bloqueo de todo el negocio, también.
    const bloqueo = await advertenciasDeAgenda(db, consulta("17:00", "18:00", "norte", "2026-10-20", "m-carla"))
    expect(bloqueo).toEqual([{ tipo: "bloqueo", mensaje: "El negocio tiene bloqueado de 17:00 a 18:00 (Trámite)." }])
  })
})
