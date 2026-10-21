import { NextResponse } from "next/server"
import { z } from "zod"

/**
 * El 400 de un cuerpo que no pasó el esquema, en los endpoints del panel.
 *
 * Antes respondían `detalles: error.errors`: la lista cruda de zod, en inglés,
 * con la forma interna del esquema, y la pantalla no la mostraba. Ahora va un
 * solo `error` que la pantalla muestra tal cual (`lib/peticiones.ts`), como ya
 * hace la disponibilidad de la reserva pública: el primer problema, con el
 * mensaje escrito en el esquema.
 *
 * Si ese mensaje es el que zod trae por defecto (en inglés, para
 * programadores: "Expected number, received string"), va "Datos inválidos".
 * Así un campo sin mensaje propio no le muestra a nadie un texto técnico.
 */
export function respuestaDeDatosInvalidos(error: z.ZodError): NextResponse {
  return NextResponse.json({ error: mensajeLegible(error) }, { status: 400 })
}

function mensajeLegible(error: z.ZodError): string {
  const [primero] = error.issues
  if (!primero) return "Datos inválidos"
  const porDefecto = z.defaultErrorMap(primero, { defaultError: "", data: undefined }).message
  return primero.message && primero.message !== porDefecto ? primero.message : "Datos inválidos"
}
