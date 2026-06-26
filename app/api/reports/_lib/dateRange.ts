import { fromZonedTime } from "date-fns-tz"

export const DEFAULT_TZ = "America/Cancun"

export interface RangoFechas {
  from: Date
  to: Date
  fromStr: string
  toStr: string
}

/**
 * Parsea los query params `from`/`to` (YYYY-MM-DD) interpretados en el timezone
 * del negocio, devolviendo límites UTC listos para usar en queries de Prisma.
 * `to` se extiende hasta el final del día (23:59:59.999) local.
 */
export function parseRangoFechas(
  searchParams: URLSearchParams,
  timezone: string = DEFAULT_TZ
): RangoFechas | null {
  const fromStr = searchParams.get("from")
  const toStr = searchParams.get("to")

  if (!fromStr || !toStr) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) return null

  const from = fromZonedTime(`${fromStr}T00:00:00`, timezone)
  const to = fromZonedTime(`${toStr}T23:59:59.999`, timezone)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  if (from.getTime() > to.getTime()) return null

  return { from, to, fromStr, toStr }
}

/**
 * Calcula el rango anterior de igual duración inmediatamente antes de `from`,
 * usado para comparaciones período vs período anterior.
 */
export function rangoAnterior(rango: RangoFechas): { from: Date; to: Date } {
  const duracionMs = rango.to.getTime() - rango.from.getTime()
  const to = new Date(rango.from.getTime() - 1)
  const from = new Date(to.getTime() - duracionMs)
  return { from, to }
}

export function calcularVariacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null
  return Math.round(((actual - anterior) / anterior) * 1000) / 10
}

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
