import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { PaginaReporteDetalle } from "./_components/paginaReporteDetalle"

const TIPOS_VALIDOS = ["ingresos", "citas", "servicios", "trabajadores", "clientes", "ocupacion", "cierres"] as const
export type TipoReporte = (typeof TIPOS_VALIDOS)[number]

const DEFAULT_TZ = "America/Cancun"

export default async function ReporteDetallePage({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params

  if (!TIPOS_VALIDOS.includes(tipo as TipoReporte)) {
    notFound()
  }

  const { member, permissions } = await requirePermission("reports", "view")

  if (tipo === "ingresos" && !permissions.reports.viewRevenue) {
    notFound()
  }
  if (tipo === "trabajadores" && !permissions.reports.viewStaff) {
    notFound()
  }

  const [business, members, services] = await Promise.all([
    prisma.business.findUnique({ where: { id: member.businessId }, select: { timezone: true } }),
    prisma.businessMember.findMany({
      where: { businessId: member.businessId },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.service.findMany({
      where: { businessId: member.businessId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  return (
    <PaginaReporteDetalle
      tipo={tipo as TipoReporte}
      timezone={business?.timezone ?? DEFAULT_TZ}
      puedeProgramar={permissions.reports.schedule}
      trabajadores={members.map((m) => ({ id: m.id, nombre: m.user.name }))}
      servicios={services.map((s) => ({ id: s.id, nombre: s.name }))}
    />
  )
}
