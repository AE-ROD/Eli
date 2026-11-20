import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeUsarSecretaria } from "@/lib/permisos"

/**
 * Devuelve a la Secretaria una conversación derivada: vuelve a responderle
 * desde el próximo mensaje, con los turnos en cero. De otro negocio, o que no
 * existe, es el mismo 404.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeUsarSecretaria(actor)) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  const { id } = await params
  const devuelta = await prisma.conversacionDeSecretaria.updateMany({
    where: { id, businessId: actor.businessId, estado: "human" },
    data: { estado: "bot", turnos: 0, motivoDerivacion: null, derivadaAMemberId: null, derivadaAt: null },
  })
  if (devuelta.count === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
