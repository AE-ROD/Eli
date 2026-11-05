import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { leerPantallaDeLaFila } from "@/lib/fila-virtual-servidor"
import { actorDeSesion, puedeVerPantallaDeFila } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * GET /api/fila-virtual/pantalla — la fila de hoy para la pantalla del local
 * (#85): quiénes esperan y quiénes están en atención, con su número y su
 * nombre con la inicial del apellido. Nunca correo ni teléfono.
 *
 * Dueña y encargado (`puedeVerPantallaDeFila`); el profesional y sin sesión,
 * 401. Siempre el negocio de la sesión. La pantalla la pide cada ~15 s: el
 * límite es el de lectura del panel (`proxy.ts`), por sesión.
 */
export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeVerPantallaDeFila(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const pantalla = await leerPantallaDeLaFila(actor)
    if (!pantalla) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })
    return NextResponse.json(pantalla, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    registrarError("leyendo la pantalla de la fila virtual", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
