import type { Rol } from "@/lib/permisos"
import { nombreDelRol } from "@/lib/nombres-de-roles"
import { nombreDeRubro } from "@/lib/rubros"

/**
 * Los contextos de una cuenta: con qué negocio y con qué rol puede trabajar en
 * una sesión (PRODUCTO.md, sección 5, "Una cuenta en varios negocios").
 *
 * - El negocio del que es dueña: rol `owner`, sin `memberId`.
 * - Cada membresía: rol `admin` o `worker`, con su `memberId`. También una
 *   membresía en su propio negocio: la dueña invitada como profesional de su
 *   negocio trabaja ahí como cualquier profesional (ve lo suyo y sus líneas
 *   llevan comisión). Es un contexto distinto del de dueña, con el mismo
 *   `businessId`.
 *
 * La sesión lleva el `id` del contexto elegido y `lib/auth.ts` lo vuelve a
 * buscar en esta lista, armada desde la base, en cada revalidación: nunca se
 * confía en un negocio o un rol que mande el navegador.
 *
 * Sin Prisma a propósito: se puede probar y usar sin base.
 */

export interface NegocioDeContexto {
  id: string
  name: string
  slug: string
  /** `Business.type`. Puede faltar en un usuario armado a mano (pruebas): queda sin rubro, no dental. */
  type?: string | null
}

/** Lo que hace falta del usuario: su negocio propio y sus membresías, con su negocio. */
export interface UsuarioConContextos {
  business: NegocioDeContexto | null
  memberships: readonly { id: string; role: string; business: NegocioDeContexto }[]
}

export interface Contexto {
  /** `dueño:<businessId>` o `miembro:<memberId>`. Estable mientras exista lo que nombra. */
  id: string
  rol: Rol
  businessId: string
  businessName: string
  businessSlug: string
  rubro: string | null
  /** Null sólo en el contexto de dueña: la dueña no es miembro del equipo. */
  memberId: string | null
}

const PREFIJO_DUEÑA = "dueño:"
const PREFIJO_MIEMBRO = "miembro:"

/** Cuántos contextos se leen como máximo: nadie trabaja en cien negocios. */
export const MAXIMO_DE_CONTEXTOS = 100

export function idDeContextoDeDueña(businessId: string): string {
  return `${PREFIJO_DUEÑA}${businessId}`
}

export function idDeContextoDeMiembro(memberId: string): string {
  return `${PREFIJO_MIEMBRO}${memberId}`
}

/**
 * Todos los contextos de la cuenta, el de dueña primero y después las
 * membresías en el orden en que llegan (la más antigua primero). Una
 * membresía con un rol que no es `admin` cuenta como `worker`, el rol con
 * menos permisos.
 */
export function contextosDe(usuario: UsuarioConContextos): Contexto[] {
  const contextos: Contexto[] = []
  if (usuario.business) {
    contextos.push({
      id: idDeContextoDeDueña(usuario.business.id),
      rol: "owner",
      businessId: usuario.business.id,
      businessName: usuario.business.name,
      businessSlug: usuario.business.slug,
      rubro: usuario.business.type ?? null,
      memberId: null,
    })
  }
  for (const membresia of usuario.memberships) {
    contextos.push({
      id: idDeContextoDeMiembro(membresia.id),
      rol: membresia.role === "admin" ? "admin" : "worker",
      businessId: membresia.business.id,
      businessName: membresia.business.name,
      businessSlug: membresia.business.slug,
      rubro: membresia.business.type ?? null,
      memberId: membresia.id,
    })
  }
  return contextos
}

/** El contexto con ese id entre los de la cuenta, o `null`. Un id que no es texto no encuentra nada. */
export function buscarContexto(contextos: readonly Contexto[], id: unknown): Contexto | null {
  if (typeof id !== "string" || !id) return null
  return contextos.find((contexto) => contexto.id === id) ?? null
}

/**
 * Con qué contexto se entra sin elegir: el único, si hay uno solo. Con varios
 * no se adivina (la cuenta elige en `/elegir-negocio`), y sin ninguno no hay
 * negocio (completar el perfil).
 */
export function contextoSinElegir(contextos: readonly Contexto[]): Contexto | null {
  return contextos.length === 1 ? contextos[0] : null
}

/** El rol en palabras, con el vocabulario del rubro: "Dueño", "Encargado", "Profesional" u "Odontólogo". */
export function nombreDelRolDelContexto(contexto: Pick<Contexto, "rol" | "rubro">): string {
  return contexto.rol === "owner" ? "Dueño" : nombreDelRol(contexto.rol, contexto.rubro)
}

/** Lo que muestra la pantalla de elegir: nombre del negocio, rubro y rol en palabras. Nada más sale al navegador. */
export interface OpcionDeContexto {
  id: string
  negocio: string
  rubro: string
  rol: string
}

export function opcionDeContexto(contexto: Contexto): OpcionDeContexto {
  return {
    id: contexto.id,
    negocio: contexto.businessName,
    rubro: nombreDeRubro(contexto.rubro ?? ""),
    rol: nombreDelRolDelContexto(contexto),
  }
}
