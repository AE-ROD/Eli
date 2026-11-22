import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { deCentavos } from "@/lib/atenciones"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { paquetesDeLaClienta, type PaqueteDeClienteVisto } from "@/lib/paquetes-servidor"
import type { EstadoDelPaquete } from "@/lib/paquetes"
import { actorDeSesion, puedeDevolverPaquete, puedeVerPaquetesDeClientes, veMontosDePaquetes, whereDeClientes } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * GET /api/clientes/[id]/paquetes — los paquetes de sesiones de una clienta
 * (`lib/paquetes.ts`), el más nuevo primero, para su ficha.
 *
 * Los ve todo el equipo (`puedeVerPaquetesDeClientes`); en una clínica dental
 * no existen: 401. La clienta se busca como en la ficha
 * (`app/api/clientes/[id]/route.ts`): del negocio de la sesión y no
 * eliminada; si no, 404. Los montos, en pesos, van sólo para quien los ve
 * (`veMontosDePaquetes`: dueña y encargado); para el resto, `null`.
 *
 * `puedeDevolver` le dice a la pantalla si muestra "Devolver"; la devolución
 * lo vuelve a verificar. El límite de peticiones es el genérico del panel
 * (`proxy.ts`).
 */

/** Un paquete como lo recibe la ficha: fechas en ISO y montos en pesos (`null` para quien no los ve). */
export interface PaqueteDeLaFicha {
  id: string
  servicio: string
  sesiones: number
  usadas: number
  restantes: number
  estado: EstadoDelPaquete
  vendidoEl: string
  venceEl: string | null
  devueltoEl: string | null
  precio: number | null
  valorPorSesion: number | null
  devuelto: number | null
  /** Lo que se devolvería hoy; `null` si no hay nada que devolver o quien mira no ve montos. */
  aDevolver: number | null
}

export interface PaquetesDeLaFichaRespuesta {
  paquetes: PaqueteDeLaFicha[]
  puedeDevolver: boolean
}

const enPesos = (centavos: number | null) => (centavos === null ? null : deCentavos(centavos))

function paraLaFicha(paquete: PaqueteDeClienteVisto): PaqueteDeLaFicha {
  return {
    id: paquete.id,
    servicio: paquete.servicio,
    sesiones: paquete.sesiones,
    usadas: paquete.usadas,
    restantes: paquete.restantes,
    estado: paquete.estado,
    vendidoEl: paquete.vendidoEl.toISOString(),
    venceEl: paquete.venceEl?.toISOString() ?? null,
    devueltoEl: paquete.devueltoEl?.toISOString() ?? null,
    precio: enPesos(paquete.precioCents),
    valorPorSesion: enPesos(paquete.valorPorSesionCents),
    devuelto: enPesos(paquete.devueltoCents),
    aDevolver: enPesos(paquete.aDevolverCents),
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeVerPaquetesDeClientes(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params

  try {
    const clienta = await prisma.customer.findFirst({
      where: whereDeClientes(actor, { AND: [{ id }, clienteNoEliminado] }),
      select: { id: true },
    })
    if (!clienta) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })

    const paquetes = await paquetesDeLaClienta(prisma, actor.businessId, clienta.id, new Date(), veMontosDePaquetes(actor))
    const respuesta: PaquetesDeLaFichaRespuesta = { paquetes: paquetes.map(paraLaFicha), puedeDevolver: puedeDevolverPaquete(actor) }
    return NextResponse.json(respuesta)
  } catch (error) {
    registrarError("leyendo los paquetes de una clienta", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
