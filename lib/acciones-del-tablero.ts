import {
  ESTADOS_ACTIVOS,
  PROFESIONAL_DUEÑO,
  aCentavos,
  deCentavos,
  errorDeCobro,
  esEstadoActivo,
  esPrecioValido,
  nombreDeEstado,
  requisitoFaltante,
  type EstadoActivo,
  type LineaDeAtencion,
  type PagoPedido,
} from "@/lib/atenciones"
import { leerMonto } from "@/lib/dinero"
import { puedeAnular, puedeCobrar, type Actor } from "@/lib/permisos"

/**
 * El tablero de atenciones (docs/PRODUCTO.md, sección 7) visto desde la
 * pantalla: en qué columna va cada tarjeta, qué botones muestra, adónde se
 * puede arrastrar y qué hay que completar antes de mover o cobrar.
 *
 * Las reglas no se repiten acá: qué transición existe y qué le falta a una
 * atención lo dice `lib/atenciones.ts`; quién puede cobrar o anular,
 * `lib/permisos.ts`. Esto sólo las junta para decidir qué ofrecer, así la
 * pantalla no ofrece un botón que el servidor va a rechazar. El servidor igual
 * vuelve a mirar todo: esto es para no hacer perder tiempo, no una barrera.
 *
 * Puro, sin red ni sesión: se usa desde el navegador y se prueba solo.
 */

// ─── Columnas ────────────────────────────────────────────────────────────────

/**
 * Las columnas, en el orden en que se recorren. Las anuladas no tienen
 * columna: salen del tablero y quedan sólo en el historial.
 */
export const COLUMNAS_DEL_TABLERO = [
  { id: "reservas", titulo: "Reservas de hoy" },
  { id: "en-espera", titulo: "En espera" },
  { id: "en-atencion", titulo: "En atención" },
  { id: "por-cobrar", titulo: "Por cobrar" },
  { id: "finalizada", titulo: "Finalizado" },
] as const

export type ColumnaId = (typeof COLUMNAS_DEL_TABLERO)[number]["id"]

/** Las columnas de atenciones: todas menos la de reservas. */
export type ColumnaDeAtencion = Exclude<ColumnaId, "reservas">

/** Lo que el tablero lee de una atención para ubicarla y ordenarla. */
export interface TiemposEnPantalla {
  estado: string
  llegoEn: string
  empezoEn: string | null
  terminoEn: string | null
  cobradaEn: string | null
}

const instante = (iso: string | null): number => (iso ? new Date(iso).getTime() : 0)

/**
 * Las atenciones de una columna, en el orden en que se atienden: arriba la
 * que más espera desde que entró a esa columna. En "Finalizado", arriba la
 * última cobrada, que es la que alguien quiere confirmar.
 */
export function atencionesDeColumna<T extends TiemposEnPantalla>(
  atenciones: readonly T[],
  columna: ColumnaDeAtencion
): T[] {
  const momento = (atencion: T): number => {
    if (columna === "en-atencion") return instante(atencion.empezoEn ?? atencion.llegoEn)
    if (columna === "por-cobrar") return instante(atencion.terminoEn ?? atencion.empezoEn ?? atencion.llegoEn)
    if (columna === "finalizada") return -instante(atencion.cobradaEn)
    return instante(atencion.llegoEn)
  }
  return atenciones.filter((atencion) => atencion.estado === columna).sort((a, b) => momento(a) - momento(b))
}

/** La reserva ya tendría que haber llegado. `ahora` en milisegundos, el mismo para todo el tablero. */
export function estaAtrasada(inicio: string, ahora: number): boolean {
  return new Date(inicio).getTime() < ahora
}

// ─── Líneas ──────────────────────────────────────────────────────────────────

/** Lo que el tablero necesita de una línea para decidir. */
export interface LineaEnPantalla {
  /** Id de miembro, `duenio`, o `null` si quien la hizo dejó el equipo. */
  profesional: { id: string | null }
  precio: number
}

/** La línea como la entienden las reglas de `lib/atenciones.ts`. */
export function lineaParaReglas(linea: LineaEnPantalla): LineaDeAtencion {
  const id = linea.profesional.id
  if (id === PROFESIONAL_DUEÑO) return { memberId: null, byOwner: true, price: linea.precio }
  return { memberId: id, byOwner: false, price: linea.precio }
}

/** Quien la hizo ya no está en el equipo: hay que decir a quién le corresponde antes de cobrar. */
export function faltaAsignar(linea: LineaEnPantalla): boolean {
  return linea.profesional.id === null
}

/**
 * Lo que le falta a una atención para entrar a `destino`, con el mismo
 * mensaje que daría el servidor; `null` si no le falta nada.
 *
 * Se mira con las líneas que se ven. Dueño y encargado ven todas, así que
 * coincide con el servidor. El profesional ve sólo las suyas: lo que le diga
 * esto es parcial, y el 400 del servidor puede llegar igual.
 */
export function requisitoParaPasarA(lineas: readonly LineaEnPantalla[], destino: string): string | null {
  return requisitoFaltante(destino, lineas.map(lineaParaReglas))
}

// ─── Movimientos ─────────────────────────────────────────────────────────────

/** La columna activa que sigue, o `null` si no hay (a "Finalizado" se llega cobrando). */
export function estadoSiguiente(estado: string): EstadoActivo | null {
  if (!esEstadoActivo(estado)) return null
  return ESTADOS_ACTIVOS[ESTADOS_ACTIVOS.indexOf(estado) + 1] ?? null
}

/** La columna activa anterior, o `null` si no hay: de "En espera" no se vuelve a "Reservas". */
export function estadoAnterior(estado: string): EstadoActivo | null {
  if (!esEstadoActivo(estado)) return null
  return ESTADOS_ACTIVOS[ESTADOS_ACTIVOS.indexOf(estado) - 1] ?? null
}

/** Cómo se dice un movimiento en un botón: hacia adelante, la acción; hacia atrás, a dónde vuelve. */
export function textoDeMovimiento(desde: string, hacia: EstadoActivo): string {
  if (hacia === estadoSiguiente(desde)) return hacia === "en-atencion" ? "Empezar atención" : "Pasar a cobro"
  return `Volver a ${nombreDeEstado(hacia)}`
}

export type AccionPrincipal =
  | { tipo: "mover"; hacia: EstadoActivo; texto: string }
  | { tipo: "cobrar"; texto: string }

/**
 * El botón grande de la tarjeta: llevarla a la columna siguiente. Desde "Por
 * cobrar" el paso siguiente es cobrar, y eso es sólo de dueño y encargado:
 * al profesional no se le ofrece.
 */
export function accionPrincipal(actor: Actor | null, estado: string): AccionPrincipal | null {
  if (!actor) return null
  if (estado === "por-cobrar") return puedeCobrar(actor) ? { tipo: "cobrar", texto: "Cobrar" } : null
  const hacia = estadoSiguiente(estado)
  return hacia ? { tipo: "mover", hacia, texto: textoDeMovimiento(estado, hacia) } : null
}

export interface AccionesSecundarias {
  /** Editar los servicios: cualquier atención activa que se ve. */
  editar: boolean
  /** A qué columna vuelve un paso atrás, o `null` si no puede volver. */
  volverA: EstadoActivo | null
  anular: boolean
}

/**
 * Los botones chicos de la tarjeta. Editar y mover no dependen del rol: el
 * endpoint deja hacerlo a quien ve la atención, y al profesional el tablero
 * sólo le muestra las suyas (y el editor, sólo sus líneas). Anular sí: lo
 * decide `puedeAnular`.
 */
export function accionesSecundarias(actor: Actor | null, estado: string): AccionesSecundarias {
  if (!actor) return { editar: false, volverA: null, anular: false }
  return {
    editar: esEstadoActivo(estado),
    volverA: estadoAnterior(estado),
    // El tablero sólo trae atenciones del negocio de quien mira (el endpoint
    // filtra por su negocio), así que el negocio de la atención es el suyo.
    anular: puedeAnular(actor, { businessId: actor.businessId, status: estado }),
  }
}

// ─── Arrastrar y soltar ──────────────────────────────────────────────────────

export type TarjetaDelTablero = { tipo: "reserva" } | { tipo: "atencion"; estado: string }

/** Lo que dispara soltar una tarjeta: lo mismo que el botón que la lleva a esa columna. */
export type AccionAlSoltar = { tipo: "llegar" } | { tipo: "mover"; hacia: EstadoActivo } | { tipo: "cobrar" }

/**
 * Qué pasa si la tarjeta se suelta en `columna`, o `null` si ahí no puede ir.
 * Sólo a la columna siguiente o a la anterior, y sólo si el botón que hace lo
 * mismo se ofrece: arrastrar no habilita nada que los botones no permitan.
 */
export function accionAlSoltar(
  actor: Actor | null,
  tarjeta: TarjetaDelTablero,
  columna: ColumnaId
): AccionAlSoltar | null {
  if (!actor) return null
  if (tarjeta.tipo === "reserva") return columna === "en-espera" ? { tipo: "llegar" } : null

  const principal = accionPrincipal(actor, tarjeta.estado)
  if (principal?.tipo === "cobrar" && columna === "finalizada") return { tipo: "cobrar" }
  if (principal?.tipo === "mover" && principal.hacia === columna) return { tipo: "mover", hacia: principal.hacia }

  const anterior = accionesSecundarias(actor, tarjeta.estado).volverA
  if (anterior !== null && anterior === columna) return { tipo: "mover", hacia: anterior }
  return null
}

/** Las columnas donde la tarjeta se puede soltar, para marcarlas mientras se arrastra. */
export function destinosDeArrastre(actor: Actor | null, tarjeta: TarjetaDelTablero): ColumnaId[] {
  return COLUMNAS_DEL_TABLERO.map((columna) => columna.id).filter(
    (columna) => accionAlSoltar(actor, tarjeta, columna) !== null
  )
}

// ─── Editor de servicios ─────────────────────────────────────────────────────

/** Una fila del editor de servicios tal como está escrita: el precio todavía es texto. */
export interface FilaDeServicio {
  /** Para la `key` de React: el id de la línea, o uno nuevo si la fila se agregó. */
  clave: string
  /** Vacío si falta elegirlo, o si el servicio de la línea se borró del catálogo. */
  servicioId: string
  /** Id de miembro, `duenio`, o vacío si falta elegir. No cuenta si quien edita no elige profesional. */
  profesional: string
  precio: string
  /** Cómo se llamaban en la línea guardada: para mostrar lo que ya no está en el catálogo o en el equipo. */
  servicioOriginal?: string
  profesionalOriginal?: string
}

/** Una línea de una atención, como la devuelve el endpoint. */
export interface LineaGuardada extends LineaEnPantalla {
  id: string
  servicioId: string | null
  servicio: string
  profesional: { id: string | null; nombre: string }
}

/** La línea guardada como fila para editarla. Un profesional que dejó el equipo queda sin elegir. */
export function filaDesdeLinea(linea: LineaGuardada): FilaDeServicio {
  return {
    clave: linea.id,
    servicioId: linea.servicioId ?? "",
    profesional: linea.profesional.id ?? "",
    precio: String(linea.precio),
    servicioOriginal: linea.servicio,
    profesionalOriginal: linea.profesional.nombre,
  }
}

/** Lo que se manda por cada línea; es el contrato de `PUT /api/atenciones/[id]`. */
export interface LineaPedida {
  servicioId: string
  profesional?: string
  precio: number
}

export interface ErroresDeFila {
  servicio?: string
  profesional?: string
  precio?: string
}

/**
 * Qué le falta a una fila, campo por campo, con un mensaje que se puede
 * mostrar al lado del campo. Un precio de cero vale (una cortesía); vacío no:
 * un cero que nadie escribió se cobraría como cortesía sin que nadie lo
 * decidiera.
 */
export function erroresDeFila(fila: FilaDeServicio, eligeProfesional: boolean): ErroresDeFila {
  const errores: ErroresDeFila = {}
  if (!fila.servicioId) errores.servicio = "Elige el servicio."
  if (eligeProfesional && !fila.profesional) errores.profesional = "Elige quién lo hace."

  const precio = leerMonto(fila.precio)
  if (precio === null) errores.precio = "Escribe el precio."
  else if (!esPrecioValido(precio)) errores.precio = "El precio tiene que ser cero o más, con hasta dos decimales."

  return errores
}

export type LineasDesdeFilas =
  | { ok: true; lineas: LineaPedida[] }
  | { ok: false; errores: Record<string, ErroresDeFila> }

/**
 * Las filas listas para mandar, o los errores de cada fila (por su `clave`).
 * Quien no elige profesional no lo manda: el servidor deja la línea a su
 * nombre igual, y mandar otro sería prometer algo que no pasa.
 */
export function lineasDesdeFilas(filas: readonly FilaDeServicio[], eligeProfesional: boolean): LineasDesdeFilas {
  const errores: Record<string, ErroresDeFila> = {}
  for (const fila of filas) {
    const deLaFila = erroresDeFila(fila, eligeProfesional)
    if (Object.keys(deLaFila).length > 0) errores[fila.clave] = deLaFila
  }
  if (Object.keys(errores).length > 0) return { ok: false, errores }

  return {
    ok: true,
    lineas: filas.map((fila) => ({
      servicioId: fila.servicioId,
      ...(eligeProfesional && { profesional: fila.profesional }),
      // Ya validado: sin errores, el precio se lee.
      precio: leerMonto(fila.precio) ?? 0,
    })),
  }
}

/** La suma en vivo de los precios que ya son válidos, en centavos. */
export function totalDeFilasEnCentavos(filas: readonly FilaDeServicio[]): number {
  return filas.reduce((suma, fila) => {
    const precio = leerMonto(fila.precio)
    return precio !== null && esPrecioValido(precio) ? suma + aCentavos(precio) : suma
  }, 0)
}

// ─── Cobro ───────────────────────────────────────────────────────────────────

/** Una fila del cobro tal como está escrita. */
export interface FilaDePago {
  clave: string
  medio: string
  monto: string
}

export interface EstadoDelCobro {
  /** El total menos lo que suman los pagos, en centavos: positivo falta, negativo sobra. */
  diferenciaCentavos: number
  /** Por qué todavía no se puede cobrar, con el mensaje del servidor; `null` si está listo. */
  error: string | null
  /** Los pagos como se mandan. Sólo sirven si no hay `error`. */
  pagos: PagoPedido[]
}

/**
 * Cómo va el cobro mientras se escribe. Todo en centavos, con la misma regla
 * que aplica el servidor (`errorDeCobro`): el botón de cobrar se habilita sólo
 * cuando el servidor lo va a aceptar. Un monto vacío o ilegible no suma y
 * cuenta como inválido.
 */
export function estadoDelCobro(totalCentavos: number, filas: readonly FilaDePago[]): EstadoDelCobro {
  const pagos = filas.map((fila) => ({ medio: fila.medio, monto: leerMonto(fila.monto) ?? Number.NaN }))
  const sumaCentavos = pagos.reduce(
    (suma, pago) => (Number.isFinite(pago.monto) ? suma + aCentavos(pago.monto) : suma),
    0
  )
  return { diferenciaCentavos: totalCentavos - sumaCentavos, error: errorDeCobro(totalCentavos, pagos), pagos }
}

/**
 * La fila que se agrega al apretar "Agregar medio": el primer medio que
 * todavía no se usó y lo que falta para llegar al total. Es el caso de todos
 * los días (parte en efectivo, el resto con tarjeta) resuelto en un clic.
 */
export function filaDePagoSugerida(
  medios: readonly { id: string }[],
  filas: readonly FilaDePago[],
  totalCentavos: number,
  clave: string
): FilaDePago {
  const usados = new Set(filas.map((fila) => fila.medio))
  const medio = medios.find((candidato) => !usados.has(candidato.id)) ?? medios[0]
  const falta = estadoDelCobro(totalCentavos, filas).diferenciaCentavos
  return { clave, medio: medio?.id ?? "", monto: falta > 0 ? String(deCentavos(falta)) : "" }
}
