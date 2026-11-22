import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { deCentavos } from "@/lib/atenciones"
import { MAXIMO_DE_PAQUETES, valorPorSesion } from "@/lib/paquetes"
import { paquetesDeLaClienta } from "@/lib/paquetes-servidor"
import { actorDeSesion, puedeVenderPaquetes } from "@/lib/permisos"
import { buscarAtencion, respuestaDeError } from "@/lib/tablero"

/**
 * Lo que el cobro del Tablero necesita saber de los paquetes de sesiones
 * (`lib/paquetes.ts`): los que el negocio ofrece, para venderle uno, y los
 * que la clienta de la atención ya compró y todavía puede usar.
 *
 * Mismas reglas que cobrar: sin sesión 401; una atención de otro negocio (o
 * que quien mira no ve) 404; sin `puedeVenderPaquetes` (quien no cobra, y
 * todos en una clínica dental) 401. Todo sale del negocio de la sesión. Los
 * montos van en pesos, como el resto del tablero. El límite de pedidos lo
 * pone `proxy.ts`.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await buscarAtencion(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Atención no encontrada" }, { status: 404 })
  }
  if (!puedeVenderPaquetes(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const businessId = actor.businessId
    const [atencion, definiciones] = await Promise.all([
      // De quién es la atención: acotado por negocio aunque el id ya venga verificado.
      prisma.visit.findFirst({ where: { id: existente.id, businessId }, select: { customerId: true } }),
      prisma.paqueteDeSesiones.findMany({
        where: { businessId, active: true, service: { is: { active: true } } },
        select: { id: true, serviceId: true, sesiones: true, priceCents: true, vigenciaMeses: true, service: { select: { name: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: MAXIMO_DE_PAQUETES,
      }),
    ])
    if (!atencion) {
      return NextResponse.json({ error: "Atención no encontrada" }, { status: 404 })
    }

    // Sólo los que todavía sirven: con sesiones por usar, sin vencer, sin devolver.
    const customerId = atencion.customerId
    const deLaClienta = customerId
      ? (await paquetesDeLaClienta(prisma, businessId, customerId, new Date(), true)).filter((paquete) => paquete.estado === "activo")
      : []

    return NextResponse.json({
      tieneClienta: customerId !== null,
      ofrecidos: definiciones
        .map((definicion) => ({
          id: definicion.id,
          servicioId: definicion.serviceId,
          servicio: definicion.service.name,
          sesiones: definicion.sesiones,
          precio: deCentavos(definicion.priceCents),
          valorPorSesion: deCentavos(valorPorSesion(definicion.priceCents, definicion.sesiones)),
          vigenciaMeses: definicion.vigenciaMeses,
        }))
        // Juntos los del mismo servicio, del más chico al más grande.
        .sort((a, b) => a.servicio.localeCompare(b.servicio, "es") || a.sesiones - b.sesiones),
      deLaClienta: deLaClienta.map((paquete) => ({
        id: paquete.id,
        servicioId: paquete.servicioId,
        servicio: paquete.servicio,
        sesiones: paquete.sesiones,
        restantes: paquete.restantes,
        valorPorSesion: deCentavos(paquete.valorPorSesionCents ?? 0),
        venceEl: paquete.venceEl,
      })),
    })
  } catch (error) {
    return respuestaDeError(error, "leyendo los paquetes para el cobro")
  }
}
