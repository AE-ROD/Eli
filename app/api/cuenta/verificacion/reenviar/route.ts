import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cuentaDeSesion } from "@/lib/permisos"
import { verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { reenviarVerificacion } from "@/lib/verificacion-de-correo-servidor"

/**
 * POST /api/cuenta/verificacion/reenviar — otro enlace de "Confirma tu correo"
 * para la cuenta de la sesión. El enlace anterior deja de servir.
 *
 * La cuenta sale de la sesión (`cuentaDeSesion`) y el correo de destino, de la
 * base: el pedido no lleva cuerpo, así que no hay cómo mandarle el correo a
 * otra casilla ni pedirlo por otra cuenta. Sin sesión vigente, 401.
 *
 * Tope propio: 3 por hora por cuenta (`reenvioDeVerificacion`, falla cerrado),
 * además del de escritura del panel (`proxy.ts`). La casilla todavía no está
 * comprobada: sin él se le podría llenar la bandeja a un tercero.
 *
 * La respuesta nunca lleva el token: sólo `{ verificado }`.
 */
export async function POST() {
  const cuenta = cuentaDeSesion(await getServerSession(authOptions))
  if (!cuenta) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { permitido } = await verificarLimite("reenvioDeVerificacion", cuenta.id)
  if (!permitido) {
    return NextResponse.json(
      { error: "Ya te mandamos varios enlaces. Revisa tu correo (también el spam) o intenta en una hora." },
      { status: 429 },
    )
  }

  try {
    const resultado = await reenviarVerificacion(cuenta.id)
    if (resultado === "sin-cuenta") return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    if (resultado === "ya-verificado") return NextResponse.json({ verificado: true })
    if (resultado === "fallido") {
      return NextResponse.json({ error: "No pudimos mandar el correo, intenta de nuevo" }, { status: 502 })
    }
    return NextResponse.json({ verificado: false })
  } catch (error) {
    registrarError("reenviando la verificación del correo", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
