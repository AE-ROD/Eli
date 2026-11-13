import { redirect } from "next/navigation"
import { sesionDelServidor } from "@/lib/sesion-del-servidor"
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
import {
  SELECCION_DE_RESUMEN,
  formatearResumen,
  leerNegocioParaLiquidar,
  ultimasLiquidacionesPorMiembro,
} from "@/lib/liquidacion"
import {
  SELECCION_DE_MOVIMIENTO,
  TIPOS_DE_MOVIMIENTO,
  formatearMovimiento,
  puedeManejarMovimiento,
} from "@/lib/movimientos"
import { fechaDelNegocio } from "@/lib/periodos-de-liquidacion"
import { vocabularioDe } from "@/lib/vocabulario"
import { SeccionPeriodo } from "./_componentes/seccion-periodo"
import { SeccionLiquidarDesde } from "./_componentes/seccion-liquidar-desde"
import { SeccionEquipo, type MiembroParaLiquidar } from "./_componentes/seccion-equipo"
import { SeccionMovimientos } from "./_componentes/seccion-movimientos"
import { HistorialDeLiquidaciones } from "./_componentes/historial-de-liquidaciones"
import { LIQUIDACIONES_POR_PAGINA } from "./_datos"
import { frasesDeLasLiquidaciones } from "./_frases"

/**
 * Cuántos miembros se listan para liquidar. Es el tope con que la pantalla de
 * Equipo (`GET /api/equipo`) lista al equipo: quien pasara de 200 personas no
 * las vería ahí tampoco, y un local real tiene decenas. Sólo evita una lectura
 * sin límite; no cambia lo que ve ningún negocio.
 */
const TOPE_DE_MIEMBROS = 200

/**
 * Liquidaciones del equipo (#68, #69): dueña y encargado. El profesional ve
 * las suyas en Mi plata. El permiso se mira en el servidor: sin él, de vuelta
 * al inicio. Cerrar, configurar el período y los ajustes son de la dueña;
 * adelantos y vales, también del encargado.
 */
export default async function PaginaLiquidaciones() {
  const actor = actorDeSesion(await sesionDelServidor())
  if (!actor) redirect("/iniciar-sesion")
  if (!puedeVerLiquidacionesDelEquipo(actor)) redirect("/dashboard")

  const [{ zona, config, liquidarDesde }, miembros, historial, vivas, pendientes] = await Promise.all([
    leerNegocioParaLiquidar(prisma, actor.businessId),
    prisma.businessMember.findMany({
      where: { businessId: actor.businessId },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: TOPE_DE_MIEMBROS,
    }),
    // La primera página del historial (una más, para saber si hay otra); el
    // resto lo pide "Ver más" a la API, con el mismo orden.
    prisma.liquidacion.findMany({
      where: whereDeLiquidaciones(actor),
      select: SELECCION_DE_RESUMEN,
      orderBy: [{ desde: "desc" }, { cerradaAt: "desc" }, { id: "desc" }],
      take: LIQUIDACIONES_POR_PAGINA + 1,
    }),
    // Si hay alguna no anulada: "Liquidar desde" ya no se cambia. Se cuenta
    // aparte para no depender de las que entran en la primera página.
    prisma.liquidacion.count({ where: whereDeLiquidaciones(actor, { estado: { not: "anulada" } }) }),
    prisma.movimientoDeLiquidacion.findMany({
      where: whereDeMovimientos(actor, { liquidacionId: null, anuladoAt: null }),
      select: SELECCION_DE_MOVIMIENTO,
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: 300,
    }),
  ])

  const resumenes = historial.slice(0, LIQUIDACIONES_POR_PAGINA).map(formatearResumen)
  // La última no anulada de cada uno, leída por persona (con un historial
  // largo, la de alguien puede no estar entre las primeras de todo el negocio),
  // pero en una sola consulta para todo el equipo.
  const ultimas = await ultimasLiquidacionesPorMiembro(
    prisma,
    actor,
    miembros.map((miembro) => miembro.id)
  )
  // Lo de antes de "Liquidar desde" no entra en ninguna liquidación (la vista
  // previa lo deja afuera): tampoco se muestra como pendiente.
  const movimientosPendientes = pendientes
    .map(formatearMovimiento)
    .filter((movimiento) => !liquidarDesde || movimiento.fecha >= liquidarDesde)
  const equipo: MiembroParaLiquidar[] = miembros.map((miembro) => ({
    id: miembro.id,
    nombre: miembro.user.name,
    ultima: ultimas.get(miembro.id) ?? null,
  }))

  const hoy = fechaDelNegocio(new Date(), zona)
  const fechaFijada = (
    <SeccionLiquidarDesde
      liquidarDesde={liquidarDesde}
      hoy={hoy}
      editable={puedeConfigurarLiquidacion(actor)}
      bloqueada={vivas > 0}
    />
  )

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Liquidaciones"
        subtitulo={frasesDeLasLiquidaciones(vocabularioDe(actor.rubro).palabras).subtitulo}
        mostrarBusqueda={false}
      />

      <div className="max-w-4xl space-y-6 px-4 pt-6 pb-12 sm:px-6 lg:pt-8">
        {/* Sin fecha no se liquida: va primero, para que la dueña la vea antes que nada. */}
        {!liquidarDesde && fechaFijada}
        <SeccionEquipo miembros={equipo} puedeCerrar={puedeCerrarLiquidacion(actor) && !!liquidarDesde} />
        <SeccionMovimientos
          miembros={equipo.map(({ id, nombre }) => ({ id, nombre }))}
          pendientes={movimientosPendientes}
          tipos={TIPOS_DE_MOVIMIENTO.filter((tipo) => puedeManejarMovimiento(actor, tipo))}
          hoy={hoy}
        />
        <HistorialDeLiquidaciones
          liquidaciones={resumenes}
          hayMas={historial.length > LIQUIDACIONES_POR_PAGINA}
          personas={equipo.map(({ id, nombre }) => ({ id, nombre }))}
        />
        {liquidarDesde && fechaFijada}
        <SeccionPeriodo inicial={config} editable={puedeConfigurarLiquidacion(actor)} />
      </div>
    </div>
  )
}
