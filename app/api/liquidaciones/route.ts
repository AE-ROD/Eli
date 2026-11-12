import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { esFechaCalendario } from "@/lib/zona-horaria"
import { actorDeSesion, puedeCerrarLiquidacion, whereDeLiquidaciones } from "@/lib/permisos"
import { vocabularioDe } from "@/lib/vocabulario"
import {
  ErrorDeLiquidacion,
  SELECCION_DE_RESUMEN,
  cerrarLiquidacion,
  formatearResumen,
  quienFirma,
  respuestaDeErrorDePlata,
} from "@/lib/liquidacion"

/**
 * Cuántas se listan por página (`?pagina=`, desde 1). Una página con menos
 * que esto es la última. El panel pide la siguiente con "Ver más".
 */
const LIQUIDACIONES_POR_PAGINA = 50

/**
 * El historial de liquidaciones, de a `LIQUIDACIONES_POR_PAGINA`. La gestión
 * ve las del negocio (todas, o las de `?miembro=`); el profesional, sólo las
 * suyas, mande lo que mande: `whereDeLiquidaciones` lo acota y `?miembro=`
 * sólo puede achicar.
 */
export async function GET(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const parametros = new URL(request.url).searchParams
    const miembro = parametros.get("miembro")
    const pagina = z.coerce.number().int().min(1).max(10_000).catch(1).parse(parametros.get("pagina") ?? 1)
    const filas = await prisma.liquidacion.findMany({
      where: whereDeLiquidaciones(actor, miembro ? { memberId: miembro } : {}),
      select: SELECCION_DE_RESUMEN,
      orderBy: [{ desde: "desc" }, { cerradaAt: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * LIQUIDACIONES_POR_PAGINA,
      take: LIQUIDACIONES_POR_PAGINA,
    })
    return NextResponse.json(filas.map(formatearResumen))
  } catch (error) {
    return respuestaDeErrorDePlata(error, "listando liquidaciones")
  }
}

const cierreSchema = z.object({
  miembroId: z.string().min(1).max(100),
  /** El `desde` de la vista previa que se vio: si ya no es el próximo, 409. */
  desde: z.string().refine(esFechaCalendario, "La fecha del período no es válida."),
  /**
   * El total a pagar que se vio al confirmar: si al cerrar ya es otro (se
   * cobró, se anuló o se registró algo mientras tanto), 409 y la pantalla
   * recalcula. Obligatorio: no se cierra a ciegas.
   */
  totalEsperadoCents: z
    .number({ required_error: "Vuelve a calcular la liquidación antes de cerrarla.", invalid_type_error: "Vuelve a calcular la liquidación antes de cerrarla." })
    .int("Vuelve a calcular la liquidación antes de cerrarla.")
    .min(-2_000_000_000)
    .max(2_000_000_000),
  excluirMovimientos: z.array(z.string().min(1).max(100)).max(200).default([]),
  nota: z.string().trim().max(500, "La nota no puede pasar de 500 caracteres.").optional(),
})

/**
 * Cierra la próxima liquidación de un profesional. Sólo la dueña. Todo en
 * una transacción, bajo un candado por negocio y miembro: un segundo cierre
 * simultáneo espera, recalcula, ve que el período ya cambió y responde 409.
 * Lo mismo si el total ya no es el que se confirmó (`totalEsperadoCents`).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeCerrarLiquidacion(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const recibido = await cuerpoConTope(request)
    if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
    const cuerpo = cierreSchema.parse(recibido.cuerpo)
    const firma = await quienFirma(prisma, actor, session?.user?.id)
    if (!firma) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const id = await prisma.$transaction(async (tx) => {
      const id = await cerrarLiquidacion(tx, {
        businessId: actor.businessId,
        memberId: cuerpo.miembroId,
        desdeEsperado: cuerpo.desde,
        totalEsperadoCents: cuerpo.totalEsperadoCents,
        excluirMovimientos: cuerpo.excluirMovimientos,
        nota: cuerpo.nota ? cuerpo.nota : null,
        cerradaPorId: firma.id,
        cerradaPorNombre: firma.nombre,
        // El rubro sale de la sesión: si no se puede cerrar, el 409 dice "servicios" o "prestaciones".
        palabras: vocabularioDe(actor.rubro).palabras,
      })
      const creada = await tx.liquidacion.findFirst({ where: { id, businessId: actor.businessId }, select: SELECCION_DE_RESUMEN })
      if (!creada) throw new ErrorDeLiquidacion(409, "La liquidación no se pudo leer después de cerrarla.")
      return formatearResumen(creada)
    })

    return NextResponse.json(id, { status: 201 })
  } catch (error) {
    return respuestaDeErrorDePlata(error, "cerrando liquidación")
  }
}
