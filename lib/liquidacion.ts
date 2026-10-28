import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { comisionParaCongelar, type PorcentajesVigentes } from "@/lib/comisiones"
import { nombreDeMedio } from "@/lib/medios-de-pago"
import { NOMBRES_DE_MOVIMIENTO, type TipoDeMovimiento } from "@/lib/movimientos"
import { whereDeLiquidaciones, type Actor } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { nombreEnElNegocio } from "@/lib/tablero"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import {
  configuracionDelNegocio,
  fechaDeColumna,
  fechaDelNegocio,
  fechaParaColumna,
  finDelPeriodoEn,
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
 *   fin del período (en la zona del negocio). Sin límite hacia atrás: lo
 *   atrasado se arrastra;
 * - sus propinas de esas atenciones (si la atención se anuló, deja de contar);
 * - sus adelantos y vales (descuentan) y ajustes (con signo), sin liquidar ni
 *   anular, con fecha hasta el fin del período. Se pueden dejar afuera de a
 *   uno (pasan a la siguiente).
 *
 * total = comisiones + propinas − adelantos y vales + ajustes. No se cierra
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

// ─── El negocio y los porcentajes ────────────────────────────────────────────

export interface NegocioParaLiquidar {
  zona: string
  config: ConfiguracionDePeriodo
}

export async function leerNegocioParaLiquidar(db: Db, businessId: string): Promise<NegocioParaLiquidar> {
  const negocio = await db.business.findUnique({
    where: { id: businessId },
    select: { timezone: true, liquidacionPeriodo: true, liquidacionInicioSemana: true },
  })
  return {
    zona: zonaDelNegocio(negocio?.timezone),
    config: configuracionDelNegocio({
      liquidacionPeriodo: negocio?.liquidacionPeriodo,
      liquidacionInicioSemana: negocio?.liquidacionInicioSemana,
    }),
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
  movimientos: readonly Pick<MovimientoEnLiquidacion, "tipo" | "montoCents" | "incluido">[]
): TotalesDeLiquidacion {
  const suma = (valores: number[]) => valores.reduce((total, valor) => total + valor, 0)
  const comisionServiciosCents = suma(lineas.filter((l) => l.tipo === "servicio").map((l) => l.comisionCents ?? 0))
  const comisionProductosCents = suma(lineas.filter((l) => l.tipo === "producto").map((l) => l.comisionCents ?? 0))
  const propinasCents = suma(propinas.map((p) => p.montoCents))
  const incluidos = movimientos.filter((m) => m.incluido)
  const adelantosCents = suma(incluidos.filter((m) => m.tipo !== "ajuste").map((m) => m.montoCents))
  const ajustesCents = suma(incluidos.filter((m) => m.tipo === "ajuste").map((m) => m.montoCents))
  const brutoCents = comisionServiciosCents + comisionProductosCents + propinasCents
  return {
    comisionServiciosCents,
    comisionProductosCents,
    propinasCents,
    adelantosCents,
    ajustesCents,
    brutoCents,
    totalCents: brutoCents - adelantosCents + ajustesCents,
  }
}

/** Por qué no se puede cerrar, o `null`. El orden es el de lo que hay que resolver primero. */
export function motivoParaNoCerrar(opciones: {
  sinPorcentaje: number
  desde: string
  hoy: string
  totales: TotalesDeLiquidacion
}): string | null {
  const { sinPorcentaje, desde, hoy, totales } = opciones
  if (desde > hoy) return "Este período todavía no empieza."
  if (sinPorcentaje > 0) {
    return sinPorcentaje === 1
      ? "Hay 1 servicio sin porcentaje de comisión: configúralo en Comisiones antes de cerrar."
      : `Hay ${sinPorcentaje} servicios sin porcentaje de comisión: configúralos en Comisiones antes de cerrar.`
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

  const { zona, config } = await leerNegocioParaLiquidar(db, businessId)
  const hoy = fechaDelNegocio(ahora, zona)

  const [ultima, lineas, propinas, movimientos] = await Promise.all([
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
        visit: { is: { businessId, status: "finalizada", paidAt: { not: null } } },
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
    db.propinaDeAtencion.findMany({
      where: { businessId, memberId, liquidacionId: null, visit: { is: { businessId, status: "finalizada" } } },
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
      where: { businessId, memberId, liquidacionId: null, anuladoAt: null },
      select: { id: true, tipo: true, montoCents: true, fecha: true, motivo: true },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    }),
  ])

  const cobradaEn = (visita: { paidAt: Date | null } | null, respaldo: Date) => visita?.paidAt ?? respaldo
  const fechas = [
    ...lineas.map((l) => fechaDelNegocio(cobradaEn(l.visit, ahora), zona)),
    ...propinas.map((p) => fechaDelNegocio(cobradaEn(p.visit, p.createdAt), zona)),
    ...movimientos.map((m) => fechaDeColumna(m.fecha)),
  ].sort()

  const periodo = proximoPeriodo({
    ultimaHasta: ultima ? fechaDeColumna(ultima.hasta) : null,
    primerPendiente: fechas[0] ?? null,
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
      incluido: !excluir.has(m.id),
    }))

  const totales = calcularTotales(lineasEnLiquidacion, propinasEnLiquidacion, movimientosEnLiquidacion)
  const sinPorcentaje = lineasEnLiquidacion.filter((l) => l.estado === "sin-porcentaje").length

  return {
    miembro: { id: miembro.id, nombre: miembro.user.name },
    periodo: { tipo: config.periodo, ...periodo, zona, texto: periodoParaLeer(periodo.desde, periodo.hasta) },
    hoy,
    lineas: lineasEnLiquidacion,
    propinas: propinasEnLiquidacion,
    movimientos: movimientosEnLiquidacion,
    totales,
    sinPorcentaje,
    noSePuedeCerrar: motivoParaNoCerrar({ sinPorcentaje, desde: periodo.desde, hoy, totales }),
  }
}

// ─── Cerrar, pagar, anular ───────────────────────────────────────────────────

const CAMBIO_A_MITAD = "La liquidación cambió mientras tanto (alguien la cerró, la anuló o cobró algo): vuelve a cargarla."

/**
 * Cierra la próxima liquidación de `memberId`. Va dentro de una transacción:
 * toma el candado, recalcula, y verifica que el período sea el que se vio
 * (`desdeEsperado`); si no, 409. Congela el snapshot y marca líneas,
 * propinas y movimientos con la liquidación. Devuelve el id.
 */
export async function cerrarLiquidacion(
  tx: Db,
  opciones: {
    businessId: string
    memberId: string
    desdeEsperado: string
    excluirMovimientos: readonly string[]
    nota: string | null
    cerradaPorId: string
    cerradaPorNombre: string
    ahora: Date
  }
): Promise<string> {
  const { businessId, memberId, ahora } = opciones
  await tomarCandadoDeLiquidacion(tx, businessId, memberId)

  const vista = await vistaPrevia(tx, { businessId, memberId, excluirMovimientos: opciones.excluirMovimientos, ahora })
  if (!vista) throw new ErrorDeLiquidacion(404, "Profesional no encontrado")
  if (vista.periodo.desde !== opciones.desdeEsperado) throw new ErrorDeLiquidacion(409, CAMBIO_A_MITAD)
  if (vista.noSePuedeCerrar) throw new ErrorDeLiquidacion(409, vista.noSePuedeCerrar)

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

  const deEstaPersona = { memberId, liquidacionId: null, visit: { is: { businessId } } }

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

  const propinas = vista.propinas.map((p) => p.id)
  if (propinas.length > 0) {
    const { count } = await tx.propinaDeAtencion.updateMany({
      where: { id: { in: propinas }, businessId, memberId, liquidacionId: null },
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

/** Marca pagada una liquidación cerrada del negocio. 404 si no es del negocio; 409 si no está cerrada. */
export async function pagarLiquidacion(
  tx: Db,
  opciones: { businessId: string; id: string; medio: string; pagadaPorId: string; pagadaPorNombre: string; ahora: Date }
): Promise<void> {
  const { businessId, id } = opciones
  const { count } = await tx.liquidacion.updateMany({
    where: { id, businessId, estado: "cerrada" },
    data: {
      estado: "pagada",
      pagadaAt: opciones.ahora,
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
 */
export async function anularLiquidacion(
  tx: Db,
  opciones: { businessId: string; id: string; motivo: string; anuladaPorId: string; anuladaPorNombre: string; ahora: Date }
): Promise<void> {
  const { businessId, id } = opciones
  const liquidacion = await tx.liquidacion.findFirst({ where: { id, businessId }, select: { memberId: true } })
  if (!liquidacion) throw new ErrorDeLiquidacion(404, "Liquidación no encontrada")
  await tomarCandadoDeLiquidacion(tx, businessId, liquidacion.memberId)

  const { count } = await tx.liquidacion.updateMany({
    where: { id, businessId, estado: "cerrada" },
    data: {
      estado: "anulada",
      anuladaAt: opciones.ahora,
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
          visit: { select: { paidAt: true, customerName: true } },
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
 * coma decimal, como `montoParaPlanilla`.
 */
const enPesos = (centavos: number): number | string =>
  centavos % 100 === 0 ? centavos / 100 : String(centavos / 100).replace(".", ",")

/**
 * Las filas del comprobante para `escribirCsv`, que protege cada celda
 * contra fórmulas: un cliente llamado "=HYPERLINK(...)" llega como texto.
 */
export function filasDelComprobante(detalle: DetalleDeLiquidacion): (string | number | null)[][] {
  const t = detalle.totales
  const vacia: (string | null)[] = []
  return [
    ["Liquidación", detalle.texto],
    ["Profesional", detalle.miembro],
    ["Período", `${detalle.desde} al ${detalle.hasta}`],
    ["Estado", NOMBRES_DE_ESTADO[detalle.estado]],
    ["Pagada con", detalle.medioDePagoTexto],
    vacia,
    ["Fecha", "Cliente", "Detalle", "Tipo", "Precio", "% comisión", "Comisión"],
    ...detalle.lineas.map((l) => [
      l.fecha,
      l.cliente,
      l.detalle,
      l.tipo === "producto" ? "Producto" : "Servicio",
      enPesos(l.precioCents),
      l.porcentaje === null ? null : String(l.porcentaje).replace(".", ","),
      l.comisionCents === null ? null : enPesos(l.comisionCents),
    ]),
    vacia,
    ["Fecha", "Cliente", "Propina", "Medio", "Monto"],
    ...detalle.propinas.map((p) => [p.fecha, p.cliente, "Propina", nombreDeMedio(p.medio), enPesos(p.montoCents)]),
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
    ["Comisión por servicios", enPesos(t.comisionServiciosCents)],
    ["Comisión por productos", enPesos(t.comisionProductosCents)],
    ["Propinas", enPesos(t.propinasCents)],
    ["Adelantos y vales", enPesos(-t.adelantosCents)],
    ["Ajustes", enPesos(t.ajustesCents)],
    ["Total a pagar", enPesos(t.totalCents)],
  ]
}
