import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { actorDeSesion, puedeVerCierresDeCaja } from "@/lib/permisos"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { PantallaDeCaja } from "./_componentes/pantalla-de-caja"

/**
 * Cierre de caja (#71): dueña y encargado. El permiso se mira en el
 * servidor: sin él, de vuelta al inicio. El endpoint lo vuelve a mirar (401).
 */
export default async function PaginaCaja() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeVerCierresDeCaja(actor)) redirect("/dashboard")

  return (
    <div className="min-h-dvh">
      <BarraSuperior titulo="Caja" subtitulo="Lo que entró en efectivo y los cierres de caja." mostrarBusqueda={false} />

      <div className="max-w-4xl px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <PantallaDeCaja />
      </div>
    </div>
  )
}
