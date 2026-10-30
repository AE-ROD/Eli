import { prisma } from "@/lib/prisma"
import { puedeActivarFilaVirtual, type Actor } from "@/lib/permisos"
import { FormularioFilaVirtual } from "./formulario-fila-virtual"

/**
 * "Fila virtual" en Configuración (#85). Sólo la dueña la ve y la cambia
 * (`puedeActivarFilaVirtual`): para el resto no se muestra nada. Lee lo suyo
 * de la base, del negocio de la sesión, para que la página sólo tenga que
 * montarla.
 */
export async function SeccionFilaVirtual({ actor }: { actor: Actor }) {
  if (!puedeActivarFilaVirtual(actor)) return null

  const negocio = await prisma.business.findUnique({
    where: { id: actor.businessId },
    select: { slug: true, filaVirtualActiva: true, filaVirtualTope: true },
  })
  if (!negocio) return null

  return (
    <div id="fila-virtual" className="scroll-mt-24">
      <FormularioFilaVirtual slug={negocio.slug} activaInicial={negocio.filaVirtualActiva} topeInicial={negocio.filaVirtualTope} />
    </div>
  )
}
