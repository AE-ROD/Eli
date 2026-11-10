import { puedeEditarHorarioDe, puedeGestionarServicios, type Actor } from "@/lib/permisos"

/** Los pasos de la bienvenida del panel (`ModalBienvenida`). */
export type PasoDeBienvenida = "horario" | "servicios" | "enlace"

/**
 * Los pasos que quien entra puede hacer de verdad, en orden. La bienvenida
 * los mostraba a todos los roles, y al profesional le pedía "Agrega tus
 * servicios" en una Configuración donde no puede: lo decide `lib/permisos.ts`.
 *
 * - **Horario:** quien puede editar el general (dueña y encargado) o el suyo
 *   (el profesional, con su membresía). Sin membresía y sin gestionar, nada.
 * - **Servicios:** quien gestiona el catálogo.
 * - **Enlace:** todos; compartir la página de reservas no cambia nada.
 *
 * Sin actor (la sesión todavía no llegó, o no es válida), ninguno: el modal
 * no se abre con pasos que después no corresponden.
 */
export function pasosDeBienvenida(actor: Actor | null): PasoDeBienvenida[] {
  if (!actor) return []
  const suHorario = actor.memberId ? { id: actor.memberId, businessId: actor.businessId } : null
  const editaUnHorario = puedeEditarHorarioDe(actor, null) || (suHorario !== null && puedeEditarHorarioDe(actor, suHorario))
  return [
    ...(editaUnHorario ? (["horario"] as const) : []),
    ...(puedeGestionarServicios(actor) ? (["servicios"] as const) : []),
    "enlace",
  ]
}
