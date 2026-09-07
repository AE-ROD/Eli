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
 * Una franja con `endTime` <= `startTime` no se puede medir: en el modelo
 * "HH:MM sin fecha" de `WorkSchedule` no hay forma honesta de saber cuánto
 * dura (¿22:00–02:00 son 4 horas del día siguiente, o un dato mal cargado?).
 * En vez de adivinar, se trata como "no se puede calcular" en todo el módulo.
 */
export function franjaValida(franja: FranjaHorario): boolean {
  return minutosDeHHMM(franja.startTime) < minutosDeHHMM(franja.endTime)
}

/** Intervalos [inicio, fin) fusionados: dos citas que se pisan no deben abrir un hueco fantasma entre ellas. */
function fusionarIntervalos(
  intervalos: { inicio: number; fin: number }[]
): { inicio: number; fin: number }[] {
  const ordenados = [...intervalos].sort((a, b) => a.inicio - b.inicio || a.fin - b.fin)
  const fusionados: { inicio: number; fin: number }[] = []

  for (const actual of ordenados) {
    const ultimo = fusionados[fusionados.length - 1]
    if (ultimo && actual.inicio <= ultimo.fin) {
      ultimo.fin = Math.max(ultimo.fin, actual.fin)
    } else {
      fusionados.push({ ...actual })
    }
  }

  return fusionados
}

/**
 * Segmentos de una franja: toda cita que se solapa con ella (aunque se pise
 * con otra, aunque quede anidada dentro de otra, aunque dure cero minutos) en
 * su hora real recortada sólo a los bordes de la franja — nunca al cursor de
 * otra cita, que es lo que hacía desaparecer o cambiar de hora a una cita
 * anidada o parcialmente solapada. Los huecos se calculan aparte, sobre la
 * *unión* de los intervalos ocupados, no restando cita por cita.
 *
 * Una franja inválida (`endTime` <= `startTime`) no genera segmentos: no hay
 * nada honesto que dibujar sobre un rango que no se puede medir.
 */
export function segmentosDeFranja(franja: FranjaHorario, citas: CitaDelDia[]): SegmentoDia[] {
  if (!franjaValida(franja)) return []

  const inicioFranja = minutosDeHHMM(franja.startTime)
  const finFranja = minutosDeHHMM(franja.endTime)

  const citasEnFranja = citas
    .map((cita) => {
      const inicioReal = minutosDeInstante(cita.startTime)
      const finReal = minutosDeInstante(cita.endTime)
      return {
        cita,
        // Semiabierto (igual que `citasFueraDeFranjas`): una cita que termina
        // justo cuando empieza la franja, o que empieza justo cuando termina,
        // no se cuenta como parte de ella.
        seSolapa: inicioReal < finFranja && finReal > inicioFranja,
        inicio: Math.max(inicioFranja, inicioReal),
        fin: Math.min(finFranja, finReal),
      }
    })
    .filter(({ seSolapa }) => seSolapa)
    .sort((a, b) => a.inicio - b.inicio || a.fin - b.fin)

  const segmentosCita: SegmentoDia[] = citasEnFranja.map(({ cita, inicio, fin }) => ({
    tipo: "cita",
    inicioMin: inicio,
    finMin: fin,
    cita,
  }))

  const huecos: SegmentoDia[] = []
  let cursor = inicioFranja
  for (const ocupado of fusionarIntervalos(citasEnFranja)) {
    if (ocupado.inicio > cursor) {
      huecos.push({ tipo: "hueco", inicioMin: cursor, finMin: ocupado.inicio })
    }
    cursor = Math.max(cursor, ocupado.fin)
  }
  if (cursor < finFranja) {
    huecos.push({ tipo: "hueco", inicioMin: cursor, finMin: finFranja })
  }

  return [...segmentosCita, ...huecos].sort((a, b) => a.inicioMin - b.inicioMin)
}

/**
 * Una cita no cubierta por ninguna franja no debe desaparecer de la vista.
 * Una franja inválida no cuenta como cobertura: no hay forma confiable de
 * saber si una cita cae "dentro" de un rango que no se puede medir, así que
 * se ignora para esta decisión (la cita cae del lado de "fuera de franjas").
 */
export function citasFueraDeFranjas(franjas: FranjaHorario[], citas: CitaDelDia[]): CitaDelDia[] {
  const franjasValidas = franjas.filter(franjaValida)

  return citas.filter((cita) => {
    const inicio = minutosDeInstante(cita.startTime)
    const fin = minutosDeInstante(cita.endTime)
    return !franjasValidas.some((franja) => {
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
 *
 * Si alguna franja es inválida (`endTime` <= `startTime`) el resultado es
 * `null`, nunca `0`: cero minutos libres es una afirmación ("no te queda
 * nada"), y un rango que no se puede medir no permite afirmar eso ni nada.
 */
export function minutosLibresEnFranjas(franjas: FranjaHorario[], citas: CitaDelDia[]): number | null {
  if (franjas.some((franja) => !franjaValida(franja))) return null

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
