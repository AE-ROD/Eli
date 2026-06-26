import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ROLE_DEFAULTS, type PermissionSet, type SystemRole } from "./types"

export type { PermissionSet, SystemRole } from "./types"
export { ROLE_DEFAULTS } from "./types"

type SessionMember = NonNullable<Awaited<ReturnType<typeof getSessionMember>>>

// Obtiene el BusinessMember de la sesión actual, con su rol personalizado si tiene
export async function getSessionMember() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.businessId) return null

  const member = await prisma.businessMember.findFirst({
    where: {
      userId: session.user.id,
      businessId: session.user.businessId,
    },
    include: { customRole: true },
  })
  return member
}

// Resuelve el PermissionSet efectivo de un miembro.
// Prioridad: isOwner > customRole.permissions > permissions override > ROLE_DEFAULTS[role]
export function resolvePermissions(member: {
  role: string
  permissions: unknown
  customRole?: { permissions: unknown } | null
  isOwner: boolean
}): PermissionSet {
  if (member.isOwner) return ROLE_DEFAULTS.owner

  if (member.customRole?.permissions) {
    return member.customRole.permissions as PermissionSet
  }

  if (member.permissions) {
    return member.permissions as PermissionSet
  }

  const role = member.role as SystemRole
  return ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.viewer
}

export function can(permissions: PermissionSet, section: keyof PermissionSet, action: string): boolean {
  const sectionPerms = permissions[section] as Record<string, boolean>
  return sectionPerms?.[action] ?? false
}

// Guard para Server Components / route handlers — redirige si no hay sesión o permiso
export async function requirePermission(
  section: keyof PermissionSet,
  action: string,
  redirectTo = "/dashboard"
): Promise<{ member: SessionMember; permissions: PermissionSet }> {
  const member = await getSessionMember()
  if (!member) redirect("/iniciar-sesion")

  const permissions = resolvePermissions(member)
  if (!can(permissions, section, action)) redirect(redirectTo)

  return { member, permissions }
}

// Variante para route handlers de API — devuelve null en vez de redirigir
export async function checkPermission(
  section: keyof PermissionSet,
  action: string
): Promise<{ member: SessionMember; permissions: PermissionSet } | null> {
  const member = await getSessionMember()
  if (!member) return null

  const permissions = resolvePermissions(member)
  if (!can(permissions, section, action)) return null

  return { member, permissions }
}
