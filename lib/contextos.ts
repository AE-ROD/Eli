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

/**
 * El contexto con el que sigue la sesión, dado el que ya tenía (`elegido`).
 *
 * - Sin contexto (el login, o un token de antes de los contextos o que nunca
 *   eligió): el atajo de `contextoSinElegir`, el único si hay uno solo.
 * - Con un contexto: ése, si sigue entre los de la cuenta. Si ya no está (le
 *   borraron la membresía, dejó de ser dueña) la sesión queda SIN contexto y
 *   vuelve a elegir: nunca se pasa sola a otro negocio, aunque quede uno solo.
 *   Quien trabajaba en A y pierde A no tiene que aparecer escribiendo en B.
 */
export function contextoDeLaSesion(contextos: readonly Contexto[], elegido: unknown): Contexto | null {
  const sinElegir = elegido === undefined || elegido === null || elegido === ""
  return sinElegir ? contextoSinElegir(contextos) : buscarContexto(contextos, elegido)
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

// ─── Una pestaña del panel abierta con otro contexto ─────────────────────────

/**
 * La sesión (la cookie) es una sola para todas las pestañas: si en una se
 * cambia de negocio, otra que quedó abierta con el anterior seguiría
 * mostrando el negocio viejo pero escribiendo en el nuevo. El panel recuerda
 * con qué contexto se cargó (lo dibuja el servidor) y se recarga en cuanto
 * sabe que la sesión ya trabaja con otro (`BarraLateral`):
 *
 * - otra pestaña cargó el panel con otro contexto: lo anota en
 *   `localStorage` bajo esta clave y las demás lo oyen (`storage`), aunque
 *   estén en segundo plano;
 * - al volver a la pestaña, se mira esa clave en el acto, antes de que se
 *   alcance a tocar nada;
 * - la sesión cambió sin que se cargara el panel (la revalidación la dejó sin
 *   negocio): `useSession` la vuelve a leer al volver el foco y avisa.
 *
 * Se eligió esto y no una cabecera por pedido revisada en el servidor porque
 * no toca ningún endpoint (tampoco los públicos) y cubre lo que se ve en
 * pantalla, no sólo lo que se envía. El servidor sigue sin confiar en el
 * navegador: siempre escribe en el contexto de la sesión.
 */
export const CLAVE_DEL_CONTEXTO_DEL_PANEL = "eli:contexto-del-panel"

/**
 * Si la pestaña tiene que recargarse: `actual` es el contexto que dice la
 * sesión ahora (o la clave compartida). `undefined` es "no se sabe" (la
 * sesión todavía no llegó, no hay nada anotado): nunca recarga por eso. Sin
 * contexto (`null` o "") cuenta como un valor: si se cargó con uno y ahora no
 * hay ninguno, recarga y el proxy manda a elegir.
 */
export function cambioElContextoDelPanel(cargado: string | null, actual: string | null | undefined): boolean {
  if (actual === undefined) return false
  return (actual || null) !== (cargado || null)
}
