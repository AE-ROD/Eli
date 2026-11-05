import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  seguroQueNoSalio,
  ESTADOS_SIN_RECORDATORIO,
  HORA_UTC_DEL_CRON,
  esDeMañana,
  fechaYHoraEnElNegocio,
  recibiraRecordatorio,
  ventanaDeBusqueda,
} from "./recordatorios"

/** Martes 6 de octubre de 2026, 23:00 en Santiago (UTC-3): en UTC ya es el miércoles. */
const AHORA = new Date("2026-10-07T02:00:00.000Z")

describe("esDeMañana", () => {
  it("cuenta el día siguiente en el reloj del negocio, de las 00:00 a las 23:59", () => {
    expect(esDeMañana(new Date("2026-10-07T03:00:00.000Z"), AHORA, "America/Santiago")).toBe(true) // mié 00:00
    expect(esDeMañana(new Date("2026-10-08T02:59:00.000Z"), AHORA, "America/Santiago")).toBe(true) // mié 23:59
  })

  it("no cuenta hoy ni pasado mañana, aunque en UTC caigan en 'mañana'", () => {
    expect(esDeMañana(new Date("2026-10-07T02:30:00.000Z"), AHORA, "America/Santiago")).toBe(false) // mar 23:30
    expect(esDeMañana(new Date("2026-10-08T03:00:00.000Z"), AHORA, "America/Santiago")).toBe(false) // jue 00:00
  })

  it("una zona guardada inválida cae en la del negocio por defecto (Santiago)", () => {
    expect(esDeMañana(new Date("2026-10-07T03:00:00.000Z"), AHORA, "no/es-una-zona")).toBe(true)
    expect(esDeMañana(new Date("2026-10-07T03:00:00.000Z"), AHORA, null)).toBe(true)
  })

  it("el día del cambio de hora (Santiago, 6/9/2026, sin 00:00) sigue siendo un día entero", () => {
    const sabado = new Date("2026-09-05T15:00:00.000Z") // sábado 5, 11:00 (UTC-4)
    expect(esDeMañana(new Date("2026-09-06T04:00:00.000Z"), sabado, "America/Santiago")).toBe(true) // dom 01:00 (UTC-3)
    expect(esDeMañana(new Date("2026-09-07T02:59:00.000Z"), sabado, "America/Santiago")).toBe(true) // dom 23:59
    expect(esDeMañana(new Date("2026-09-07T03:00:00.000Z"), sabado, "America/Santiago")).toBe(false) // lun 00:00
  })
})

describe("ventanaDeBusqueda", () => {
  it("cubre todo 'mañana' en cualquier zona: desde ahora hasta 50 horas después", () => {
    const { desde, hasta } = ventanaDeBusqueda(AHORA)
    expect(desde).toEqual(AHORA)
    expect(hasta.getTime() - AHORA.getTime()).toBe(50 * 60 * 60 * 1000)
  })
})

describe("fechaYHoraEnElNegocio", () => {
  it("da la fecha calendario y la hora HH:MM del negocio, no las de UTC", () => {
    expect(fechaYHoraEnElNegocio(new Date("2026-10-07T02:30:00.000Z"), "America/Santiago")).toEqual({
      fecha: "2026-10-06",
      hora: "23:30",
    })
  })
})

describe("ESTADOS_SIN_RECORDATORIO", () => {
  it("deja afuera las canceladas, las completadas y las de quien no vino", () => {
    expect([...ESTADOS_SIN_RECORDATORIO].sort()).toEqual(["cancelada", "completada", "no-asistio"])
  })
})

describe("recibiraRecordatorio (N4): la pantalla final promete el recordatorio sólo si el cron lo va a enviar", () => {
  const SANTIAGO = "America/Santiago"
  // Noviembre en Santiago: UTC-3. El cron corre a las 13:00 UTC, las 10:00.
  const enSantiago = (fechaYHora: string) => new Date(`${fechaYHora}:00.000-03:00`)

  it("reservar a las 22:40 para el día siguiente: la corrida de ese día ya pasó, no llega", () => {
    expect(recibiraRecordatorio(enSantiago("2026-11-05T15:00"), enSantiago("2026-11-04T22:40"), SANTIAGO)).toBe(false)
  })

  it("reservar antes de la corrida para el día siguiente: llega", () => {
    expect(recibiraRecordatorio(enSantiago("2026-11-05T15:00"), enSantiago("2026-11-04T08:00"), SANTIAGO)).toBe(true)
  })

  it("justo después de la corrida, para mañana: no llega", () => {
    expect(recibiraRecordatorio(enSantiago("2026-11-05T09:00"), enSantiago("2026-11-04T10:01"), SANTIAGO)).toBe(false)
  })

  it("para hoy: nunca llega", () => {
    expect(recibiraRecordatorio(enSantiago("2026-11-04T18:00"), enSantiago("2026-11-04T08:00"), SANTIAGO)).toBe(false)
  })

  it("para pasado mañana o más adelante: llega con la corrida del día antes", () => {
    expect(recibiraRecordatorio(enSantiago("2026-11-06T09:00"), enSantiago("2026-11-04T22:40"), SANTIAGO)).toBe(true)
    expect(recibiraRecordatorio(enSantiago("2027-01-20T09:00"), enSantiago("2026-11-04T22:40"), SANTIAGO)).toBe(true)
  })

  it("coincide con lo que haría el cron: la corrida que la ve como de mañana es posterior a la reserva", () => {
    const inicio = enSantiago("2026-11-06T09:00")
    const corridaDelDiaAntes = new Date(Date.UTC(2026, 10, 5, HORA_UTC_DEL_CRON))
    expect(esDeMañana(inicio, corridaDelDiaAntes, SANTIAGO)).toBe(true)
    expect(recibiraRecordatorio(inicio, new Date(corridaDelDiaAntes.getTime() - 1), SANTIAGO)).toBe(true)
    expect(recibiraRecordatorio(inicio, corridaDelDiaAntes, SANTIAGO)).toBe(false)
  })

  it("HORA_UTC_DEL_CRON es la del cron de recordatorios en vercel.json", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[]
    }
    const cron = vercel.crons.find((entrada) => entrada.path === "/api/cron/recordatorios")
    expect(cron?.schedule).toBe(`0 ${HORA_UTC_DEL_CRON} * * *`)
  })
})

describe("seguroQueNoSalio (#140)", () => {
  it("sin clave de Resend (null) o con un rechazo de Resend: no salió", () => {
    expect(seguroQueNoSalio(null)).toBe(true)
    for (const name of ["rate_limit_exceeded", "daily_quota_exceeded", "validation_error", "invalid_api_key"]) {
      expect(seguroQueNoSalio({ error: { name } })).toBe(true)
    }
  })

  it("un error ambiguo (red caída, error interno) o un envío aceptado: pudo salir", () => {
    expect(seguroQueNoSalio({ error: { name: "application_error" } })).toBe(false)
    expect(seguroQueNoSalio({ error: { name: "internal_server_error" } })).toBe(false)
    expect(seguroQueNoSalio({ error: null })).toBe(false)
  })
})
