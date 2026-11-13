import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { sesionDelServidor } from "@/lib/sesion-del-servidor"
import { actorDeSesion, puedeEditarComisiones, puedePagarAlLaboratorio } from "@/lib/permisos"
import { prisma } from "@/lib/prisma"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { PorPagarAlLaboratorioConfig } from "../_componentes/por-pagar-al-laboratorio"

/**
 * Comisiones › Por pagar al laboratorio: sólo la dueña de una clínica dental
 * (`puedePagarAlLaboratorio`). Fuera de una clínica, a Comisiones; sin ser la
 * dueña, al inicio. Los endpoints lo vuelven a mirar.
 */
export default async function PaginaPorPagarAlLaboratorio() {
  const actor = actorDeSesion(await sesionDelServidor())
  if (!actor) redirect("/iniciar-sesion")
  if (!puedePagarAlLaboratorio(actor)) redirect(puedeEditarComisiones(actor) ? "/dashboard/comisiones" : "/dashboard")
  // Las fechas, en la zona del negocio (como la ficha y la liquidación), no en la del dispositivo.
  const negocio = await prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
  const zona = zonaDelNegocio(negocio?.timezone)

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Por pagar al laboratorio"
        subtitulo="La parte del laboratorio de cada abono de prótesis, desde que la prótesis se entrega."
        mostrarBusqueda={false}
      />

      <div className="max-w-4xl space-y-5 px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <Link
          href="/dashboard/comisiones"
          className="inline-flex min-h-11 items-center gap-2 rounded-[12px] text-sm font-medium text-navy underline-offset-4 anillo-foco hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Comisiones
        </Link>
        <PorPagarAlLaboratorioConfig zona={zona} />
      </div>
    </div>
  )
}
