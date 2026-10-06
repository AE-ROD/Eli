/**
 * Todo lo que la vista de equipo le pide al servidor. La pantalla llama a
 * estas funciones y no conoce ninguna URL.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * la pantalla está obligada a decidir qué mostrar cuando algo falla.
 */

import { pedir, conJson, type Resultado } from "@/lib/peticiones"

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

/** Crea la invitación y le manda el correo con el enlace a la persona invitada. */
export async function invitarAlEquipo(datos: DatosDeInvitacion): Promise<Resultado> {
  return pedir("/api/equipo", "Error al enviar la invitación", conJson("POST", datos))
}
