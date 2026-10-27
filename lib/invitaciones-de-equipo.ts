import { prisma } from "@/lib/prisma"
import { enviarInvitacionTrabajador } from "@/lib/email"
import { generarToken } from "@/lib/tokens"

/**
 * (servidor) Las invitaciones al equipo: cuánto duran, cuándo están vencidas
 * y cómo se manda el enlace. Lo usan invitar (`POST /api/equipo`), que
 * reemplaza una invitación vencida, y reenviar
 * (`POST /api/equipo/pendientes/[id]/reenviar`).
 */

/** Días que vale el enlace. El correo dice "expira en 7 días". */
export const DIAS_DE_VIGENCIA = 7

/** Cuándo vence una invitación que se manda ahora. */
export function vencimientoDesde(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() + DIAS_DE_VIGENCIA * 24 * 60 * 60 * 1000)
}

/**
 * Si el enlace ya no sirve. Mismo criterio que aceptar la invitación
 * (`/api/equipo/invitacion/[token]/aceptar`), que pide `expiresAt > ahora`.
 */
export function estaVencida(invitacion: { expiresAt: Date }, ahora: Date = new Date()): boolean {
  return invitacion.expiresAt.getTime() <= ahora.getTime()
}

/**
 * Los campos de una invitación que pueden salir en una respuesta. Nunca el
 * hash del token: ni se pide.
 */
export const CAMPOS_DE_INVITACION = {
  id: true,
  name: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
} as const

/**
 * Un enlace nuevo: el token en claro (va sólo en el correo), su hash (va a la
 * base, `lib/tokens.ts`) y el vencimiento.
 */
export function enlaceNuevo(ahora: Date = new Date()) {
  return { ...generarToken(), expiresAt: vencimientoDesde(ahora) }
}

interface DatosDelCorreo {
  token: string
  businessId: string
  /** Por si el negocio no se encuentra: el nombre que trae la sesión. */
  nombreDeRespaldo: string
  email: string
  nombre: string
  rol: string
}

/**
 * Manda el correo con el enlace. Si el envío falla no se corta nada: la
 * invitación ya quedó guardada y se puede reenviar.
 */
export async function mandarCorreoDeInvitacion(datos: DatosDelCorreo): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const negocio = await prisma.business.findUnique({ where: { id: datos.businessId }, select: { name: true } })

  await enviarInvitacionTrabajador({
    emailTrabajador: datos.email,
    nombreTrabajador: datos.nombre,
    nombreNegocio: negocio?.name ?? datos.nombreDeRespaldo,
    rol: datos.rol,
    enlaceAceptar: `${baseUrl}/unirse/${datos.token}`,
  }).catch(() => null)
}

/**
 * La clave del límite de reenvíos (`reenvioDeInvitacion`): por negocio y por
 * casilla de destino, sin mayúsculas, que es lo que se quiere proteger.
 */
export function claveDeReenvio(businessId: string, email: string): string {
  return `${businessId}:${email.trim().toLowerCase()}`
}
