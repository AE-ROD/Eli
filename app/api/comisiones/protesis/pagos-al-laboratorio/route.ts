import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cuerpoDelPedido, firmaClinica, noAutorizado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { leerPagos, pagarAlLaboratorio, pagoAlLaboratorioSchema } from "@/lib/pagos-al-laboratorio"
import { actorDeSesion, esClinicaDental, puedePagarAlLaboratorio } from "@/lib/permisos"

/**
 * Los pagos a laboratorios ("Marcar pagado"). Sólo la dueña; fuera de una
 * clínica dental, 404; encargado u odontólogo, 401. El pago no sale de la caja
 * del día: no cuenta en el cierre de caja.
 */

const noEncontrado = () => NextResponse.json({ error: "No encontrado" }, { status: 404 })

/** El historial de pagos (anulados incluidos), del más nuevo al más viejo. `?laboratorio=` lo acota a uno. */
export async function GET(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return noEncontrado()
  if (!puedePagarAlLaboratorio(actor)) return noAutorizado()

  try {
    const laboratorio = new URL(request.url).searchParams.get("laboratorio")
    return NextResponse.json(await leerPagos(actor, laboratorio || null))
  } catch (error) {
    return respuestaClinica(error, "leyendo los pagos al laboratorio")
  }
}

/**
 * Marca pagado: `{ laboratorioId, medio, lineas: [ids] }` o
 * `{ laboratorioId, medio, todo: true }`. El monto lo suma el servidor.
 * Responde 201 con el pago.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return noEncontrado()
  if (!puedePagarAlLaboratorio(actor)) return noAutorizado()

  try {
    const pedido = pagoAlLaboratorioSchema.parse(await cuerpoDelPedido(request))
    const firma = await firmaClinica(actor, session?.user?.id)
    if (!firma) return noAutorizado()
    return NextResponse.json(await pagarAlLaboratorio(actor, pedido, firma), { status: 201 })
  } catch (error) {
    return respuestaClinica(error, "registrando un pago al laboratorio")
  }
}
