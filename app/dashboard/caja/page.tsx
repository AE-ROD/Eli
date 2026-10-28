import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { actorDeSesion, puedeVerCierresDeCaja } from "@/lib/permisos"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { EstadoVacio } from "@/components/panel/estado-vacio"

/**
 * Cierre de caja (#71): dueña y encargado.
 * Por ahora es un lugar reservado para que la entrada de la barra lateral no
 * lleve a un 404; la pantalla de verdad la trae su frente de la etapa 2. El
 * permiso se mira en el servidor: sin él, de vuelta al inicio.
 */
export default async function PaginaCaja() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeVerCierresDeCaja(actor)) redirect("/dashboard")

  return (
    <div className="min-h-dvh">
      <BarraSuperior titulo="Caja" subtitulo="Los cierres de caja del día." mostrarBusqueda={false} />

      <div className="max-w-4xl px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <EstadoVacio titulo="Próximamente">Esta sección está en camino.</EstadoVacio>
      </div>
    </div>
  )
}
