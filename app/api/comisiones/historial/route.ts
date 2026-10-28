import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeVerHistorialDeComisiones } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

const POR_PAGINA = 50

const consultaSchema = z.object({
  /** Un cuid; 64 sobra y corta un parámetro absurdo. */
  miembro: z.string().min(1).max(64).optional(),
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
})

/**
 * GET /api/comisiones/historial?miembro=&pagina= — los cambios de % de
 * comisión (`CommissionChange`, #35): quién cambió qué, de cuánto a cuánto y
 * cuándo, del más reciente al más viejo. Sólo la dueña.
 *
 * Sin `miembro` trae todo el negocio, incluidos los cambios de quienes ya no
 * están en el equipo: su `memberId` quedó en null al irse, pero el nombre se
 * copió al auditar (`memberName`) y se sigue leyendo. Con `miembro`, sólo los
 * de ese profesional, que tiene que ser del negocio (si no, 404).
 */
export async function GET(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeVerHistorialDeComisiones(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const parametros = Object.fromEntries(
    [...new URL(request.url).searchParams.entries()].filter(([, valor]) => valor !== "")
  )
  const consulta = consultaSchema.safeParse(parametros)
  if (!consulta.success) return respuestaDeDatosInvalidos(consulta.error)
  const { miembro, pagina } = consulta.data

  if (miembro) {
    const existe = await prisma.businessMember.findFirst({
      where: { id: miembro, businessId: actor.businessId },
      select: { id: true },
    })
    if (!existe) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 })
  }

  const where = { AND: [{ businessId: actor.businessId }, miembro ? { memberId: miembro } : {}] }
  const [total, cambios] = await Promise.all([
    prisma.commissionChange.count({ where }),
    prisma.commissionChange.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        memberId: true,
        memberName: true,
        scope: true,
        serviceName: true,
        productName: true,
        changedByName: true,
        previousPercent: true,
        newPercent: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ])

  return NextResponse.json({
    cambios: cambios.map((cambio) => ({
      id: cambio.id,
      cuando: cambio.createdAt,
      miembro: { id: cambio.memberId, nombre: cambio.memberName },
      alcance: cambio.scope,
      /** El servicio o el producto del cambio, copiado al auditar; null en el % por defecto. */
      sobre: cambio.scope === "service" ? cambio.serviceName : cambio.scope === "product" ? cambio.productName : null,
      quien: cambio.changedByName,
      antes: cambio.previousPercent,
      despues: cambio.newPercent,
    })),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
  })
}
