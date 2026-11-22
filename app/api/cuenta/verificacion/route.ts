import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cuentaDeSesion } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { estadoDeVerificacion } from "@/lib/verificacion-de-correo-servidor"

/**
 * GET /api/cuenta/verificacion — `{ verificado, email }` de la cuenta de la
 * sesión, para el aviso "Confirma tu correo" del panel.
 *
 * La cuenta sale de la sesión (`cuentaDeSesion`), jamás de la URL ni de una
 * cabecera: nadie puede preguntar por el correo de otra persona. Sin sesión
 * vigente, 401. El límite es el de lectura del panel, por sesión (`proxy.ts`).
 */
export async function GET() {
  const cuenta = cuentaDeSesion(await getServerSession(authOptions))
  if (!cuenta) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const estado = await estadoDeVerificacion(cuenta.id)
    if (!estado) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    return NextResponse.json(estado)
  } catch (error) {
    registrarError("leyendo la verificación del correo", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
