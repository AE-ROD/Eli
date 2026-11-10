import type { ReactNode } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion } from "@/lib/permisos"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { ProveedorDeZona } from "../agenda/_componentes/zona-del-negocio"

/**
 * El historial de la ficha del cliente se lee en la hora del negocio, como la
 * agenda (#99), y no en la del dispositivo. La zona sale de
 * `Business.timezone` del negocio de la sesión (nunca de otro) y llega a la
 * pantalla por el mismo contexto que usa la agenda. Sin sesión, con una zona
 * inválida o si la lectura falla, la de por defecto.
 */
export default async function LayoutDeClientes({ children }: { children: ReactNode }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  const negocio = actor
    ? await prisma.business
        .findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
        .catch(() => null)
    : null

  return <ProveedorDeZona zona={zonaDelNegocio(negocio?.timezone)}>{children}</ProveedorDeZona>
}
