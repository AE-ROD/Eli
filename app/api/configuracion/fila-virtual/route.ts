import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { TOPE_DE_FILA_MAXIMO, TOPE_DE_FILA_MINIMO } from "@/lib/fila-virtual"
import { actorDeSesion, puedeActivarFilaVirtual } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

const MENSAJE_TOPE = `El tope tiene que ser un número entero de personas, de ${TOPE_DE_FILA_MINIMO} a ${TOPE_DE_FILA_MAXIMO}`

const cambiosSchema = z
  .object(
    {
      activa: z.boolean({ invalid_type_error: "La fila virtual tiene que estar encendida o apagada" }).optional(),
      tope: z
        .number({ invalid_type_error: MENSAJE_TOPE })
        .int(MENSAJE_TOPE)
        .min(TOPE_DE_FILA_MINIMO, MENSAJE_TOPE)
        .max(TOPE_DE_FILA_MAXIMO, MENSAJE_TOPE)
        .optional(),
    },
    { invalid_type_error: "Datos inválidos", required_error: "Datos inválidos" }
  )
  .refine((cambios) => cambios.activa !== undefined || cambios.tope !== undefined, "No hay nada que cambiar")

/**
 * PUT /api/configuracion/fila-virtual — encender o apagar la fila virtual
 * (#85) y fijar su tope de personas esperando a la vez. Sólo la dueña
 * (`puedeActivarFilaVirtual`); encargado, profesional y sin sesión, 401.
 * Siempre sobre el negocio de la sesión, nunca uno del cuerpo. El límite de
 * peticiones es el del panel (`proxy.ts`).
 *
 * Apagarla no saca a nadie de la fila: quienes ya esperan siguen en el
 * Tablero y en su celular. Sólo impide que se anoten más.
 */
export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeActivarFilaVirtual(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const leido = cambiosSchema.safeParse(await cuerpoDelPedido(request))
  if (!leido.success) return respuestaDeDatosInvalidos(leido.error)

  const negocio = await prisma.business.update({
    where: { id: actor.businessId },
    data: { filaVirtualActiva: leido.data.activa, filaVirtualTope: leido.data.tope },
    select: { filaVirtualActiva: true, filaVirtualTope: true },
  })
  return NextResponse.json({ activa: negocio.filaVirtualActiva, tope: negocio.filaVirtualTope })
}
