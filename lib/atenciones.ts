import { esMedioDePago } from "@/lib/medios-de-pago"

/**
 * Reglas del tablero de atenciones (docs/PRODUCTO.md, sección 7): por qué
 * columnas pasa una atención, qué hace falta para avanzar y cómo se valida un
 * cobro. No toca la base ni la sesión: son reglas que se prueban solas, y
 * equivocarse en una se paga con plata mal cobrada o mal repartida.
 *
 * Quién puede hacer cada cosa no vive acá sino en `lib/permisos.ts`.
 */

// ─── Estados ─────────────────────────────────────────────────────────────────

/** En kebab-case, igual que los estados de la cita. */
export const ESTADOS_DE_ATENCION = [
  { id: "en-espera", nombre: "En espera" },
  { id: "en-atencion", nombre: "En atención" },
  { id: "por-cobrar", nombre: "Por cobrar" },
  { id: "finalizada", nombre: "Finalizada" },
  { id: "anulada", nombre: "Anulada" },
] as const

export type EstadoDeAtencion = (typeof ESTADOS_DE_ATENCION)[number]["id"]

/**
 * Las columnas que todavía se trabajan, en el orden en que se recorren. Una
 * atención activa se puede editar y mover a mano; `finalizada` y `anulada`
 * son finales y no.
 */
export const ESTADOS_ACTIVOS = ["en-espera", "en-atencion", "por-cobrar"] as const

export type EstadoActivo = (typeof ESTADOS_ACTIVOS)[number]

/** Lo que se muestra si en la base aparece un estado que el catálogo no conoce. */
const ESTADO_DESCONOCIDO = "Estado desconocido"

/** Busca con `find` y no en un objeto indexado, como `nombreDeRubro`. */
export function nombreDeEstado(id: string): string {
  return ESTADOS_DE_ATENCION.find((estado) => estado.id === id)?.nombre ?? ESTADO_DESCONOCIDO
}

export function esEstadoActivo(estado: string): estado is EstadoActivo {
  return (ESTADOS_ACTIVOS as readonly string[]).includes(estado)
}

// ─── Transiciones ────────────────────────────────────────────────────────────

/**
 * Si una atención puede pasar de `desde` a `hacia`:
 *
 * - Entre columnas activas se mueve de a un paso, hacia adelante o hacia
 *   atrás: `en-espera ⇄ en-atencion ⇄ por-cobrar`. Saltar una columna dejaría
 *   sin marcar cuándo empezó o terminó la atención.
 * - A `finalizada` sólo se llega cobrando, desde `por-cobrar`.
 * - A `anulada` se llega desde cualquier estado activo y también desde
 *   `finalizada`: es la única forma de corregir un cobro. Que eso último sea
 *   sólo del dueño lo decide `lib/permisos.ts`, no esta función.
 */
export function transicionPermitida(desde: string, hacia: string): boolean {
  if (hacia === "anulada") return esEstadoActivo(desde) || desde === "finalizada"
  if (hacia === "finalizada") return desde === "por-cobrar"
  if (!esEstadoActivo(desde) || !esEstadoActivo(hacia)) return false
  return Math.abs(ESTADOS_ACTIVOS.indexOf(desde) - ESTADOS_ACTIVOS.indexOf(hacia)) === 1
}

/** Cuándo empezó la atención y cuándo quedó lista para cobrar. */
export interface TiemposDeAtencion {
  startedAt?: Date | null
  readyAt?: Date | null
}

/**
 * Qué tiempos marca un movimiento entre columnas activas. Hacia adelante se
 * marca el momento; hacia atrás se borra el del paso que se deshace, para que
 * una atención de vuelta en espera no muestre que ya empezó. Al volver a
 * avanzar se marca de nuevo.
 */
export function tiemposDeTransicion(desde: EstadoActivo, hacia: EstadoActivo, ahora: Date): TiemposDeAtencion {
  if (desde === "en-espera" && hacia === "en-atencion") return { startedAt: ahora }
  if (desde === "en-atencion" && hacia === "por-cobrar") return { readyAt: ahora }
  if (desde === "por-cobrar" && hacia === "en-atencion") return { readyAt: null }
  if (desde === "en-atencion" && hacia === "en-espera") return { startedAt: null }
  return {}
}

// ─── Dinero ──────────────────────────────────────────────────────────────────

/**
 * Tope de cualquier precio o monto. Muy por encima de lo que cuesta un
 * servicio, y muy por debajo de donde los centavos dejan de ser enteros
 * exactos en un `number`.
 */
export const MONTO_MAXIMO = 1_000_000_000

/**
 * Los montos se guardan como `Float`, igual que el resto del esquema, pero
 * toda suma y toda comparación se hace en centavos enteros: `0.1 + 0.2` da
 * `0.30000000000000004`, y un cobro de 0,30 pagado con 0,10 y 0,20 no puede
 * rechazarse por eso.
 */
export function aCentavos(monto: number): number {
  return Math.round(monto * 100)
}

export function deCentavos(centavos: number): number {
  return centavos / 100
}

/**
 * Si el monto se escribe con hasta dos decimales. Un precio de 10,005 no es
 * un monto que se pueda cobrar: redondearlo en silencio cambiaría lo cobrado
 * sin que nadie lo decidiera, así que se rechaza.
 */
export function tieneCentavosExactos(monto: number): boolean {
  return Number.isFinite(monto) && deCentavos(aCentavos(monto)) === monto
}

/** Precio de una línea: cero vale (una cortesía), negativo no. */
export function esPrecioValido(precio: number): boolean {
  return tieneCentavosExactos(precio) && precio >= 0 && precio <= MONTO_MAXIMO
}

/** Monto de un pago: siempre mayor que cero. */
export function esMontoDePagoValido(monto: number): boolean {
  return tieneCentavosExactos(monto) && monto > 0 && monto <= MONTO_MAXIMO
}

/** El total de una atención: la suma de sus líneas, en centavos. */
export function totalEnCentavos(lineas: readonly { price: number }[]): number {
  return lineas.reduce((suma, linea) => suma + aCentavos(linea.price), 0)
}

/** Para los mensajes de error: `$25.000`, `$0,3`. */
function comoMonto(centavos: number): string {
  return `$${deCentavos(centavos).toLocaleString("es-ES", { maximumFractionDigits: 2 })}`
}

// ─── Requisitos para avanzar ─────────────────────────────────────────────────

/** Lo de una línea que hace falta para saber si la atención puede avanzar. */
export interface LineaDeAtencion {
  memberId: string | null
  byOwner: boolean
  price: number
}

/**
 * La línea sabe quién la hizo: un miembro del equipo o el dueño. Una línea sin
 * `memberId` y sin `byOwner` es de alguien que ya no está en el equipo, y
 * antes de cobrar hay que decir a quién le corresponde.
 */
export function tieneProfesional(linea: Pick<LineaDeAtencion, "memberId" | "byOwner">): boolean {
  return linea.byOwner || !!linea.memberId
}

/**
 * Cómo se nombra al dueño donde se espera el id de un profesional: al anotar
 * una línea, en lo que devuelve el tablero y en el filtro de los reportes. El
 * dueño no es `BusinessMember`, así que no tiene id propio; un cuid nunca
 * coincide con este texto.
 */
export const PROFESIONAL_DUEÑO = "duenio"

/** El id de profesional de una línea: el del miembro, `duenio`, o `null` si ya no está en el equipo. */
export function idDeProfesional(linea: Pick<LineaDeAtencion, "memberId" | "byOwner">): string | null {
  if (linea.byOwner) return PROFESIONAL_DUEÑO
  return linea.memberId
}

/**
 * Lo que le falta a una atención para entrar a `destino`, como un mensaje que
 * se le puede mostrar a quien está en el tablero; `null` si no le falta nada.
 *
 * - `en-atencion`: al menos un servicio con su profesional. Una atención sin
 *   nadie que la haga no está "en atención".
 * - `por-cobrar` (y `finalizada`, que es cobrarla): al menos un servicio, y
 *   todos con su profesional y un precio válido. Es lo que se reparte en
 *   comisiones: una línea sin dueño no se le puede pagar a nadie.
 */
export function requisitoFaltante(destino: string, lineas: readonly LineaDeAtencion[]): string | null {
  if (destino === "en-atencion") {
    return lineas.some(tieneProfesional)
      ? null
      : "Para empezar la atención hace falta al menos un servicio con su profesional."
  }

  if (destino === "por-cobrar" || destino === "finalizada") {
    if (lineas.length === 0) return "Para cobrar hace falta al menos un servicio."
    if (!lineas.every(tieneProfesional)) {
      return "Hay servicios sin profesional: indica quién hizo cada uno antes de cobrar."
    }
    if (!lineas.every((linea) => esPrecioValido(linea.price))) {
      return "Hay servicios con un precio inválido: corrígelo antes de cobrar."
    }
  }

  return null
}

// ─── Cobro ───────────────────────────────────────────────────────────────────

export interface PagoPedido {
  medio: string
  monto: number
}

/**
 * Por qué un cobro no se puede registrar, o `null` si está bien. Los medios
 * tienen que ser del catálogo, cada monto mayor que cero, y la suma tiene que
 * dar el total exacto, comparada en centavos.
 *
 * Un total de cero se cobra sin pagos: es una cortesía, y queda registrada
 * como atención finalizada igual.
 */
export function errorDeCobro(totalCentavos: number, pagos: readonly PagoPedido[]): string | null {
  if (pagos.some((pago) => !esMedioDePago(pago.medio))) {
    return "Hay un medio de pago que no existe."
  }
  if (pagos.some((pago) => !esMontoDePagoValido(pago.monto))) {
    return "Cada pago tiene que ser mayor que cero y con hasta dos decimales."
  }

  const sumaCentavos = pagos.reduce((suma, pago) => suma + aCentavos(pago.monto), 0)
  if (sumaCentavos === totalCentavos) return null

  if (pagos.length === 0) {
    return `Falta indicar cómo se pagó: el total es ${comoMonto(totalCentavos)}.`
  }
  return `Los pagos suman ${comoMonto(sumaCentavos)} y el total es ${comoMonto(totalCentavos)}: tienen que coincidir.`
}
