import {
  ESTADOS_ACTIVOS,
  MONTO_MAXIMO,
  PROFESIONAL_DUEÑO,
  aCentavos,
  deCentavos,
  errorDeCobro,
  esEstadoActivo,
  esMontoDePagoValido,
  esPrecioValido,
  mismoNombreDeServicio,
  nombreDeEstado,
  requisitoFaltante,
  sePuedeDeshacerLaLlegada,
  type EstadoActivo,
  type LineaDeAtencion,
  type PagoPedido,
} from "@/lib/atenciones"
import { formatearMonto, leerMonto, montoParaEscribir } from "@/lib/dinero"
import { esHoy, horaConArticulo } from "@/lib/fechas"
import { puedeAnular, puedeCobrar, puedeDeshacerLlegada, type Actor } from "@/lib/permisos"

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

/**
 * Cómo se nombra una atención en los botones de su tarjeta: el cliente y una
 * hora que no cambia mientras está en el tablero, la del cobro si ya se cobró
 * y si no la de llegada. Con el nombre solo, dos visitas de la misma clienta
 * daban dos "Anular el cobro de María González" que el lector de pantalla no
 * distinguía.
 */
export function nombreConHora(atencion: {
  estado: string
  cliente: { nombre: string }
  llegoEn: string
  cobradaEn: string | null
}): string {
  const iso = atencion.estado === "finalizada" && atencion.cobradaEn ? atencion.cobradaEn : atencion.llegoEn
  return `${atencion.cliente.nombre} de ${horaConArticulo(iso)}`
}

/** Lo que hace falta de una atención para nombrarla en los botones del tablero. */
export type AtencionConNombre = Parameters<typeof nombreConHora>[0] & { id: string }

/**
 * El nombre de cada atención del tablero en sus botones, por id y sin
 * repetir. Es el de `nombreConHora`, pero la hora sola no alcanza: dos
 * llegadas de la misma clienta en el mismo minuto daban dos "Empezar
 * atención: Lucía Pérez de las 02:51" que el lector de pantalla no
 * distinguía. La primera en llegar se queda con el nombre; las siguientes
 * llevan un ordinal, "(2)", "(3)", en el orden en que llegaron. Ese orden no
 * cambia mientras siguen en el tablero, aunque pasen a otra columna.
 */
export function nombresSinRepetir(atenciones: readonly AtencionConNombre[]): Map<string, string> {
  const porLlegada = [...atenciones].sort(
    (a, b) => instante(a.llegoEn) - instante(b.llegoEn) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
  const veces = new Map<string, number>()
  const nombres = new Map<string, string>()
  for (const atencion of porLlegada) {
    const nombre = nombreConHora(atencion)
    const vez = (veces.get(nombre) ?? 0) + 1
    veces.set(nombre, vez)
    nombres.set(atencion.id, vez === 1 ? nombre : `${nombre} (${vez})`)
  }
  return nombres
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

/** Lo que el tablero mira de una atención para ofrecer "Deshacer llegada". */
export interface AtencionParaDeshacer {
  estado: string
  citaId: string | null
  /** Cuándo empezó a atenderse. Volver a espera no lo borra: una que empezó ya no se deshace. */
  empezoEn: string | null
  /**
   * La reserva de la que nació. El servidor la manda sólo a quien ve esa
   * cita: dueño y encargado, cualquiera; el profesional, sólo una suya. `null`
   * si no nació de una reserva o si quien mira no la ve.
   */
  reserva: Pick<ReservaDeOrigen, "profesional"> | null
}

/**
 * Si la tarjeta ofrece "Deshacer llegada". Las mismas dos preguntas que hace
 * el servidor antes de borrar (`DELETE /api/atenciones/[id]`):
 *
 * - si la llegada se puede deshacer: nació de una reserva, está en espera y
 *   nunca empezó (`sePuedeDeshacerLaLlegada`);
 * - si quien mira puede deshacer esa reserva (`puedeDeshacerLlegada`): dueño y
 *   encargado, la de cualquiera; el profesional, sólo una suya. Ver la
 *   atención no alcanza: el profesional ve la de la reserva de una colega si
 *   tiene un servicio en ella.
 *
 * Sin la reserva no se sabe de quién es, y para el profesional eso es que no
 * (falla cerrado). El servidor igual vuelve a mirar todo.
 */
export function ofreceDeshacerLlegada(actor: Actor | null, atencion: AtencionParaDeshacer): boolean {
  if (!actor) return false
  const deshacible = sePuedeDeshacerLaLlegada({
    status: atencion.estado,
    appointmentId: atencion.citaId,
    startedAt: atencion.empezoEn,
  })
  // El tablero sólo trae atenciones del negocio de quien mira (el endpoint
  // filtra por su negocio), así que la reserva de origen es de ese negocio.
  const cita = atencion.reserva
    ? { businessId: actor.businessId, memberId: atencion.reserva.profesional?.id ?? null }
    : null
  return deshacible && puedeDeshacerLlegada(actor, cita)
}

/**
 * Lo que hace falta saber de una atención para confirmar que se anula. Viene
 * del tablero o del historial de reportes, donde el dueño anula cobros de
 * cualquier día.
 */
export interface AtencionParaAnular {
  estado: string
  cliente: { nombre: string }
  /** Sólo para quien ve los totales. */
  total?: number
  /** Si nació de una reserva: anularla sin cobrar cancela la cita de la agenda. */
  citaId?: string | null
  /** Cuándo se cobró, si se cobró. */
  cobradaEn?: string | null
}

/** "hoy a las 10:30", o "el lunes, 5 de octubre a las 10:30" si fue otro día. */
function momentoDelCobro(iso: string): string {
  const fecha = new Date(iso)
  const dia = esHoy(fecha)
    ? "hoy"
    : `el ${fecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}`
  return `${dia} a ${horaConArticulo(iso)}`
}

/**
 * Qué pasa al anular, dicho antes de hacerlo. Lo cobrado no se borra: deja de
 * sumar a los ingresos y queda en el historial como anulado; se dice cuándo se
 * cobró y por cuánto, porque desde el historial se anulan cobros de otros
 * días. Si no estaba cobrada y venía de una reserva, la cita de la agenda pasa
 * a cancelada.
 */
export function consecuenciasDeAnular(atencion: AtencionParaAnular): string {
  if (atencion.estado === "finalizada") {
    const porCuanto = atencion.total !== undefined ? formatearMonto(atencion.total) : null
    const cuando = atencion.cobradaEn ? momentoDelCobro(atencion.cobradaEn) : null
    const cobro = cuando
      ? `Se cobró ${cuando}${porCuanto ? `, por ${porCuanto}` : ""}.`
      : `Esta atención ya está cobrada${porCuanto ? ` (${porCuanto})` : ""}.`
    return `${cobro} Al anularla deja de sumar a los ingresos del negocio y queda en el historial como anulada. No se puede deshacer.`
  }
  const reserva = atencion.citaId ? " La reserva de la agenda queda cancelada." : ""
  return `La atención sale del tablero y queda en el historial como anulada.${reserva} No se puede deshacer.`
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

/**
 * La línea guardada como fila para editarla. Un profesional que dejó el
 * equipo queda sin elegir. El precio se escribe como lo lee el campo
 * (`montoParaEscribir`): `8000,50`.
 */
export function filaDesdeLinea(linea: LineaGuardada): FilaDeServicio {
  return {
    clave: linea.id,
    servicioId: linea.servicioId ?? "",
    profesional: linea.profesional.id ?? "",
    precio: montoParaEscribir(linea.precio),
    servicioOriginal: linea.servicio,
    profesionalOriginal: linea.profesional.nombre,
  }
}

/** De qué reserva nació una atención, como la manda el servidor para precargar el editor. */
export interface ReservaDeOrigen {
  /** El servicio de la cita, si lo guardó por id (la reserva pública); `null` si la agenda lo guardó como texto. */
  servicioId: string | null
  /** El servicio tal como quedó escrito en la cita. */
  titulo: string
  precio: number | null
  profesional: { id: string; nombre: string } | null
}

/** Lo del catálogo del tablero que hace falta para armar una fila. */
export interface CatalogoParaFilas {
  /** Sólo los activos. */
  servicios: readonly { id: string; nombre: string; precio: number | null }[]
  /** A quién se le puede asignar una línea. */
  profesionales: readonly { id: string; nombre: string }[]
}

/**
 * La fila con que se abre el editor de una atención que nació de una reserva
 * y todavía no tiene servicios: lo que dice la reserva, en lo que se pueda usar.
 *
 * - El servicio de la cita, si sigue en el catálogo, que sólo trae los
 *   activos. Si la agenda lo guardó como texto, el único servicio del catálogo
 *   que se llama igual (`mismoNombreDeServicio`, la misma regla que aplica el
 *   servidor al marcar la llegada). Uno dado de baja, o un nombre que no está
 *   o que está repetido, no se precarga: su nombre queda como ayuda para elegir.
 * - Quién lo hace: el profesional de la cita, si se le puede asignar. Si no,
 *   el único posible, como en una fila vacía; y si ya no está en el equipo,
 *   su nombre queda como ayuda.
 * - El precio de la reserva o, si no tiene, el del catálogo. Sólo con un
 *   servicio precargado: elegir otro lo pisa con el precio del catálogo.
 */
export function filaDesdeReserva(reserva: ReservaDeOrigen, catalogo: CatalogoParaFilas, clave: string): FilaDeServicio {
  const servicio =
    reserva.servicioId !== null
      ? catalogo.servicios.find((candidato) => candidato.id === reserva.servicioId)
      : unicoConEseNombre(catalogo.servicios, reserva.titulo)

  const deLaReserva = reserva.profesional?.id
  const asignable = deLaReserva !== undefined && catalogo.profesionales.some((candidato) => candidato.id === deLaReserva)
  const unico = catalogo.profesionales.length === 1 ? catalogo.profesionales[0].id : ""
  const profesional = asignable ? deLaReserva : unico

  const precio = servicio ? (reserva.precio ?? servicio.precio) : null

  return {
    clave,
    servicioId: servicio?.id ?? "",
    profesional,
    precio: precio === null ? "" : montoParaEscribir(precio),
    ...(!servicio && { servicioOriginal: reserva.titulo }),
    ...(reserva.profesional && !asignable && !profesional && { profesionalOriginal: reserva.profesional.nombre }),
  }
}

/** El servicio que se llama como el título, sólo si es uno: con dos iguales no se adivina cuál. */
function unicoConEseNombre<T extends { nombre: string }>(servicios: readonly T[], titulo: string): T | undefined {
  const conEseNombre = servicios.filter((servicio) => mismoNombreDeServicio(servicio.nombre, titulo))
  return conEseNombre.length === 1 ? conEseNombre[0] : undefined
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

/** Lo que se le dice a quien escribió un monto que `leerMonto` no puede leer sin adivinar. */
const MONTO_ILEGIBLE = "Escríbelo así: 8000 o 8000,50."

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
  if (fila.precio.trim() === "") errores.precio = "Escribe el precio."
  else if (precio === null) errores.precio = `No se entiende el precio. ${MONTO_ILEGIBLE}`
  else if (!esPrecioValido(precio)) {
    errores.precio = `El precio tiene que ser cero o más, hasta ${formatearMonto(MONTO_MAXIMO)}, con hasta dos decimales.`
  }

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
  return { clave, medio: medio?.id ?? "", monto: falta > 0 ? montoParaEscribir(deCentavos(falta)) : "" }
}

/**
 * Lo que hay que decir de un monto de pago escrito, al lado del campo, o
 * `null` si está vacío o sirve. Vacío no es un error del campo: lo dice el
 * cobro, como lo que falta para el total.
 */
export function errorDeMontoDePago(texto: string): string | null {
  if (texto.trim() === "") return null
  const monto = leerMonto(texto)
  if (monto === null) return `No se entiende el monto. ${MONTO_ILEGIBLE}`
  if (!esMontoDePagoValido(monto)) {
    return `Tiene que ser mayor que cero, hasta ${formatearMonto(MONTO_MAXIMO)}, con hasta dos decimales.`
  }
  return null
}
