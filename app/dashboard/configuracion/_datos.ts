/**
 * Todo lo que la configuración le pide al servidor desde el navegador: el
 * horario de un miembro (leer y guardar) y el catálogo de servicios. Lo que se
 * ve al entrar ya viene resuelto por `page.tsx`, que es de servidor y consulta
 * la base directo.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * la pantalla está obligada a decidir qué mostrar cuando algo falla, también
 * cuando el servidor rechaza un horario o un servicio.
 */

import { pedir, conJson, type Resultado } from "@/lib/peticiones"

/** Un día del horario semanal: si se atiende y de qué hora a qué hora. */
export interface HorarioDelDia {
  id?: string
  /** 0 es domingo, como `Date.getDay()`. */
  dayOfWeek: number
  startTime: string
  endTime: string
  active: boolean
}

export interface Servicio {
  id: string
  name: string
  description: string | null
  duration: number
  price: number | null
  active: boolean
}

/** Lo que se carga en el modal de servicio. El precio es texto: así llega del campo. */
export interface DatosDeServicio {
  name: string
  description: string
  duration: number
  price: string
}

/**
 * Sin `memberId`, el endpoint opera sobre el horario propio de quien está en
 * sesión (el del dueño es el horario general del negocio).
 */
function rutaDelHorario(memberId: string | null): string {
  return memberId ? `/api/configuracion/horarios?memberId=${memberId}` : "/api/configuracion/horarios"
}

export async function leerHorario(memberId: string | null): Promise<Resultado<HorarioDelDia[]>> {
  return pedir<HorarioDelDia[]>(rutaDelHorario(memberId), "No se pudo cargar el horario")
}

export async function guardarHorario(memberId: string | null, horarios: HorarioDelDia[]): Promise<Resultado> {
  return pedir(rutaDelHorario(memberId), "No se pudo guardar el horario", conJson("POST", horarios))
}

/** Del formulario a lo que espera el servidor: descripción o precio vacíos no se mandan. */
function cuerpoDeServicio(datos: DatosDeServicio) {
  return {
    name: datos.name,
    description: datos.description || undefined,
    duration: datos.duration,
    price: datos.price ? parseFloat(datos.price) : undefined,
  }
}

/** Devuelve el servicio tal como quedó guardado. */
export async function crearServicio(datos: DatosDeServicio): Promise<Resultado<Servicio>> {
  return pedir<Servicio>(
    "/api/configuracion/servicios",
    "No se pudo crear el servicio",
    conJson("POST", cuerpoDeServicio(datos))
  )
}

/** Devuelve el servicio tal como quedó guardado. */
export async function editarServicio(id: string, datos: DatosDeServicio): Promise<Resultado<Servicio>> {
  return pedir<Servicio>(
    `/api/configuracion/servicios/${id}`,
    "No se pudo guardar el servicio",
    conJson("PUT", cuerpoDeServicio(datos))
  )
}

/** Un servicio inactivo no aparece en la página pública de reservas. */
export async function activarODesactivarServicio(id: string, activo: boolean): Promise<Resultado<Servicio>> {
  return pedir<Servicio>(
    `/api/configuracion/servicios/${id}`,
    activo ? "No se pudo activar el servicio" : "No se pudo desactivar el servicio",
    conJson("PUT", { active: activo })
  )
}

export async function borrarServicio(id: string): Promise<Resultado> {
  return pedir(`/api/configuracion/servicios/${id}`, "No se pudo borrar el servicio", { method: "DELETE" })
}
