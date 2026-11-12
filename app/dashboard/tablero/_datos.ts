/**
 * Todo lo que el tablero de atenciones le pide al servidor. La pantalla llama
 * a estas funciones y no conoce ninguna URL.
 *
 * Las lecturas devuelven un `Resultado` (`lib/peticiones.ts`). Las acciones
 * devuelven además el motivo del fallo, porque el tablero reacciona distinto
 * según qué pasó: si la atención cambió mientras tanto (409) o ya no se ve
 * (404), recarga; si le falta un requisito (400), abre el editor. Los códigos
 * HTTP se traducen acá: la pantalla decide por el motivo, no por el número.
 */

import { nombreCompletoDeCliente } from "@/lib/nombre-de-cliente"
import type { EstadoActivo, PagoPedido } from "@/lib/atenciones"
import type { LineaGuardada, LineaPedida, PropinaPedida, ReservaDeOrigen } from "@/lib/acciones-del-tablero"
import { rangoDelDia, zonaDelDispositivo } from "@/lib/fechas"
import { CODIGO_CORREGIR_CON_AJUSTE, CODIGO_PAGADO_AL_LABORATORIO } from "@/lib/bloqueos-de-dinero"
import {
  codigoDelServidor,
  conJson,
  pedir,
  pedirConCodigo,
  pedirConCuerpo,
  type Resultado,
  type ResultadoConCodigo,
} from "@/lib/peticiones"
import { mostrarTelefono } from "@/lib/telefono"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDelTablero } from "./_frases"

/**
 * Las palabras de un rubro sin palabras propias: lo que dicen los mensajes de
 * estos pedidos ("No se pudo cargar el tablero") si quien llama no pasa las
 * del rubro. Los pedidos que traen un mensaje del servidor lo muestran tal cual.
 */
const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

// ─── Lo que devuelve el servidor ─────────────────────────────────────────────

/**
 * Una línea de la atención: servicio, quién lo hizo y a qué precio.
 * `servicioId` en null: el servicio se borró del catálogo (el nombre quedó
 * copiado). `profesional.id` en null: quien lo hizo dejó el equipo, y hay que
 * reasignarla antes de cobrar.
 */
export type LineaDeServicio = LineaGuardada & {
  /**
   * Sólo en un abono de prótesis (clínica dental): a qué prótesis abona y,
   * ya cobrado, lo que quien mira ve del reparto (en unidades). La dueña, las
   * tres partes; la odontóloga tratante, sólo la suya; el encargado, nada
   * (`null`). Antes de cobrar, `null` para todos.
   */
  abono?: AbonoDeLinea
}

export interface AbonoDeLinea {
  protesisId: string
  reparto: { odontologo: number; clinica?: number; tecnico?: number } | null
}

/** Si la línea es un abono de prótesis: no se edita como servicio ni viaja en el PUT de líneas. */
export const esAbono = (linea: { abono?: unknown }): boolean => !!linea.abono

/**
 * Cómo se lee un abono en la tarjeta y en el cobro: "Abono · Removible
 * parcial · Acrílico (45, 46)". El servidor lo guarda como "Abono prótesis ·
 * …" (así queda en reportes); acá se acorta, porque la tarjeta es angosta.
 */
export const nombreDelAbono = (servicio: string): string => servicio.replace(/^Abono prótesis · /, "Abono · ")

/** Una prótesis del paciente a la que se puede abonar (no anulada), en unidades como el tablero. */
export interface ProtesisParaAbonar {
  id: string
  nombre: string
  estado: string
  nombreDeEstado: string
  tratante: string
  valor: number
  /** Abonos de atenciones ya cobradas. */
  pagado: number
  /** Abonos en atenciones abiertas de la Sala de espera (esta incluida). */
  porCobrar: number
  /** Valor − pagado − por cobrar: el máximo del abono. */
  saldo: number
}

export interface PagoRegistrado {
  id: string
  medio: string
  nombreMedio: string
  monto: number
}

/** Una propina registrada al cobrar (#66): aparte del total, para quien la recibe. */
export interface PropinaRegistrada {
  id: string
  /** Id de miembro o `duenio`; `null` si quien la recibió dejó el equipo. */
  profesional: { id: string | null; nombre: string }
  medio: string
  nombreMedio: string
  monto: number
}

export interface Atencion {
  id: string
  /** `en-espera`, `en-atencion`, `por-cobrar` o `finalizada`; las anuladas no llegan al tablero. */
  estado: string
  /** `id` en null si el cliente se borró: el nombre siempre está. */
  cliente: { id: string | null; nombre: string }
  citaId: string | null
  /**
   * La reserva de la que nació, para precargar el editor mientras la atención
   * no tiene servicios y para saber de quién es al ofrecer "Deshacer llegada"
   * (`ofreceDeshacerLlegada`). `null` si no nació de una, si la cita se borró
   * o si quien mira no ve esa cita: al profesional sólo le llega la suya.
   */
  reserva: ReservaDeOrigen | null
  notas: string | null
  llegoEn: string
  /** Cuándo empezó a atenderse. Volver a espera no lo borra: una que empezó ya no se deshace, se anula. */
  empezoEn: string | null
  terminoEn: string | null
  cobradaEn: string | null
  anuladaEn: string | null
  motivoDeAnulacion: string | null
  /** El número de turno de quien se anotó en la fila virtual (#85); `null` si llegó por otro lado. */
  turno: number | null
  /** Al profesional le llegan sólo las suyas. */
  lineas: LineaDeServicio[]
  /**
   * Sólo para dueño y encargado: al profesional la clave no le llega. En una
   * atención abierta es la suma viva de las líneas; en una cobrada, la que
   * quedó congelada al cobrar.
   */
  total?: number
  pagos?: PagoRegistrado[]
  /** Sólo para dueño y encargado, como los pagos. No suman al total. */
  propinas?: PropinaRegistrada[]
}

/** Una cita de hoy que todavía no llegó. Que esté atrasada lo calcula la pantalla con su reloj. */
export interface Reserva {
  id: string
  inicio: string
  fin: string
  estado: string
  /** El servicio tal como se anotó en la cita. */
  titulo: string
  servicioId: string | null
  precio: number | null
  cliente: { id: string; nombre: string } | null
  profesional: { id: string; nombre: string } | null
}

export interface ServicioDelCatalogo {
  id: string
  nombre: string
  /** Puede faltar: un servicio sin precio se cobra con el que se escriba. */
  precio: number | null
}

/** Un producto que se vende en el local (#67). Sin su % de comisión: eso es de la dueña. */
export interface ProductoDelCatalogo {
  id: string
  nombre: string
  precio: number | null
}

/** Lo que se puede elegir en el tablero: ya viene recortado según quién mira. */
export interface Catalogo {
  /** Sólo los activos. */
  servicios: ServicioDelCatalogo[]
  /** Sólo los activos. */
  productos: ProductoDelCatalogo[]
  /** Los miembros y el dueño (`id: "duenio"`); al profesional, sólo él. */
  profesionales: { id: string; nombre: string }[]
  mediosDePago: { id: string; nombre: string }[]
}

export interface Tablero {
  reservas: Reserva[]
  atenciones: Atencion[]
  catalogo: Catalogo
  /** Había más atenciones de las que el servidor manda de una vez: algunas no se ven. */
  truncado: boolean
  /** La fila virtual está encendida y quien mira puede abrir su pantalla (#85). */
  filaVirtual?: boolean
}

/**
 * Lo que trae el sondeo cada 30 segundos: lo que cambia durante el día. El
 * catálogo y la fila virtual no vienen: se piden completos al abrir, al volver
 * a la pestaña y tras cada acción, y casi no cambian entre una y otra.
 */
export type Sondeo = Pick<Tablero, "reservas" | "atenciones" | "truncado">

/**
 * El tablero que ya se ve, con lo que trajo el sondeo encima: reservas,
 * atenciones y `truncado` se reemplazan; el catálogo y la fila quedan como
 * estaban. Sólo se copian esos tres campos, venga lo que venga.
 */
export function aplicarSondeo(previo: Tablero, sondeo: Sondeo): Tablero {
  return { ...previo, reservas: sondeo.reservas, atenciones: sondeo.atenciones, truncado: sondeo.truncado }
}

/** Un cliente que coincide con lo que se escribe en el buscador. */
export interface ClienteEncontrado {
  id: string
  nombre: string
  /** Teléfono o correo, para distinguir a dos clientes con el mismo nombre. */
  detalle: string
}

// ─── Cómo falla una acción ───────────────────────────────────────────────────

/**
 * - `desactualizada`: la atención o la reserva cambió entretanto (409) o ya
 *   no se ve (404). Lo que muestra la pantalla está viejo: hay que recargar.
 * - `falta-requisito`: el servidor dice que falta algo para avanzar (400),
 *   con el mensaje de qué.
 * - `corregir-con-ajuste`: la atención ya entró en una liquidación o en un
 *   cierre de caja (409 con `codigo: "corregir-con-ajuste"`), o lleva un
 *   abono ya pagado al laboratorio (`codigo: "pagado-al-laboratorio"`): no
 *   cambió, no se toca, y el mensaje dice cómo se corrige.
 * - `otro`: cualquier otro motivo; se muestra el mensaje y nada más.
 */
export type MotivoDeFallo = "desactualizada" | "falta-requisito" | "corregir-con-ajuste" | "otro"

export type ResultadoDeAccion<T> = { ok: true; datos: T } | { ok: false; error: string; motivo: MotivoDeFallo }

function conMotivo<T>(resultado: ResultadoConCodigo<T>): ResultadoDeAccion<T> {
  if (resultado.ok) return resultado
  const { error, codigo } = resultado
  if (codigo === 409 || codigo === 404) return { ok: false, error, motivo: "desactualizada" }
  if (codigo === 400) return { ok: false, error, motivo: "falta-requisito" }
  return { ok: false, error, motivo: "otro" }
}

const URL_DE_ATENCIONES = "/api/atenciones"
const urlDeAtencion = (id: string) => `${URL_DE_ATENCIONES}/${encodeURIComponent(id)}`

// ─── Lecturas ────────────────────────────────────────────────────────────────

/**
 * La dirección del tablero del día que contiene a `hoy`: de 00:00 a 00:00 del
 * día siguiente en la hora del dispositivo, enviado como instantes ISO. El
 * servidor no sabe en qué huso está el local; el navegador sí.
 */
function urlDelTablero(hoy: Date, soloAtenciones: boolean): string {
  const { desde, hasta } = rangoDelDia(hoy)
  const parametros = new URLSearchParams({ desde: desde.toISOString(), hasta: hasta.toISOString() })
  if (soloAtenciones) parametros.set("soloAtenciones", "1")
  return `${URL_DE_ATENCIONES}?${parametros}`
}

/** El tablero completo del día que contiene a `hoy`: reservas, atenciones, catálogo y fila. */
export async function leerTablero(hoy: Date, palabras: PalabrasDelRubro = PALABRAS_NEUTRAS): Promise<Resultado<Tablero>> {
  return pedir<Tablero>(urlDelTablero(hoy, false), frasesDelTablero(palabras).errores.cargarElTablero)
}

/**
 * Sólo lo que cambia del día que contiene a `hoy`: reservas y atenciones. Es
 * el sondeo de cada 30 segundos; el servidor ni consulta el catálogo.
 */
export async function leerAtencionesDelDia(
  hoy: Date,
  palabras: PalabrasDelRubro = PALABRAS_NEUTRAS
): Promise<Resultado<Sondeo>> {
  return pedir<Sondeo>(urlDelTablero(hoy, true), frasesDelTablero(palabras).errores.cargarElTablero)
}

/** Hasta ocho clientes cuyo nombre, correo o teléfono contiene `texto`. */
export async function buscarClientes(
  texto: string,
  palabras: PalabrasDelRubro = PALABRAS_NEUTRAS
): Promise<Resultado<ClienteEncontrado[]>> {
  const parametros = new URLSearchParams({ q: texto, limite: "8" })
  const resultado = await pedir<{
    clientes: { id: string; name: string; lastName: string | null; email: string | null; phone: string | null }[]
  }>(`/api/clientes?${parametros}`, frasesDelTablero(palabras).errores.buscarClientes)
  if (!resultado.ok) return resultado

  return {
    ok: true,
    datos: resultado.datos.clientes.map((cliente) => ({
      id: cliente.id,
      // Nombre y apellido, como queda escrito en la atención: "María González".
      nombre: nombreCompletoDeCliente(cliente),
      // El teléfono como se lee en todo el panel ("+56 9 1234 5678"), no como se guarda.
      detalle: mostrarTelefono(cliente.phone) || cliente.email || "",
    })),
  }
}

// ─── Acciones ────────────────────────────────────────────────────────────────

/**
 * Llegó alguien con reserva: la cita entra al tablero como atención en espera.
 *
 * Va con la zona del dispositivo, la misma con que `leerTablero` arma el día:
 * así el servidor corta "hoy" en el calendario de quien marca la llegada, y
 * una reserva de otro día da 409 con un mensaje para mostrar ("Esta reserva no
 * es de hoy…"), igual que una que ya llegó o se canceló. Si el navegador no
 * informa la zona no se manda, y el servidor acepta las de ±24 horas. Lo
 * mismo si manda una que el servidor no reconoce (`Etc/Unknown`, de un equipo
 * sin zona configurada, o una más nueva que la base de zonas del servidor):
 * la trata como si no hubiera venido, en vez de rechazar la llegada.
 */
export async function marcarLlegada(citaId: string): Promise<ResultadoDeAccion<Atencion>> {
  const zona = zonaDelDispositivo()
  return conMotivo(
    await pedirConCodigo<Atencion>(
      URL_DE_ATENCIONES,
      "No se pudo marcar la llegada",
      conJson("POST", { citaId, ...(zona && { zona }) })
    )
  )
}

/**
 * La reserva no llegó: la cita queda "No vino" (`no-asistio`; "No asistió" en
 * una clínica dental, según las `palabras` del rubro), sale de
 * "Reservas de hoy", libera su horario y cuenta en la ficha del cliente. El
 * servidor sólo lo acepta en una reserva pendiente o confirmada cuya hora ya
 * pasó y que no esté en el tablero: si no, 409 con el motivo.
 */
export async function marcarNoVino(
  citaId: string,
  palabras: PalabrasDelRubro = PALABRAS_NEUTRAS
): Promise<ResultadoDeAccion<unknown>> {
  return conMotivo(
    await pedirConCodigo<unknown>(
      `/api/citas/${encodeURIComponent(citaId)}`,
      frasesDelTablero(palabras).errores.marcarNoVino,
      conJson("PUT", { status: "no-asistio" })
    )
  )
}

/**
 * Deshace una llegada marcada por error: la atención en espera se borra y la
 * reserva vuelve a "Reservas de hoy". Si ya empezó, o no nació de una
 * reserva, el servidor responde 409 con un mensaje: eso se anula.
 */
export async function deshacerLlegada(id: string): Promise<ResultadoDeAccion<{ eliminada: true }>> {
  return conMotivo(
    await pedirConCodigo<{ eliminada: true }>(urlDeAtencion(id), "No se pudo deshacer la llegada", { method: "DELETE" })
  )
}

export interface DatosSinReserva {
  /** Un cliente que ya existe, o uno nuevo que se crea junto con la atención. */
  cliente: { id: string } | { nuevo: { nombre: string; telefono: string } }
  lineas: LineaPedida[]
  notas: string
}

/** Llegó alguien sin reserva. */
export async function anotarSinReserva(datos: DatosSinReserva): Promise<ResultadoDeAccion<Atencion>> {
  const cliente =
    "id" in datos.cliente
      ? { clienteId: datos.cliente.id }
      : {
          clienteNuevo: {
            nombre: datos.cliente.nuevo.nombre.trim(),
            ...(datos.cliente.nuevo.telefono.trim() && { telefono: datos.cliente.nuevo.telefono.trim() }),
          },
        }

  return conMotivo(
    await pedirConCodigo<Atencion>(
      URL_DE_ATENCIONES,
      "No se pudo anotar la atención",
      conJson("POST", {
        ...cliente,
        ...(datos.lineas.length > 0 && { lineas: datos.lineas }),
        ...(datos.notas.trim() && { notas: datos.notas.trim() }),
      })
    )
  )
}

/**
 * Reemplaza los servicios de la atención. Al profesional el servidor le
 * reemplaza sólo los suyos: los de sus colegas quedan como estaban.
 */
export async function guardarServicios(
  id: string,
  lineas: LineaPedida[],
  palabras: PalabrasDelRubro = PALABRAS_NEUTRAS
): Promise<ResultadoDeAccion<Atencion>> {
  return conMotivo(
    await pedirConCodigo<Atencion>(
      urlDeAtencion(id),
      frasesDelTablero(palabras).errores.guardarServicios,
      conJson("PUT", { lineas })
    )
  )
}

/** Mueve la atención a otra columna activa, de a un paso. */
export async function moverAtencion(id: string, estado: EstadoActivo): Promise<ResultadoDeAccion<Atencion>> {
  return conMotivo(
    await pedirConCodigo<Atencion>(`${urlDeAtencion(id)}/estado`, "No se pudo mover la atención", conJson("POST", { estado }))
  )
}

/**
 * Cobra la atención: los pagos tienen que sumar el total (con total cero, sin
 * pagos). Las propinas van aparte y no cuentan para el total.
 */
export async function cobrarAtencion(
  id: string,
  pagos: PagoPedido[],
  propinas: PropinaPedida[] = []
): Promise<ResultadoDeAccion<Atencion>> {
  return conMotivo(
    await pedirConCodigo<Atencion>(
      `${urlDeAtencion(id)}/cobro`,
      "No se pudo registrar el cobro",
      conJson("POST", { pagos, ...(propinas.length > 0 && { propinas }) })
    )
  )
}

// ─── Abonos de prótesis (clínica dental) ─────────────────────────────────────

const urlDeAbonos = (id: string) => `${urlDeAtencion(id)}/abonos`

/** Las prótesis no anuladas del paciente de la atención, con su valor, lo pagado, lo por cobrar y el saldo. */
export async function leerProtesisParaAbonar(id: string): Promise<Resultado<ProtesisParaAbonar[]>> {
  const resultado = await pedir<{ protesis: ProtesisParaAbonar[] }>(urlDeAbonos(id), "No se pudieron cargar las prótesis")
  return resultado.ok ? { ok: true, datos: resultado.datos.protesis } : resultado
}

/**
 * Agrega un abono a la atención: una línea ligada a la prótesis, de monto
 * libre hasta el saldo. Responde la atención con la línea nueva. Los fallos
 * se muestran tal cual (el monto pasa el saldo, la atención ya se cobró…):
 * el código no cambia lo que hace la pantalla, que vuelve a leer las prótesis.
 */
export async function agregarAbono(id: string, protesisId: string, monto: number): Promise<ResultadoConCodigo<Atencion>> {
  return pedirConCodigo<Atencion>(urlDeAbonos(id), "No se pudo agregar el abono", conJson("POST", { protesisId, monto }))
}

/** Quita un abono antes de cobrar. Responde la atención sin esa línea. */
export async function quitarAbono(id: string, lineaId: string): Promise<ResultadoDeAccion<Atencion>> {
  return conMotivo(
    await pedirConCodigo<Atencion>(`${urlDeAbonos(id)}/${encodeURIComponent(lineaId)}`, "No se pudo quitar el abono", {
      method: "DELETE",
    })
  )
}

/** "Vaciar la fila de hoy" (#85): anula a todos los que esperan en la fila virtual del día. */
export async function vaciarFilaDeHoy(): Promise<ResultadoDeAccion<{ anuladas: number }>> {
  return conMotivo(
    await pedirConCodigo<{ anuladas: number }>("/api/fila-virtual/vaciar", "No se pudo vaciar la fila", {
      method: "POST",
    })
  )
}

/**
 * Antes de cobrar (#118): los ids de las líneas que quedarían sin % de
 * comisión si se cobrara ahora. Sólo para avisar; el cobro no se frena.
 */
export async function leerLineasSinPorcentaje(
  id: string,
  palabras: PalabrasDelRubro = PALABRAS_NEUTRAS
): Promise<Resultado<string[]>> {
  const resultado = await pedir<{ lineasSinPorcentaje: string[] }>(
    `${urlDeAtencion(id)}/cobro`,
    frasesDelTablero(palabras).errores.lineasSinPorcentaje
  )
  return resultado.ok ? { ok: true, datos: resultado.datos.lineasSinPorcentaje } : resultado
}

/**
 * Anula la atención. Queda en el historial como anulada y deja de sumar. Si
 * ya se rindió (liquidación o cierre de caja), el servidor lo dice con un
 * código, no con el texto (#117). Lo mismo si lleva un abono de prótesis ya
 * pagado al laboratorio (`pagado-al-laboratorio`): no cambió nada, así que no
 * es "la atención cambió". Las dos se tratan igual (`corregir-con-ajuste`):
 * el modal se queda con el motivo escrito y el mensaje del servidor, que dice
 * cómo seguir; antes ese 409 se leía como desactualizada, el tablero recargaba
 * y el motivo se perdía.
 */
export async function anularAtencion(id: string, motivo: string): Promise<ResultadoDeAccion<Atencion>> {
  const resultado = await pedirConCuerpo<Atencion>(
    `${urlDeAtencion(id)}/anulacion`,
    "No se pudo anular la atención",
    conJson("POST", motivo.trim() ? { motivo: motivo.trim() } : {})
  )
  const codigo = codigoDelServidor(resultado.ok ? null : resultado.cuerpo)
  if (!resultado.ok && (codigo === CODIGO_CORREGIR_CON_AJUSTE || codigo === CODIGO_PAGADO_AL_LABORATORIO)) {
    return { ok: false, error: resultado.error, motivo: "corregir-con-ajuste" }
  }
  return conMotivo(resultado)
}
