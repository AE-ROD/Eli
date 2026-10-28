import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeVerIngresosDelNegocio } from "@/lib/permisos"
import {
  calcularInasistencia,
  calcularOcupacion,
  clasificarClientes,
  comparar,
  diasDelPeriodo,
  type CitaParaReporte,
} from "@/lib/reportes-de-ocupacion"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { diasEntre, esFechaCalendario, rangoDelDiaEn, sumarDias, zonaDelNegocio } from "@/lib/zona-horaria"

/** Un año, con margen para uno bisiesto, como el reporte de lo cobrado. */
const DIAS_MAXIMOS = 366

/** Cuántas filas se traen como máximo por consulta; si se pasa, la respuesta lo dice con `truncado`. */
const TOPE = 20_000

const fecha = z.string().refine(esFechaCalendario, "La fecha no es válida (AAAA-MM-DD)")
const consultaSchema = z.object({ desde: fecha, hasta: fecha })

/**
 * GET /api/reportes/ocupacion?desde=AAAA-MM-DD&hasta=AAAA-MM-DD — "Llenar
 * horas" (#72): ocupación por profesional, clientes nuevos y recurrentes,
 * inasistencia y la comparación con el período anterior de igual largo. Los
 * días son del negocio (su zona), los dos incluidos, hasta 366.
 *
 * Dueña y encargado (`puedeVerIngresosDelNegocio`); el profesional, 401.
 * Todas las consultas van acotadas al negocio de la sesión. El límite de
 * peticiones es el del panel (`proxy.ts`).
 */
export async function GET(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeVerIngresosDelNegocio(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = actor.businessId

  const parametros = new URL(request.url).searchParams
  const consulta = consultaSchema.safeParse({ desde: parametros.get("desde"), hasta: parametros.get("hasta") })
  if (!consulta.success) return respuestaDeDatosInvalidos(consulta.error)
  const { desde, hasta } = consulta.data
  const largo = diasEntre(desde, hasta) + 1
  if (largo < 1) return NextResponse.json({ error: "El final del período tiene que ser igual o posterior al inicio" }, { status: 400 })
  if (largo > DIAS_MAXIMOS) {
    return NextResponse.json({ error: `El período no puede pasar de ${DIAS_MAXIMOS} días` }, { status: 400 })
  }

  const anteriorHasta = sumarDias(desde, -1)
  const anteriorDesde = sumarDias(desde, -largo)

  const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } })
  const zona = zonaDelNegocio(negocio?.timezone)
  const inicioAnterior = rangoDelDiaEn(anteriorDesde, zona).desde
  const inicio = rangoDelDiaEn(desde, zona).desde
  const fin = rangoDelDiaEn(hasta, zona).hasta

  const [miembros, filas, bloqueos, citas, cobradas] = await Promise.all([
    prisma.businessMember.findMany({
      where: { businessId },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workSchedule.findMany({
      where: { businessId, active: true },
      select: { memberId: true, dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.timeBlock.findMany({
      where: { businessId, startTime: { lt: fin }, endTime: { gt: inicioAnterior } },
      select: { memberId: true, startTime: true, endTime: true },
      take: TOPE + 1,
    }),
    prisma.appointment.findMany({
      where: { businessId, startTime: { gte: inicioAnterior, lt: fin } },
      select: { memberId: true, status: true, startTime: true, endTime: true },
      take: TOPE + 1,
    }),
    prisma.visit.findMany({
      where: { businessId, status: "finalizada", paidAt: { gte: inicioAnterior, lt: fin } },
      select: { customerId: true, paidAt: true },
      take: TOPE + 1,
    }),
  ])

  // Quién de los que pagaron tenía una atención cobrada antes. Para el
  // período anterior alcanza con mirar antes de su inicio.
  const clientes = [...new Set(cobradas.map((atencion) => atencion.customerId).filter((id): id is string => !!id))]
  const historia = clientes.length
    ? await prisma.visit.findMany({
        where: { businessId, status: "finalizada", customerId: { in: clientes }, paidAt: { lt: inicio } },
        select: { customerId: true, paidAt: true },
        take: TOPE * 5 + 1,
      })
    : []

  const truncado = [bloqueos, citas, cobradas].some((lista) => lista.length > TOPE) || historia.length > TOPE * 5
  const equipo = miembros.map((miembro) => ({ id: miembro.id, nombre: miembro.user.name }))
  const ahora = new Date()

  const enRango = (cita: CitaParaReporte, desdeInstante: Date, hastaInstante: Date) =>
    cita.startTime >= desdeInstante && cita.startTime < hastaInstante

  function periodo(dias: string[], desdeInstante: Date, hastaInstante: Date) {
    const delPeriodo = citas.filter((cita) => enRango(cita, desdeInstante, hastaInstante))
    const pagadas = cobradas.filter(
      (atencion) => atencion.paidAt && atencion.paidAt >= desdeInstante && atencion.paidAt < hastaInstante
    )
    const conHistoria = new Set(
      historia
        .filter((atencion) => atencion.paidAt && atencion.paidAt < desdeInstante)
        .map((atencion) => atencion.customerId as string)
    )
    return {
      ocupacion: calcularOcupacion({ dias, zona, miembros: equipo, filas, bloqueos, citas: delPeriodo }),
      clientes: clasificarClientes(pagadas, conHistoria),
      inasistencia: calcularInasistencia(delPeriodo, equipo, ahora),
    }
  }

  const actual = periodo(diasDelPeriodo(desde, hasta), inicio, fin)
  const anterior = periodo(diasDelPeriodo(anteriorDesde, anteriorHasta), inicioAnterior, inicio)

  return NextResponse.json({
    zona,
    periodo: { desde, hasta, dias: largo },
    periodoAnterior: { desde: anteriorDesde, hasta: anteriorHasta },
    ocupacion: actual.ocupacion,
    clientes: actual.clientes,
    inasistencia: actual.inasistencia,
    comparacion: {
      ocupacion: comparar(actual.ocupacion.total.ocupacion, anterior.ocupacion.total.ocupacion, "tasa"),
      clientesNuevos: comparar(actual.clientes.nuevos, anterior.clientes.nuevos, "cantidad"),
      clientesRecurrentes: comparar(actual.clientes.recurrentes, anterior.clientes.recurrentes, "cantidad"),
      inasistencia: comparar(actual.inasistencia.total.tasa, anterior.inasistencia.total.tasa, "tasa"),
    },
    truncado,
  })
}
