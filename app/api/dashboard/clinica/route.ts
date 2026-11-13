import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import {
  estadoDeLosSillones,
  presupuestosPorResponder,
  salaDeEspera,
} from "@/lib/inicio-de-la-clinica"
import {
  actorDeSesion,
  esClinicaDental,
  puedeVerIngresosDelNegocio,
  puedeVerTodaLaAgenda,
  vePlanDeTratamiento,
  veSillones,
  whereDeAgenda,
  whereDeAtenciones,
  whereDeEtapasDelPlan,
  whereDeSillones,
} from "@/lib/permisos"
import { ORDEN_DE_SILLONES } from "@/lib/sillones"
import { fechaYMinutosEn, rangoDelDiaEn, zonaDelNegocio } from "@/lib/zona-horaria"

/** Topes de lectura: un día de una clínica no llega a esto, y sin tope una lista no tiene fin. */
const TOPE_DE_SILLONES = 100
const TOPE_DE_CITAS = 500
const TOPE_DE_ESPERA = 200
const TOPE_DE_PRESUPUESTOS = 200

/** Las citas que pueden estar en el sillón ahora o venir después: ni cerradas ni canceladas. */
const CITAS_VIVAS = ["pendiente", "confirmada", "en-progreso"]

/**
 * El inicio de la clínica dental, para hoy en la zona del negocio: "Sillones
 * ahora", la sala de espera y los presupuestos por responder. Las reglas de
 * cada bloque están en `lib/inicio-de-la-clinica.ts`. Fuera de una clínica
 * dental, 404.
 *
 * Cada rol ve lo suyo, con los filtros de `lib/permisos.ts`:
 * - Sillones: todos los activos de la clínica; las citas en ellos, las que el
 *   actor ve en la agenda (`whereDeAgenda`: el odontólogo, sólo las suyas).
 *   `alcance` dice cuál de las dos vistas es: con "propias", un sillón libre
 *   es uno sin citas suyas, no uno vacío.
 * - Sala de espera: las atenciones que ve (`whereDeAtenciones`).
 * - Presupuestos: los de todos los pacientes (`vePlanDeTratamiento`), y los
 *   montos sólo para quien ve la plata del negocio (`puedeVerIngresosDelNegocio`,
 *   como los ingresos de `/api/dashboard/stats`): para el resto, las claves
 *   no viajan.
 */
export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!esClinicaDental(actor)) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  // La zona y los sillones no dependen uno del otro: una sola ida a la base en vez de dos seguidas (esta ruta se pide cada minuto).
  const [negocio, sillones] = await Promise.all([
    prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } }),
    veSillones(actor)
      ? prisma.sillon.findMany({
          where: whereDeSillones(actor, { activo: true }),
          select: { id: true, nombre: true, orden: true },
          orderBy: ORDEN_DE_SILLONES,
          take: TOPE_DE_SILLONES,
        })
      : Promise.resolve([]),
  ])
  const zona = zonaDelNegocio(negocio?.timezone)
  const ahora = new Date()
  const hoy = fechaYMinutosEn(ahora, zona).fecha
  const dia = rangoDelDiaEn(hoy, zona)
  const conMontos = puedeVerIngresosDelNegocio(actor)

  const [citas, enEspera, etapas] = await Promise.all([
    sillones.length > 0
      ? prisma.appointment.findMany({
          where: whereDeAgenda(actor, {
            startTime: { gte: dia.desde, lt: dia.hasta },
            sillonId: { in: sillones.map((sillon) => sillon.id) },
            status: { in: CITAS_VIVAS },
          }),
          select: {
            id: true,
            sillonId: true,
            title: true,
            startTime: true,
            endTime: true,
            status: true,
            customer: { select: { id: true, name: true, lastName: true } },
            member: { select: { id: true, user: { select: { name: true } } } },
            visit: { select: { status: true, startedAt: true } },
          },
          orderBy: { startTime: "asc" },
          take: TOPE_DE_CITAS,
        })
      : Promise.resolve([]),
    // Llegaron hoy y no han pasado: la columna "En espera" del Tablero. Una
    // que quedó esperando de otro día no es la sala de espera de hoy.
    prisma.visit.findMany({
      where: whereDeAtenciones(actor, { status: "en-espera", arrivedAt: { gte: dia.desde } }),
      select: {
        id: true,
        customerId: true,
        customerName: true,
        arrivedAt: true,
        appointmentId: true,
        appointment: {
          select: { businessId: true, memberId: true, title: true, sillon: { select: { id: true, nombre: true } } },
        },
      },
      orderBy: { arrivedAt: "asc" },
      take: TOPE_DE_ESPERA,
    }),
    vePlanDeTratamiento(actor)
      ? prisma.etapaDelPlan.findMany({
          where: whereDeEtapasDelPlan(actor, {
            estado: "por-aprobar",
            presentadaEn: { not: null },
            plan: { is: { vigente: true, customer: { is: clienteNoEliminado } } },
          }),
          select: {
            id: true,
            nombre: true,
            presentadaEn: true,
            planId: true,
            plan: { select: { customer: { select: { id: true, name: true, lastName: true } } } },
            // Sin montos para quien no ve la plata: ni se piden a la base.
            ...(conMontos && { prestaciones: { select: { valorCents: true } } }),
          },
          orderBy: { presentadaEn: "desc" },
          take: TOPE_DE_PRESUPUESTOS,
        })
      : Promise.resolve(null),
  ])

  return NextResponse.json({
    fecha: hoy,
    zona,
    ahora,
    alcance: puedeVerTodaLaAgenda(actor) ? "negocio" : "propias",
    sillones: estadoDeLosSillones(sillones, citas, ahora),
    salaDeEspera: salaDeEspera(actor, enEspera, ahora),
    ...(etapas && { presupuestosPorResponder: presupuestosPorResponder(etapas, conMontos) }),
  })
}
