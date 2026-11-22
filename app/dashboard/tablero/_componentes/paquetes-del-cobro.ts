/**
 * Los paquetes de sesiones en el cobro del Tablero, sin React: qué líneas se
 * pueden pagar con una sesión, cuáles se marcan solas al abrir, qué se le
 * manda al servidor y cuánto queda por pagar. Las reglas son las de
 * `lib/paquetes.ts`, y el servidor las vuelve a aplicar todas
 * (`aplicarPaquetesEnElCobro`): esto es para que la pantalla muestre, antes
 * de cobrar, el mismo número que el servidor va a exigir.
 */

import { aCentavos } from "@/lib/atenciones"
import { MAXIMO_DE_PAQUETES_POR_COBRO, MEDIO_PAQUETE } from "@/lib/paquetes"

/** Un paquete que el negocio ofrece, como lo manda `GET /api/atenciones/[id]/paquetes`. Montos en pesos. */
export interface PaqueteOfrecido {
  id: string
  servicioId: string
  servicio: string
  sesiones: number
  precio: number
  valorPorSesion: number
  vigenciaMeses: number | null
}

/** Un paquete que la clienta ya compró y todavía puede usar. */
export interface PaqueteDeLaClienta {
  id: string
  servicioId: string
  servicio: string
  sesiones: number
  restantes: number
  valorPorSesion: number
  /** Instante ISO, o `null` si no vence. */
  venceEl: string | null
}

export interface PaquetesParaCobrar {
  /** La atención es de una clienta de la lista: sin eso no se vende ni se usa un paquete. */
  tieneClienta: boolean
  ofrecidos: PaqueteOfrecido[]
  deLaClienta: PaqueteDeLaClienta[]
}

export const SIN_PAQUETES_PARA_COBRAR: PaquetesParaCobrar = { tieneClienta: false, ofrecidos: [], deLaClienta: [] }

/** Lo de una línea de la atención que importa acá. */
export interface LineaParaPaquetes {
  id: string
  tipo?: "servicio" | "producto"
  servicioId: string | null
  precio: number
  abono?: unknown
  conPaquete?: boolean
  ventaDePaquete?: boolean
}

/** Qué paquete ya comprado paga cada línea: `{ [lineaId]: paqueteDeClienteId }`. */
export type UsosElegidos = Readonly<Record<string, string>>

/** Un paquete que se vende en este cobro. `usarHoy`: la primera sesión se usa en esta misma atención, si hay en qué. */
export interface VentaElegida {
  clave: string
  paqueteId: string
  usarHoy: boolean
}

/** Lo que viaja en `paquetes` al cobrar (`PaquetesDelCobro` del servidor). */
export interface PaquetesPedidos {
  ventas: { paqueteId: string }[]
  usos: ({ lineaId: string; paqueteDeClienteId: string } | { lineaId: string; venta: number })[]
}

/** El servidor acepta el doble de usos que de ventas (`errorDePaquetesPedidos`). */
const MAXIMO_DE_USOS = MAXIMO_DE_PAQUETES_POR_COBRO * 2

/**
 * Con un paquete se paga un servicio del catálogo: no un producto, ni un
 * abono de prótesis, ni un servicio que se borró (sin `servicioId` no se sabe
 * de qué paquete sería).
 */
export function sePuedeCubrir(linea: LineaParaPaquetes): boolean {
  return linea.tipo !== "producto" && linea.servicioId !== null && !linea.abono && !linea.conPaquete && !linea.ventaDePaquete
}

/** Primero el que vence antes (el que no vence, al final); entre iguales, el más antiguo: llegan del más nuevo al más viejo. */
function enOrdenDeUso(paquetes: readonly PaqueteDeLaClienta[]): PaqueteDeLaClienta[] {
  const cuando = (paquete: PaqueteDeLaClienta) => (paquete.venceEl ? new Date(paquete.venceEl).getTime() : Number.POSITIVE_INFINITY)
  return [...paquetes].reverse().sort((a, b) => cuando(a) - cuando(b))
}

function sesionesTomadas(usos: UsosElegidos, paqueteId: string, salvoLinea?: string): number {
  return Object.entries(usos).filter(([lineaId, id]) => id === paqueteId && lineaId !== salvoLinea).length
}

/**
 * El paquete de la clienta con que se pagaría esta línea si se marca: del
 * mismo servicio y con una sesión que no esté ya puesta en otra línea de este
 * cobro. `null`: no tiene, o ya las repartió todas.
 */
export function paqueteLibrePara(
  linea: LineaParaPaquetes,
  usos: UsosElegidos,
  deLaClienta: readonly PaqueteDeLaClienta[]
): PaqueteDeLaClienta | null {
  if (!sePuedeCubrir(linea)) return null
  return (
    enOrdenDeUso(deLaClienta).find(
      (paquete) => paquete.servicioId === linea.servicioId && paquete.restantes - sesionesTomadas(usos, paquete.id, linea.id) > 0
    ) ?? null
  )
}

/**
 * Lo que queda marcado al abrir el cobro: cada servicio para el que la
 * clienta tiene un paquete usa una sesión, que es lo que casi siempre se
 * quiere. Si hay más líneas del mismo servicio que sesiones, se marcan las
 * primeras, hasta donde alcanzan.
 */
export function usosPorDefecto(lineas: readonly LineaParaPaquetes[], deLaClienta: readonly PaqueteDeLaClienta[]): UsosElegidos {
  const usos: Record<string, string> = {}
  for (const linea of lineas) {
    if (Object.keys(usos).length >= MAXIMO_DE_USOS) break
    const paquete = paqueteLibrePara(linea, usos, deLaClienta)
    if (paquete) usos[linea.id] = paquete.id
  }
  return usos
}

/** De dónde sale la sesión que paga una línea: de un paquete ya comprado o de uno que se vende en este cobro. */
export type Cobertura = { origen: "comprado"; paquete: PaqueteDeLaClienta } | { origen: "venta"; clave: string }

export interface VentaResuelta {
  clave: string
  paquete: PaqueteOfrecido
  usarHoy: boolean
  /** La línea donde se usaría la primera sesión hoy; `null` si no hay ninguna del mismo servicio sin cubrir. */
  lineaDeHoy: string | null
}

export interface PaquetesResueltos {
  /** Por línea cubierta, de dónde sale su sesión. */
  cubiertas: ReadonlyMap<string, Cobertura>
  ventas: VentaResuelta[]
  /** Lo que hay que pagar con los medios normales: las líneas sin cubrir más los paquetes que se venden. */
  aPagarCentavos: number
  pedido: PaquetesPedidos
}

/**
 * Lo elegido en pantalla contra lo que hay ahora: descarta lo que ya no
 * corresponde (una línea que se quitó, un paquete que no está, más sesiones de
 * las que quedan) y arma el pedido y el total a pagar.
 *
 * Para el servidor una línea cubierta pasa a valer lo que vale la sesión y
 * queda pagada con el paquete, así que los pagos tienen que sumar las líneas
 * sin cubrir más las ventas: eso es `aPagarCentavos`.
 */
export function resolverPaquetes(
  lineas: readonly LineaParaPaquetes[],
  totalCentavos: number,
  paquetes: PaquetesParaCobrar,
  usos: UsosElegidos,
  ventas: readonly VentaElegida[]
): PaquetesResueltos {
  const cubiertas = new Map<string, Cobertura>()
  const pedido: PaquetesPedidos = { ventas: [], usos: [] }
  if (!paquetes.tieneClienta) return { cubiertas, ventas: [], aPagarCentavos: totalCentavos, pedido }

  // 1. Las sesiones de paquetes ya comprados, mientras alcancen.
  const tomadas = new Map<string, number>()
  for (const linea of lineas) {
    const paquete = paquetes.deLaClienta.find((candidato) => candidato.id === usos[linea.id])
    if (!paquete || !sePuedeCubrir(linea) || paquete.servicioId !== linea.servicioId) continue
    const yaTomadas = tomadas.get(paquete.id) ?? 0
    if (yaTomadas >= paquete.restantes || pedido.usos.length >= MAXIMO_DE_USOS) continue
    tomadas.set(paquete.id, yaTomadas + 1)
    cubiertas.set(linea.id, { origen: "comprado", paquete })
    pedido.usos.push({ lineaId: linea.id, paqueteDeClienteId: paquete.id })
  }

  // 2. Los que se venden ahora, cada uno con la primera línea de su servicio que siga sin cubrir.
  const resueltas: VentaResuelta[] = []
  for (const venta of ventas) {
    const paquete = paquetes.ofrecidos.find((candidato) => candidato.id === venta.paqueteId)
    if (!paquete || pedido.ventas.length >= MAXIMO_DE_PAQUETES_POR_COBRO) continue
    const lineaDeHoy =
      lineas.find((linea) => sePuedeCubrir(linea) && linea.servicioId === paquete.servicioId && !cubiertas.has(linea.id))?.id ?? null
    const indice = pedido.ventas.push({ paqueteId: paquete.id }) - 1
    if (venta.usarHoy && lineaDeHoy !== null && pedido.usos.length < MAXIMO_DE_USOS) {
      cubiertas.set(lineaDeHoy, { origen: "venta", clave: venta.clave })
      pedido.usos.push({ lineaId: lineaDeHoy, venta: indice })
    }
    resueltas.push({ clave: venta.clave, paquete, usarHoy: venta.usarHoy, lineaDeHoy })
  }

  const cubiertoCentavos = lineas.reduce((suma, linea) => (cubiertas.has(linea.id) ? suma + aCentavos(linea.precio) : suma), 0)
  const vendidoCentavos = resueltas.reduce((suma, venta) => suma + aCentavos(venta.paquete.precio), 0)
  return { cubiertas, ventas: resueltas, aPagarCentavos: totalCentavos - cubiertoCentavos + vendidoCentavos, pedido }
}

// ─── Ya cobrada ──────────────────────────────────────────────────────────────

/**
 * Los pagos de una atención cobrada, separados: la plata que entró y lo que
 * cubrió un paquete (el medio interno `paquete`: ya estaba pagado, no entró
 * ese día).
 */
export function separarLoCubiertoPorPaquete<Pago extends { medio: string; monto: number }>(
  pagos: readonly Pago[]
): { recibidos: Pago[]; cubiertoCentavos: number } {
  const recibidos = pagos.filter((pago) => pago.medio !== MEDIO_PAQUETE)
  const cubiertoCentavos = pagos.reduce((suma, pago) => (pago.medio === MEDIO_PAQUETE ? suma + aCentavos(pago.monto) : suma), 0)
  return { recibidos, cubiertoCentavos }
}
