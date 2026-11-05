import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeEditarComisiones, whereDeProductos } from "@/lib/permisos"
import { leerNegocioParaLiquidar } from "@/lib/liquidacion"
import { inicioDelPeriodoEn } from "@/lib/periodos-de-liquidacion"

/**
 * Cuántas líneas pendientes se cuentan como máximo. Es un aviso ("tiene N
 * servicios esperando %"), no un total que se pague: con el tope alcanzado
 * se dice "más de N".
 */
const TOPE_DE_PENDIENTES = 5000

/**
 * GET /api/comisiones — lo que necesita la pantalla de Comisiones (sólo la
 * dueña; el resto, 401):
 *
 * - `miembros`: cada profesional del equipo con su % por defecto (null = sin
 *   configurar), sus excepciones por servicio y cuántas líneas suyas ya
 *   cobradas esperan un % (comisión pendiente). Con "Liquidar desde" fijado,
 *   lo cobrado antes no cuenta: nunca va a entrar a una liquidación.
 * - `servicios`: el catálogo, para elegir dónde poner una excepción.
 * - `productos`: el % de cada producto, sólo para leer (se edita en
 *   Configuración › Productos).
 *
 * Todo acotado al negocio de la sesión.
 */
export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeEditarComisiones(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = actor.businessId

  // Desde cuándo lo cobrado se liquida, con el mismo corte que la vista
  // previa (`vistaPrevia` en lib/liquidacion.ts). Sin fecha fijada todavía,
  // cuenta todo lo cobrado.
  const { zona, liquidarDesde } = await leerNegocioParaLiquidar(prisma, businessId)
  const cobradaDesde = liquidarDesde ? inicioDelPeriodoEn(liquidarDesde, zona) : null

  const [miembros, servicios, productos, pendientes] = await Promise.all([
    prisma.businessMember.findMany({
      where: { businessId },
      select: {
        id: true,
        role: true,
        commissionPercent: true,
        user: { select: { name: true } },
        commissionRates: {
          where: { businessId },
          select: { serviceId: true, percent: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.service.findMany({
      where: { businessId },
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.producto.findMany({
      where: whereDeProductos(actor),
      select: { id: true, name: true, commissionPercent: true, active: true },
      orderBy: { name: "asc" },
    }),
    // Líneas cobradas de alguien del equipo que todavía no tienen comisión:
    // las de la dueña nunca llevan, y las de quien dejó el equipo no tienen a
    // quién liquidarse. Lo cobrado antes de "Liquidar desde", tampoco.
    prisma.visitService.findMany({
      where: {
        memberId: { not: null },
        byOwner: false,
        commissionAt: null,
        visit: { is: { businessId, status: "finalizada", ...(cobradaDesde && { paidAt: { gte: cobradaDesde } }) } },
      },
      select: { memberId: true },
      take: TOPE_DE_PENDIENTES + 1,
    }),
  ])

  const pendientesPorMiembro = new Map<string, number>()
  for (const { memberId } of pendientes.slice(0, TOPE_DE_PENDIENTES)) {
    if (memberId) pendientesPorMiembro.set(memberId, (pendientesPorMiembro.get(memberId) ?? 0) + 1)
  }
  const nombreDeServicio = new Map(servicios.map((servicio) => [servicio.id, servicio.name]))

  return NextResponse.json({
    miembros: miembros.map((miembro) => ({
      id: miembro.id,
      nombre: miembro.user.name,
      rol: miembro.role,
      porcentaje: miembro.commissionPercent,
      excepciones: miembro.commissionRates
        .map((excepcion) => ({
          servicioId: excepcion.serviceId,
          servicio: nombreDeServicio.get(excepcion.serviceId) ?? "Servicio",
          porcentaje: excepcion.percent,
        }))
        .sort((a, b) => a.servicio.localeCompare(b.servicio, "es")),
      pendientes: pendientesPorMiembro.get(miembro.id) ?? 0,
    })),
    servicios: servicios.map((servicio) => ({ id: servicio.id, nombre: servicio.name, activo: servicio.active })),
    productos: productos.map((producto) => ({
      id: producto.id,
      nombre: producto.name,
      porcentaje: producto.commissionPercent,
      activo: producto.active,
    })),
    pendientesTruncado: pendientes.length > TOPE_DE_PENDIENTES,
  })
}
