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

import type { EstadoActivo, PagoPedido } from "@/lib/atenciones"
import type { LineaGuardada, LineaPedida, ReservaDeOrigen } from "@/lib/acciones-del-tablero"
import { rangoDelDia } from "@/lib/fechas"
import { conJson, pedir, pedirConCodigo, type Resultado, type ResultadoConCodigo } from "@/lib/peticiones"

// ─── Lo que devuelve el servidor ─────────────────────────────────────────────

/**
 * Una línea de la atención: servicio, quién lo hizo y a qué precio.
 * `servicioId` en null: el servicio se borró del catálogo (el nombre quedó
 * copiado). `profesional.id` en null: quien lo hizo dejó el equipo, y hay que
 * reasignarla antes de cobrar.
 */
export type LineaDeServicio = LineaGuardada

export interface PagoRegistrado {
  id: string
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
   * no tiene servicios. `null` si no nació de una, si la cita se borró o si
   * quien mira no ve esa cita.
   */
  reserva: ReservaDeOrigen | null
  notas: string | null
  llegoEn: string
  empezoEn: string | null
  terminoEn: string | null
  cobradaEn: string | null
  anuladaEn: string | null
  motivoDeAnulacion: string | null
  /** Al profesional le llegan sólo las suyas. */
  lineas: LineaDeServicio[]
  /**
   * Sólo para dueño y encargado: al profesional la clave no le llega. En una
   * atención abierta es la suma viva de las líneas; en una cobrada, la que
   * quedó congelada al cobrar.
   */
  total?: number
  pagos?: PagoRegistrado[]
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

/** Lo que se puede elegir en el tablero: ya viene recortado según quién mira. */
export interface Catalogo {
  /** Sólo los activos. */
  servicios: ServicioDelCatalogo[]
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
 * - `otro`: cualquier otro motivo; se muestra el mensaje y nada más.
 */
export type MotivoDeFallo = "desactualizada" | "falta-requisito" | "otro"

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
 * El tablero del día que contiene a `hoy`: de 00:00 a 00:00 del día
 * siguiente en la hora del dispositivo, enviado como instantes ISO. El
 * servidor no sabe en qué huso está el local; el navegador sí.
 */
export async function leerTablero(hoy: Date): Promise<Resultado<Tablero>> {
  const { desde, hasta } = rangoDelDia(hoy)
  const parametros = new URLSearchParams({ desde: desde.toISOString(), hasta: hasta.toISOString() })
  return pedir<Tablero>(`${URL_DE_ATENCIONES}?${parametros}`, "No se pudo cargar el tablero")
}

/** Hasta ocho clientes cuyo nombre, correo o teléfono contiene `texto`. */
export async function buscarClientes(texto: string): Promise<Resultado<ClienteEncontrado[]>> {
  const parametros = new URLSearchParams({ q: texto, limite: "8" })
  const resultado = await pedir<{
    clientes: { id: string; name: string; lastName: string | null; email: string | null; phone: string | null }[]
  }>(`/api/clientes?${parametros}`, "No se pudieron buscar los clientes")
  if (!resultado.ok) return resultado

  return {
    ok: true,
    datos: resultado.datos.clientes.map((cliente) => ({
      id: cliente.id,
      // Nombre y apellido, como queda escrito en la atención: "María González".
      nombre: [cliente.name, cliente.lastName].filter(Boolean).join(" "),
      detalle: cliente.phone ?? cliente.email ?? "",
    })),
  }
}

// ─── Acciones ────────────────────────────────────────────────────────────────

/**
 * Llegó alguien con reserva: la cita entra al tablero como atención en espera.
 * Una reserva de otro día da 409 con un mensaje para mostrar.
 */
export async function marcarLlegada(citaId: string): Promise<ResultadoDeAccion<Atencion>> {
  return conMotivo(
    await pedirConCodigo<Atencion>(URL_DE_ATENCIONES, "No se pudo marcar la llegada", conJson("POST", { citaId }))
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
export async function guardarServicios(id: string, lineas: LineaPedida[]): Promise<ResultadoDeAccion<Atencion>> {
  return conMotivo(
    await pedirConCodigo<Atencion>(urlDeAtencion(id), "No se pudieron guardar los servicios", conJson("PUT", { lineas }))
  )
}

/** Mueve la atención a otra columna activa, de a un paso. */
export async function moverAtencion(id: string, estado: EstadoActivo): Promise<ResultadoDeAccion<Atencion>> {
  return conMotivo(
    await pedirConCodigo<Atencion>(`${urlDeAtencion(id)}/estado`, "No se pudo mover la atención", conJson("POST", { estado }))
  )
}

/** Cobra la atención: los pagos tienen que sumar el total. Con total cero, sin pagos. */
export async function cobrarAtencion(id: string, pagos: PagoPedido[]): Promise<ResultadoDeAccion<Atencion>> {
  return conMotivo(
    await pedirConCodigo<Atencion>(`${urlDeAtencion(id)}/cobro`, "No se pudo registrar el cobro", conJson("POST", { pagos }))
  )
}

/** Anula la atención. Queda en el historial como anulada y deja de sumar. */
export async function anularAtencion(id: string, motivo: string): Promise<ResultadoDeAccion<Atencion>> {
  return conMotivo(
    await pedirConCodigo<Atencion>(
      `${urlDeAtencion(id)}/anulacion`,
      "No se pudo anular la atención",
      conJson("POST", motivo.trim() ? { motivo: motivo.trim() } : {})
    )
  )
}
