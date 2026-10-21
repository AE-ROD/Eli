/**
 * Fechas calendario y horas de pared en la zona horaria del negocio
 * (`Business.timezone`, IANA). Puro: sin base, sin sesión, sin dependencias;
 * todo sale de `Intl.DateTimeFormat` con `timeZone`.
 *
 * Por qué existe: `new Date("2026-10-19")` es la medianoche UTC, y
 * `getDay()`/`setHours()`/`getHours()` usan la zona del servidor. En una
 * máquina en Santiago (UTC-3) el lunes 19 daba domingo; en Vercel (UTC) el
 * día salía bien pero las horas quedaban corridas tres o cuatro horas
 * respecto de las del negocio. Acá nada depende de la zona del proceso.
 *
 * Horario de verano (Chile lo tiene). Se sigue la regla "compatible" de
 * `Temporal` y de los calendarios:
 * - Hora que no existe (el reloj salta, p. ej. Santiago el 6/9/2026 pasa de
 *   las 00:00 a la 01:00): se corre hacia adelante lo que dura el salto. Las
 *   00:30 de ese día son las 01:30 de ese día. Así el inicio de un día que
 *   empieza con el salto es su primer instante real.
 * - Hora que ocurre dos veces (el reloj retrocede, p. ej. Santiago el
 *   4/4/2026 vuelve de las 24:00 a las 23:00): la primera vez que ocurre.
 */

/** La zona de un negocio que no tiene otra cargada (el default del esquema). */
export const ZONA_POR_DEFECTO = "America/Santiago"

/** "AAAA-MM-DD": una fecha calendario, sin hora ni zona. */
const FORMA_DE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
/** "HH:MM" de 00:00 a 23:59. */
const FORMA_DE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/
/** Forma de un nombre IANA: deja afuera desplazamientos como "-03:00", que no saben de horario de verano. */
const FORMA_DE_ZONA = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/

const MS_POR_MINUTO = 60_000
const MS_POR_DIA = 24 * 60 * MS_POR_MINUTO

// ─── Zona ────────────────────────────────────────────────────────────────────

/** Si es una zona IANA que este motor conoce. Nunca lanza. */
export function esZonaValida(zona: unknown): zona is string {
  if (typeof zona !== "string" || zona.length > 64 || !FORMA_DE_ZONA.test(zona)) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona })
    return true
  } catch {
    return false
  }
}

/**
 * La zona con la que se calcula para un negocio. Si lo guardado no es una
 * zona válida (dato viejo, a mano, o más nuevo que la base de zonas del
 * motor), el default: una reserva no puede reventar por eso.
 */
export function zonaDelNegocio(guardada: string | null | undefined): string {
  return esZonaValida(guardada) ? guardada : ZONA_POR_DEFECTO
}

// ─── Fechas calendario ───────────────────────────────────────────────────────

interface Calendario {
  año: number
  mes: number // 1 a 12
  dia: number
}

/**
 * Años que se aceptan en una fecha calendario: 1900 a 9998. La única
 * definición de "fecha aceptable"; la usan todos los endpoints a través de
 * `esFechaCalendario`.
 * - Desde 1900: `Date.UTC` lee los años 0 a 99 como 1900–1999 (0050 sería
 *   1950), y en esas épocas las zonas IANA usan la hora media local, con
 *   desfases de segundos. Algunas la usan hasta después de 1900 (Santiago,
 *   hasta 1910): ahí las horas pueden correrse unos segundos, sin lanzar.
 *   Nadie reserva en esos años; lo que importa es que no rompan.
 * - Hasta 9998: el rango de un día necesita el día siguiente, y "10000-01-01"
 *   ya no es "AAAA-MM-DD". Con 9998, el siguiente del último día aceptado
 *   (9999-01-01) todavía se escribe y se calcula.
 */
export const AÑO_MINIMO = 1900
export const AÑO_MAXIMO = 9998

function leerFecha(fecha: string): Calendario | null {
  const partes = FORMA_DE_FECHA.exec(fecha)
  if (!partes) return null
  const [año, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])]
  if (año < AÑO_MINIMO || año > AÑO_MAXIMO) return null
  const comprobada = new Date(Date.UTC(año, mes - 1, dia))
  const existe =
    comprobada.getUTCFullYear() === año && comprobada.getUTCMonth() === mes - 1 && comprobada.getUTCDate() === dia
  return existe ? { año, mes, dia } : null
}

function fechaValidaOLanza(fecha: string): Calendario {
  const leida = leerFecha(fecha)
  if (!leida) throw new RangeError(`Fecha calendario inválida: ${fecha}`)
  return leida
}

const dosCifras = (n: number) => String(n).padStart(2, "0")

function comoTexto({ año, mes, dia }: Calendario): string {
  return `${String(año).padStart(4, "0")}-${dosCifras(mes)}-${dosCifras(dia)}`
}

/**
 * Si el texto es "AAAA-MM-DD", ese día existe (rechaza "2026-02-30") y su año
 * va de `AÑO_MINIMO` a `AÑO_MAXIMO`. Las funciones que reciben una fecha
 * lanzan `RangeError` con lo que esto rechaza: quien recibe fechas de afuera
 * pregunta acá primero.
 */
export function esFechaCalendario(fecha: string): boolean {
  return leerFecha(fecha) !== null
}

/** Si el texto es "HH:MM" entre 00:00 y 23:59. */
export function esHoraDelDia(hora: string): boolean {
  return FORMA_DE_HORA.test(hora)
}

/**
 * Día de la semana de una fecha calendario, 0 domingo a 6 sábado (como
 * `WorkSchedule.dayOfWeek`). Es aritmética de calendario: no depende de
 * ninguna zona. "2026-10-19" es lunes (1) en cualquier servidor.
 */
export function diaDeLaSemana(fecha: string): number {
  const { año, mes, dia } = fechaValidaOLanza(fecha)
  return new Date(Date.UTC(año, mes - 1, dia)).getUTCDay()
}

/** El día calendario `dias` días después, sin validar el rango de años (uso interno). */
function moverCalendario({ año, mes, dia }: Calendario, dias: number): Calendario {
  const movida = new Date(Date.UTC(año, mes - 1, dia + dias))
  return { año: movida.getUTCFullYear(), mes: movida.getUTCMonth() + 1, dia: movida.getUTCDate() }
}

/**
 * La fecha calendario `dias` días después (o antes, si es negativo). Lanza
 * `RangeError` si la de entrada o la resultante no es aceptable.
 */
export function sumarDias(fecha: string, dias: number): string {
  const resultado = comoTexto(moverCalendario(fechaValidaOLanza(fecha), dias))
  fechaValidaOLanza(resultado)
  return resultado
}

/**
 * Cuántos días calendario van de `desde` a `hasta` (negativo si `hasta` es
 * anterior). Aritmética de calendario, como `diaDeLaSemana`: no depende de
 * ninguna zona ni del horario de verano. Lanza `RangeError` si alguna de las
 * dos no es aceptable.
 */
export function diasEntre(desde: string, hasta: string): number {
  const a = fechaValidaOLanza(desde)
  const b = fechaValidaOLanza(hasta)
  return (Date.UTC(b.año, b.mes - 1, b.dia) - Date.UTC(a.año, a.mes - 1, a.dia)) / MS_POR_DIA
}

// ─── Instantes y hora de pared ───────────────────────────────────────────────

interface Pared extends Calendario {
  hora: number
  minuto: number
}

/** Un formateador por zona, reusado: crearlos es lo caro. */
const formateadores = new Map<string, Intl.DateTimeFormat>()

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    })
    formateadores.set(zona, f)
  }
  return f
}

function paredEn(instante: number, zona: string): Pared {
  const partes = formateador(zona).formatToParts(new Date(instante))
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value)
  return {
    año: parte("year"),
    mes: parte("month"),
    dia: parte("day"),
    // `% 24` por si algún motor escribe la medianoche como "24".
    hora: parte("hour") % 24,
    minuto: parte("minute"),
  }
}

/** Cuánto le suma la zona a UTC en ese instante, en ms (Santiago en octubre: -3 h). Al minuto: las zonas IANA actuales no tienen segundos. */
function desfaseEn(instante: number, zona: string): number {
  const p = paredEn(instante, zona)
  const comoSiFueraUtc = Date.UTC(p.año, p.mes - 1, p.dia, p.hora, p.minuto)
  return comoSiFueraUtc - Math.floor(instante / MS_POR_MINUTO) * MS_POR_MINUTO
}

/**
 * El instante (UTC) en que el reloj de la zona marca esa fecha y esa hora.
 * Horas inexistentes y duplicadas por el cambio de horario: ver el
 * encabezado del módulo (adelante lo que dura el salto / la primera vez).
 * Lanza `RangeError` si la fecha o la hora no son válidas; la zona inválida
 * cae en el default, como en `zonaDelNegocio`.
 */
export function instanteEn(fecha: string, hora: string, zona: string): Date {
  const calendario = fechaValidaOLanza(fecha)
  const partes = FORMA_DE_HORA.exec(hora)
  if (!partes) throw new RangeError(`Hora inválida: ${hora}`)
  return instanteDePared(calendario, Number(partes[1]), Number(partes[2]), zonaDelNegocio(zona))
}

/**
 * `instanteEn` sobre un calendario ya leído. Sólo recibe años de 1900 en
 * adelante (`leerFecha` o el día siguiente de uno aceptado): `Date.UTC` no
 * reinterpreta ninguno.
 */
function instanteDePared({ año, mes, dia }: Calendario, hora: number, minuto: number, z: string): Date {
  const pared = Date.UTC(año, mes - 1, dia, hora, minuto)

  // Los desfases de la víspera y del día siguiente cubren cualquier cambio de
  // hora cerca de esa hora (ninguna zona cambia dos veces en 48 horas).
  const antes = desfaseEn(pared - MS_POR_DIA, z)
  const despues = desfaseEn(pared + MS_POR_DIA, z)
  const validos = [...new Set([antes, despues])]
    .map((desfase) => pared - desfase)
    .filter((instante) => instante + desfaseEn(instante, z) === pared)

  // Duplicada: la primera. Inexistente: con el desfase de antes del salto,
  // que la corre hacia adelante lo que dura el salto.
  return new Date(validos.length > 0 ? Math.min(...validos) : pared - antes)
}

/**
 * El día calendario en la zona como rango [desde, hasta): `desde` es su
 * primer instante y `hasta` el primero del día siguiente. Dura 23 o 25 horas
 * los días de cambio de hora; por eso se arma con el calendario y no sumando
 * 24 horas.
 */
export function rangoDelDiaEn(fecha: string, zona: string): { desde: Date; hasta: Date } {
  const dia = fechaValidaOLanza(fecha)
  const z = zonaDelNegocio(zona)
  // El día siguiente no se valida: del 9998-12-31 es el 9999-01-01, fuera de
  // lo que se acepta de afuera pero perfectamente calculable.
  return { desde: instanteDePared(dia, 0, 0, z), hasta: instanteDePared(moverCalendario(dia, 1), 0, 0, z) }
}

/**
 * Qué fecha calendario y qué minuto del día (0 a 1439) marca el reloj de la
 * zona en ese instante. Para comparar citas guardadas (instantes) con
 * horarios "HH:MM" y para saber qué es "hoy" para el negocio.
 */
export function fechaYMinutosEn(instante: Date, zona: string): { fecha: string; minutos: number } {
  const p = paredEn(instante.getTime(), zonaDelNegocio(zona))
  return { fecha: comoTexto(p), minutos: p.hora * 60 + p.minuto }
}

/**
 * Si el reloj de la zona marca alguna vez esa hora ese día. No la marca en
 * el salto del horario de verano (Santiago, 6/9/2026 de 00:00 a 00:59):
 * `instanteEn` la correría a la hora siguiente, así que ni se ofrece ni se
 * acepta, y lo ofrecido y lo guardado coinciden. Las horas duplicadas sí
 * existen. No lanza: fecha u hora inválidas dan `false`.
 */
export function existeLaHora(fecha: string, hora: string, zona: string): boolean {
  if (!esFechaCalendario(fecha) || !esHoraDelDia(hora)) return false
  const vuelta = fechaYMinutosEn(instanteEn(fecha, hora, zona), zona)
  const [h, m] = hora.split(":").map(Number)
  return vuelta.fecha === fecha && vuelta.minutos === h * 60 + m
}
