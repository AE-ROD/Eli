import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { actorDeSesion } from "@/lib/permisos"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { CentroDeAyuda } from "@/components/soporte/centro-de-ayuda"

/**
 * Ayuda del panel: el centro de ayuda con sesión, para todos los roles. El
 * servidor toma de la sesión quién escribe y de qué negocio, así que el
 * formulario no los pide.
 */
export default async function PaginaAyuda() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) redirect("/iniciar-sesion")

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Centro de ayuda"
        subtitulo="Busca una respuesta o escríbenos: te respondemos por correo."
        mostrarBusqueda={false}
      />

      <div className="max-w-4xl px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <CentroDeAyuda conSesion emailDeSesion={session?.user?.email ?? undefined} />
      </div>
    </div>
  )
}
