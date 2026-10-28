import { diasEntre, fechaYMinutosEn } from "@/lib/zona-horaria"

/**
 * Cada cuánto vuelve un cliente, si ya le toca volver (#75, "Te toca tu
 * corte") y si se está yendo (#76). Puro: sin base ni sesión. Lo usan el cron
 * de "te toca" (`lib/te-toca.ts`) y la lista "Se están yendo"
 * (`/api/clientes/se-van`), así los dos cuentan igual.
 *
 * Todo va en días calendario del negocio (`diasEntre` sobre "AAAA-MM-DD" de
 * su zona), nunca en milisegundos: una visita a las 23:30 y otra a las 00:30
 * del día siguiente están a un día, y el cambio de horario no corre nada.
 *
 * Decisiones del dueño (a):
 * - El ciclo propio es la mediana de días entre visitas, con al menos 3.
 * - Si no hay ciclo propio, la frecuencia que la dueña puso en el servicio
 *   de la última visita (`Service.frecuenciaDias`). Si tampoco, sin ciclo:
 *   no se le escribe ni aparece en la lista.
 * - "Se va" es una ausencia de al menos 1,5 veces el ciclo, fijo.
 */

/** Visitas (días distintos) que hacen falta para usar la mediana del propio cliente. */
export const MINIMO_DE_VISITAS_PARA_MEDIANA = 3

/** Ausencia, en ciclos, a partir de la cual un cliente "se está yendo". */
export const FACTOR_SE_VA = 1.5

/**
 * Cuánta historia se mira hacia atrás, en días. Acota lo que se lee de la
 * base y deja afuera a quien no viene hace más de dos años: no es alguien que
 * "se está yendo", ya se fue. Con el ciclo más largo que acepta un servicio
 * (365 días) un cliente se va a los 548: entra en la ventana.
 */
export const DIAS_DE_HISTORIAL = 730

/**
 * Días que un cliente que se va queda fuera de la lista después de
 * "Escribirle", contando el día del contacto: la lista es de pendientes, no de
 * a quién ya se le habló. No lo decidió el dueño: es una propuesta.
 */
export const DIAS_OCULTO_TRAS_CONTACTO = 14

export type OrigenDelCiclo = "propio" | "servicio"

export interface Ciclo {
  dias: number
  origen: OrigenDelCiclo
}

/** El día calendario de una visita en la zona del negocio. */
export function fechaDeVisita(llegada: Date, zona: string): string {
  return fechaYMinutosEn(llegada, zona).fecha
}

/**
 * La mediana de días entre visitas consecutivas, o null si hay menos de
 * `MINIMO_DE_VISITAS_PARA_MEDIANA` días distintos. Dos visitas el mismo día
 * cuentan como una: un intervalo de 0 días no es un ciclo. Con un número par
 * de intervalos, el promedio de los dos del medio, redondeado.
 */
export function medianaDeDias(fechas: readonly string[]): number | null {
  const dias = [...new Set(fechas)].sort()
  if (dias.length < MINIMO_DE_VISITAS_PARA_MEDIANA) return null
  const intervalos = dias.slice(1).map((dia, i) => diasEntre(dias[i], dia)).sort((a, b) => a - b)
  const medio = Math.floor(intervalos.length / 2)
  return intervalos.length % 2 === 1 ? intervalos[medio] : Math.round((intervalos[medio - 1] + intervalos[medio]) / 2)
}

/** Si la frecuencia de un servicio es usable: un entero de 1 o más (la base exige 7 a 365). */
const esFrecuenciaValida = (dias: number | null | undefined): dias is number =>
  typeof dias === "number" && Number.isInteger(dias) && dias > 0

/**
 * El ciclo del cliente: el propio si alcanza, si no el del servicio de su
 * última visita, si no null. `frecuenciasDelUltimoServicio` son las de cada
 * servicio de la última visita; si hay más de una, la más corta (lo primero
 * que le toca repetir).
 */
export function cicloDelCliente(
  fechas: readonly string[],
  frecuenciasDelUltimoServicio: readonly (number | null | undefined)[] = []
): Ciclo | null {
  const propio = medianaDeDias(fechas)
  if (propio !== null) return { dias: propio, origen: "propio" }
  const validas = frecuenciasDelUltimoServicio.filter(esFrecuenciaValida)
  if (validas.length === 0) return null
  return { dias: Math.min(...validas), origen: "servicio" }
}

/** Días calendario desde la última visita hasta hoy (los dos en la zona del negocio). */
export const diasSinVenir = (ultimaVisita: string, hoy: string): number => diasEntre(ultimaVisita, hoy)

/** "Te toca": hoy ya es, o pasó, la última visita más un ciclo. */
export function estaVencido(ultimaVisita: string, ciclo: number, hoy: string): boolean {
  return diasSinVenir(ultimaVisita, hoy) >= ciclo
}

/** "Se está yendo": no viene hace al menos 1,5 ciclos. */
export function seEstaYendo(ultimaVisita: string, ciclo: number, hoy: string): boolean {
  return diasSinVenir(ultimaVisita, hoy) >= FACTOR_SE_VA * ciclo
}

// ─── Resumir las visitas leídas de la base ──────────────────────────────────

/** Una visita finalizada, como la leen el cron y la lista. */
export interface VisitaParaFrecuencia {
  customerId: string
  arrivedAt: Date
  /** Los servicios que se hizo (sin productos), con su id para buscar la frecuencia. */
  servicios: readonly { serviceId: string | null; nombre: string }[]
}

export interface FrecuenciaDelCliente {
  customerId: string
  /** "AAAA-MM-DD" de la última visita, en la zona del negocio. */
  ultimaVisita: string
  /** El primer servicio de la última visita, para mostrar y para el correo. */
  ultimoServicio: string | null
  ciclo: Ciclo | null
}

/**
 * Agrupa las visitas por cliente y calcula última visita, último servicio y
 * ciclo. `frecuencias` mapea serviceId → `frecuenciaDias` y tiene que traer
 * sólo servicios del negocio: quien llama los lee con su `businessId`.
 */
export function frecuenciasPorCliente(
  visitas: readonly VisitaParaFrecuencia[],
  zona: string,
  frecuencias: ReadonlyMap<string, number | null>
): Map<string, FrecuenciaDelCliente> {
  const porCliente = new Map<string, VisitaParaFrecuencia[]>()
  for (const visita of visitas) {
    const lista = porCliente.get(visita.customerId)
    if (lista) lista.push(visita)
    else porCliente.set(visita.customerId, [visita])
  }

  const resultado = new Map<string, FrecuenciaDelCliente>()
  for (const [customerId, suyas] of porCliente) {
    const ultima = suyas.reduce((a, b) => (b.arrivedAt.getTime() > a.arrivedAt.getTime() ? b : a))
    const fechas = suyas.map((visita) => fechaDeVisita(visita.arrivedAt, zona))
    const frecuenciasDeLaUltima = ultima.servicios.map((s) => (s.serviceId ? frecuencias.get(s.serviceId) : null))
    resultado.set(customerId, {
      customerId,
      ultimaVisita: fechaDeVisita(ultima.arrivedAt, zona),
      ultimoServicio: ultima.servicios[0]?.nombre ?? null,
      ciclo: cicloDelCliente(fechas, frecuenciasDeLaUltima),
    })
  }
  return resultado
}
