import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { actorDeSesion, puedeVerPantallaDeFila } from "@/lib/permisos"
import { PantallaDeFila } from "./_componentes/pantalla-de-fila"

export const metadata: Metadata = { title: "Pantalla de la fila" }

/**
 * `/dashboard/fila`: la pantalla de la fila virtual para el televisor o la
 * tablet del local (#85). Con sesión, para dueña y encargado
 * (`puedeVerPantallaDeFila`); al profesional lo devuelve al panel. Los datos
 * los trae el navegador de `/api/fila-virtual/pantalla`, que vuelve a mirar
 * el permiso, y se refrescan solos.
 */
export default async function PaginaPantallaDeFila() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeVerPantallaDeFila(actor)) redirect("/dashboard")
  return <PantallaDeFila />
}
