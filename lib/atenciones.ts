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

/**
 * En kebab-case, igual que los estados de la cita. La base repite la lista en
 * una restricción CHECK (`atenciones_status_check`, en la migración del
 * tablero): un estado nuevo pide también una migración.
 */
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
 * marca el momento, también si se vuelve a avanzar después de retroceder.
 *
 * Hacia atrás, de "Por cobrar" a "En atención" se borra cuándo quedó lista
 * para cobrar: todavía no lo está. De "En atención" a "En espera", en cambio,
 * `startedAt` se conserva: es el rastro de que la atención empezó, y una que
 * empezó no se borra deshaciendo la llegada, se anula y queda en el historial
 * (`sePuedeDeshacerLaLlegada`).
 */
export function tiemposDeTransicion(desde: EstadoActivo, hacia: EstadoActivo, ahora: Date): TiemposDeAtencion {
  if (desde === "en-espera" && hacia === "en-atencion") return { startedAt: ahora }
  if (desde === "en-atencion" && hacia === "por-cobrar") return { readyAt: ahora }
  if (desde === "por-cobrar" && hacia === "en-atencion") return { readyAt: null }
  return {}
}

// ─── Dinero ──────────────────────────────────────────────────────────────────

/**
 * El dinero de las atenciones se guarda en centavos enteros (`priceCents`,
 * `amountCents`, `totalCents`) y toda suma y toda comparación se hace en
 * centavos: `0.1 + 0.2` da `0.30000000000000004`, y un cobro de 0,30 pagado
 * con 0,10 y 0,20 no puede rechazarse por eso.
 *
 * Lo que entra y sale por la API sigue en unidades, con hasta dos decimales
 * (`precio: 8000`, `monto: 0.3`): se convierte en el borde con estas dos.
 * Así la pantalla no cambia de contrato, y la base nunca ve un `Float`.
 */
export function aCentavos(monto: number): number {
  return Math.round(monto * 100)
}

export function deCentavos(centavos: number): number {
  return centavos / 100
}

/**
 * Topes del dinero. Las columnas de centavos son `Int` de Postgres: 32 bits
 * con signo, hasta 2.147.483.647 centavos (21.474.836,47 en unidades).
 * Pasarse no redondea ni da la vuelta: Postgres rechaza la fila, y el pedido
 * terminaría en un 500 en vez de un mensaje que diga qué corregir.
 *
 * - El total de una atención no pasa de 2.000.000.000 centavos (20 millones).
 *   Es una cifra redonda que se puede decir en un mensaje, deja un 7 % de
 *   margen bajo el límite de la columna y sobra para cualquier visita en la
 *   moneda que sea. Se valida sobre la suma de las líneas al anotarlas, al
 *   editarlas, al pasar a "Por cobrar" y otra vez al cobrar, que es cuando se
 *   congela; no al empezar ni al volver atrás, para que una atención que se
 *   pasó se pueda volver a corregir. El profesional lo cumple sobre sus
 *   líneas, que son las que ve: sobre la atención entera, el rechazo le diría
 *   cuánto suman las de los demás (ver `lineasDeLaAtencion`). Una abierta
 *   puede entonces pasarse si entre varios cargan más de la cuenta; no se
 *   cobra así, porque el cobro la valida entera. La base repite el tope del
 *   total congelado en una restricción CHECK (`atenciones_totalCents_check`).
 * - Un precio o un pago tampoco pasa de eso: ninguno puede ser más que el
 *   total que lo contiene. Como los pagos suman exactamente el total, con el
 *   total acotado ningún pago puede desbordar, y el tope por monto corta antes
 *   de sumar nada. La base lo repite en `atencion_servicios_priceCents_check`
 *   y `atencion_pagos_amountCents_check`.
 * - Lo que se suma entre muchas atenciones (los ingresos de un mes, un
 *   reporte) no se guarda en una columna: se suma en JavaScript o con `_sum`,
 *   que Postgres calcula como `bigint`.
 * - 2.000 millones de centavos está muy por debajo de 2^53: en un `number`
 *   los centavos siguen siendo enteros exactos.
 */
export const TOTAL_MAXIMO_CENTAVOS = 2_000_000_000

/** El mismo tope en unidades: lo más que vale un precio o un pago. */
export const MONTO_MAXIMO = deCentavos(TOTAL_MAXIMO_CENTAVOS)

/**
 * Cuántos servicios puede tener una atención, sumando los de todos los que la
 * atendieron. Ninguna visita real tiene tantos; el tope corta un pedido
 * absurdo y asegura que leer las líneas con este `take` las trae todas, así
 * que el total que se muestra y el que se cobra salen de las mismas.
 *
 * A diferencia del total, se mide sobre la atención entera para todos,
 * también para el profesional: cuántos servicios hay no es dinero. Se valida
 * cada vez que se escriben sus líneas, así que ninguna atención pasa de este
 * tope, ni siquiera mientras está abierta.
 */
export const MAXIMO_DE_LINEAS_POR_ATENCION = 20

/** Más medios que esto en un solo cobro no es un pago dividido, es un error de carga. */
export const MAXIMO_DE_PAGOS = 20

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

/** El total de una atención: la suma de sus líneas, tal como se guardan, en centavos. */
export function totalEnCentavos(lineas: readonly { priceCents: number }[]): number {
  return lineas.reduce((suma, linea) => suma + linea.priceCents, 0)
}

/** Para los mensajes de error: `$25.000`, `$0,3`. */
function comoMonto(centavos: number): string {
  return `$${deCentavos(centavos).toLocaleString("es-ES", { maximumFractionDigits: 2 })}`
}

/** Por qué el total de una atención no se puede guardar ni cobrar, o `null` si está bien. */
export function errorDeTotal(totalCentavos: number): string | null {
  return totalCentavos > TOTAL_MAXIMO_CENTAVOS
    ? `El total de la atención no puede pasar de ${comoMonto(TOTAL_MAXIMO_CENTAVOS)}: divídela en dos.`
    : null
}

/** Por qué una atención tiene demasiados servicios, o `null` si está bien. */
export function errorDeCantidadDeLineas(cantidad: number): string | null {
  return cantidad > MAXIMO_DE_LINEAS_POR_ATENCION
    ? `Una atención puede tener hasta ${MAXIMO_DE_LINEAS_POR_ATENCION} servicios.`
    : null
}

// ─── Requisitos para avanzar ─────────────────────────────────────────────────

/**
 * Lo de una línea que hace falta para saber si la atención puede avanzar. El
 * precio va en unidades, como lo escribe la pantalla: el servidor la arma
 * desde `priceCents` con `deCentavos`, así las dos aplican la misma regla.
 */
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

// ─── Llegadas ────────────────────────────────────────────────────────────────

/**
 * Si se puede deshacer la llegada (borrar la atención y devolver la reserva a
 * "Reservas de hoy"): sólo si nació de una reserva, porque sin reserva no hay
 * adónde volver (eso se anula), y sólo si nunca empezó: está en espera y sin
 * `startedAt`. Una atención que empezó registró algo que no se borra, aunque
 * la hayan vuelto a espera (volver no borra `startedAt`, ver
 * `tiemposDeTransicion`): se anula, y queda en el historial.
 *
 * `startedAt` llega como `Date` desde la base (`buscarAtencion`) y como texto
 * ISO desde la API (`empezoEn`, en la pantalla). Es obligatorio: quien
 * pregunta tiene que decir si empezó. Sólo `null` es "no empezó"; un valor
 * que llegue sin él, por fuera de los tipos, se lee como empezada y no se
 * deshace (falla cerrado). El servidor además lo exige en el `WHERE` con que
 * toma la fila antes de borrarla.
 */
export function sePuedeDeshacerLaLlegada<
  T extends { status: string; appointmentId: string | null; startedAt: Date | string | null },
>(atencion: T): atencion is T & { appointmentId: string } {
  return atencion.status === "en-espera" && atencion.appointmentId !== null && atencion.startedAt === null
}

/**
 * Si el nombre de un servicio del catálogo es el que quedó escrito en una
 * cita. La agenda guarda el servicio como texto (`title`) y no su id: para
 * precargar la línea al llegar, se busca por nombre, sin distinguir
 * mayúsculas ni espacios al borde. Nada más laxo: con acentos o palabras de
 * más ya no es seguro que sea el mismo servicio, y una línea con el servicio
 * equivocado se cobraría al precio equivocado.
 */
export function mismoNombreDeServicio(nombre: string, titulo: string): boolean {
  const normal = (texto: string) => texto.trim().toLocaleLowerCase("es")
  return normal(nombre) === normal(titulo)
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
