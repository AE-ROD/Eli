import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { quitarAbono } from "@/lib/abonos-de-protesis"
import { actorDeSesion, esClinicaDental, puedeCobrarAbonosDeProtesis } from "@/lib/permisos"
import { buscarAtencion, respuestaDeError } from "@/lib/tablero"

type Contexto = { params: Promise<{ id: string; lineaId: string }> }

/**
 * Quita un abono de prótesis de una atención abierta. Mismas reglas que
 * agregarlo (`../route.ts`). Responde 200 con la atención. 404 si la línea no
 * es un abono de esta atención; 409 si la atención ya se cobró o se anuló.
 */
export async function DELETE(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!esClinicaDental(actor)) return NextResponse.json({ error: "Atención no encontrada" }, { status: 404 })

  const { id, lineaId } = await params
  const existente = await buscarAtencion(actor, id)
  if (!existente) return NextResponse.json({ error: "Atención no encontrada" }, { status: 404 })
  if (!puedeCobrarAbonosDeProtesis(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    return NextResponse.json(await quitarAbono(actor, existente, lineaId))
  } catch (error) {
    return respuestaDeError(error, "quitando un abono de prótesis")
  }
}
