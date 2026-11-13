import type { ReactNode } from "react"
import { sesionDelServidor } from "@/lib/sesion-del-servidor"
import { actorDeSesion } from "@/lib/permisos"
import { ZONA_POR_DEFECTO } from "@/lib/zona-horaria"
import { zonaHorariaDelNegocio } from "@/lib/zona-horaria-servidor"
import { ProveedorDeZona } from "../agenda/_componentes/zona-del-negocio"

/**
 * El historial de la ficha del cliente se lee en la hora del negocio, como la
 * agenda (#99), y no en la del dispositivo. La zona sale de
 * `Business.timezone` del negocio de la sesión (nunca de otro) y llega a la
 * pantalla por el mismo contexto que usa la agenda. Sin sesión, con una zona
 * inválida o si la lectura falla, la de por defecto.
 */
export default async function LayoutDeClientes({ children }: { children: ReactNode }) {
  const actor = actorDeSesion(await sesionDelServidor())
  // La misma lectura que hace la ficha del paciente en este render: una sola consulta.
  const zona = actor
    ? await zonaHorariaDelNegocio(actor.businessId).catch(() => ZONA_POR_DEFECTO)
    : ZONA_POR_DEFECTO

  return <ProveedorDeZona zona={zona}>{children}</ProveedorDeZona>
}
