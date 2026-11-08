import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { authOptions } from "@/lib/auth"
import { actorDeSesion, puedeConfigurarRepartoDeProtesis, puedeEditarComisiones } from "@/lib/permisos"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { RepartoDeProtesisConfig } from "../_componentes/reparto-de-protesis"

/**
 * Comisiones › Reparto de prótesis: sólo la dueña de una clínica dental. El
 * permiso se mira en el servidor (`puedeConfigurarRepartoDeProtesis`): fuera
 * de una clínica, a Comisiones; sin ser la dueña, al inicio. Los endpoints lo
 * vuelven a mirar.
 */
export default async function PaginaRepartoDeProtesis() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeConfigurarRepartoDeProtesis(actor)) redirect(puedeEditarComisiones(actor) ? "/dashboard/comisiones" : "/dashboard")

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Reparto de prótesis"
        subtitulo="Cuánto recibe cada parte según el material. Aplica a las prótesis nuevas; las creadas antes mantienen su regla."
        mostrarBusqueda={false}
      />

      <div className="max-w-5xl space-y-5 px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <Link
          href="/dashboard/comisiones"
          className="inline-flex min-h-11 items-center gap-2 rounded-[12px] text-sm font-medium text-navy underline-offset-4 anillo-foco hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Comisiones
        </Link>
        <RepartoDeProtesisConfig />
      </div>
    </div>
  )
}
