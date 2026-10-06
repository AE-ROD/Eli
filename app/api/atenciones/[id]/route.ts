import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { esEstadoActivo } from "@/lib/atenciones"
import { lineasPedidasSchema, resolverLineas } from "@/lib/lineas-de-atencion"
import { actorDeSesion, whereDeLineas } from "@/lib/permisos"
import {
  ErrorDeAtencion,
  buscarAtencion,
  cuerpoDelPedido,
  leerAtencion,
  respuestaDeError,
  tomarAtencion,
} from "@/lib/tablero"

const edicionSchema = z
  .object({
    /** Reemplaza las líneas que el actor puede tocar: todas, o sólo las suyas si es profesional. */
    lineas: lineasPedidasSchema.optional(),
    notas: z.string().max(1000).nullable().optional(),
  })
  .refine((datos) => datos.lineas !== undefined || datos.notas !== undefined, {
    message: "No hay nada que cambiar: faltan las líneas, las notas o ambas",
  })

/**
 * Edita las líneas y las notas de una atención abierta.
 *
 * Dueño y encargado reemplazan todas las líneas. El profesional reemplaza sólo
 * las suyas: las de sus colegas quedan como estaban, y las nuevas quedan a su
 * nombre aunque pida otro (`profesionalParaLinea`). Lo cobrado no se reescribe:
 * una atención finalizada o anulada da 409.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await buscarAtencion(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Atención no encontrada" }, { status: 404 })
  }

  try {
    const datos = edicionSchema.parse(await cuerpoDelPedido(request))

    if (!esEstadoActivo(existente.status)) {
      throw new ErrorDeAtencion(409, "Una atención finalizada o anulada ya no se edita.")
    }

    const atencion = await prisma.$transaction(async (tx) => {
      // Se reescribe el mismo estado a propósito: el UPDATE toma la fila y, si
      // entretanto la cobraron o la movieron, no matchea y no se edita nada.
      await tomarAtencion(tx, existente.id, existente.status, {
        status: existente.status,
        ...(datos.notas !== undefined && { notes: datos.notas || null }),
      })

      if (datos.lineas !== undefined) {
        const nuevas = await resolverLineas(tx, actor, datos.lineas)
        // Por `whereDeLineas`: al profesional sólo se le borran las suyas.
        await tx.visitService.deleteMany({ where: whereDeLineas(actor, { visitId: existente.id }) })
        if (nuevas.length > 0) {
          await tx.visitService.createMany({ data: nuevas.map((linea) => ({ ...linea, visitId: existente.id })) })
        }
      }

      return leerAtencion(tx, actor, existente.id)
    })

    return NextResponse.json(atencion)
  } catch (error) {
    return respuestaDeError(error, "editando atención")
  }
}
