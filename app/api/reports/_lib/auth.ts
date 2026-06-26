import { checkPermission } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { DEFAULT_TZ } from "./dateRange"

/**
 * Variante de checkPermission que además resuelve el timezone del negocio,
 * necesario para interpretar correctamente los query params from/to.
 */
export async function checkPermissionWithBusiness(section: "reports", action: string) {
  const auth = await checkPermission(section, action)
  if (!auth) return null

  const business = await prisma.business.findUnique({
    where: { id: auth.member.businessId },
    select: { timezone: true },
  })

  return { ...auth, timezone: business?.timezone ?? DEFAULT_TZ }
}
