import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { comisionParaCongelar, type PorcentajesVigentes } from "@/lib/comisiones"
import { nombreDeMedio } from "@/lib/medios-de-pago"
import { NOMBRES_DE_MOVIMIENTO, type TipoDeMovimiento } from "@/lib/movimientos"
import { veLaLineaDePropinas, whereDeLiquidaciones, type Actor } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { nombreEnElNegocio } from "@/lib/tablero"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { horaDeLaBase } from "@/lib/bloqueos-de-dinero"
import { sumarDias, zonaDelNegocio } from "@/lib/zona-horaria"
import { cantidadDe, numeroDe } from "@/lib/concordancia"
import { conMayuscula, vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import {
  configuracionDelNegocio,
  fechaDeColumna,
  fechaDelNegocio,
  fechaParaColumna,
  finDelPeriodoEn,
  inicioDelPeriodoEn,
  periodoParaLeer,
  proximoPeriodo,
  type ConfiguracionDePeriodo,
  type TipoDePeriodo,
} from "@/lib/periodos-de-liquidacion"

export type { TipoDeMovimiento }

/**
 * La liquidación de un profesional (#68): qué se le debe por un período,
 * calculado sin guardar (vista previa) y congelado al cerrar. Lo usan los
 * endpoints de `app/api/liquidaciones/**`, el comprobante y Mi plata.
 *
 * Qué entra en la próxima liquidación de alguien (`vistaPrevia`):
 * - sus líneas de atenciones finalizadas, sin liquidar, cobradas antes del
 *   fin del período (en la zona del negocio). Hacia atrás, hasta "Liquidar
 *   desde" (`Business.liquidacionDesde`): lo atrasado desde ahí se arrastra,
 *   lo anterior nunca entra;
 * - sus propinas de esas atenciones (si la atención se anuló, deja de contar);
 * - sus adelantos y vales (descuentan) y ajustes (con signo), sin liquidar ni
 *   anular, con fecha hasta el fin del período. Se pueden dejar afuera de a
 *   uno (pasan a la siguiente).
 *
 * - en una clínica dental, su parte (`odontologoCents`) de los abonos de
 *   prótesis cobrados de las que es tratante, recién cuando la prótesis está
 *   entregada: cada abono se libera el día más tardío entre su cobro y la
 *   entrega, y entra en la liquidación cuyo período contiene ese día (o en
 *   la siguiente que se cierre, si se atrasó). Así lo cobrado antes de
 *   entregar entra en la liquidación del período de la entrega, y lo cobrado
 *   después, en la del período de su cobro. Lo cobrado antes de "Liquidar
 *   desde" nunca entra, como el resto. No lleva la comisión de la cascada.
 *
 * total = comisiones (servicios, productos y prótesis) + propinas − adelantos
 * y vales + ajustes. No se cierra
 * con líneas sin % configurado ni con el total negativo. Una línea pendiente
 * que ya tiene % vigente se congela al cerrar, en la misma sentencia que le
 * pone la liquidación (el trigger de la base rechaza congelarla después).
 */

/** El tope del dinero, como `TOTAL_MAXIMO_CENTAVOS` y los CHECK de la base. */
const TOPE_DE_CENTAVOS = 2_000_000_000

type Db = Prisma.TransactionClient

// ─── Errores ─────────────────────────────────────────────────────────────────

/** Un "no" con su código, que se puede lanzar dentro de una transacción para deshacerla. */
export class ErrorDeLiquidacion extends Error {
  readonly status: 400 | 401 | 404 | 409

  constructor(status: 400 | 401 | 404 | 409, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

/** La respuesta para cualquier error de los endpoints de liquidaciones, movimientos y Mi plata. */
export function respuestaDeErrorDePlata(error: unknown, contexto: string): NextResponse {
  if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
  if (error instanceof ErrorDeLiquidacion) return NextResponse.json({ error: error.message }, { status: error.status })
  // El índice único parcial (negocio, miembro, desde): otro cierre del mismo
  // período ganó la carrera. Con el candado no debería pasar; si pasa, 409.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json(
      { error: "Esta liquidación se acaba de cerrar desde otra sesión: vuelve a cargar." },
      { status: 409 }
    )
  }
  // Lo que se iba a escribir ya no existe (P2025: se borró entretanto) o
  // apunta a algo que ya no está (P2003): es una carrera, no un error del
  // servidor. Se dice como 404 y 409, sin registrar.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return NextResponse.json({ error: "Ya no existe: vuelve a cargar." }, { status: 404 })
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return NextResponse.json({ error: "Algo de lo que se usaba cambió mientras tanto: vuelve a cargar." }, { status: 409 })
  }
  registrarError(contexto, error)
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
}

// ─── Quién lo hace ───────────────────────────────────────────────────────────

/**
 * El id y el nombre de quien cierra, paga, anula o registra algo, como
 * `paidById`/`paidByName` en el cobro: el nombre se copia para que el
 * historial lo diga aunque la persona deje el negocio. Sin id de usuario en
 * la sesión, `null` (el endpoint responde 401).
 */
export async function quienFirma(
  db: Db,
  actor: Actor,
  usuarioId: string | null | undefined
): Promise<{ id: string; nombre: string } | null> {
  if (!usuarioId) return null
  const nombre = await nombreEnElNegocio(db, actor, usuarioId)
  return { id: usuarioId, nombre: nombre ?? "Sin nombre" }
}

// ─── Candado ─────────────────────────────────────────────────────────────────

/**
 * Candado de transacción por negocio + miembro: dos cierres (o un cierre y
 * una anulación) de la misma persona se hacen uno detrás del otro. El
 * segundo, al recalcular, ve que el período ya no es el que pidió y responde
 * 409. `$executeRaw` y no `$queryRaw`: la función devuelve `void`, que
 * Prisma no sabe leer como fila.
 */
export async function tomarCandadoDeLiquidacion(tx: Db, businessId: string, memberId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${businessId}), hashtext(${memberId}))`
}

/**
 * Candado de liquidaciones del negocio entero. Lo toma exclusivo el cambio de
 * "Liquidar desde" (`app/api/liquidaciones/liquidar-desde`), y compartido cada
 * cierre, antes del de su miembro: entre cierres no se esperan, pero ninguno
 * pasa a la vez que un cambio de fecha. Así la fecha no cambia en medio de un
 * cierre que la está usando, ni se cambia justo cuando se acaba de cerrar la
 * primera liquidación. La clave es `hashtext('liquidaciones:' || businessId)`,
 * de un solo número: no choca con la de negocio + miembro.
 */
export async function tomarCandadoDeLiquidacionesDelNegocio(
  tx: Db,
  businessId: string,
  modo: "exclusivo" | "compartido"
): Promise<void> {
  const clave = `liquidaciones:${businessId}`
  if (modo === "exclusivo") await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`
  else await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${clave}))`
}

/**
 * Toma el candado de liquidación de cada profesional con líneas o propinas en
 * la atención, en orden estable (por id) para que dos transacciones que toman
 * varios no se crucen en un deadlock. Lo usan la anulación de una atención,
 * antes de mirar si ya está liquidada (así no pasa en medio de un cierre que
 * la está incluyendo), y el cobro, antes de fijar la hora (§7: si un cierre
 * de liquidación está en curso, cobrar espera a que termine). `otros` suma
 * miembros que todavía no están en la atención (las propinas del cobro).
 */
export async function tomarCandadosDeLaAtencion(
  tx: Db,
  businessId: string,
  visitId: string,
  otros: readonly string[] = []
): Promise<void> {
  const [lineas, propinas] = await Promise.all([
    tx.visitService.findMany({
      where: { visitId, visit: { is: { businessId } }, memberId: { not: null } },
      select: { memberId: true },
    }),
    tx.propinaDeAtencion.findMany({
      where: { visitId, businessId, memberId: { not: null } },
      select: { memberId: true },
    }),
  ])
  const miembros = [...new Set([...[...lineas, ...propinas].map((f) => f.memberId as string), ...otros])].sort()
  for (const memberId of miembros) await tomarCandadoDeLiquidacion(tx, businessId, memberId)
}

// ─── El negocio y los porcentajes ────────────────────────────────────────────

export interface NegocioParaLiquidar {
  zona: string
  config: ConfiguracionDePeriodo
  /** "Liquidar desde" (día del negocio), o `null` si la dueña todavía no lo fijó. */
  liquidarDesde: string | null
}

/** El 409 de vista previa y cierre mientras la dueña no fijó "Liquidar desde". */
export const FALTA_LIQUIDAR_DESDE =
  "Antes de liquidar, la dueña tiene que elegir desde qué fecha se liquida (Liquidaciones → Período)."

export async function leerNegocioParaLiquidar(db: Db, businessId: string): Promise<NegocioParaLiquidar> {
  const negocio = await db.business.findUnique({
    where: { id: businessId },
    select: { timezone: true, liquidacionPeriodo: true, liquidacionInicioSemana: true, liquidacionDesde: true },
  })
  return {
    zona: zonaDelNegocio(negocio?.timezone),
    config: configuracionDelNegocio({
      liquidacionPeriodo: negocio?.liquidacionPeriodo,
      liquidacionInicioSemana: negocio?.liquidacionInicioSemana,
    }),
    liquidarDesde: negocio?.liquidacionDesde ? fechaDeColumna(negocio.liquidacionDesde) : null,
  }
}

/** Los % vigentes de una persona, siempre acotados al negocio. */
export async function porcentajesVigentesDe(db: Db, businessId: string, memberId: string): Promise<PorcentajesVigentes> {
  const [miembro, excepciones, productos] = await Promise.all([
    db.businessMember.findFirst({ where: { id: memberId, businessId }, select: { commissionPercent: true } }),
    db.commissionRate.findMany({ where: { businessId, memberId }, select: { serviceId: true, percent: true } }),
    db.producto.findMany({ where: { businessId }, select: { id: true, commissionPercent: true } }),
  ])
  return {
    porMiembro: new Map([[memberId, miembro?.commissionPercent ?? null]]),
    excepciones: new Map([[memberId, new Map(excepciones.map((fila) => [fila.serviceId, fila.percent]))]]),
    porProducto: new Map(productos.map((producto) => [producto.id, producto.commissionPercent])),
  }
}

// ─── Vista previa ────────────────────────────────────────────────────────────

export type EstadoDeLineaEnLiquidacion = "congelada" | "se-congelara" | "sin-porcentaje"
export type TipoDeLinea = "servicio" | "producto"

export interface LineaEnLiquidacion {
  id: string
  visitId: string
  /** El día del negocio en que se cobró. */
  fecha: string
  cliente: string
  detalle: string
  tipo: TipoDeLinea
  precioCents: number
  estado: EstadoDeLineaEnLiquidacion
  porcentaje: number | null
  comisionCents: number | null
}

/**
 * La parte de la odontóloga de un abono de prótesis (`odontologoCents`,
 * congelada al cobrar con la regla de la prótesis). `fecha` es el día en que
 * se liberó: el más tardío entre el cobro y la entrega de la prótesis.
 */
export interface AbonoDeProtesisEnLiquidacion {
  id: string
  visitId: string
  protesisId: string
  /** El día del negocio en que se liberó para liquidar. */
  fecha: string
  /** El día del negocio en que se cobró el abono. */
  cobradoEl: string
  /** El día del negocio en que se entregó la prótesis. */
  entregadaEl: string
  cliente: string
  detalle: string
  /** Lo que pagó el paciente en ese abono. */
  abonoCents: number
  /** La parte de la odontóloga: lo que se le liquida. */
  comisionCents: number
}

export interface PropinaEnLiquidacion {
  id: string
  visitId: string
  fecha: string
  cliente: string
  medio: string
  montoCents: number
}

export interface MovimientoEnLiquidacion {
  id: string
  tipo: TipoDeMovimiento
  montoCents: number
  fecha: string
  motivo: string | null
  /** En la vista previa: si entra en esta liquidación (se puede dejar para la siguiente). */
  incluido: boolean
}

export interface TotalesDeLiquidacion {
  comisionServiciosCents: number
  comisionProductosCents: number
  /** La parte de la odontóloga de los abonos de prótesis entregadas. 0 fuera de una clínica dental. */
  comisionProtesisCents: number
  propinasCents: number
  /** Adelantos y vales: descuentan. */
  adelantosCents: number
  /** Con signo. */
  ajustesCents: number
  brutoCents: number
  totalCents: number
}

export interface VistaPrevia {
  miembro: { id: string; nombre: string }
  periodo: { tipo: TipoDePeriodo; desde: string; hasta: string; zona: string; texto: string }
  hoy: string
  lineas: LineaEnLiquidacion[]
  /** Clínica dental: su parte de los abonos de prótesis ya liberados. Vacío en los demás rubros. */
  protesis: AbonoDeProtesisEnLiquidacion[]
  propinas: PropinaEnLiquidacion[]
  movimientos: MovimientoEnLiquidacion[]
  totales: TotalesDeLiquidacion
  /** Líneas sin % configurado: mientras haya, no se cierra. */
  sinPorcentaje: number
  /** Por qué no se puede cerrar todavía, o `null`. */
  noSePuedeCerrar: string | null
}

const esTipoDeLinea = (tipo: string): TipoDeLinea => (tipo === "producto" ? "producto" : "servicio")

/** Los totales de lo que se incluye. Puro. */
export function calcularTotales(
  lineas: readonly Pick<LineaEnLiquidacion, "tipo" | "comisionCents">[],
  propinas: readonly Pick<PropinaEnLiquidacion, "montoCents">[],
  movimientos: readonly Pick<MovimientoEnLiquidacion, "tipo" | "montoCents" | "incluido">[],
  abonosDeProtesis: readonly Pick<AbonoDeProtesisEnLiquidacion, "comisionCents">[] = []
): TotalesDeLiquidacion {
  const suma = (valores: number[]) => valores.reduce((total, valor) => total + valor, 0)
  const comisionServiciosCents = suma(lineas.filter((l) => l.tipo === "servicio").map((l) => l.comisionCents ?? 0))
  const comisionProductosCents = suma(lineas.filter((l) => l.tipo === "producto").map((l) => l.comisionCents ?? 0))
  const comisionProtesisCents = suma(abonosDeProtesis.map((a) => a.comisionCents))
  const propinasCents = suma(propinas.map((p) => p.montoCents))
  const incluidos = movimientos.filter((m) => m.incluido)
  const adelantosCents = suma(incluidos.filter((m) => m.tipo !== "ajuste").map((m) => m.montoCents))
  const ajustesCents = suma(incluidos.filter((m) => m.tipo === "ajuste").map((m) => m.montoCents))
  const brutoCents = comisionServiciosCents + comisionProductosCents + comisionProtesisCents + propinasCents
  return {
    comisionServiciosCents,
    comisionProductosCents,
    comisionProtesisCents,
    propinasCents,
    adelantosCents,
    ajustesCents,
    brutoCents,
    totalCents: brutoCents - adelantosCents + ajustesCents,
  }
}

/**
 * Por qué no se puede cerrar, o `null`. El orden es el de lo que hay que
 * resolver primero. `palabras` pone el "servicio" del rubro ("Hay 2
 * prestaciones sin porcentaje de comisión"); sin ellas, "servicios", que es lo
 * que arma el servidor, que no mira el rubro.
 */
export function motivoParaNoCerrar(opciones: {
  sinPorcentaje: number
  desde: string
  hoy: string
  totales: TotalesDeLiquidacion
  palabras?: Pick<PalabrasDelRubro, "servicio">
}): string | null {
  const { sinPorcentaje, desde, hoy, totales } = opciones
  const { servicio } = opciones.palabras ?? vocabularioDe(null).palabras
  if (desde > hoy) return "Este período todavía no empieza."
  if (sinPorcentaje > 0) {
    // "Hay 1 servicio" / "Hay 2 servicios": con una sola, el verbo sigue en singular.
    return numeroDe(sinPorcentaje) === "singular"
      ? `Hay ${cantidadDe(sinPorcentaje, servicio)} sin porcentaje de comisión: configúralo en Comisiones antes de cerrar.`
      : `Hay ${cantidadDe(sinPorcentaje, servicio)} sin porcentaje de comisión: configúralos en Comisiones antes de cerrar.`
  }
  const montos = Object.values(totales)
  if (montos.some((monto) => Math.abs(monto) > TOPE_DE_CENTAVOS)) {
    return "Los montos de esta liquidación pasan del tope: pídele ayuda a soporte."
  }
  if (totales.totalCents < 0) {
    return "El total queda en negativo: deja afuera adelantos o vales y pasarán a la siguiente liquidación."
  }
  return null
}

/**
 * Los abonos de prótesis de `memberId` que se pueden liquidar: de prótesis
 * suyas (tratante) y del negocio ya entregadas, con su parte congelada, de una
 * línea suya que no es de la dueña y todavía sin liquidar. El estado de la
 * atención lo agrega quien llama.
 */
function abonosLiberadosDe(businessId: string, memberId: string) {
  return {
    memberId,
    byOwner: false,
    liquidacionId: null,
    protesisId: { not: null },
    odontologoCents: { not: null },
    protesis: { is: { businessId, memberId, entregadaEn: { not: null } } },
  } satisfies Prisma.VisitServiceWhereInput
}

/** El día en que se libera un abono para liquidar: el más tardío entre su cobro y la entrega de la prótesis. Puro. */
export function liberadoEl(cobrado: Date, entregada: Date): Date {
  return cobrado > entregada ? cobrado : entregada
}

/**
 * Lo que tendría la próxima liquidación de `memberId`, sin guardar nada.
 * `null` si la persona no es del negocio. `ahora` decide "hoy" y la fecha
 * con que se congelaría lo pendiente.
 */
export async function vistaPrevia(
  db: Db,
  opciones: { businessId: string; memberId: string; excluirMovimientos?: readonly string[]; ahora: Date }
): Promise<VistaPrevia | null> {
  const { businessId, memberId, ahora } = opciones
  const excluir = new Set(opciones.excluirMovimientos ?? [])

  const miembro = await db.businessMember.findFirst({
    where: { id: memberId, businessId },
    select: { id: true, user: { select: { name: true } } },
  })
  if (!miembro) return null

  const { zona, config, liquidarDesde } = await leerNegocioParaLiquidar(db, businessId)
  if (!liquidarDesde) throw new ErrorDeLiquidacion(409, FALTA_LIQUIDAR_DESDE)
  const hoy = fechaDelNegocio(ahora, zona)
  // Lo cobrado antes de "Liquidar desde" (en la zona del negocio) nunca entra.
  const inicio = inicioDelPeriodoEn(liquidarDesde, zona)

  const [ultima, lineas, abonos, propinas, movimientos] = await Promise.all([
    db.liquidacion.findFirst({
      where: { businessId, memberId, estado: { not: "anulada" } },
      orderBy: { hasta: "desc" },
      select: { hasta: true },
    }),
    db.visitService.findMany({
      where: {
        memberId,
        byOwner: false,
        liquidacionId: null,
        // Los abonos de prótesis van aparte (abajo): no llevan la cascada.
        protesisId: null,
        visit: { is: { businessId, status: "finalizada", paidAt: { gte: inicio } } },
      },
      select: {
        id: true,
        visitId: true,
        tipo: true,
        serviceId: true,
        productId: true,
        serviceName: true,
        priceCents: true,
        commissionPercent: true,
        commissionCents: true,
        commissionAt: true,
        visit: { select: { paidAt: true, customerName: true } },
      },
      orderBy: { id: "asc" },
    }),
    // Su parte de los abonos de prótesis de las que es tratante, ya
    // congelada al cobrar y liberada: la prótesis está entregada.
    db.visitService.findMany({
      where: { ...abonosLiberadosDe(businessId, memberId), visit: { is: { businessId, status: "finalizada", paidAt: { gte: inicio } } } },
      select: {
        id: true,
        visitId: true,
        protesisId: true,
        serviceName: true,
        priceCents: true,
        odontologoCents: true,
        visit: { select: { paidAt: true, customerName: true } },
        protesis: { select: { entregadaEn: true } },
      },
      orderBy: { id: "asc" },
    }),
    db.propinaDeAtencion.findMany({
      where: {
        businessId,
        memberId,
        liquidacionId: null,
        visit: { is: { businessId, status: "finalizada", paidAt: { gte: inicio } } },
      },
      select: {
        id: true,
        visitId: true,
        method: true,
        amountCents: true,
        createdAt: true,
        visit: { select: { paidAt: true, customerName: true } },
      },
      orderBy: { id: "asc" },
    }),
    db.movimientoDeLiquidacion.findMany({
      where: { businessId, memberId, liquidacionId: null, anuladoAt: null, fecha: { gte: fechaParaColumna(liquidarDesde) } },
      select: { id: true, tipo: true, montoCents: true, fecha: true, motivo: true },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    }),
  ])

  const cobradaEn = (visita: { paidAt: Date | null } | null, respaldo: Date) => visita?.paidAt ?? respaldo
  const abonosLeidos = abonos.map((a) => {
    const cobrado = cobradaEn(a.visit, ahora)
    const entregada = a.protesis?.entregadaEn ?? ahora
    return { ...a, cobrado, entregada, liberado: liberadoEl(cobrado, entregada) }
  })
  const fechas = [
    ...lineas.map((l) => fechaDelNegocio(cobradaEn(l.visit, ahora), zona)),
    ...abonosLeidos.map((a) => fechaDelNegocio(a.liberado, zona)),
    ...propinas.map((p) => fechaDelNegocio(cobradaEn(p.visit, p.createdAt), zona)),
    ...movimientos.map((m) => fechaDeColumna(m.fecha)),
  ].sort()

  const primerPendiente = fechas[0] ?? null
  // Sin liquidaciones previas, la primera empieza en el período de lo más
  // antiguo pendiente (o el de hoy), pero nunca antes de "Liquidar desde":
  // así no hay que cerrar uno por uno los períodos vacíos entre el corte y
  // lo primero que hay para liquidar. Termina con su período.
  const primeraDesde = (): string => {
    const delPendiente = proximoPeriodo({ ultimaHasta: null, primerPendiente, hoy, config }).desde
    return delPendiente > liquidarDesde ? delPendiente : liquidarDesde
  }
  const periodo = proximoPeriodo({
    ultimaHasta: ultima ? fechaDeColumna(ultima.hasta) : sumarDias(primeraDesde(), -1),
    primerPendiente,
    hoy,
    config,
  })
  const fin = finDelPeriodoEn(periodo.hasta, zona)

  const lineasDelPeriodo = lineas.filter((l) => cobradaEn(l.visit, ahora) < fin)
  const vigentes = lineasDelPeriodo.some((l) => !l.commissionAt)
    ? await porcentajesVigentesDe(db, businessId, memberId)
    : null

  const lineasEnLiquidacion = lineasDelPeriodo.map((l): LineaEnLiquidacion => {
    const tipo = esTipoDeLinea(l.tipo)
    const comun = {
      id: l.id,
      visitId: l.visitId,
      fecha: fechaDelNegocio(cobradaEn(l.visit, ahora), zona),
      cliente: l.visit?.customerName ?? "",
      detalle: l.serviceName,
      tipo,
      precioCents: l.priceCents,
    }
    if (l.commissionAt) {
      return { ...comun, estado: "congelada", porcentaje: l.commissionPercent, comisionCents: l.commissionCents }
    }
    const congelada = comisionParaCongelar(
      { tipo, byOwner: false, memberId, serviceId: l.serviceId, productId: l.productId, priceCents: l.priceCents },
      vigentes as PorcentajesVigentes,
      ahora
    )
    return congelada.commissionAt
      ? { ...comun, estado: "se-congelara", porcentaje: congelada.commissionPercent, comisionCents: congelada.commissionCents }
      : { ...comun, estado: "sin-porcentaje", porcentaje: null, comisionCents: null }
  })

  const protesisEnLiquidacion: AbonoDeProtesisEnLiquidacion[] = abonosLeidos
    .filter((a) => a.liberado < fin)
    .map((a) => ({
      id: a.id,
      visitId: a.visitId,
      protesisId: a.protesisId ?? "",
      fecha: fechaDelNegocio(a.liberado, zona),
      cobradoEl: fechaDelNegocio(a.cobrado, zona),
      entregadaEl: fechaDelNegocio(a.entregada, zona),
      cliente: a.visit?.customerName ?? "",
      detalle: a.serviceName,
      abonoCents: a.priceCents,
      comisionCents: a.odontologoCents ?? 0,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))

  const propinasEnLiquidacion: PropinaEnLiquidacion[] = propinas
    .filter((p) => cobradaEn(p.visit, p.createdAt) < fin)
    .map((p) => ({
      id: p.id,
      visitId: p.visitId,
      fecha: fechaDelNegocio(cobradaEn(p.visit, p.createdAt), zona),
      cliente: p.visit?.customerName ?? "",
      medio: p.method,
      montoCents: p.amountCents,
    }))

  const movimientosEnLiquidacion: MovimientoEnLiquidacion[] = movimientos
    .filter((m) => fechaDeColumna(m.fecha) <= periodo.hasta)
    .map((m) => ({
      id: m.id,
      tipo: m.tipo as TipoDeMovimiento,
      montoCents: m.montoCents,
      fecha: fechaDeColumna(m.fecha),
      motivo: m.motivo,
      // Sólo adelantos y vales se dejan para la siguiente (§3.7): un ajuste
      // corrige algo ya cobrado y entra siempre.
      incluido: m.tipo === "ajuste" || !excluir.has(m.id),
    }))

  const totales = calcularTotales(lineasEnLiquidacion, propinasEnLiquidacion, movimientosEnLiquidacion, protesisEnLiquidacion)
  const sinPorcentaje = lineasEnLiquidacion.filter((l) => l.estado === "sin-porcentaje").length

  return {
    miembro: { id: miembro.id, nombre: miembro.user.name },
    periodo: { tipo: config.periodo, ...periodo, zona, texto: periodoParaLeer(periodo.desde, periodo.hasta) },
    hoy,
    lineas: lineasEnLiquidacion,
    protesis: protesisEnLiquidacion,
    propinas: propinasEnLiquidacion,
    movimientos: movimientosEnLiquidacion,
    totales,
    sinPorcentaje,
    noSePuedeCerrar: motivoParaNoCerrar({ sinPorcentaje, desde: periodo.desde, hoy, totales }),
  }
}

// ─── Cerrar, pagar, anular ───────────────────────────────────────────────────

const CAMBIO_A_MITAD = "La liquidación cambió mientras tanto (alguien la cerró, la anuló o cobró algo): vuelve a cargarla."

/** El 409 de un cierre cuyo total ya no es el que se confirmó. */
export const CAMBIO_MIENTRAS_CONFIRMABAS =
  "La liquidación cambió mientras confirmabas (se cobró, se anuló o se registró algo): revisa el total nuevo y vuelve a cerrar."

/** El 400 de un cierre que pide dejar afuera un ajuste: sólo adelantos y vales pasan a la siguiente (§3.7). */
export const AJUSTE_NO_SE_EXCLUYE = "Los ajustes no se dejan para la siguiente liquidación: sólo los adelantos y los vales."

/**
 * Cierra la próxima liquidación de `memberId`. Va dentro de una transacción:
 * toma el candado, recalcula, y verifica que el período y el total sean los
 * que se vieron y confirmaron (`desdeEsperado`, `totalEsperadoCents`); si
 * no, 409: lo que se cobró, se anuló o se registró mientras la dueña
 * confirmaba no se cuela en un cierre que no lo mostró. Congela el snapshot y marca líneas,
 * propinas y movimientos con la liquidación. Devuelve el id.
 */
export async function cerrarLiquidacion(
  tx: Db,
  opciones: {
    businessId: string
    memberId: string
    desdeEsperado: string
    /** El total a pagar que se vio al confirmar. */
    totalEsperadoCents: number
    excluirMovimientos: readonly string[]
    nota: string | null
    cerradaPorId: string
    cerradaPorNombre: string
  }
): Promise<string> {
  const { businessId, memberId } = opciones
  // Primero el del negocio, compartido: un cambio de "Liquidar desde" en
  // curso termina antes, y la vista previa de abajo ya lee la fecha nueva.
  await tomarCandadoDeLiquidacionesDelNegocio(tx, businessId, "compartido")
  await tomarCandadoDeLiquidacion(tx, businessId, memberId)
  // La hora del cierre (`cerradaAt`, `commissionAt` y el "hoy" del período)
  // es la de la base, leída DESPUÉS de los candados, no la de esta instancia
  // (#152), igual que la anulación de la liquidación.
  const ahora = await horaDeLaBase(tx)

  const vista = await vistaPrevia(tx, { businessId, memberId, excluirMovimientos: opciones.excluirMovimientos, ahora })
  if (!vista) throw new ErrorDeLiquidacion(404, "Profesional no encontrado")
  if (vista.periodo.desde !== opciones.desdeEsperado) throw new ErrorDeLiquidacion(409, CAMBIO_A_MITAD)
  const excluidos = new Set(opciones.excluirMovimientos)
  if (vista.movimientos.some((m) => m.tipo === "ajuste" && excluidos.has(m.id))) {
    throw new ErrorDeLiquidacion(400, AJUSTE_NO_SE_EXCLUYE)
  }
  if (vista.noSePuedeCerrar) throw new ErrorDeLiquidacion(409, vista.noSePuedeCerrar)
  if (vista.totales.totalCents !== opciones.totalEsperadoCents) {
    throw new ErrorDeLiquidacion(409, CAMBIO_MIENTRAS_CONFIRMABAS)
  }

  const { totales } = vista
  const creada = await tx.liquidacion.create({
    data: {
      businessId,
      memberId,
      memberName: vista.miembro.nombre,
      periodo: vista.periodo.tipo,
      desde: fechaParaColumna(vista.periodo.desde),
      hasta: fechaParaColumna(vista.periodo.hasta),
      zona: vista.periodo.zona,
      estado: "cerrada",
      comisionServiciosCents: totales.comisionServiciosCents,
      comisionProductosCents: totales.comisionProductosCents,
      comisionProtesisCents: totales.comisionProtesisCents,
      propinasCents: totales.propinasCents,
      adelantosCents: totales.adelantosCents,
      ajustesCents: totales.ajustesCents,
      brutoCents: totales.brutoCents,
      totalCents: totales.totalCents,
      cerradaAt: ahora,
      cerradaPorId: opciones.cerradaPorId,
      cerradaPorNombre: opciones.cerradaPorNombre,
      nota: opciones.nota,
    },
    select: { id: true },
  })

  // Sólo lo de atenciones que siguen cobradas: si una se anuló entre la
  // vista previa y acá, el conteo no cuadra y el cierre responde 409.
  const deEstaPersona = { memberId, liquidacionId: null, visit: { is: { businessId, status: "finalizada" } } }

  const yaCongeladas = vista.lineas.filter((l) => l.estado === "congelada").map((l) => l.id)
  if (yaCongeladas.length > 0) {
    const { count } = await tx.visitService.updateMany({
      where: { ...deEstaPersona, id: { in: yaCongeladas }, commissionAt: { not: null } },
      data: { liquidacionId: creada.id },
    })
    if (count !== yaCongeladas.length) throw new ErrorDeLiquidacion(409, CAMBIO_A_MITAD)
  }

  // Lo pendiente con % vigente se congela en la MISMA sentencia que le pone la
  // liquidación: el trigger rechaza tocar la comisión de una línea liquidada.
  for (const linea of vista.lineas.filter((l) => l.estado === "se-congelara")) {
    const { count } = await tx.visitService.updateMany({
      where: { ...deEstaPersona, id: linea.id, commissionAt: null },
      data: {
        commissionPercent: linea.porcentaje,
        commissionCents: linea.comisionCents,
        commissionAt: ahora,
        liquidacionId: creada.id,
      },
    })
    if (count !== 1) throw new ErrorDeLiquidacion(409, CAMBIO_A_MITAD)
  }

  // Los abonos de prótesis, sólo si siguen liberados, sin liquidar y de una
  // atención cobrada: su parte ya está congelada, sólo se marca.
  const abonos = vista.protesis.map((a) => a.id)
  if (abonos.length > 0) {
    const { count } = await tx.visitService.updateMany({
      where: { ...abonosLiberadosDe(businessId, memberId), id: { in: abonos }, visit: { is: { businessId, status: "finalizada" } } },
      data: { liquidacionId: creada.id },
    })
    if (count !== abonos.length) throw new ErrorDeLiquidacion(409, CAMBIO_A_MITAD)
  }

  const propinas = vista.propinas.map((p) => p.id)
  if (propinas.length > 0) {
    const { count } = await tx.propinaDeAtencion.updateMany({
      where: {
        id: { in: propinas },
        businessId,
        memberId,
        liquidacionId: null,
        visit: { is: { businessId, status: "finalizada" } },
      },
      data: { liquidacionId: creada.id },
    })
    if (count !== propinas.length) throw new ErrorDeLiquidacion(409, CAMBIO_A_MITAD)
  }

  const movimientos = vista.movimientos.filter((m) => m.incluido).map((m) => m.id)
  if (movimientos.length > 0) {
    const { count } = await tx.movimientoDeLiquidacion.updateMany({
      where: { id: { in: movimientos }, businessId, memberId, liquidacionId: null, anuladoAt: null },
      data: { liquidacionId: creada.id },
    })
    if (count !== movimientos.length) throw new ErrorDeLiquidacion(409, CAMBIO_A_MITAD)
  }

  return creada.id
}

/** El mensaje de por qué una liquidación no está cerrada (para pagar o anular). */
function noEstaCerrada(estado: string, accion: "pagar" | "anular"): string {
  if (estado === "pagada") {
    return accion === "pagar" ? "Esta liquidación ya está pagada." : "Una liquidación pagada no se anula: corrígela con un ajuste."
  }
  if (estado === "anulada") return "Esta liquidación está anulada."
  return "Esta liquidación ya no está cerrada."
}

/**
 * Marca pagada una liquidación cerrada del negocio. 404 si no es del negocio;
 * 409 si no está cerrada. `pagadaAt` es la hora de la base, no la de esta
 * instancia (#152): no hay candado que esperar, la escritura es un único
 * updateMany condicional, así que se pide justo antes.
 */
export async function pagarLiquidacion(
  tx: Db,
  opciones: { businessId: string; id: string; medio: string; pagadaPorId: string; pagadaPorNombre: string }
): Promise<void> {
  const { businessId, id } = opciones
  const ahora = await horaDeLaBase(tx)
  const { count } = await tx.liquidacion.updateMany({
    where: { id, businessId, estado: "cerrada" },
    data: {
      estado: "pagada",
      pagadaAt: ahora,
      pagadaPorId: opciones.pagadaPorId,
      pagadaPorNombre: opciones.pagadaPorNombre,
      medioDePago: opciones.medio,
    },
  })
  if (count === 1) return
  const actual = await tx.liquidacion.findFirst({ where: { id, businessId }, select: { estado: true } })
  if (!actual) throw new ErrorDeLiquidacion(404, "Liquidación no encontrada")
  throw new ErrorDeLiquidacion(409, noEstaCerrada(actual.estado, "pagar"))
}

/**
 * Anula una liquidación cerrada y no pagada, y libera lo que incluía: sus
 * líneas, propinas y movimientos vuelven a estar pendientes para la próxima.
 * La comisión que se congeló al cerrarla queda congelada (no se descongela).
 *
 * Toma los mismos candados que el cierre y en el mismo orden: primero el del
 * negocio, compartido, y después el del profesional. Así un cambio de
 * "Liquidar desde" (que lo toma exclusivo y cuenta las liquidaciones vivas)
 * espera a que la anulación termine y ya la ve anulada, en vez de responder
 * 409 por una liquidación que se estaba anulando.
 *
 * `anuladaAt` es la hora de la base leída DESPUÉS de los candados, no la de
 * esta instancia, igual que el cobro, la caja y la anulación de atenciones.
 */
export async function anularLiquidacion(
  tx: Db,
  opciones: { businessId: string; id: string; motivo: string; anuladaPorId: string; anuladaPorNombre: string }
): Promise<void> {
  const { businessId, id } = opciones
  await tomarCandadoDeLiquidacionesDelNegocio(tx, businessId, "compartido")
  const liquidacion = await tx.liquidacion.findFirst({ where: { id, businessId }, select: { memberId: true } })
  if (!liquidacion) throw new ErrorDeLiquidacion(404, "Liquidación no encontrada")
  await tomarCandadoDeLiquidacion(tx, businessId, liquidacion.memberId)
  const ahora = await horaDeLaBase(tx)

  const { count } = await tx.liquidacion.updateMany({
    where: { id, businessId, estado: "cerrada" },
    data: {
      estado: "anulada",
      anuladaAt: ahora,
      anuladaPorId: opciones.anuladaPorId,
      anuladaPorNombre: opciones.anuladaPorNombre,
      motivoAnulacion: opciones.motivo,
    },
  })
  if (count !== 1) {
    const actual = await tx.liquidacion.findFirst({ where: { id, businessId }, select: { estado: true } })
    throw new ErrorDeLiquidacion(409, noEstaCerrada(actual?.estado ?? "", "anular"))
  }

  await tx.visitService.updateMany({
    where: { liquidacionId: id, visit: { is: { businessId } } },
    data: { liquidacionId: null },
  })
  await tx.propinaDeAtencion.updateMany({ where: { liquidacionId: id, businessId }, data: { liquidacionId: null } })
  await tx.movimientoDeLiquidacion.updateMany({ where: { liquidacionId: id, businessId }, data: { liquidacionId: null } })
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export type EstadoDeLiquidacion = "cerrada" | "pagada" | "anulada"

export interface ResumenDeLiquidacion {
  id: string
  memberId: string
  miembro: string
  periodo: string
  desde: string
  hasta: string
  texto: string
  estado: EstadoDeLiquidacion
  totalCents: number
  cerradaAt: string
  pagadaAt: string | null
}

export interface DetalleDeLiquidacion extends ResumenDeLiquidacion {
  zona: string
  totales: TotalesDeLiquidacion
  cerradaPorNombre: string
  pagadaPorNombre: string | null
  medioDePago: string | null
  medioDePagoTexto: string | null
  anuladaAt: string | null
  anuladaPorNombre: string | null
  motivoAnulacion: string | null
  nota: string | null
  lineas: Omit<LineaEnLiquidacion, "estado">[]
  /** Clínica dental: los abonos de prótesis que pagó (la parte de la odontóloga). Vacío en los demás rubros. */
  protesis: AbonoDeProtesisEnLiquidacion[]
  propinas: PropinaEnLiquidacion[]
  movimientos: Omit<MovimientoEnLiquidacion, "incluido">[]
}

export const SELECCION_DE_RESUMEN = {
  id: true,
  memberId: true,
  memberName: true,
  periodo: true,
  desde: true,
  hasta: true,
  estado: true,
  totalCents: true,
  cerradaAt: true,
  pagadaAt: true,
} satisfies Prisma.LiquidacionSelect

type FilaDeResumen = Prisma.LiquidacionGetPayload<{ select: typeof SELECCION_DE_RESUMEN }>

export function formatearResumen(fila: FilaDeResumen): ResumenDeLiquidacion {
  const desde = fechaDeColumna(fila.desde)
  const hasta = fechaDeColumna(fila.hasta)
  return {
    id: fila.id,
    memberId: fila.memberId,
    miembro: fila.memberName,
    periodo: fila.periodo,
    desde,
    hasta,
    texto: periodoParaLeer(desde, hasta),
    estado: fila.estado as EstadoDeLiquidacion,
    totalCents: fila.totalCents,
    cerradaAt: fila.cerradaAt.toISOString(),
    pagadaAt: fila.pagadaAt?.toISOString() ?? null,
  }
}

/**
 * Una liquidación con todo lo que incluye, si el actor la ve
 * (`whereDeLiquidaciones`: la gestión, todas las del negocio; el
 * profesional, sólo las suyas). `null` = 404, sea ajena o no exista.
 */
export async function leerLiquidacion(db: Db, actor: Actor, id: string): Promise<DetalleDeLiquidacion | null> {
  const fila = await db.liquidacion.findFirst({
    where: whereDeLiquidaciones(actor, { id }),
    select: {
      ...SELECCION_DE_RESUMEN,
      zona: true,
      comisionServiciosCents: true,
      comisionProductosCents: true,
      comisionProtesisCents: true,
      propinasCents: true,
      adelantosCents: true,
      ajustesCents: true,
      brutoCents: true,
      cerradaPorNombre: true,
      pagadaPorNombre: true,
      medioDePago: true,
      anuladaAt: true,
      anuladaPorNombre: true,
      motivoAnulacion: true,
      nota: true,
      lineas: {
        select: {
          id: true,
          visitId: true,
          tipo: true,
          serviceName: true,
          priceCents: true,
          commissionPercent: true,
          commissionCents: true,
          protesisId: true,
          odontologoCents: true,
          visit: { select: { paidAt: true, customerName: true } },
          protesis: { select: { entregadaEn: true } },
        },
        orderBy: { id: "asc" },
      },
      propinas: {
        select: {
          id: true,
          visitId: true,
          method: true,
          amountCents: true,
          createdAt: true,
          visit: { select: { paidAt: true, customerName: true } },
        },
        orderBy: { id: "asc" },
      },
      movimientos: {
        select: { id: true, tipo: true, montoCents: true, fecha: true, motivo: true },
        orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      },
    },
  })
  if (!fila) return null

  const zona = zonaDelNegocio(fila.zona)
  const dia = (instante: Date | null | undefined, respaldo: Date) => fechaDelNegocio(instante ?? respaldo, zona)
  const lineas = fila.lineas
    .filter((l) => !l.protesisId)
    .map((l) => ({
      id: l.id,
      visitId: l.visitId,
      fecha: dia(l.visit?.paidAt, fila.cerradaAt),
      cliente: l.visit?.customerName ?? "",
      detalle: l.serviceName,
      tipo: esTipoDeLinea(l.tipo),
      precioCents: l.priceCents,
      porcentaje: l.commissionPercent,
      comisionCents: l.commissionCents,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  const protesis = fila.lineas
    .filter((l) => !!l.protesisId)
    .map((l): AbonoDeProtesisEnLiquidacion => {
      const cobrado = l.visit?.paidAt ?? fila.cerradaAt
      const entregada = l.protesis?.entregadaEn ?? fila.cerradaAt
      return {
        id: l.id,
        visitId: l.visitId,
        protesisId: l.protesisId ?? "",
        fecha: dia(liberadoEl(cobrado, entregada), fila.cerradaAt),
        cobradoEl: dia(cobrado, fila.cerradaAt),
        entregadaEl: dia(entregada, fila.cerradaAt),
        cliente: l.visit?.customerName ?? "",
        detalle: l.serviceName,
        abonoCents: l.priceCents,
        comisionCents: l.odontologoCents ?? 0,
      }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  const propinas = fila.propinas
    .map((p) => ({
      id: p.id,
      visitId: p.visitId,
      fecha: dia(p.visit?.paidAt, p.createdAt),
      cliente: p.visit?.customerName ?? "",
      medio: p.method,
      montoCents: p.amountCents,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  return {
    ...formatearResumen(fila),
    zona,
    totales: {
      comisionServiciosCents: fila.comisionServiciosCents,
      comisionProductosCents: fila.comisionProductosCents,
      comisionProtesisCents: fila.comisionProtesisCents,
      propinasCents: fila.propinasCents,
      adelantosCents: fila.adelantosCents,
      ajustesCents: fila.ajustesCents,
      brutoCents: fila.brutoCents,
      totalCents: fila.totalCents,
    },
    cerradaPorNombre: fila.cerradaPorNombre,
    pagadaPorNombre: fila.pagadaPorNombre,
    medioDePago: fila.medioDePago,
    medioDePagoTexto: fila.medioDePago ? nombreDeMedio(fila.medioDePago) : null,
    anuladaAt: fila.anuladaAt?.toISOString() ?? null,
    anuladaPorNombre: fila.anuladaPorNombre,
    motivoAnulacion: fila.motivoAnulacion,
    nota: fila.nota,
    lineas,
    protesis,
    propinas,
    movimientos: fila.movimientos.map((m) => ({
      id: m.id,
      tipo: m.tipo as TipoDeMovimiento,
      montoCents: m.montoCents,
      fecha: fechaDeColumna(m.fecha),
      motivo: m.motivo,
    })),
  }
}

// ─── Comprobante en CSV ──────────────────────────────────────────────────────

export const NOMBRES_DE_ESTADO: Record<EstadoDeLiquidacion, string> = {
  cerrada: "Cerrada, por pagar",
  pagada: "Pagada",
  anulada: "Anulada",
}

/**
 * En pesos para la planilla. Entero, como número: así un negativo (un
 * descuento) no se toma por fórmula y Excel lo suma. Con centavos, texto con
 * coma decimal y siempre dos decimales ("19,90", no "19,9"). Exportada para
 * su prueba.
 */
export const enPesos = (centavos: number): number | string =>
  centavos % 100 === 0 ? centavos / 100 : (centavos / 100).toFixed(2).replace(".", ",")

/**
 * Las filas del comprobante para `escribirCsv`, que protege cada celda
 * contra fórmulas: un cliente llamado "=HYPERLINK(...)" llega como texto.
 *
 * Anulada (QA#13, igual que el comprobante en pantalla): lo que incluía
 * volvió a quedar pendiente, así que no se paga. Lo de cuando se cerró queda
 * como "Total al cerrarse (anulada)" y el total a pagar es 0.
 *
 * `rubro`: cada rubro con sus palabras (`vocabularioDe`): "Odontólogo",
 * "Paciente" y "Prestación" en una clínica dental, "Estilista" en un salón;
 * en un rubro sin palabras propias, como siempre. Una clínica
 * dental tampoco trabaja con propinas: sin plata en ellas, el comprobante no
 * trae la sección ni la fila de propinas (`veLaLineaDePropinas`). Con propinas
 * guardadas de antes sí, y los totales no cambian.
 */
export function filasDelComprobante(detalle: DetalleDeLiquidacion, rubro?: string | null): (string | number | null)[][] {
  const { palabras } = vocabularioDe(rubro)
  const cliente = conMayuscula(palabras.cliente.singular)
  const t = detalle.totales
  const vacia: (string | null)[] = []
  const anulada = detalle.estado === "anulada"
  // La sección de prótesis sólo si hubo (clínica dental): el comprobante de
  // los demás rubros sale igual que siempre.
  const conProtesis = detalle.protesis.length > 0 || t.comisionProtesisCents !== 0
  const conPropinas = detalle.propinas.length > 0 || veLaLineaDePropinas(rubro, t.propinasCents)
  return [
    ["Liquidación", detalle.texto],
    [conMayuscula(palabras.profesional.singular), detalle.miembro],
    ["Período", `${detalle.desde} al ${detalle.hasta}`],
    ["Estado", NOMBRES_DE_ESTADO[detalle.estado]],
    ["Pagada con", detalle.medioDePagoTexto],
    ...(anulada
      ? [
          ["Anulada por", detalle.anuladaPorNombre],
          ["Motivo de la anulación", detalle.motivoAnulacion],
          ["Nota", "Lo que incluía volvió a quedar pendiente para la próxima liquidación: no se paga."],
        ]
      : []),
    vacia,
    ["Fecha", cliente, "Detalle", "Tipo", "Precio", "% comisión", "Comisión"],
    ...detalle.lineas.map((l) => [
      l.fecha,
      l.cliente,
      l.detalle,
      l.tipo === "producto" ? "Producto" : conMayuscula(palabras.servicio.singular),
      enPesos(l.precioCents),
      l.porcentaje === null ? null : String(l.porcentaje).replace(".", ","),
      l.comisionCents === null ? null : enPesos(l.comisionCents),
    ]),
    ...(conProtesis
      ? [
          vacia,
          ["Liberado el", cliente, "Prótesis", "Cobrado el", "Entregada el", "Abono", "Parte de la odontóloga"],
          ...detalle.protesis.map((a) => [
            a.fecha,
            a.cliente,
            a.detalle,
            a.cobradoEl,
            a.entregadaEl,
            enPesos(a.abonoCents),
            enPesos(a.comisionCents),
          ]),
        ]
      : []),
    ...(conPropinas
      ? [
          vacia,
          ["Fecha", cliente, "Propina", "Medio", "Monto"],
          ...detalle.propinas.map((p) => [p.fecha, p.cliente, "Propina", nombreDeMedio(p.medio), enPesos(p.montoCents)]),
        ]
      : []),
    vacia,
    ["Fecha", "Movimiento", "Motivo", "Monto"],
    ...detalle.movimientos.map((m) => [
      m.fecha,
      NOMBRES_DE_MOVIMIENTO[m.tipo],
      m.motivo,
      // Adelantos y vales descuentan: van en negativo, como en el total.
      enPesos(m.tipo === "ajuste" ? m.montoCents : -m.montoCents),
    ]),
    vacia,
    [`Comisión por ${palabras.servicio.plural}`, enPesos(t.comisionServiciosCents)],
    ["Comisión por productos", enPesos(t.comisionProductosCents)],
    ...(conProtesis ? [["Comisión por prótesis", enPesos(t.comisionProtesisCents)]] : []),
    ...(conPropinas ? [["Propinas", enPesos(t.propinasCents)]] : []),
    ["Adelantos y vales", enPesos(-t.adelantosCents)],
    ["Ajustes", enPesos(t.ajustesCents)],
    ...(anulada
      ? [
          ["Total al cerrarse (anulada)", enPesos(t.totalCents)],
          ["Total a pagar", 0],
        ]
      : [["Total a pagar", enPesos(t.totalCents)]]),
  ]
}
