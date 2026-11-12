import type { ReactNode } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, whereDeSedes } from "@/lib/permisos"
import { planConocido } from "@/lib/planes"
import { MAX_SEDES, modoDeSedes, ordenarSedes } from "@/lib/sedes"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { ProveedorDeSedes } from "./_componentes/sedes-de-la-agenda"
import { ProveedorDeZona } from "./_componentes/zona-del-negocio"
import { SIN_SEDES, type SedesDeLaAgenda } from "./_sedes"

/**
 * La agenda se lee y se escribe en la hora del negocio, no en la del
 * navegador (#99). La zona sale de `Business.timezone` del negocio de la
 * sesión (nunca de otro) y llega a la pantalla por contexto. Sin sesión o con
 * una zona inválida, la de por defecto.
 *
 * Con sedes (etapa 9, plan Independiente) llegan igual las del negocio de la
 * sesión, con el modo (`modoDeSedes`: "varias" con dos o más sedes activas).
 * Se leen con `whereDeSedes` (el `businessId` del actor) y sólo las activas:
 * son las que se ofrecen al agendar. Con una sola sede o ninguna, o si la
 * lectura falla, la agenda queda como siempre.
 */
export default async function LayoutDeLaAgenda({ children }: { children: ReactNode }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  const negocio = actor
    ? await prisma.business
        .findUnique({ where: { id: actor.businessId }, select: { timezone: true, plan: true } })
        // Si la lectura falla, la agenda sigue con la zona por defecto.
        .catch(() => null)
    : null

  // El plan sale de la base, no de la sesión (que puede ir un paso atrás); un plan que no se conoce no tiene sedes.
  const sedesActivas =
    actor && planConocido(negocio?.plan) === "independiente"
      ? await prisma.sede
          .findMany({
            where: whereDeSedes(actor, { activo: true }),
            select: { id: true, nombre: true, orden: true, activo: true },
            take: MAX_SEDES + 1,
          })
          .catch(() => [])
      : []
  const sedes: SedesDeLaAgenda = actor
    ? {
        modo: modoDeSedes(negocio?.plan, sedesActivas),
        sedes: ordenarSedes(sedesActivas).map(({ id, nombre }) => ({ id, nombre })),
      }
    : SIN_SEDES

  return (
    <ProveedorDeZona zona={zonaDelNegocio(negocio?.timezone)}>
      <ProveedorDeSedes sedes={sedes}>{children}</ProveedorDeSedes>
    </ProveedorDeZona>
  )
}
