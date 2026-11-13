import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cuerpoDelPedido, noAutorizado, respuestaClinica } from "@/lib/ficha-clinica-servidor"
import { materialNuevoSchema } from "@/lib/edicion-de-protesis"
import { actorDeSesion, esClinicaDental, puedeConfigurarRepartoDeProtesis } from "@/lib/permisos"
import { crearMaterial, leerMateriales } from "@/lib/protesis-servidor"

/**
 * Comisiones › Reparto de prótesis: los materiales con su precio por arcada o
 * por pieza, los tipos que sirven y la regla de reparto en tres partes (en
 * puntos base que suman 10.000). Sólo la dueña: es dinero, como las
 * comisiones (§3.4). Fuera de una clínica dental, 404. Cada regla nueva o
 * cambiada queda en la auditoría (`cambios_de_reparto_de_protesis`). Cambiar
 * una regla sólo afecta las prótesis nuevas: las creadas copiaron la suya.
 */

const noEncontrado = () => NextResponse.json({ error: "No encontrado" }, { status: 404 })

/** Todos los materiales, activos e inactivos, en su orden. */
export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return noEncontrado()
  if (!puedeConfigurarRepartoDeProtesis(actor)) return noAutorizado()

  try {
    return NextResponse.json(await leerMateriales(actor))
  } catch (error) {
    return respuestaClinica(error, "leyendo los materiales de prótesis")
  }
}

/** Agrega un material. Nombre repetido (sin mayúsculas), 409; laboratorio ajeno, 404; desactivado, 400. */
export async function POST(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return noAutorizado()
  if (!esClinicaDental(actor)) return noEncontrado()
  if (!puedeConfigurarRepartoDeProtesis(actor)) return noAutorizado()

  try {
    const datos = materialNuevoSchema.parse(await cuerpoDelPedido(request))
    return NextResponse.json(await crearMaterial(actor, datos), { status: 201 })
  } catch (error) {
    return respuestaClinica(error, "creando un material de prótesis")
  }
}
