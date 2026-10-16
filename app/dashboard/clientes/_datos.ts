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
  createdAt: string
  appointments: CitaDeCliente[]
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

export interface DatosDeNuevoCliente {
  nombre: string
  email: string
  telefono: string
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
    })
  )
}

export async function guardarNotasDeCliente(id: string, notas: string): Promise<Resultado> {
  return pedir(`/api/clientes/${id}`, "No se pudieron guardar las notas", conJson("PUT", { notes: notas }))
}
