import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { abonoPedidoSchema, agregarAbono, protesisParaAbonar } from "@/lib/abonos-de-protesis"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, esClinicaDental, puedeCobrarAbonosDeProtesis, type Actor } from "@/lib/permisos"
import { buscarAtencion, respuestaDeError } from "@/lib/tablero"

/**
 * Los abonos de prótesis de una atención de la Sala de espera (sólo clínica
 * dental). Cobran dueño y encargado (`puedeCobrarAbonosDeProtesis`), como el
 * resto de la caja: el odontólogo que ve la atención recibe 401, como en el
 * cobro. Fuera de una clínica dental, o con una atención ajena o que no se
 * ve, 404. El límite de pedidos lo pone `proxy.ts`.
 */

type Contexto = { params: Promise<{ id: string }> }

const noEncontrada = () => NextResponse.json({ error: "Atención no encontrada" }, { status: 404 })
const noAutorizado = () => NextResponse.json({ error: "No autorizado" }, { status: 401 })

/** La atención, si existe para el actor y puede cobrarle abonos; si no, la respuesta que corresponde. */
async function atencionParaAbonar(actor: Actor | null, params: Contexto["params"]) {
  if (!actor) return { respuesta: noAutorizado() }
  if (!esClinicaDental(actor)) return { respuesta: noEncontrada() }
  const { id } = await params
  const existente = await buscarAtencion(actor, id)
  if (!existente) return { respuesta: noEncontrada() }
  if (!puedeCobrarAbonosDeProtesis(actor)) return { respuesta: noAutorizado() }
  return { actor, existente }
}

/**
 * Las prótesis del paciente de la atención que se pueden abonar (no
 * anuladas), con su valor, lo pagado, lo por cobrar y el saldo, en unidades.
 * Sin el reparto. Una atención sin paciente: lista vacía.
 */
export async function GET(_request: NextRequest, { params }: Contexto) {
  const leida = await atencionParaAbonar(actorDeSesion(await getServerSession(authOptions)), params)
  if (!leida.actor) return leida.respuesta

  try {
    return NextResponse.json({ protesis: await protesisParaAbonar(leida.actor, leida.existente) })
  } catch (error) {
    return respuestaDeError(error, "leyendo las prótesis para abonar")
  }
}

/**
 * Agrega un abono: `{ protesisId, monto }` (monto en unidades, > 0, hasta dos
 * decimales, no más que el saldo). Responde 201 con la atención como la
 * devuelve el tablero. 400 monto inválido o topes de la atención; 404
 * prótesis de otro paciente o de otro negocio; 409 atención cobrada o
 * anulada, prótesis anulada, sin tratante, o el abono pasa el saldo.
 */
export async function POST(request: NextRequest, { params }: Contexto) {
  const leida = await atencionParaAbonar(actorDeSesion(await getServerSession(authOptions)), params)
  if (!leida.actor) return leida.respuesta

  try {
    const recibido = await cuerpoConTope(request)
    if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
    const pedido = abonoPedidoSchema.parse(recibido.cuerpo)
    return NextResponse.json(await agregarAbono(leida.actor, leida.existente, pedido), { status: 201 })
  } catch (error) {
    return respuestaDeError(error, "agregando un abono de prótesis")
  }
}
