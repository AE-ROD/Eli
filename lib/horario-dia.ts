/**
 * Cálculo puro para la línea de tiempo del profesional (F-014): a partir de su
 * horario de hoy y sus citas, arma los segmentos que se dibujan (cita / hueco)
 * y el tiempo libre real. Sin acceso a red ni a Prisma — todo lo que entra acá
 * ya vino resuelto por el endpoint.
 *
 * `WorkSchedule` guarda `startTime`/`endTime` como `"HH:MM"`, sin fecha ni zona
 * horaria: se comparan como minutos desde la medianoche, nunca como `Date`.
 * Las citas sí son instantes reales (ISO), así que su hora se lee con `Date`
 * en la zona local del navegador — igual que ya hace `page.tsx`.
 */

export interface FranjaHorario {
  startTime: string
  endTime: string
}

export interface CitaDelDia {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string
  patient: { id: string; name: string } | null
}

export type SegmentoDia =
  | { tipo: "cita"; inicioMin: number; finMin: number; cita: CitaDelDia }
  | { tipo: "hueco"; inicioMin: number; finMin: number }

function minutosDeHHMM(hhmm: string): number {
  const [horas, minutos] = hhmm.split(":").map(Number)
  return horas * 60 + minutos
}

function minutosDeInstante(iso: string): number {
  const fecha = new Date(iso)
  return fecha.getHours() * 60 + fecha.getMinutes()
}

/**
 * Segmentos de una franja: las citas que caen dentro (recortadas a sus bordes)
 * y los huecos que quedan entre ellas. Una franja sin citas es un único hueco
 * del largo completo — así un día sin citas se lee como agenda libre.
 */
export function segmentosDeFranja(franja: FranjaHorario, citas: CitaDelDia[]): SegmentoDia[] {
  const inicioFranja = minutosDeHHMM(franja.startTime)
  const finFranja = minutosDeHHMM(franja.endTime)

  const citasEnFranja = citas
    .map((cita) => ({
      cita,
      inicio: Math.max(inicioFranja, minutosDeInstante(cita.startTime)),
      fin: Math.min(finFranja, minutosDeInstante(cita.endTime)),
    }))
    .filter(({ inicio, fin }) => fin > inicio)
    .sort((a, b) => a.inicio - b.inicio)

  const segmentos: SegmentoDia[] = []
  let cursor = inicioFranja

  for (const { cita, inicio, fin } of citasEnFranja) {
    if (inicio > cursor) {
      segmentos.push({ tipo: "hueco", inicioMin: cursor, finMin: inicio })
    }
    // Si dos citas se pisan, la segunda no resta hueco: el cursor no retrocede.
    if (fin > cursor) {
      segmentos.push({ tipo: "cita", inicioMin: Math.max(inicio, cursor), finMin: fin, cita })
      cursor = fin
    }
  }

  if (cursor < finFranja) {
    segmentos.push({ tipo: "hueco", inicioMin: cursor, finMin: finFranja })
  }

  return segmentos
}

/** Una cita no cubierta por ninguna franja no debe desaparecer de la vista. */
export function citasFueraDeFranjas(franjas: FranjaHorario[], citas: CitaDelDia[]): CitaDelDia[] {
  return citas.filter((cita) => {
    const inicio = minutosDeInstante(cita.startTime)
    const fin = minutosDeInstante(cita.endTime)
    return !franjas.some((franja) => {
      const inicioFranja = minutosDeHHMM(franja.startTime)
      const finFranja = minutosDeHHMM(franja.endTime)
      return fin > inicioFranja && inicio < finFranja
    })
  })
}

/**
 * Minutos libres reales: horas del horario menos horas ocupadas por citas.
 * Se calcula, no se estima — por eso pide siempre `franjas`; si no hay
 * horario, el llamador no debe invocar esta función (no hay contra qué medir).
 */
export function minutosLibresEnFranjas(franjas: FranjaHorario[], citas: CitaDelDia[]): number {
  return franjas.reduce((total, franja) => {
    const libresDeLaFranja = segmentosDeFranja(franja, citas)
      .filter((segmento) => segmento.tipo === "hueco")
      .reduce((acc, segmento) => acc + (segmento.finMin - segmento.inicioMin), 0)
    return total + libresDeLaFranja
  }, 0)
}

export function formatoDuracion(minutos: number): string {
  if (minutos <= 0) return "0 min"
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (horas === 0) return `${resto} min`
  if (resto === 0) return `${horas} h`
  return `${horas} h ${resto} min`
}

export function formatoHHMM(minutos: number): string {
  const horas = String(Math.floor(minutos / 60)).padStart(2, "0")
  const restoMin = String(minutos % 60).padStart(2, "0")
  return `${horas}:${restoMin}`
}
