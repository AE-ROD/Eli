import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { actorDeSesion, puedeGestionarEquipo } from "@/lib/permisos"
import { PantallaDeEquipo } from "./_componentes/pantalla-de-equipo"

/**
 * `/dashboard/equipo`: dueña y encargado (`puedeGestionarEquipo`, el mismo
 * permiso con que la barra lateral muestra la sección). Al profesional que
 * llega por la URL lo devuelve al panel, como la caja o la fila (#49): antes
 * veía "No autorizado" y el estado vacío. `/api/equipo` vuelve a mirar el
 * permiso (401).
 */
export default async function PaginaEquipo() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeGestionarEquipo(actor)) redirect("/dashboard")
  return <PantallaDeEquipo />
}
