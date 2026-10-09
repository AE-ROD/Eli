import { PROFESIONAL_DUEÑO, deCentavos, idDeProfesional } from "@/lib/atenciones"
import { nombreDeMedio } from "@/lib/medios-de-pago"

/**
 * Reglas de los reportes (docs/PRODUCTO.md, sección 8): a qué turno pertenece
 * un cobro, qué atenciones entran según los filtros y cómo se resume un
 * período. Sin base ni sesión, como `lib/atenciones.ts`: el endpoint trae las
 * atenciones y decide qué puede ver cada uno; esto sólo cuenta.
 */

// ─── Turnos ──────────────────────────────────────────────────────────────────

/** Mañana antes de las 12, tarde de 12 a 18, noche desde las 18. */
export const TURNOS = [
  { id: "manana", nombre: "Mañana", desde: 0, hasta: 12 },
  { id: "tarde", nombre: "Tarde", desde: 12, hasta: 18 },
  { id: "noche", nombre: "Noche", desde: 18, hasta: 24 },
] as const

export type TurnoId = (typeof TURNOS)[number]["id"]

/** Tupla no vacía para `z.enum`, igual que `IDS_DE_RUBROS`. */
export const IDS_DE_TURNOS = TURNOS.map((turno) => turno.id) as [TurnoId, ...TurnoId[]]

/**
 * La hora (0 a 23) de un instante en una zona horaria. Con `Intl` y no con
 * `getHours()`: el servidor corre en UTC, y las 13:00 de Santiago son las
 * 16:00 o 17:00 UTC según la época del año. Calcularlo en el servidor sin la
 * zona de quien mira pondría el cobro en el turno equivocado.
 */
export function horaEn(instante: Date, zona: string): number {
  const partes = formateadorDeHora(zona).formatToParts(instante)
  // `% 24` por si algún motor escribe la medianoche como "24".
  return Number(partes.find((parte) => parte.type === "hour")?.value) % 24
}

/**
 * Un formateador por zona, reusado: un reporte calcula el turno de miles de
 * cobros, y crear un `Intl.DateTimeFormat` por cada uno es lo más caro de
 * todo el cálculo. La clave va en minúsculas porque `Intl` no distingue
 * mayúsculas en el nombre de la zona: así el caché tiene a lo sumo una
 * entrada por zona que existe (unos cientos), por más variantes que alguien
 * mande. Una zona inválida lanza antes de guardarse.
 */
const formateadoresPorZona = new Map<string, Intl.DateTimeFormat>()

function formateadorDeHora(zona: string): Intl.DateTimeFormat {
  const clave = zona.toLowerCase()
  let formateador = formateadoresPorZona.get(clave)
  if (!formateador) {
    formateador = new Intl.DateTimeFormat("en-US", { timeZone: zona, hour: "numeric", hourCycle: "h23" })
    formateadoresPorZona.set(clave, formateador)
  }
  return formateador
}

export function turnoDe(instante: Date, zona: string): TurnoId {
  const hora = horaEn(instante, zona)
  return TURNOS.find((turno) => hora >= turno.desde && hora < turno.hasta)?.id ?? "noche"
}

/**
 * Forma de un nombre IANA (`America/Santiago`, `Etc/GMT+3`, `UTC`). `Intl`
 * también acepta desplazamientos como `-03:00`, que no son una zona: no saben
 * de horario de verano y partirían un período en dos husos distintos.
 */
const FORMA_DE_ZONA_IANA = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/

/** Ningún nombre IANA se acerca a este largo; corta antes de llamar a `Intl`. */
const LARGO_MAXIMO_DE_ZONA = 64

/** Si es una zona IANA que el servidor conoce. Nunca lanza. */
export function esZonaHorariaValida(zona: string): boolean {
  if (zona.length > LARGO_MAXIMO_DE_ZONA || !FORMA_DE_ZONA_IANA.test(zona)) return false
  try {
    return !!new Intl.DateTimeFormat("en-US", { timeZone: zona }).resolvedOptions().timeZone
  } catch {
    return false
  }
}

// ─── Meses en una zona ───────────────────────────────────────────────────────

/** Fecha y hora de pared de un instante en una zona, como números (mes de 1 a 12). */
interface FechaDePared {
  año: number
  mes: number
  dia: number
  hora: number
  minuto: number
  segundo: number
}

/** Como `formateadoresPorZona`, uno por zona y reusado. */
const formateadoresDeFecha = new Map<string, Intl.DateTimeFormat>()

function fechaDeParedEn(instante: number, zona: string): FechaDePared {
  const clave = zona.toLowerCase()
  let formateador = formateadoresDeFecha.get(clave)
  if (!formateador) {
    formateador = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
    formateadoresDeFecha.set(clave, formateador)
  }
  const partes = formateador.formatToParts(new Date(instante))
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value)
  return {
    año: parte("year"),
    mes: parte("month"),
    dia: parte("day"),
    // `% 24` por la misma razón que en `horaEn`.
    hora: parte("hour") % 24,
    minuto: parte("minute"),
    segundo: parte("second"),
  }
}

/** Cuánto le suma la zona a UTC en ese instante, en milisegundos (Santiago en octubre: -3 h). */
function desfaseEn(instante: number, zona: string): number {
  const pared = fechaDeParedEn(instante, zona)
  const comoSiFueraUtc = Date.UTC(pared.año, pared.mes - 1, pared.dia, pared.hora, pared.minuto, pared.segundo)
  // El formateador no da milisegundos: se compara contra el segundo entero.
  return comoSiFueraUtc - Math.floor(instante / 1000) * 1000
}

const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * El primer instante de un día en una zona. Casi siempre son sus 00:00. Si
 * ese día empieza con un cambio de hora y las 00:00 no existen (Asunción, el
 * 1 de octubre de 2023, pasó de las 23:59:59 a la 01:00), es el instante del
 * salto. `mes` va de 1 a 12 y puede salirse del rango (0 es diciembre del año
 * anterior), como en `Date.UTC`.
 *
 * Prueba con el desfase de la víspera, el del día y el del día siguiente, que
 * cubren cualquier cambio de hora de ese día, y se queda con el más temprano
 * de los instantes que ya caen en ese día.
 */
export function inicioDelDiaEn(año: number, mes: number, dia: number, zona: string): Date {
  const pared = Date.UTC(año, mes - 1, dia)
  const buscado = new Date(pared)
  const candidatos = [pared - MS_POR_DIA, pared, pared + MS_POR_DIA].map((cerca) => pared - desfaseEn(cerca, zona))
  const delDia = candidatos.filter((instante) => {
    const fecha = fechaDeParedEn(instante, zona)
    return (
      fecha.año === buscado.getUTCFullYear() &&
      fecha.mes === buscado.getUTCMonth() + 1 &&
      fecha.dia === buscado.getUTCDate()
    )
  })
  return new Date(Math.min(...(delDia.length > 0 ? delDia : candidatos)))
}

/**
 * Dónde empiezan, en la zona de quien mira, el mes de `ahora` y el anterior.
 * El mes pasado es [inicioMesAnterior, inicioMes). Con la hora del servidor
 * (UTC), un cobro del 30 de septiembre a las 22:30 en Santiago ya es 1 de
 * octubre, y el inicio y los reportes, que cuentan en la zona del
 * dispositivo, no coincidirían en el borde del mes.
 */
export function iniciosDeMesEn(ahora: Date, zona: string): { inicioMes: Date; inicioMesAnterior: Date } {
  const { año, mes } = fechaDeParedEn(ahora.getTime(), zona)
  return {
    inicioMes: inicioDelDiaEn(año, mes, 1, zona),
    inicioMesAnterior: inicioDelDiaEn(año, mes - 1, 1, zona),
  }
}

// ─── Lo que el reporte lee de una atención ───────────────────────────────────

export interface LineaParaReporte {
  serviceId: string | null
  serviceName: string
  memberId: string | null
  byOwner: boolean
  professionalName: string
  priceCents: number
}

export interface PagoParaReporte {
  method: string
  amountCents: number
}

/**
 * Una atención finalizada tal como entra al reporte, con el dinero en
 * centavos como se guarda. Para el profesional el endpoint arma una versión
 * reducida: sólo sus líneas, `totalCents` es lo que sumó él y `pagos` va
 * vacío. Así su resumen sale de estas mismas funciones y nunca de datos que
 * no puede ver.
 */
export interface AtencionParaReporte {
  paidAt: Date
  totalCents: number
  lineas: readonly LineaParaReporte[]
  pagos: readonly PagoParaReporte[]
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

/** Los que se miran sobre cada línea: quién la hizo y qué servicio fue. */
export interface FiltrosDeLinea {
  /** Id de miembro o `duenio`. */
  profesional?: string
  servicio?: string
}

export interface FiltrosDeReporte extends FiltrosDeLinea {
  zona: string
  turno?: TurnoId
  medio?: string
}

export function hayFiltrosDeLinea(filtros: FiltrosDeLinea): boolean {
  return !!(filtros.profesional || filtros.servicio)
}

/**
 * Si la línea cumple todos los filtros de línea a la vez: "Color hecho por
 * Juan" es una línea de Color hecha por Juan, no una atención donde Juan hizo
 * un corte y otra persona el color. Sin filtros de línea, toda línea cumple.
 */
export function lineaCumpleFiltros(
  linea: Pick<LineaParaReporte, "serviceId" | "memberId" | "byOwner">,
  filtros: FiltrosDeLinea
): boolean {
  return (
    (!filtros.profesional || idDeProfesional(linea) === filtros.profesional) &&
    (!filtros.servicio || linea.serviceId === filtros.servicio)
  )
}

/**
 * Si la atención entra al reporte: cobrada en el turno pedido, con al menos un
 * pago del medio pedido y con al menos una línea que cumpla los filtros de
 * línea. Qué cifras aporta una vez adentro lo decide `resumirAtenciones`.
 */
export function cumpleFiltros(atencion: AtencionParaReporte, filtros: FiltrosDeReporte): boolean {
  const { turno, medio, zona } = filtros

  if (turno && turnoDe(atencion.paidAt, zona) !== turno) return false
  if (medio && !atencion.pagos.some((pago) => pago.method === medio)) return false
  if (hayFiltrosDeLinea(filtros) && !atencion.lineas.some((linea) => lineaCumpleFiltros(linea, filtros))) return false

  return true
}

// ─── Resumen ─────────────────────────────────────────────────────────────────

export interface ResumenPorMedio {
  medio: string
  nombre: string
  monto: number
}

export interface ResumenPorProfesional {
  /** Única dentro del resumen: sirve de `key` aunque dos grupos compartan `id`. */
  clave: string
  /** Lo que se manda como filtro `profesional`; `null` para un ex-miembro. */
  id: string | null
  nombre: string
  monto: number
  servicios: number
}

export interface ResumenPorServicio {
  clave: string
  /** `null` si el servicio ya no está en el catálogo. */
  id: string | null
  nombre: string
  cantidad: number
  monto: number
}

/**
 * Un desglose en `null` no es un desglose vacío: es uno que con esos filtros
 * no se puede calcular sin inventar (ver `resumirAtenciones`). La pantalla
 * dice que no aplica, en vez de mostrar ceros que se leerían como un dato.
 */
export interface ResumenDeReporte {
  ingresos: number
  cantidad: number
  /** `null` sin atenciones: un promedio de cero se leería como un dato. */
  ticketPromedio: number | null
  porMedio: ResumenPorMedio[] | null
  porProfesional: ResumenPorProfesional[] | null
  porServicio: ResumenPorServicio[] | null
}

/**
 * A quién se le atribuye una línea en el desglose. Los miembros se agrupan por
 * su id; el dueño y los ex-miembros, por el nombre que quedó copiado en la
 * línea, porque es lo único que los identifica. Llevan prefijos distintos para
 * que un ex-miembro que se llame igual que el dueño no se sume con él.
 */
function grupoDeProfesional(linea: LineaParaReporte): { clave: string; id: string | null } {
  if (linea.memberId) return { clave: `miembro:${linea.memberId}`, id: linea.memberId }
  if (linea.byOwner) return { clave: `duenio:${linea.professionalName}`, id: PROFESIONAL_DUEÑO }
  return { clave: `ex-miembro:${linea.professionalName}`, id: null }
}

function grupoDeServicio(linea: LineaParaReporte): { clave: string; id: string | null } {
  if (linea.serviceId) return { clave: `servicio:${linea.serviceId}`, id: linea.serviceId }
  return { clave: `sin-catalogo:${linea.serviceName}`, id: null }
}

interface Acumulado {
  clave: string
  id: string | null
  nombre: string
  centavos: number
  cantidad: number
}

/** Suma por grupo en centavos. El primer nombre que aparece es el que se muestra. */
function acumular(grupos: Map<string, Acumulado>, clave: string, id: string | null, nombre: string, centavos: number) {
  const grupo = grupos.get(clave) ?? { clave, id, nombre, centavos: 0, cantidad: 0 }
  grupo.centavos += centavos
  grupo.cantidad += 1
  grupos.set(clave, grupo)
}

/** De mayor a menor monto; a igual monto, por nombre para que el orden sea estable. */
function ordenados(grupos: Map<string, Acumulado>): Acumulado[] {
  return [...grupos.values()].sort((a, b) => b.centavos - a.centavos || a.nombre.localeCompare(b.nombre, "es"))
}

function desglosePorMedio(pagos: readonly PagoParaReporte[]): ResumenPorMedio[] {
  const grupos = new Map<string, Acumulado>()
  for (const pago of pagos) acumular(grupos, pago.method, pago.method, nombreDeMedio(pago.method), pago.amountCents)
  return ordenados(grupos).map(({ clave, nombre, centavos }) => ({ medio: clave, nombre, monto: deCentavos(centavos) }))
}

function desglosePorProfesional(lineas: readonly LineaParaReporte[]): ResumenPorProfesional[] {
  const grupos = new Map<string, Acumulado>()
  for (const linea of lineas) {
    const { clave, id } = grupoDeProfesional(linea)
    acumular(grupos, clave, id, linea.professionalName, linea.priceCents)
  }
  return ordenados(grupos).map(({ clave, id, nombre, centavos, cantidad }) => ({
    clave,
    id,
    nombre,
    monto: deCentavos(centavos),
    servicios: cantidad,
  }))
}

function desglosePorServicio(lineas: readonly LineaParaReporte[]): ResumenPorServicio[] {
  const grupos = new Map<string, Acumulado>()
  for (const linea of lineas) {
    const { clave, id } = grupoDeServicio(linea)
    acumular(grupos, clave, id, linea.serviceName, linea.priceCents)
  }
  return ordenados(grupos).map(({ clave, id, nombre, centavos, cantidad }) => ({
    clave,
    id,
    nombre,
    cantidad,
    monto: deCentavos(centavos),
  }))
}

function cifras(ingresosCentavos: number, cantidad: number) {
  return {
    ingresos: deCentavos(ingresosCentavos),
    cantidad,
    ticketPromedio: cantidad === 0 ? null : deCentavos(Math.round(ingresosCentavos / cantidad)),
  }
}

const sumar = (centavos: readonly number[]) => centavos.reduce((suma, monto) => suma + monto, 0)

/**
 * El resumen de un período: ingresos, cantidad de atenciones, ticket promedio
 * y los desgloses por medio de pago, por profesional y por servicio. Todo se
 * suma en centavos.
 *
 * Qué se suma depende de los filtros, porque un filtro de línea y uno de medio
 * miran cosas que no se pueden cruzar: un pago es de la atención entera, no de
 * una línea. Sumar la atención completa cuando se filtra por algo de adentro
 * mostraba, con "Medio = Efectivo", también lo cobrado con tarjeta, y con
 * "Profesional = Carla", lo que hicieron los demás.
 *
 * - Sin filtros de línea ni de medio (sólo período o turno): ingresos es la
 *   suma de los totales; por medio, la suma de los pagos; por profesional y
 *   por servicio, la suma de las líneas.
 * - Con `profesional` y/o `servicio` (filtros de línea): cuentan sólo las
 *   líneas que cumplen todos los filtros de línea (`lineaCumpleFiltros`).
 *   Ingresos es la suma de esas líneas; cantidad, las atenciones con al menos
 *   una; el ticket, ingresos sobre cantidad; por profesional y por servicio,
 *   sólo esas líneas. Por medio es `null`: un pago no se puede atribuir a
 *   una línea.
 * - Con `medio` y sin filtros de línea: cuentan las atenciones con al menos
 *   un pago de ese medio, y de cada una sólo lo pagado con él. Ingresos es la
 *   suma de esos pagos; por medio, sólo ese medio. Por profesional y por
 *   servicio son `null`: lo pagado con un medio no se puede repartir entre
 *   las líneas.
 * - Con `medio` y filtros de línea: el medio sólo decide qué atenciones
 *   entran (las que tienen un pago con él, que ya filtró `cumpleFiltros`);
 *   las cifras salen de las líneas, como con filtros de línea, y por medio
 *   es `null`.
 *
 * El turno y el período deciden qué atenciones entran; no cambian qué se suma.
 */
export function resumirAtenciones(
  atenciones: readonly AtencionParaReporte[],
  filtros: FiltrosDeLinea & { medio?: string } = {}
): ResumenDeReporte {
  if (hayFiltrosDeLinea(filtros)) {
    const lineasPorAtencion = atenciones.map((atencion) =>
      atencion.lineas.filter((linea) => lineaCumpleFiltros(linea, filtros))
    )
    const incluidas = lineasPorAtencion.flat()
    return {
      ...cifras(
        sumar(incluidas.map((linea) => linea.priceCents)),
        lineasPorAtencion.filter((lineas) => lineas.length > 0).length
      ),
      porMedio: null,
      porProfesional: desglosePorProfesional(incluidas),
      porServicio: desglosePorServicio(incluidas),
    }
  }

  const { medio } = filtros
  if (medio) {
    const pagosPorAtencion = atenciones.map((atencion) => atencion.pagos.filter((pago) => pago.method === medio))
    const delMedio = pagosPorAtencion.flat()
    return {
      ...cifras(
        sumar(delMedio.map((pago) => pago.amountCents)),
        pagosPorAtencion.filter((pagos) => pagos.length > 0).length
      ),
      porMedio: desglosePorMedio(delMedio),
      porProfesional: null,
      porServicio: null,
    }
  }

  const lineas = atenciones.flatMap((atencion) => atencion.lineas)
  return {
    ...cifras(sumar(atenciones.map((atencion) => atencion.totalCents)), atenciones.length),
    porMedio: desglosePorMedio(atenciones.flatMap((atencion) => atencion.pagos)),
    porProfesional: desglosePorProfesional(lineas),
    porServicio: desglosePorServicio(lineas),
  }
}

// ─── Cómo se titula ──────────────────────────────────────────────────────────

/** "en efectivo", "con tarjeta de débito": el medio dicho dentro de una frase. */
function conElMedio(medio: string): string {
  if (medio === "efectivo") return "en efectivo"
  return `con ${nombreDeMedio(medio).toLocaleLowerCase("es")}`
}

/** Lo elegido en los filtros, con nombre: vacío es "sin filtro". */
export interface FiltrosConNombre {
  /** El nombre del profesional elegido. */
  profesional: string
  /** El nombre del servicio elegido. */
  servicio: string
  /** El id del medio elegido. */
  medio: string
}

/**
 * Cómo se titula la cifra principal del resumen, para que diga qué se sumó
 * (`resumirAtenciones`): con filtro de profesional o de servicio son sólo las
 * líneas que lo cumplen; con filtro de medio, sólo lo pagado con ese medio.
 * Un "Ingresos" a secas sobre esas cifras se leía como lo facturado en total.
 *
 * - Sin filtros: "Ingresos" (al profesional, "Lo que atendiste").
 * - Profesional o servicio: "Ingresos · servicios de Carla", "Ingresos ·
 *   Color", "Ingresos · Color de Carla".
 * - Sólo medio: "Cobrado en efectivo", "Cobrado con transferencia".
 * - Medio y profesional o servicio: el medio sólo decide qué atenciones
 *   entran, así que se suma como el anterior y se aclara cuáles:
 *   "Ingresos · servicios de Carla · atenciones pagadas en efectivo".
 *
 * Al profesional no le llegan los filtros de profesional ni de medio: su
 * reporte ya es sólo lo suyo y no ve medios de pago.
 */
export function rotuloDeIngresos(propio: boolean, filtros: FiltrosConNombre): string {
  const { profesional, servicio, medio } = filtros
  if (propio) return servicio ? `Lo que atendiste · ${servicio}` : "Lo que atendiste"

  const lineas =
    profesional && servicio
      ? `${servicio} de ${profesional}`
      : profesional
        ? `servicios de ${profesional}`
        : servicio
  if (!lineas) return medio ? `Cobrado ${conElMedio(medio)}` : "Ingresos"
  return medio ? `Ingresos · ${lineas} · atenciones pagadas ${conElMedio(medio)}` : `Ingresos · ${lineas}`
}
