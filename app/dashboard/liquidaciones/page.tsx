import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { BarraSuperior } from "@/components/panel/barra-superior"
import {
  actorDeSesion,
  puedeCerrarLiquidacion,
  puedeConfigurarLiquidacion,
  puedeVerLiquidacionesDelEquipo,
  whereDeLiquidaciones,
  whereDeMovimientos,
} from "@/lib/permisos"
import { SELECCION_DE_RESUMEN, formatearResumen, leerNegocioParaLiquidar } from "@/lib/liquidacion"
import {
  SELECCION_DE_MOVIMIENTO,
  TIPOS_DE_MOVIMIENTO,
  formatearMovimiento,
  puedeManejarMovimiento,
} from "@/lib/movimientos"
import { fechaDelNegocio } from "@/lib/periodos-de-liquidacion"
import { SeccionPeriodo } from "./_componentes/seccion-periodo"
import { SeccionEquipo, type MiembroParaLiquidar } from "./_componentes/seccion-equipo"
import { SeccionMovimientos } from "./_componentes/seccion-movimientos"
import { HistorialDeLiquidaciones } from "./_componentes/historial-de-liquidaciones"

/**
 * Liquidaciones del equipo (#68, #69): dueña y encargado. El profesional ve
 * las suyas en Mi plata. El permiso se mira en el servidor: sin él, de vuelta
 * al inicio. Cerrar, configurar el período y los ajustes son de la dueña;
 * adelantos y vales, también del encargado.
 */
export default async function PaginaLiquidaciones() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeVerLiquidacionesDelEquipo(actor)) redirect("/dashboard")

  const [{ zona, config }, miembros, historial, pendientes] = await Promise.all([
    leerNegocioParaLiquidar(prisma, actor.businessId),
    prisma.businessMember.findMany({
      where: { businessId: actor.businessId },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.liquidacion.findMany({
      where: whereDeLiquidaciones(actor),
      select: SELECCION_DE_RESUMEN,
      orderBy: [{ desde: "desc" }, { cerradaAt: "desc" }],
      take: 200,
    }),
    prisma.movimientoDeLiquidacion.findMany({
      where: whereDeMovimientos(actor, { liquidacionId: null, anuladoAt: null }),
      select: SELECCION_DE_MOVIMIENTO,
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: 300,
    }),
  ])

  const resumenes = historial.map(formatearResumen)
  const equipo: MiembroParaLiquidar[] = miembros.map((miembro) => {
    // El historial viene de la más nueva a la más vieja: la primera viva es la última.
    const ultima = resumenes.find((l) => l.memberId === miembro.id && l.estado !== "anulada")
    return { id: miembro.id, nombre: miembro.user.name, ultima: ultima ? { desde: ultima.desde, hasta: ultima.hasta } : null }
  })

  return (
    <div className="min-h-dvh">
      <BarraSuperior titulo="Liquidaciones" subtitulo="Lo que se le paga a cada profesional por período." mostrarBusqueda={false} />

      <div className="max-w-4xl space-y-6 px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        <SeccionEquipo miembros={equipo} puedeCerrar={puedeCerrarLiquidacion(actor)} />
        <SeccionMovimientos
          miembros={equipo.map(({ id, nombre }) => ({ id, nombre }))}
          pendientes={pendientes.map(formatearMovimiento)}
          tipos={TIPOS_DE_MOVIMIENTO.filter((tipo) => puedeManejarMovimiento(actor, tipo))}
          hoy={fechaDelNegocio(new Date(), zona)}
        />
        <HistorialDeLiquidaciones liquidaciones={resumenes} />
        <SeccionPeriodo inicial={config} editable={puedeConfigurarLiquidacion(actor)} />
      </div>
    </div>
  )
}
