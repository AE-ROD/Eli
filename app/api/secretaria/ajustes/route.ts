import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeConfigurarSecretaria } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"

/**
 * Los ajustes de la Secretaria del negocio de la sesión: encendida, topes,
 * presupuesto mensual y reglas propias. Sólo el dueño (toca plata).
 */

const ajustesSchema = z.object({
  activa: z.boolean(),
  maxTurnos: z.number().int().min(1).max(50),
  maxTokens: z.number().int().min(50).max(2000),
  /** En dólares, con hasta dos decimales. */
  presupuestoMensualUsd: z.number().min(0).max(10_000),
  reglas: z.string().trim().max(2000).nullable(),
})

export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeConfigurarSecretaria(actor)) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  try {
    const datos = ajustesSchema.parse(await leerJsonConTope(request))
    const valores = {
      activa: datos.activa,
      maxTurnos: datos.maxTurnos,
      maxTokens: datos.maxTokens,
      presupuestoMensualCentavos: Math.round(datos.presupuestoMensualUsd * 100),
      reglas: datos.reglas || null,
    }
    const ajustes = await prisma.ajustesDeSecretaria.upsert({
      where: { businessId: actor.businessId },
      create: { businessId: actor.businessId, ...valores },
      update: valores,
      select: { activa: true, maxTurnos: true, maxTokens: true, presupuestoMensualCentavos: true, reglas: true },
    })
    return NextResponse.json(ajustes)
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "El pedido no es un JSON válido" }, { status: 400 })
    registrarError("guardando los ajustes de la Secretaria", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
