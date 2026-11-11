import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  cuerpoDelPedido,
  firmaClinica,
  noAutorizado,
  pacienteConAcceso,
  pacienteNoEncontrado,
  respuestaClinica,
} from "@/lib/ficha-clinica-servidor"
import { edicionDeProtesisSchema } from "@/lib/edicion-de-protesis"
import { actorDeSesion, puedeEditarProtesis, veProtesis } from "@/lib/permisos"
import { editarProtesis } from "@/lib/protesis-servidor"

/**
 * Avanza el seguimiento de una prótesis por los pasos de su tipo
 * (`{ estado }`, `PASOS_POR_TIPO` en lib/protesis.ts: `entregada` fija la
 * fecha de entrega; `anulada` sólo antes de entregar y sin abonos), o cambia
 * el laboratorio, la entrega estimada o el tono. Un paso que no es del tipo,
 * 400; un paso anterior, o una prótesis entregada o anulada, 409. Cada paso
 * queda como un evento con fecha y autor. Una prótesis de otro paciente es 404.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; protesisId: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return noAutorizado()

  const { id, protesisId } = await params
  const paciente = await pacienteConAcceso(actor, id, veProtesis)
  if (!paciente) return pacienteNoEncontrado()
  if (!puedeEditarProtesis(actor)) return noAutorizado()

  try {
    const pedido = edicionDeProtesisSchema.parse(await cuerpoDelPedido(request))
    const firma = await firmaClinica(actor, session?.user?.id)
    if (!firma) return noAutorizado()
    return NextResponse.json(await editarProtesis(actor, paciente.id, protesisId, pedido, firma))
  } catch (error) {
    return respuestaClinica(error, "cambiando una prótesis")
  }
}
