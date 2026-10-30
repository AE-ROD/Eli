/**
 * Todo lo que la vista de clientes le pide al servidor. La pantalla llama a
 * estas funciones y no conoce ninguna URL.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * la pantalla está obligada a decidir qué mostrar cuando algo falla, también
 * cuando unas notas no se guardan.
 */

import { pedir, conJson, leerCuerpo, SIN_CONEXION, type Resultado } from "@/lib/peticiones"

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
  /** Cuándo aceptó recibir avisos y novedades por correo, o `null` si no (o se dio de baja). */
  correoPromoConsentAt: string | null
  createdAt: string
  appointments: CitaDeCliente[]
  /** Atenciones cobradas: las cuenta el servidor, no el historial (que trae cinco). */
  visitas: number
  /** Citas marcadas "No vino": también las cuenta el servidor. */
  inasistencias: number
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
  /**
   * "Quiere recibir avisos y novedades por correo" (promocional: "te toca" y
   * reseñas). Desmarcarlo en un cliente que lo tenía es darlo de baja.
   */
  aceptaCorreoPromo: boolean
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
      // Sólo marcado: la profesional crea clientes, pero no da este consentimiento.
      correoPromoConsent: datos.aceptaCorreoPromo || undefined,
    })
  )
}

export async function guardarNotasDeCliente(id: string, notas: string): Promise<Resultado> {
  return pedir(`/api/clientes/${id}`, "No se pudieron guardar las notas", conJson("PUT", { notes: notas }))
}

/**
 * Cambia el nombre, el correo, el teléfono y los consentimientos de WhatsApp y
 * de avisos por correo. Un
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
      correoPromoConsent: datos.aceptaCorreoPromo,
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

/** Una fila del CSV que no se importó, con su número en la planilla (la cabecera es la 1). */
export interface FilaOmitida {
  fila: number
  motivo: string
}

/** Lo que responde el servidor al importar un CSV. */
export interface ResumenDeImportacion {
  creados: number
  duplicados: FilaOmitida[]
  errores: FilaOmitida[]
}

/**
 * Manda el CSV (ya en texto) y qué columna es cada dato. El servidor vuelve a
 * leerlo y valida todo: lo que se vio en la vista previa no se da por bueno.
 */
export async function importarClientes(
  csv: string,
  mapeo: Partial<Record<string, number>>
): Promise<Resultado<ResumenDeImportacion>> {
  return pedir("/api/clientes/importar", "No se pudo importar el archivo", conJson("POST", { csv, mapeo }))
}

/** El nombre que manda el servidor en `Content-Disposition`, o el de respaldo. */
function nombreDelAdjunto(respuesta: Response, respaldo: string): string {
  const cabecera = respuesta.headers.get("Content-Disposition") ?? ""
  return /filename="([^"]+)"/.exec(cabecera)?.[1] ?? respaldo
}

/**
 * Pide una planilla y la descarga en el navegador. Con `fetch` y no con un
 * enlace: si el servidor dice que no (un rango inválido, el límite de
 * descargas), la pantalla muestra el motivo en vez de abrir un JSON.
 */
async function descargar(url: string, respaldo: string, errorPorDefecto: string): Promise<Resultado> {
  try {
    const respuesta = await fetch(url)
    if (!respuesta.ok) {
      const cuerpo = (await leerCuerpo(respuesta)) as { error?: unknown } | null
      return { ok: false, error: typeof cuerpo?.error === "string" ? cuerpo.error : errorPorDefecto }
    }
    const archivo = await respuesta.blob()
    const enlace = document.createElement("a")
    enlace.href = URL.createObjectURL(archivo)
    enlace.download = nombreDelAdjunto(respuesta, respaldo)
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    // Después del clic: el navegador ya tomó el archivo.
    setTimeout(() => URL.revokeObjectURL(enlace.href), 0)
    return { ok: true, datos: undefined }
  } catch {
    return { ok: false, error: SIN_CONEXION }
  }
}

/** Todos los clientes del negocio, en CSV para Excel. Sólo dueño y encargado. */
export async function exportarClientes(): Promise<Resultado> {
  return descargar("/api/clientes/exportar", "clientes.csv", "No se pudo descargar la planilla de clientes")
}

/** Las atenciones que llegaron entre dos días (incluidos, "AAAA-MM-DD"), en CSV. Sólo dueño y encargado. */
export async function exportarAtenciones(desde: string, hasta: string): Promise<Resultado> {
  const parametros = new URLSearchParams({ desde, hasta })
  return descargar(`/api/atenciones/exportar?${parametros}`, "atenciones.csv", "No se pudo descargar la planilla de atenciones")
}

// ─── Clientes que se están yendo (#76) ──────────────────────────────────────

/** Un cliente que se está yendo, como lo devuelve `/api/clientes/se-van`. */
export interface ClienteQueSeVa {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
  /** E.164 (`+56987654321`). */
  telefono: string | null
  /** "AAAA-MM-DD" de su última visita, en la zona del negocio. */
  ultimaVisita: string
  diasSinVenir: number
  /** Cada cuántos días suele venir. */
  ciclo: number
  /** "propio": la mediana de sus visitas; "servicio": la frecuencia del servicio. */
  origenDelCiclo: "propio" | "servicio"
  ultimoServicio: string | null
}

export interface ListaDeQuienesSeVan {
  clientes: ClienteQueSeVa[]
  /** Cuántos son en total: la lista trae hasta 200. */
  total: number
  /** Cuántos días sale de la lista alguien después de "Escribirle". */
  diasOcultoTrasContacto: number
}

/** Sólo dueña y encargado: a la profesional el servidor le responde 401. */
export async function leerClientesQueSeVan(): Promise<Resultado<ListaDeQuienesSeVan>> {
  return pedir<ListaDeQuienesSeVan>("/api/clientes/se-van", "No se pudo cargar la lista de clientes que se están yendo")
}

/**
 * Anota que se le escribió (por WhatsApp o correo, a mano). Cuenta en
 * "Mensajes de este mes" y saca la fila de la lista unos días.
 */
export async function registrarContacto(id: string): Promise<Resultado<{ vuelveALaListaEl: string }>> {
  return pedir<{ vuelveALaListaEl: string }>(`/api/clientes/${id}/contacto`, "No se pudo anotar el contacto", { method: "POST" })
}
