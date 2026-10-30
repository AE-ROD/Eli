import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { enviarAClientes } from "@/lib/envios-a-clientes"
import { DIAS_OCULTO_TRAS_CONTACTO, fechaDeVisita } from "@/lib/frecuencia-de-visitas"
import { sumarDias, zonaDelNegocio } from "@/lib/zona-horaria"
import { actorDeSesion, puedeEscribirAClienteQueSeVa, whereDeClientes } from "@/lib/permisos"

/**
 * "Escribirle" a un cliente que se está yendo (#76). El mensaje lo manda la
 * persona del negocio desde su WhatsApp o su correo (`wa.me` / `mailto:`):
 * acá sólo se registra, como canal "manual", para contarlo en "Mensajes de
 * este mes" y para sacar la fila de la lista unos días.
 *
 * Un registro por cliente y día (referencia `${customerId}:${hoy}`): tocar
 * "Escribirle" dos veces el mismo día no cuenta dos mensajes.
 *
 * Primero la pertenencia y después el permiso: un cliente de otro negocio, o
 * uno eliminado, es 404 para todos; del propio negocio sin permiso, 401. Sin
 * cuerpo. El límite de pedidos lo pone `proxy.ts`.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const cliente = await prisma.customer.findFirst({
    where: whereDeClientes(actor, { AND: [{ id }, clienteNoEliminado] }),
    select: { id: true },
  })
  if (!cliente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }
  if (!puedeEscribirAClienteQueSeVa(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const negocio = await prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
  const ahora = new Date()
  const zona = zonaDelNegocio(negocio?.timezone)
  const hoy = fechaDeVisita(ahora, zona)
  const resultado = await enviarAClientes({
    businessId: actor.businessId,
    zona,
    tipo: "contacto-manual",
    canal: "manual",
    referencia: `${cliente.id}:${hoy}`,
    customerId: cliente.id,
    ahora,
  })

  if (resultado !== "enviado" && resultado !== "ya-enviado") {
    return NextResponse.json({ error: "No se pudo registrar el contacto" }, { status: 500 })
  }
  return NextResponse.json({ registrado: true, vuelveALaListaEl: sumarDias(hoy, DIAS_OCULTO_TRAS_CONTACTO) })
}
