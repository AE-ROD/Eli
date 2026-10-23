/**
 * La tarjeta "Invita a otro negocio" del inicio del panel: el enlace de
 * invitación del negocio y si ya sumó sus días por invitar
 * (`docs/PRODUCTO.md`, sección 4). Sólo la ve el dueño
 * (`puedeInvitarNegocios`, `lib/permisos.ts`).
 *
 * Este módulo no toca la base: lo usan el endpoint y la pantalla. La lógica
 * del premio vive en `lib/referidos.ts`.
 */

import { pedir, type Resultado } from "@/lib/peticiones"

/** Lo que devuelve `GET /api/dashboard/invitar`. Nada de los negocios invitados, salvo cuántos son. */
export interface DatosDeInvitacion {
  /** El código del enlace de invitación del propio negocio. */
  codigo: string
  /** Si ya sumó los días extra por un referido (se dan una sola vez). */
  yaSumoLosDias: boolean
  /** Cuántos negocios crearon su cuenta con el enlace. */
  registrados: number
}

/** El enlace que se comparte: crear-cuenta lee `?invita=`. */
export function enlaceDeInvitacion(origen: string, codigo: string): string {
  return `${origen}/crear-cuenta?invita=${encodeURIComponent(codigo)}`
}

const URL_DE_LA_INVITACION = "/api/dashboard/invitar"

export async function leerInvitacion(): Promise<Resultado<DatosDeInvitacion>> {
  return pedir<DatosDeInvitacion>(URL_DE_LA_INVITACION, "No se pudo cargar tu enlace de invitación")
}
