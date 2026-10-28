import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { aCentavos, deCentavos, esPrecioValido, MONTO_MAXIMO } from "@/lib/atenciones"
import {
  cabeEnLaCaja,
  cuentaDeCaja,
  diaDelNegocio,
  inicioDelProximoCierre,
  leerCaja,
  MENSAJE_CAJA_CAMBIO,
  MENSAJE_NOTA_OBLIGATORIA,
  type DesgloseDeCaja,
} from "@/lib/caja"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { formatearMonto } from "@/lib/dinero"
import { nombreDeMedio } from "@/lib/medios-de-pago"
import { actorDeSesion, puedeCerrarCaja, puedeVerCierresDeCaja, whereDeCierresDeCaja } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { nombreEnElNegocio } from "@/lib/tablero"
import { zonaDelNegocio } from "@/lib/zona-horaria"

const POR_PAGINA = 20
const LARGO_MAXIMO_DE_NOTA = 500

const MENSAJE_DE_MONTO = `Escribe un monto de 0 a ${formatearMonto(MONTO_MAXIMO)}, con hasta dos decimales`
const monto = (nombre: string) =>
  z
    .number({ required_error: `Falta ${nombre}`, invalid_type_error: MENSAJE_DE_MONTO })
    .refine(esPrecioValido, MENSAJE_DE_MONTO)

const cierreSchema = z.object(
  {
    /** El inicio del período que se vio al contar (`abierto.desde` del GET): si cambió, otro cerró antes. */
    desde: z.string({ required_error: MENSAJE_CAJA_CAMBIO }).datetime({ offset: true, message: MENSAJE_CAJA_CAMBIO }),
    fondoInicial: monto("el fondo inicial"),
    contado: monto("lo contado"),
    nota: z.string().trim().max(LARGO_MAXIMO_DE_NOTA, `La nota puede tener hasta ${LARGO_MAXIMO_DE_NOTA} caracteres`).optional(),
  },
  { required_error: "Datos inválidos", invalid_type_error: "Datos inválidos" }
)

/** El desglose en unidades y con nombres, para mostrar. */
function desgloseParaMostrar(desglose: DesgloseDeCaja) {
  const lista = (porMedio: Record<string, number> | undefined) =>
    Object.entries(porMedio ?? {}).map(([medio, centavos]) => ({ medio, nombre: nombreDeMedio(medio), monto: deCentavos(centavos) }))
  return { otrosMedios: lista(desglose.otrosMedios), propinasOtrosMedios: lista(desglose.propinasOtrosMedios) }
}

const SELECCION_DE_CIERRE = {
  id: true,
  desde: true,
  hasta: true,
  fecha: true,
  fondoInicialCents: true,
  efectivoCobradoCents: true,
  propinasEfectivoCents: true,
  efectivoEsperadoCents: true,
  efectivoContadoCents: true,
  diferenciaCents: true,
  desglose: true,
  nota: true,
  cerradoPorNombre: true,
} satisfies Prisma.CierreDeCajaSelect

type CierreLeido = Prisma.CierreDeCajaGetPayload<{ select: typeof SELECCION_DE_CIERRE }>

function formatearCierre(cierre: CierreLeido) {
  return {
    id: cierre.id,
    desde: cierre.desde,
    hasta: cierre.hasta,
    fecha: cierre.fecha.toISOString().slice(0, 10),
    fondoInicial: deCentavos(cierre.fondoInicialCents),
    efectivoCobrado: deCentavos(cierre.efectivoCobradoCents),
    propinasEfectivo: deCentavos(cierre.propinasEfectivoCents),
    esperado: deCentavos(cierre.efectivoEsperadoCents),
    contado: deCentavos(cierre.efectivoContadoCents),
    diferencia: deCentavos(cierre.diferenciaCents),
    desglose: desgloseParaMostrar(cierre.desglose as unknown as DesgloseDeCaja),
    nota: cierre.nota,
    cerradoPor: cierre.cerradoPorNombre,
  }
}

async function zonaDe(businessId: string) {
  const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } })
  return zonaDelNegocio(negocio?.timezone)
}

/**
 * GET /api/caja?pagina= — la caja abierta (desde el último cierre hasta
 * ahora: lo cobrado en efectivo, las propinas en efectivo y los otros
 * medios) y los cierres anteriores, del más nuevo al más viejo. Dueña y
 * encargado (`puedeVerCierresDeCaja`); el profesional, 401.
 */
export async function GET(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeVerCierresDeCaja(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const pagina = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .catch(1)
    .parse(new URL(request.url).searchParams.get("pagina") ?? 1)

  const ahora = new Date()
  const zona = await zonaDe(actor.businessId)
  const [ultimo, total, cierres] = await Promise.all([
    prisma.cierreDeCaja.findFirst({
      where: whereDeCierresDeCaja(actor),
      select: { hasta: true },
      orderBy: { hasta: "desc" },
    }),
    prisma.cierreDeCaja.count({ where: whereDeCierresDeCaja(actor) }),
    prisma.cierreDeCaja.findMany({
      where: whereDeCierresDeCaja(actor),
      select: SELECCION_DE_CIERRE,
      orderBy: { hasta: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ])

  const desde = inicioDelProximoCierre(ultimo?.hasta ?? null, ahora, zona)
  const resumen = await leerCaja(prisma, actor.businessId, desde, ahora)

  return NextResponse.json({
    zona,
    puedeCerrar: puedeCerrarCaja(actor),
    abierta: {
      desde,
      hasta: ahora,
      efectivoCobrado: deCentavos(resumen.efectivoCobradoCents),
      propinasEfectivo: deCentavos(resumen.propinasEfectivoCents),
      desglose: desgloseParaMostrar(resumen.desglose),
    },
    cierres: cierres.map(formatearCierre),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
  })
}

/**
 * POST /api/caja — cierra la caja: cubre desde el último cierre hasta
 * ahora. Lo cierran quienes pueden cobrar (`puedeCerrarCaja`); el
 * profesional, 401.
 *
 * `desde` es el inicio del período que se vio al contar: si otro cerró
 * entretanto, ya no coincide y es 409 (lo contado era de otro período). Con
 * un candado por negocio, dos cierres simultáneos no se solapan: el segundo
 * espera, ve el cierre nuevo y responde 409. Un cierre no se edita ni se
 * borra: esta ruta no tiene PUT ni DELETE.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeCerrarCaja(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const datos = cierreSchema.safeParse(await cuerpoDelPedido(request))
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)
  const visto = new Date(datos.data.desde)
  const nota = datos.data.nota || null

  const zona = await zonaDe(actor.businessId)
  const usuarioId = session?.user?.id ?? null

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`caja:${actor.businessId}`}))`

      const ahora = new Date()
      const ultimo = await tx.cierreDeCaja.findFirst({
        where: whereDeCierresDeCaja(actor),
        select: { hasta: true },
        orderBy: { hasta: "desc" },
      })
      const desde = inicioDelProximoCierre(ultimo?.hasta ?? null, ahora, zona)
      if (desde.getTime() !== visto.getTime() || ahora.getTime() <= desde.getTime()) {
        return { status: 409 as const, error: MENSAJE_CAJA_CAMBIO }
      }

      const cuenta = cuentaDeCaja(
        await leerCaja(tx, actor.businessId, desde, ahora),
        aCentavos(datos.data.fondoInicial),
        aCentavos(datos.data.contado)
      )
      if (!cabeEnLaCaja(cuenta)) {
        return { status: 400 as const, error: "Los montos son demasiado grandes para un solo cierre" }
      }
      if (cuenta.diferenciaCents !== 0 && !nota) return { status: 400 as const, error: MENSAJE_NOTA_OBLIGATORIA }

      const cierre = await tx.cierreDeCaja.create({
        data: {
          businessId: actor.businessId,
          desde,
          hasta: ahora,
          fecha: diaDelNegocio(ahora, zona),
          zona,
          fondoInicialCents: cuenta.fondoInicialCents,
          efectivoCobradoCents: cuenta.efectivoCobradoCents,
          propinasEfectivoCents: cuenta.propinasEfectivoCents,
          efectivoEsperadoCents: cuenta.efectivoEsperadoCents,
          efectivoContadoCents: cuenta.efectivoContadoCents,
          diferenciaCents: cuenta.diferenciaCents,
          desglose: cuenta.desglose as unknown as Prisma.InputJsonValue,
          nota,
          cerradoPorId: usuarioId ?? "",
          cerradoPorNombre: (await nombreEnElNegocio(tx, actor, usuarioId)) ?? "Alguien del equipo",
        },
        select: SELECCION_DE_CIERRE,
      })
      return { status: 201 as const, cierre }
    })

    if (resultado.status !== 201) return NextResponse.json({ error: resultado.error }, { status: resultado.status })
    return NextResponse.json(formatearCierre(resultado.cierre), { status: 201 })
  } catch (error) {
    // El único (negocio, hasta) es la última red: dos cierres en el mismo instante.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: MENSAJE_CAJA_CAMBIO }, { status: 409 })
    }
    console.error("Error al cerrar la caja:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
