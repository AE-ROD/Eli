import { requirePermission } from "@/lib/permissions"
import { PaginaCierreTurno } from "./_components/paginaCierreTurno"

export default async function CierreTurnoPage() {
  const { permissions } = await requirePermission("shiftClose", "view")

  return (
    <PaginaCierreTurno
      puedeVerTodo={permissions.shiftClose.viewAll}
      puedeCrear={permissions.shiftClose.create}
      puedeEditar={permissions.shiftClose.edit}
      puedeRevisar={permissions.shiftClose.review}
      puedeEliminar={permissions.shiftClose.delete}
    />
  )
}
