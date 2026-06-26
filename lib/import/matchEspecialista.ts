import type { PrismaClient } from "@prisma/client"
import { normalizarNombre } from "./normalizar"

export async function matchEspecialista(
  nombreNorm: string,
  businessId: string,
  prisma: PrismaClient
): Promise<{ id: string } | null> {
  const miembros = await prisma.businessMember.findMany({
    where: { businessId },
    select: {
      id: true,
      user: { select: { name: true } },
    },
  })

  const match = miembros.find((miembro) => normalizarNombre(miembro.user.name) === nombreNorm)
  return match ? { id: match.id } : null
}
