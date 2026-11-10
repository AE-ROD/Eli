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
  MENSAJE_CAJA_CAMBIO_LO_COBRADO,
  MENSAJE_NOTA_OBLIGATORIA,
  primerCobroDeOtroDia,
  type DesgloseDeCaja,
  type ResumenDeCaja,
} from "@/lib/caja"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { formatearMonto } from "@/lib/dinero"
import { nombreDeMedio } from "@/lib/medios-de-pago"
import { actorDeSesion, puedeCerrarCaja, puedeVerCierresDeCaja, whereDeCierresDeCaja } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { horaDeLaBase, tomarCandadoDeCaja } from "@/lib/bloqueos-de-dinero"
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
    /**
     * El fin del período que se vio al contar (`abierta.hasta` del GET): el
     * cierre cubre `(desde, hasta]` y lo cobrado después queda para el
     * próximo. Así no entra en el cierre nada que no estaba en pantalla.
     */
    hasta: z.string({ required_error: MENSAJE_CAJA_CAMBIO }).datetime({ offset: true, message: MENSAJE_CAJA_CAMBIO }),
    /**
     * El esperado que se vio (fondo + efectivo + propinas en efectivo): si
     * con lo que hay de verdad en `(desde, hasta]` da otro (un cobro que
     * estaba en curso al leer, una anulación), 409 y la pantalla recarga.
     */
    esperado: monto("el esperado"),
    /**
     * El total cobrado que se vio (`abierta.totalCobrado` del GET): todos los
     * medios, con propinas. El esperado sólo mira el efectivo; sin éste, un
     * cobro con tarjeta o una anulación entre leer y cerrar entraba al
     * desglose del cierre sin que nadie lo viera. Si cambió, 409.
     */
    totalCobrado: z
      .number({ required_error: MENSAJE_CAJA_CAMBIO_LO_COBRADO, invalid_type_error: MENSAJE_CAJA_CAMBIO_LO_COBRADO })
      .finite(MENSAJE_CAJA_CAMBIO_LO_COBRADO)
      .nonnegative(MENSAJE_CAJA_CAMBIO_LO_COBRADO),
    fondoInicial: monto("el fondo inicial"),
    contado: monto("lo contado"),
    nota: z.string().trim().max(LARGO_MAXIMO_DE_NOTA, `La nota puede tener hasta ${LARGO_MAXIMO_DE_NOTA} caracteres`).optional(),
  },
  { required_error: "Datos inválidos", invalid_type_error: "Datos inválidos" }
)

/**
 * Todo lo cobrado en el período, en centavos: pagos y propinas de todos los
 * medios. Es lo que el cierre guarda (efectivo y desglose); la pantalla lo
 * recibe en el GET y lo devuelve al cerrar para confirmar que no cambió.
 */
function totalCobradoCents(resumen: ResumenDeCaja): number {
  const suma = (porMedio: Record<string, number> | undefined) =>
    Object.values(porMedio ?? {}).reduce((total, centavos) => total + centavos, 0)
  return (
    resumen.efectivoCobradoCents +
    resumen.propinasEfectivoCents +
    suma(resumen.desglose.otrosMedios) +
    suma(resumen.desglose.propinasOtrosMedios)
  )
}

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
 * ahora: lo cobrado en efectivo, las propinas en efectivo, los otros medios
 * y, si arrastra cobros de días anteriores sin cerrar, desde cuándo) y los
 * cierres anteriores, del más nuevo al más viejo. Dueña y
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

  // La hora de la base, como el cierre y el cobro: con relojes desfasados
  // entre instancias, cerca de medianoche el GET y el POST podían ver días
  // distintos y el cierre respondía un 409 falso.
  const ahora = await horaDeLaBase(prisma)
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
  const [resumen, cobroDeOtroDia] = await Promise.all([
    leerCaja(prisma, actor.businessId, desde, ahora),
    primerCobroDeOtroDia(prisma, actor.businessId, desde, ahora, zona),
  ])

  return NextResponse.json({
    zona,
    puedeCerrar: puedeCerrarCaja(actor),
    abierta: {
      desde,
      hasta: ahora,
      efectivoCobrado: deCentavos(resumen.efectivoCobradoCents),
      propinasEfectivo: deCentavos(resumen.propinasEfectivoCents),
      desglose: desgloseParaMostrar(resumen.desglose),
      /** Todo lo cobrado, en todos los medios y con propinas: el cierre lo pide de vuelta (409 si cambió). */
      totalCobrado: deCentavos(totalCobradoCents(resumen)),
      /** El cobro más antiguo de un día anterior a hoy, si la caja arrastra días sin cerrar (#120); si no, null. */
      cobrosDesde: cobroDeOtroDia,
    },
    cierres: cierres.map(formatearCierre),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
  })
}

/**
 * POST /api/caja — cierra la caja: cubre desde el último cierre hasta el
 * `hasta` que se vio en pantalla (lo cobrado después queda para el próximo
 * cierre). Lo cierran quienes pueden cobrar (`puedeCerrarCaja`); el
 * profesional, 401.
 *
 * `desde` es el inicio del período que se vio al contar: si otro cerró
 * entretanto, ya no coincide y es 409 (lo contado era de otro período).
 * `esperado` y `totalCobrado` son los que se vieron: si lo que hay en
 * `(desde, hasta]` da otro efectivo u otro total (cualquier medio), 409.
 * Con un candado por negocio, dos cierres simultáneos no se solapan: el
 * segundo espera, ve el cierre nuevo y responde 409. Un cierre no se edita ni
 * se borra: esta ruta no tiene PUT ni DELETE.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeCerrarCaja(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const datos = cierreSchema.safeParse(recibido.cuerpo)
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)
  const visto = new Date(datos.data.desde)
  const hasta = new Date(datos.data.hasta)
  const nota = datos.data.nota || null

  // Sin id de usuario en la sesión no hay quién firme el cierre: 401, como la
  // liquidación (`quienFirma`), en vez de guardar un `cerradoPorId` vacío.
  const usuarioId = session?.user?.id || null
  if (!usuarioId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const zona = await zonaDe(actor.businessId)

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      await tomarCandadoDeCaja(tx, actor.businessId)

      // La hora de la base, después del candado: la misma fuente que usa el
      // cobro para `paidAt`, aunque las instancias tengan relojes desfasados.
      const ahora = await horaDeLaBase(tx)
      const ultimo = await tx.cierreDeCaja.findFirst({
        where: whereDeCierresDeCaja(actor),
        select: { hasta: true },
        orderBy: { hasta: "desc" },
      })
      const desde = inicioDelProximoCierre(ultimo?.hasta ?? null, ahora, zona)
      // El `hasta` visto tiene que caer después del inicio y no en el futuro
      // de la base: si no, lo que se contó no es de este período.
      if (
        desde.getTime() !== visto.getTime() ||
        hasta.getTime() <= desde.getTime() ||
        hasta.getTime() > ahora.getTime()
      ) {
        return { status: 409 as const, error: MENSAJE_CAJA_CAMBIO }
      }

      const cuenta = cuentaDeCaja(
        await leerCaja(tx, actor.businessId, desde, hasta),
        aCentavos(datos.data.fondoInicial),
        aCentavos(datos.data.contado)
      )
      if (!cabeEnLaCaja(cuenta)) {
        return { status: 400 as const, error: "Los montos son demasiado grandes para un solo cierre" }
      }
      // Lo que hay de verdad en `(desde, hasta]` no es lo que se vio: un
      // cobro que estaba en curso al leer, o una anulación entretanto. Se
      // mira el efectivo (el esperado) y también el total de todos los
      // medios: un cobro con tarjeta cambia el desglose que guarda el cierre.
      if (
        cuenta.efectivoEsperadoCents !== aCentavos(datos.data.esperado) ||
        totalCobradoCents(cuenta) !== aCentavos(datos.data.totalCobrado)
      ) {
        return { status: 409 as const, error: MENSAJE_CAJA_CAMBIO_LO_COBRADO }
      }
      if (cuenta.diferenciaCents !== 0 && !nota) return { status: 400 as const, error: MENSAJE_NOTA_OBLIGATORIA }

      const cierre = await tx.cierreDeCaja.create({
        data: {
          businessId: actor.businessId,
          desde,
          hasta,
          fecha: diaDelNegocio(hasta, zona),
          zona,
          fondoInicialCents: cuenta.fondoInicialCents,
          efectivoCobradoCents: cuenta.efectivoCobradoCents,
          propinasEfectivoCents: cuenta.propinasEfectivoCents,
          efectivoEsperadoCents: cuenta.efectivoEsperadoCents,
          efectivoContadoCents: cuenta.efectivoContadoCents,
          diferenciaCents: cuenta.diferenciaCents,
          desglose: cuenta.desglose as unknown as Prisma.InputJsonValue,
          nota,
          cerradoPorId: usuarioId,
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
    registrarError("cerrando la caja", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
