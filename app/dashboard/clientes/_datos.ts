/**
 * Todo lo que la vista de clientes le pide al servidor. La pantalla llama a
 * estas funciones y no conoce ninguna URL.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * la pantalla está obligada a decidir qué mostrar cuando algo falla, también
 * cuando unas notas no se guardan.
 */

import { pedir, conJson, type Resultado } from "@/lib/peticiones"

/** Una cita del historial de un cliente: el listado trae las últimas cinco. */
export interface CitaDeCliente {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string
  price: number | null
}

/** Un cliente tal como lo devuelve el servidor, con sus últimas citas. */
export interface Cliente {
  id: string
  name: string
  email: string | null
  phone: string | null
  tags: string[]
  notes: string | null
  /** Cuándo aceptó recibir mensajes por WhatsApp, o `null` si no lo aceptó. */
  whatsappConsentAt: string | null
  createdAt: string
  appointments: CitaDeCliente[]
  /** Atenciones cobradas: las cuenta el servidor, no el historial (que trae cinco). */
  visitas: number
  /** Cuándo llegó a su última atención cobrada, o `null` si nunca vino. */
  ultimaVisita: string | null
  /** Su próxima cita pendiente o confirmada, o `null` si no tiene. */
  proximaCita: string | null
}

/** Una página del listado, y cuántos clientes hay en total con ese filtro. */
export interface PaginaDeClientes {
  clientes: Cliente[]
  total: number
  pagina: number
  paginas: number
}

export interface FiltroDeClientes {
  busqueda: string
  /** `"Todos"` no filtra por etiqueta. */
  etiqueta: string
  pagina: number
}

/** Lo que se escribe en el formulario de un cliente, nuevo o editado. */
export interface DatosDeNuevoCliente {
  nombre: string
  email: string
  telefono: string
  /** "Acepta recibir mensajes por WhatsApp". El servidor anota cuándo y que fue desde el panel. */
  aceptaWhatsapp: boolean
}

/** Cuántos clientes trae cada página: seis filas de tres en la grilla. */
const CLIENTES_POR_PAGINA = 18

export async function leerClientes({ busqueda, etiqueta, pagina }: FiltroDeClientes): Promise<Resultado<PaginaDeClientes>> {
  const parametros = new URLSearchParams({ pagina: String(pagina), limite: String(CLIENTES_POR_PAGINA) })
  if (busqueda) parametros.set("q", busqueda)
  if (etiqueta && etiqueta !== "Todos") parametros.set("tag", etiqueta)

  return pedir<PaginaDeClientes>(`/api/clientes?${parametros}`, "No se pudieron cargar los clientes")
}

export async function crearCliente(datos: DatosDeNuevoCliente): Promise<Resultado> {
  return pedir(
    "/api/clientes",
    "No se pudo crear el cliente",
    conJson("POST", {
      name: datos.nombre,
      email: datos.email || undefined,
      phone: datos.telefono || undefined,
      whatsappConsent: datos.aceptaWhatsapp,
    })
  )
}

export async function guardarNotasDeCliente(id: string, notas: string): Promise<Resultado> {
  return pedir(`/api/clientes/${id}`, "No se pudieron guardar las notas", conJson("PUT", { notes: notas }))
}

/**
 * Cambia el nombre, el correo, el teléfono y el consentimiento de WhatsApp. Un
 * campo vacío borra el dato (salvo el nombre, que es obligatorio). Sólo dueño
 * y encargado.
 */
export async function editarCliente(id: string, datos: DatosDeNuevoCliente): Promise<Resultado> {
  return pedir(
    `/api/clientes/${id}`,
    "No se pudo guardar el cliente",
    conJson("PUT", {
      name: datos.nombre,
      email: datos.email,
      phone: datos.telefono,
      whatsappConsent: datos.aceptaWhatsapp,
    })
  )
}

/**
 * Elimina al cliente: borra sus datos personales y deja sus citas y cobros,
 * para que los reportes no cambien. Sólo dueño y encargado.
 */
export async function eliminarCliente(id: string): Promise<Resultado> {
  return pedir(`/api/clientes/${id}`, "No se pudo eliminar el cliente", { method: "DELETE" })
}
