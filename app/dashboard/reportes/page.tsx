import { requirePermission } from "@/lib/permissions"
import { PaginaReportes } from "./_components/paginaReportes"

export default async function ReportesPage() {
  const { permissions } = await requirePermission("reports", "view")

  return (
    <PaginaReportes
      puedeVerIngresos={permissions.reports.viewRevenue}
      puedeVerStaff={permissions.reports.viewStaff}
      puedeProgramar={permissions.reports.schedule}
      puedeExportar={permissions.reports.export}
    />
  )
}
