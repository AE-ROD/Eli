import { toZonedTime } from "date-fns-tz"

export type Granularity = "day" | "week" | "month"

export function parseGranularity(value: string | null): Granularity {
  if (value === "week" || value === "month") return value
  return "day"
}

/**
 * Devuelve la clave de bucket (string) para una fecha dada, según granularidad,
 * usando el timezone del negocio para que los cortes de día/semana/mes sean correctos
 * para el usuario final y no UTC.
 */
export function bucketKey(date: Date, granularity: Granularity, timezone: string): string {
  const local = toZonedTime(date, timezone)

  if (granularity === "day") {
    return local.toISOString().slice(0, 10)
  }

  if (granularity === "month") {
    const y = local.getFullYear()
    const m = String(local.getMonth() + 1).padStart(2, "0")
    return `${y}-${m}`
  }

  // week: lunes como inicio de semana ISO
  const day = local.getDay() // 0=domingo
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(local)
  monday.setDate(monday.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

/** Crea/incrementa un bucket en un Map preservando orden de inserción */
export function incrementBucket<T extends Record<string, number>>(
  map: Map<string, T>,
  key: string,
  empty: T,
  patch: Partial<T>
) {
  const current = map.get(key) ?? { ...empty }
  for (const [k, v] of Object.entries(patch)) {
    ;(current as Record<string, number>)[k] = ((current as Record<string, number>)[k] ?? 0) + (v as number)
  }
  map.set(key, current)
}
