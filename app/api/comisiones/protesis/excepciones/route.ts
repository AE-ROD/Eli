import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cuerpoDelPedido, noAutorizado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { excepcionNuevaSchema } from "@/lib/edicion-de-protesis"
import { actorDeSesion, esClinicaDental, puedeConfigurarRepartoDeProtesis } from "@/lib/permisos"
import { crearExcepcion, leerExcepciones } from "@/lib/protesis-servidor"

/**
 * Excepciones del reparto de prótesis: la regla de un odontólogo en un
 * material, que manda sobre la del material (como una excepción de comisión
 * sobre el % por defecto). Sólo la dueña; fuera de una clínica dental, 404.
 * Cada cambio queda en la auditoría.
 */

const noEncontrado = () => NextResponse.json({ error: "No encontrado" }, { status: 404 })

export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return noEncontrado()
  if (!puedeConfigurarRepartoDeProtesis(actor)) return noAutorizado()

  try {
    return NextResponse.json(await leerExcepciones(actor))
  } catch (error) {
    return respuestaClinica(error, "leyendo las excepciones de reparto")
  }
}

/** Crea una excepción. Miembro o material de otra clínica, 404; ya hay una para ese par, 409. */
export async function POST(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return noEncontrado()
  if (!puedeConfigurarRepartoDeProtesis(actor)) return noAutorizado()

  try {
    const datos = excepcionNuevaSchema.parse(await cuerpoDelPedido(request))
    return NextResponse.json(await crearExcepcion(actor, datos), { status: 201 })
  } catch (error) {
    return respuestaClinica(error, "creando una excepción de reparto")
  }
}
