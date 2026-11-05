import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { aCentavos } from "@/lib/atenciones"
import { actorDeSesion, whereDeMovimientos } from "@/lib/permisos"
import {
  ErrorDeLiquidacion,
  leerNegocioParaLiquidar,
  quienFirma,
  respuestaDeErrorDePlata,
  tomarCandadoDeLiquidacionesDelNegocio,
} from "@/lib/liquidacion"
import {
  SELECCION_DE_MOVIMIENTO,
  TIPOS_DE_MOVIMIENTO,
  errorDeMonto,
  formatearMovimiento,
  puedeManejarMovimiento,
} from "@/lib/movimientos"
import { fechaDelNegocio, fechaParaColumna, fechaParaLeer } from "@/lib/periodos-de-liquidacion"
import { esFechaCalendario } from "@/lib/zona-horaria"

const MAXIMO_DE_LA_LISTA = 300

/**
 * Adelantos, vales y ajustes. La gestión ve los del negocio (o los de
 * `?miembro=`); el profesional, sólo los suyos. `?pendientes=1`: sólo los que
 * todavía no entraron en una liquidación ni se anularon, y con fecha desde
 * "Liquidar desde" si está fijada: lo anterior nunca entra en una liquidación
 * (la vista previa aplica el mismo corte), así que no está pendiente.
 */
export async function GET(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const miembro = searchParams.get("miembro")
    const pendientes = searchParams.get("pendientes") === "1"
    const { liquidarDesde } = pendientes
      ? await leerNegocioParaLiquidar(prisma, actor.businessId)
      : { liquidarDesde: null }
    const filas = await prisma.movimientoDeLiquidacion.findMany({
      where: whereDeMovimientos(actor, {
        ...(miembro ? { memberId: miembro } : {}),
        ...(pendientes ? { liquidacionId: null, anuladoAt: null } : {}),
        ...(liquidarDesde ? { fecha: { gte: fechaParaColumna(liquidarDesde) } } : {}),
      }),
      select: SELECCION_DE_MOVIMIENTO,
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: MAXIMO_DE_LA_LISTA,
    })
    return NextResponse.json(filas.map(formatearMovimiento))
  } catch (error) {
    return respuestaDeErrorDePlata(error, "listando movimientos de liquidación")
  }
}

const movimientoSchema = z.object({
  miembroId: z.string({ required_error: "Elige a quién." }).min(1, "Elige a quién.").max(100),
  tipo: z.enum(TIPOS_DE_MOVIMIENTO, { errorMap: () => ({ message: "Elige adelanto, vale o ajuste." }) }),
  monto: z.number({ required_error: "Escribe el monto.", invalid_type_error: "Escribe el monto." }),
  fecha: z.string().refine(esFechaCalendario, "La fecha no es válida.").optional(),
  motivo: z.string().trim().max(300, "El motivo no puede pasar de 300 caracteres.").optional(),
  atencionId: z.string().min(1).max(100).optional(),
})

/**
 * Registra un adelanto o un vale (dueña y encargado) o un ajuste (sólo la
 * dueña, con motivo, con signo y opcionalmente la atención que corrige). El
 * monto llega en unidades y se guarda en centavos. Sin fecha, hoy en la
 * zona del negocio. Una fecha anterior a "Liquidar desde" (si está fijada)
 * es 400: nunca entraría en una liquidación. Miembro o atención de otro
 * negocio: 404.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  // Quien no puede registrar ningún tipo no llega a validar el cuerpo.
  if (!actor || TIPOS_DE_MOVIMIENTO.every((tipo) => !puedeManejarMovimiento(actor, tipo))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const cuerpo = movimientoSchema.parse(await cuerpoDelPedido(request))
    if (!puedeManejarMovimiento(actor, cuerpo.tipo)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const errorDelMonto = errorDeMonto(cuerpo.tipo, cuerpo.monto)
    if (errorDelMonto) return NextResponse.json({ error: errorDelMonto }, { status: 400 })
    const motivo = cuerpo.motivo ? cuerpo.motivo : null
    if (cuerpo.tipo === "ajuste" && !motivo) {
      return NextResponse.json({ error: "Escribe el motivo del ajuste." }, { status: 400 })
    }

    const firma = await quienFirma(prisma, actor, session?.user?.id)
    if (!firma) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const creado = await prisma.$transaction(async (tx) => {
      const miembro = await tx.businessMember.findFirst({
        where: { id: cuerpo.miembroId, businessId: actor.businessId },
        select: { id: true, user: { select: { name: true } } },
      })
      if (!miembro) throw new ErrorDeLiquidacion(404, "Profesional no encontrado")

      if (cuerpo.atencionId) {
        const atencion = await tx.visit.findFirst({
          where: { id: cuerpo.atencionId, businessId: actor.businessId },
          select: { id: true },
        })
        if (!atencion) throw new ErrorDeLiquidacion(404, "Atención no encontrada")
      }

      // "Liquidar desde" se lee bajo el candado de liquidaciones del negocio,
      // compartido (como cada cierre): un cambio de la fecha en curso termina
      // antes, y el corte de abajo ya usa la nueva.
      await tomarCandadoDeLiquidacionesDelNegocio(tx, actor.businessId, "compartido")
      const { zona, liquidarDesde } = await leerNegocioParaLiquidar(tx, actor.businessId)
      const fecha = cuerpo.fecha ?? fechaDelNegocio(new Date(), zona)
      // La vista previa sólo toma movimientos desde "Liquidar desde": uno
      // anterior quedaría pendiente para siempre.
      if (liquidarDesde && fecha < liquidarDesde) {
        throw new ErrorDeLiquidacion(
          400,
          `La fecha no puede ser anterior a "Liquidar desde" (${fechaParaLeer(liquidarDesde)}).`
        )
      }
      return tx.movimientoDeLiquidacion.create({
        data: {
          businessId: actor.businessId,
          memberId: miembro.id,
          memberName: miembro.user.name,
          tipo: cuerpo.tipo,
          montoCents: aCentavos(cuerpo.monto),
          fecha: fechaParaColumna(fecha),
          motivo,
          visitId: cuerpo.atencionId ?? null,
          createdById: firma.id,
          createdByName: firma.nombre,
        },
        select: SELECCION_DE_MOVIMIENTO,
      })
    })

    return NextResponse.json(formatearMovimiento(creado), { status: 201 })
  } catch (error) {
    return respuestaDeErrorDePlata(error, "registrando un movimiento de liquidación")
  }
}
