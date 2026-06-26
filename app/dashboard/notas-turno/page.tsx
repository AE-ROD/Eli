import { requirePermission } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { toZonedTime } from "date-fns-tz"
import { PaginaNotasTurno } from "./_components/paginaNotasTurno"

const DEFAULT_TZ = "America/Cancun"

export default async function NotasTurnoPage() {
  const { member, permissions } = await requirePermission("shiftNotes", "view")

  const negocio = await prisma.business.findUnique({
    where: { id: member.businessId },
    select: { timezone: true },
  })
  const tz = negocio?.timezone ?? DEFAULT_TZ
  const fechaHoy = toZonedTime(new Date(), tz).toISOString().slice(0, 10)

  const miembros = await prisma.businessMember.findMany({
    where: { businessId: member.businessId },
    select: { id: true, role: true, user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  })

  return (
    <PaginaNotasTurno
      memberIdActual={member.id}
      permissions={permissions}
      fechaInicial={fechaHoy}
      miembros={miembros.map((m) => ({ id: m.id, nombre: m.user.name, rol: m.role }))}
    />
  )
}
