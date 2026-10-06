import { PROFESIONAL_DUEÑO, aCentavos, deCentavos, idDeProfesional } from "@/lib/atenciones"
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

// ─── Lo que el reporte lee de una atención ───────────────────────────────────

export interface LineaParaReporte {
  serviceId: string | null
  serviceName: string
  memberId: string | null
  byOwner: boolean
  professionalName: string
  price: number
}

export interface PagoParaReporte {
  method: string
  amount: number
}

/**
 * Una atención finalizada tal como entra al reporte. Para el profesional el
 * endpoint arma una versión reducida: sólo sus líneas, `total` es lo que sumó
 * él y `pagos` va vacío. Así su resumen sale de esta misma función y nunca de
 * datos que no puede ver.
 */
export interface AtencionParaReporte {
  paidAt: Date
  total: number
  lineas: readonly LineaParaReporte[]
  pagos: readonly PagoParaReporte[]
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

export interface FiltrosDeReporte {
  zona: string
  turno?: TurnoId
  /** Id de miembro o `duenio`. */
  profesional?: string
  servicio?: string
  medio?: string
}

/**
 * Si la atención entra al reporte. Profesional y servicio se miran sobre la
 * misma línea: "Color hecho por Juan" no incluye una atención donde Juan hizo
 * un corte y otra persona el color.
 */
export function cumpleFiltros(atencion: AtencionParaReporte, filtros: FiltrosDeReporte): boolean {
  const { turno, profesional, servicio, medio, zona } = filtros

  if (turno && turnoDe(atencion.paidAt, zona) !== turno) return false
  if (medio && !atencion.pagos.some((pago) => pago.method === medio)) return false

  if (profesional || servicio) {
    const hayLinea = atencion.lineas.some(
      (linea) =>
        (!profesional || idDeProfesional(linea) === profesional) &&
        (!servicio || linea.serviceId === servicio)
    )
    if (!hayLinea) return false
  }

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

export interface ResumenDeReporte {
  ingresos: number
  cantidad: number
  /** `null` sin atenciones: un promedio de cero se leería como un dato. */
  ticketPromedio: number | null
  porMedio: ResumenPorMedio[]
  porProfesional: ResumenPorProfesional[]
  porServicio: ResumenPorServicio[]
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
function acumular(grupos: Map<string, Acumulado>, clave: string, id: string | null, nombre: string, monto: number) {
  const grupo = grupos.get(clave) ?? { clave, id, nombre, centavos: 0, cantidad: 0 }
  grupo.centavos += aCentavos(monto)
  grupo.cantidad += 1
  grupos.set(clave, grupo)
}

/** De mayor a menor monto; a igual monto, por nombre para que el orden sea estable. */
function ordenados(grupos: Map<string, Acumulado>): Acumulado[] {
  return [...grupos.values()].sort((a, b) => b.centavos - a.centavos || a.nombre.localeCompare(b.nombre, "es"))
}

/**
 * El resumen de un período: ingresos (la suma de los totales), cantidad de
 * atenciones, ticket promedio y el desglose por medio de pago, por
 * profesional y por servicio. Todo se suma en centavos.
 */
export function resumirAtenciones(atenciones: readonly AtencionParaReporte[]): ResumenDeReporte {
  const porMedio = new Map<string, Acumulado>()
  const porProfesional = new Map<string, Acumulado>()
  const porServicio = new Map<string, Acumulado>()
  let ingresosCentavos = 0

  for (const atencion of atenciones) {
    ingresosCentavos += aCentavos(atencion.total)

    for (const pago of atencion.pagos) {
      acumular(porMedio, pago.method, pago.method, nombreDeMedio(pago.method), pago.amount)
    }
    for (const linea of atencion.lineas) {
      const profesional = grupoDeProfesional(linea)
      acumular(porProfesional, profesional.clave, profesional.id, linea.professionalName, linea.price)
      const servicio = grupoDeServicio(linea)
      acumular(porServicio, servicio.clave, servicio.id, linea.serviceName, linea.price)
    }
  }

  const cantidad = atenciones.length

  return {
    ingresos: deCentavos(ingresosCentavos),
    cantidad,
    ticketPromedio: cantidad === 0 ? null : deCentavos(Math.round(ingresosCentavos / cantidad)),
    porMedio: ordenados(porMedio).map(({ clave, nombre, centavos }) => ({
      medio: clave,
      nombre,
      monto: deCentavos(centavos),
    })),
    porProfesional: ordenados(porProfesional).map(({ clave, id, nombre, centavos, cantidad }) => ({
      clave,
      id,
      nombre,
      monto: deCentavos(centavos),
      servicios: cantidad,
    })),
    porServicio: ordenados(porServicio).map(({ clave, id, nombre, centavos, cantidad }) => ({
      clave,
      id,
      nombre,
      cantidad,
      monto: deCentavos(centavos),
    })),
  }
}
