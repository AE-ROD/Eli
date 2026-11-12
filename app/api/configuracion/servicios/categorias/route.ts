import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { categoriaDeServicio } from "@/lib/campos-del-panel"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { registrarError } from "@/lib/registro-de-errores"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { normalizarNombre } from "@/lib/servicios-en-lote"
import { autorizarEscrituraMasiva } from "../_escritura-masiva"

/**
 * Renombrar una categoría, o unirla con otra: todos los servicios del negocio
 * que están en la categoría `de` pasan a `a`. Si `a` ya existe, quedan juntos.
 * `null` es "sin categoría" en los dos lados: `de: null` agrupa los servicios
 * sin categoría, y `a: null` los deja sin ella.
 *
 * `de` se compara sin mayúsculas, sin tildes y con los espacios colapsados
 * ("corte", "Corte " y "CORTÉ" son la misma categoría, y todas pasan a `a`,
 * escrita tal como llegó). `a` pasa por `categoriaDeServicio()`: hasta 40
 * caracteres y vacío es "sin categoría".
 *
 * Responde cuántos servicios cambiaron: los que ya estaban en `a`, exactamente
 * escrita así, no cuentan.
 */
const cambioSchema = z.object({
  de: categoriaDeServicio().nullable(),
  a: categoriaDeServicio().nullable(),
})

export async function POST(request: NextRequest) {
  const puerta = await autorizarEscrituraMasiva()
  if ("respuesta" in puerta) return puerta.respuesta
  const { actor } = puerta

  try {
    const { de, a } = cambioSchema.parse(await leerJsonConTope(request))
    const claveDe = normalizarNombre(de)

    // Se compara en memoria porque Prisma no sabe comparar sin tildes, y un
    // negocio no tiene más de unos cientos de servicios.
    const delNegocio = await prisma.service.findMany({
      where: { businessId: actor.businessId },
      select: { id: true, category: true },
    })
    const ids = delNegocio
      .filter((servicio) => normalizarNombre(servicio.category) === claveDe && (servicio.category ?? null) !== a)
      .map((servicio) => servicio.id)

    if (ids.length === 0) return NextResponse.json({ actualizados: 0 })

    const { count } = await prisma.service.updateMany({
      where: { businessId: actor.businessId, id: { in: ids } },
      data: { category: a },
    })

    return NextResponse.json({ actualizados: count })
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "El pedido no es un JSON válido" }, { status: 400 })
    }
    registrarError("cambiando la categoría de los servicios", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
