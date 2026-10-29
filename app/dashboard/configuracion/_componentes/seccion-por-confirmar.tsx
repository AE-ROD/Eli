import { prisma } from "@/lib/prisma"
import { puedeConfigurarPorConfirmar, type Actor } from "@/lib/permisos"
import { FormularioPorConfirmar } from "./formulario-por-confirmar"

/**
 * (servidor) "Reservas por confirmar" en Configuración (#84). Sólo la dueña
 * (`puedeConfigurarPorConfirmar`); a los demás no se les muestra. Lee su
 * propio dato para que `page.tsx` sólo tenga que montarla.
 */
export async function SeccionPorConfirmar({ actor }: { actor: Actor }) {
  if (!puedeConfigurarPorConfirmar(actor)) return null
  const negocio = await prisma.business.findUnique({
    where: { id: actor.businessId },
    select: { porConfirmarTrasFaltas: true },
  })
  if (!negocio) return null
  return (
    <div id="por-confirmar" className="scroll-mt-24">
      <FormularioPorConfirmar faltasIniciales={negocio.porConfirmarTrasFaltas} />
    </div>
  )
}
