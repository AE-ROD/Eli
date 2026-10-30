import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { actorDeSesion, puedeEditarComisiones } from "@/lib/permisos"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { PantallaDeComisiones } from "./_componentes/pantalla-de-comisiones"

/**
 * Comisiones (#64, #35): sólo la dueña. El permiso se mira en el servidor:
 * sin él, de vuelta al inicio. Los endpoints lo vuelven a mirar (401).
 */
export default async function PaginaComisiones() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeEditarComisiones(actor)) redirect("/dashboard")

  return (
    <div className="min-h-dvh">
      <BarraSuperior titulo="Comisiones" subtitulo="El porcentaje de cada profesional, por servicio y por producto." mostrarBusqueda={false} />

      <div className="max-w-5xl px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <PantallaDeComisiones />
      </div>
    </div>
  )
}
