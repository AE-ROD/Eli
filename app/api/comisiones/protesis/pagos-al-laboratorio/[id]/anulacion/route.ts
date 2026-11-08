import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { firmaClinica, noAutorizado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { anularPagoAlLaboratorio } from "@/lib/pagos-al-laboratorio"
import { actorDeSesion, esClinicaDental, puedePagarAlLaboratorio } from "@/lib/permisos"

/**
 * Anula un pago al laboratorio: sus líneas vuelven a "por pagar". Sólo la
 * dueña. Ya anulado, 409; ajeno o inexistente, 404. Responde 200 con el pago.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  if (!puedePagarAlLaboratorio(actor)) return noAutorizado()

  try {
    const { id } = await params
    const firma = await firmaClinica(actor, session?.user?.id)
    if (!firma) return noAutorizado()
    return NextResponse.json(await anularPagoAlLaboratorio(actor, id, firma))
  } catch (error) {
    return respuestaClinica(error, "anulando un pago al laboratorio")
  }
}
