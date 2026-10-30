import type { ReactNode } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion } from "@/lib/permisos"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { ProveedorDeZona } from "./_componentes/zona-del-negocio"

/**
 * La agenda se lee y se escribe en la hora del negocio, no en la del
 * navegador (#99). La zona sale de `Business.timezone` del negocio de la
 * sesión (nunca de otro) y llega a la pantalla por contexto. Sin sesión o con
 * una zona inválida, la de por defecto.
 */
export default async function LayoutDeLaAgenda({ children }: { children: ReactNode }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  const negocio = actor
    ? await prisma.business
        .findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
        // Si la lectura falla, la agenda sigue con la zona por defecto.
        .catch(() => null)
    : null

  return <ProveedorDeZona zona={zonaDelNegocio(negocio?.timezone)}>{children}</ProveedorDeZona>
}
