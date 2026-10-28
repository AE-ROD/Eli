/**
 * Todo lo que la vista de equipo le pide al servidor. La pantalla llama a
 * estas funciones y no conoce ninguna URL.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * la pantalla está obligada a decidir qué mostrar cuando algo falla.
 */

import { pedir, pedirConCuerpo, conJson, type Resultado } from "@/lib/peticiones"

export interface MiembroDelEquipo {
  id: string
  role: string
  createdAt: string
  user: { id: string; name: string; email: string }
}

/** Una invitación que todavía nadie aceptó. */
export interface InvitacionPendiente {
  id: string
  name: string
  email: string
  role: string
  expiresAt: string
  createdAt: string
}

export interface Equipo {
  miembros: MiembroDelEquipo[]
  invitaciones: InvitacionPendiente[]
}

export interface DatosDeInvitacion {
  nombre: string
  email: string
  rol: "worker" | "admin"
}

export async function leerEquipo(): Promise<Resultado<Equipo>> {
  return pedir<Equipo>("/api/equipo", "No se pudo cargar el equipo")
}

/**
 * Por qué no se pudo invitar. Si el correo ya tiene una invitación vigente,
 * trae su id para ofrecer reenviarla en vez de crear otra.
 */
export type ResultadoDeInvitar = { ok: true } | { ok: false; error: string; invitacionVigenteId: string | null }

/**
 * Crea la invitación y le manda el correo con el enlace a la persona invitada.
 * Si ese correo tenía una invitación vencida, el servidor la reemplaza.
 */
export async function invitarAlEquipo(datos: DatosDeInvitacion): Promise<ResultadoDeInvitar> {
  const resultado = await pedirConCuerpo("/api/equipo", "Error al enviar la invitación", conJson("POST", datos))
  if (resultado.ok) return { ok: true }
  const cuerpo = resultado.cuerpo
  const invitacionVigenteId =
    resultado.codigo === 409 &&
    typeof cuerpo === "object" &&
    cuerpo !== null &&
    "invitacionId" in cuerpo &&
    typeof cuerpo.invitacionId === "string"
      ? cuerpo.invitacionId
      : null
  return { ok: false, error: resultado.error, invitacionVigenteId }
}

/** Manda de nuevo la invitación, con un enlace y siete días nuevos. El enlace anterior deja de servir. */
export async function reenviarInvitacion(id: string): Promise<Resultado> {
  return pedir(`/api/equipo/pendientes/${id}/reenviar`, "No se pudo reenviar la invitación", { method: "POST" })
}

/** Anula la invitación: el enlace deja de servir. */
export async function anularInvitacion(id: string): Promise<Resultado> {
  return pedir(`/api/equipo/pendientes/${id}`, "No se pudo anular la invitación", { method: "DELETE" })
}

/** Un servicio del catálogo, lo justo para elegir cuáles hace un profesional. */
export interface ServicioDelCatalogo {
  id: string
  name: string
  active: boolean
}

/** Qué servicios hace un profesional: todos (sin acotar) o sólo los de la lista. */
export type ServiciosDelMiembro = { todos: true; serviceIds: string[] } | { todos: false; serviceIds: string[] }

/** El catálogo de servicios del negocio, activos e inactivos. */
export async function leerCatalogoDeServicios(): Promise<Resultado<ServicioDelCatalogo[]>> {
  return pedir<ServicioDelCatalogo[]>("/api/configuracion/servicios", "No se pudieron cargar los servicios")
}

export async function leerServiciosDelMiembro(memberId: string): Promise<Resultado<ServiciosDelMiembro>> {
  return pedir<ServiciosDelMiembro>(
    `/api/equipo/miembros/${encodeURIComponent(memberId)}/servicios`,
    "No se pudieron cargar los servicios de esta persona"
  )
}

/** Guarda qué servicios hace: `null` es "todos". */
export async function guardarServiciosDelMiembro(
  memberId: string,
  serviceIds: string[] | null
): Promise<Resultado<ServiciosDelMiembro>> {
  return pedir<ServiciosDelMiembro>(
    `/api/equipo/miembros/${encodeURIComponent(memberId)}/servicios`,
    "No se pudieron guardar los servicios",
    conJson("PUT", serviceIds === null ? { todos: true } : { todos: false, serviceIds })
  )
}
