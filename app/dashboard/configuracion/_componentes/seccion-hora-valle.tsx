import { prisma } from "@/lib/prisma"
import { puedeConfigurarHoraValle, type Actor } from "@/lib/permisos"
import { FormularioHoraValle } from "./formulario-hora-valle"

/**
 * (servidor) "Precios de hora valle" en Configuración (#89c). Sólo la dueña
 * (`puedeConfigurarHoraValle`); a los demás no se les muestra. Lee sus
 * propios datos, siempre con el `businessId` de la sesión, para que
 * `page.tsx` sólo tenga que montarla.
 */
export async function SeccionHoraValle({ actor }: { actor: Actor }) {
  if (!puedeConfigurarHoraValle(actor)) return null
  const [negocio, franjas, servicios] = await Promise.all([
    prisma.business.findUnique({ where: { id: actor.businessId }, select: { horaValleActiva: true } }),
    prisma.franjaDeHoraValle.findMany({
      where: { businessId: actor.businessId },
      select: { dayOfWeek: true, desde: true, hasta: true, porcentaje: true },
      orderBy: [{ dayOfWeek: "asc" }, { desde: "asc" }],
    }),
    prisma.service.findMany({
      where: { businessId: actor.businessId, active: true },
      select: { id: true, name: true, excluidoDeHoraValle: true },
      orderBy: { createdAt: "asc" },
    }),
  ])
  if (!negocio) return null
  return (
    <div id="hora-valle" className="scroll-mt-24">
      <FormularioHoraValle
        activaInicial={negocio.horaValleActiva}
        franjasIniciales={franjas}
        serviciosIniciales={servicios.map((servicio) => ({
          id: servicio.id,
          nombre: servicio.name,
          excluido: servicio.excluidoDeHoraValle,
        }))}
      />
    </div>
  )
}
