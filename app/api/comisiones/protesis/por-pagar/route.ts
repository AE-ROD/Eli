import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { noAutorizado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { leerPorPagar } from "@/lib/pagos-al-laboratorio"
import { actorDeSesion, esClinicaDental, puedePagarAlLaboratorio } from "@/lib/permisos"

/**
 * "Por pagar al laboratorio": la parte del técnico de los abonos cobrados de
 * prótesis entregadas, todavía sin pagar, agrupada por laboratorio. Sólo la
 * dueña (es el reparto). Fuera de una clínica dental, 404; encargado u
 * odontólogo, 401. El límite de pedidos lo pone `proxy.ts`.
 */
export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  if (!puedePagarAlLaboratorio(actor)) return noAutorizado()

  try {
    return NextResponse.json(await leerPorPagar(actor))
  } catch (error) {
    return respuestaClinica(error, "leyendo lo por pagar al laboratorio")
  }
}
