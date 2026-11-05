import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { vaciarLaFilaDeHoy } from "@/lib/fila-virtual-servidor"
import { actorDeSesion, puedeVaciarFilaVirtual } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { nombreEnElNegocio } from "@/lib/tablero"

/**
 * POST /api/fila-virtual/vaciar — "Vaciar la fila de hoy" (#85): anula a
 * todos los que esperan en la fila virtual del día, por ejemplo si alguien la
 * llenó con nombres inventados. Las que ya se atienden no se tocan.
 *
 * Dueña y encargado (`puedeVaciarFilaVirtual`); el profesional y sin sesión,
 * 401. Siempre el negocio de la sesión. El límite es el de escritura del
 * panel (`proxy.ts`), por sesión. Quién la vació queda en cada atención, como
 * en cualquier anulación.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeVaciarFilaVirtual(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const usuarioId = session?.user?.id ?? null
    const nombre = await nombreEnElNegocio(prisma, actor, usuarioId)
    const anuladas = await vaciarLaFilaDeHoy(actor, { id: usuarioId, nombre })
    if (anuladas === null) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })
    return NextResponse.json({ anuladas })
  } catch (error) {
    registrarError("vaciando la fila virtual", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
