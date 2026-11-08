import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { MAXIMO_DE_LINEAS_POR_ATENCION, aCentavos, deCentavos, esEstadoActivo, esMontoDePagoValido } from "@/lib/atenciones"
import { puedeCobrarAbonosDeProtesis, whereDeProtesisParaCobrar, type Actor } from "@/lib/permisos"
import { nombreDeEstado, nombreParaElPlan, repartirMonto } from "@/lib/protesis"
import { ErrorDeAtencion, leerAtencion, lineasDeLaAtencion, tomarAtencion } from "@/lib/tablero"

/**
 * (servidor) El cobro de las prótesis por abonos en la Sala de espera
 * (docs/PRODUCTO.md, "Prótesis"): un abono es una línea de la atención ligada
 * a una prótesis del mismo paciente (`VisitService.protesisId`), sin servicio
 * ni producto y sin la comisión de la cascada. Se cobra con la atención, como
 * cualquier línea, y al cobrarla se congela su reparto en tres partes con la
 * regla congelada de la prótesis (`congelarRepartoDeAbonos`).
 *
 * El saldo de una prótesis es su valor menos los abonos de atenciones no
 * anuladas: los cobrados y también los que están por cobrar en una atención
 * abierta, para que dos abonos a la vez (en dos atenciones, o un doble clic)
 * no pasen el valor. Se mide con la fila de la prótesis trabada
 * (`FOR UPDATE`): el segundo abono espera al primero y ve lo que agregó.
 *
 * Quién: dueño y encargado de la clínica (`puedeCobrarAbonosDeProtesis`).
 * Fuera de una clínica dental, todo 404.
 */

type Tx = Prisma.TransactionClient

export const MENSAJE_ATENCION_NO_ENCONTRADA = "Atención no encontrada"
export const MENSAJE_PROTESIS_NO_ENCONTRADA = "Prótesis no encontrada"
export const MENSAJE_ABONO_NO_ENCONTRADO = "Abono no encontrado"
export const MENSAJE_ATENCION_CERRADA = "Una atención finalizada o anulada ya no se edita."
export const MENSAJE_PROTESIS_ANULADA_SIN_ABONOS = "La prótesis está anulada: no recibe abonos."
export const MENSAJE_SIN_TRATANTE =
  "La odontóloga tratante de esta prótesis ya no está en el equipo: su parte no tiene a quién liquidarse. Avísale a la dueña."
export const MENSAJE_MONTO_INVALIDO = "El abono tiene que ser mayor que cero y con hasta dos decimales."
export const MENSAJE_PROTESIS_PAGADA = "Esta prótesis ya está pagada entera (contando los abonos por cobrar)."

/** Para los mensajes: `$25.000`, como `lib/atenciones.ts`. */
const comoMonto = (centavos: number) => `$${deCentavos(centavos).toLocaleString("es-CL", { maximumFractionDigits: 2 })}`

export const mensajeAbonoPasaElSaldo = (saldoCents: number) =>
  `El abono pasa lo que falta pagar de la prótesis: quedan ${comoMonto(saldoCents)} (contando los abonos por cobrar en la Sala de espera).`

/** Lo que manda la caja: a qué prótesis y cuánto, en unidades como el resto del tablero. */
export const abonoPedidoSchema = z.object({
  protesisId: z.string().min(1).max(100),
  monto: z.number(),
})

export type AbonoPedido = z.infer<typeof abonoPedidoSchema>

/** El nombre de la línea del abono, copiado como el de un servicio: "Abono prótesis · Removible parcial · Acrílico (45, 46)". */
export const nombreDeLaLineaDeAbono = (protesis: Parameters<typeof nombreParaElPlan>[0]) =>
  `Abono prótesis · ${nombreParaElPlan(protesis)}`

// ─── Saldo ───────────────────────────────────────────────────────────────────

export interface CuentaDeLaProtesis {
  valorCents: number
  /** Abonos de atenciones finalizadas. */
  pagadoCents: number
  /** Abonos de atenciones abiertas (en espera, en atención o por cobrar). */
  porCobrarCents: number
  /** Valor − pagado − por cobrar, nunca negativo. */
  saldoCents: number
}

/** Puro: la cuenta de una prótesis con sus abonos de atenciones no anuladas. */
export function cuentaDeLaProtesis(valorCents: number, abonos: readonly { priceCents: number; estado: string }[]): CuentaDeLaProtesis {
  let pagadoCents = 0
  let porCobrarCents = 0
  for (const abono of abonos) {
    if (abono.estado === "finalizada") pagadoCents += abono.priceCents
    else if (esEstadoActivo(abono.estado)) porCobrarCents += abono.priceCents
  }
  return { valorCents, pagadoCents, porCobrarCents, saldoCents: Math.max(valorCents - pagadoCents - porCobrarCents, 0) }
}

/** Los abonos de atenciones no anuladas de unas prótesis del negocio, con el estado de su atención. */
async function abonosVivos(db: Tx, businessId: string, protesisIds: string[]) {
  if (protesisIds.length === 0) return []
  const lineas = await db.visitService.findMany({
    where: { protesisId: { in: protesisIds }, visit: { is: { businessId, status: { not: "anulada" } } } },
    select: { protesisId: true, priceCents: true, visit: { select: { status: true } } },
  })
  return lineas.map((linea) => ({ protesisId: linea.protesisId, priceCents: linea.priceCents, estado: linea.visit.status }))
}

// ─── Lectura: las prótesis que se pueden abonar ──────────────────────────────

export interface ProtesisParaAbonar {
  id: string
  nombre: string
  estado: string
  nombreDeEstado: string
  tratante: string
  /** En unidades, como el tablero. */
  valor: number
  pagado: number
  porCobrar: number
  saldo: number
}

/**
 * Lo que la caja necesita para elegir a qué prótesis abonar en esta atención:
 * las no anuladas de su paciente, con su valor, lo pagado, lo por cobrar y el
 * saldo (sin el reparto, que el encargado no ve). Sin paciente, ninguna.
 */
export async function protesisParaAbonar(actor: Actor, existente: AtencionDelTablero): Promise<ProtesisParaAbonar[]> {
  if (!puedeCobrarAbonosDeProtesis(actor)) throw new ErrorDeAtencion(404, MENSAJE_ATENCION_NO_ENCONTRADA)
  const atencion = await prisma.visit.findFirst({
    where: { id: existente.id, businessId: actor.businessId },
    select: { customerId: true },
  })
  if (!atencion) throw new ErrorDeAtencion(404, MENSAJE_ATENCION_NO_ENCONTRADA)
  if (!atencion.customerId) return []

  const protesis = await prisma.protesis.findMany({
    where: whereDeProtesisParaCobrar(actor, { customerId: atencion.customerId, estado: { not: "anulada" } }),
    select: {
      id: true,
      tipo: true,
      arcada: true,
      piezas: true,
      pilares: true,
      materialNombre: true,
      estado: true,
      tratanteNombre: true,
      valorCents: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  })
  const abonos = await abonosVivos(prisma, actor.businessId, protesis.map((p) => p.id))
  return protesis.map((p) => {
    const cuenta = cuentaDeLaProtesis(p.valorCents, abonos.filter((abono) => abono.protesisId === p.id))
    return {
      id: p.id,
      nombre: nombreParaElPlan(p),
      estado: p.estado,
      nombreDeEstado: nombreDeEstado(p.estado),
      tratante: p.tratanteNombre,
      valor: deCentavos(cuenta.valorCents),
      pagado: deCentavos(cuenta.pagadoCents),
      porCobrar: deCentavos(cuenta.porCobrarCents),
      saldo: deCentavos(cuenta.saldoCents),
    }
  })
}

// ─── Escritura ───────────────────────────────────────────────────────────────

/** La atención del tablero sobre la que se escribe, ya buscada por el endpoint con `buscarAtencion`. */
export interface AtencionDelTablero {
  id: string
  status: string
}

/**
 * Lo cobrado no se reescribe: en una atención finalizada o anulada, 409. El
 * endpoint ya verificó el permiso; esto lo repite y falla cerrado (404).
 */
function verificarAbierta(actor: Actor, atencion: AtencionDelTablero) {
  if (!puedeCobrarAbonosDeProtesis(actor)) throw new ErrorDeAtencion(404, MENSAJE_ATENCION_NO_ENCONTRADA)
  if (!esEstadoActivo(atencion.status)) throw new ErrorDeAtencion(409, MENSAJE_ATENCION_CERRADA)
}

/** Traba la fila de la prótesis hasta que termine la transacción. Acota por negocio: un id ajeno no traba nada. */
export async function trabarProtesis(tx: Tx, businessId: string, protesisId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM protesis WHERE id = ${protesisId} AND "businessId" = ${businessId} FOR UPDATE`
}

/**
 * Agrega un abono a una atención abierta: una línea ligada a la prótesis,
 * a nombre de la tratante (o de la dueña, si la tratante es ella), con el
 * monto pedido. Todo en una transacción:
 *
 * 1. Se toma la atención (`tomarAtencion`): si entretanto la cobraron o la
 *    movieron, 409 y nada.
 * 2. Se traba la prótesis (`FOR UPDATE`) y recién entonces se lee y se mide
 *    el saldo: dos abonos a la vez van uno detrás del otro.
 * 3. La prótesis tiene que ser del mismo paciente y de la clínica (si no,
 *    404), no estar anulada (409) y tener a quién liquidarle su parte (409).
 * 4. El monto: mayor que cero con hasta dos decimales (400) y no más que el
 *    saldo (409).
 * 5. Después de escribir, los topes de la atención (servicios y total): 400.
 */
export async function agregarAbono(actor: Actor, existente: AtencionDelTablero, pedido: AbonoPedido) {
  verificarAbierta(actor, existente)
  if (!esMontoDePagoValido(pedido.monto)) throw new ErrorDeAtencion(400, MENSAJE_MONTO_INVALIDO)
  const montoCents = aCentavos(pedido.monto)

  return prisma.$transaction(async (tx) => {
    await tomarAtencion(tx, actor, existente.id, existente.status, { status: existente.status })
    const atencion = await tx.visit.findFirst({
      where: { id: existente.id, businessId: actor.businessId },
      select: { customerId: true },
    })
    if (!atencion?.customerId) throw new ErrorDeAtencion(404, MENSAJE_PROTESIS_NO_ENCONTRADA)

    await trabarProtesis(tx, actor.businessId, pedido.protesisId)
    const protesis = await tx.protesis.findFirst({
      where: whereDeProtesisParaCobrar(actor, { id: pedido.protesisId, customerId: atencion.customerId }),
      select: {
        id: true,
        tipo: true,
        arcada: true,
        piezas: true,
        pilares: true,
        materialNombre: true,
        estado: true,
        memberId: true,
        byOwner: true,
        tratanteNombre: true,
        valorCents: true,
      },
    })
    if (!protesis) throw new ErrorDeAtencion(404, MENSAJE_PROTESIS_NO_ENCONTRADA)
    if (protesis.estado === "anulada") throw new ErrorDeAtencion(409, MENSAJE_PROTESIS_ANULADA_SIN_ABONOS)
    if (!protesis.byOwner && !protesis.memberId) throw new ErrorDeAtencion(409, MENSAJE_SIN_TRATANTE)

    const cuenta = cuentaDeLaProtesis(protesis.valorCents, await abonosVivos(tx, actor.businessId, [protesis.id]))
    if (cuenta.saldoCents === 0) throw new ErrorDeAtencion(409, MENSAJE_PROTESIS_PAGADA)
    if (montoCents > cuenta.saldoCents) throw new ErrorDeAtencion(409, mensajeAbonoPasaElSaldo(cuenta.saldoCents))

    await tx.visitService.create({
      data: {
        visitId: existente.id,
        serviceId: null,
        tipo: "servicio",
        serviceName: nombreDeLaLineaDeAbono(protesis),
        memberId: protesis.byOwner ? null : protesis.memberId,
        byOwner: protesis.byOwner,
        professionalName: protesis.tratanteNombre,
        priceCents: montoCents,
        protesisId: protesis.id,
      },
      select: { id: true },
    })

    const { errorDelTotalQueVe } = await lineasDeLaAtencion(tx, actor, existente.id)
    if (errorDelTotalQueVe) throw new ErrorDeAtencion(400, errorDelTotalQueVe)

    return leerAtencion(tx, actor, existente.id)
  })
}

/**
 * Quita un abono de una atención abierta (se anotó por error o con otro
 * monto). Lo cobrado no se toca: en una atención finalizada o anulada, 409.
 * Una línea que no es un abono de esta atención: 404.
 */
export async function quitarAbono(actor: Actor, existente: AtencionDelTablero, lineaId: string) {
  verificarAbierta(actor, existente)
  return prisma.$transaction(async (tx) => {
    await tomarAtencion(tx, actor, existente.id, existente.status, { status: existente.status })
    const { count } = await tx.visitService.deleteMany({
      where: { AND: [{ id: lineaId, protesisId: { not: null } }, { visitId: existente.id, visit: { is: { businessId: actor.businessId } } }] },
    })
    if (count === 0) throw new ErrorDeAtencion(404, MENSAJE_ABONO_NO_ENCONTRADO)
    return leerAtencion(tx, actor, existente.id)
  })
}

// ─── Al cobrar ───────────────────────────────────────────────────────────────

/**
 * Congela el reparto de cada abono de la atención en sus tres partes
 * (odontóloga tratante, clínica y técnico) con la regla que la prótesis
 * congeló al crearse (`repartirMonto`, al centavo: odontóloga y técnico
 * redondeados, la clínica con el resto). Si la tratante es la dueña, su parte
 * va a la clínica. Va dentro de la transacción del cobro, después de tomar la
 * atención: nada se congela dos veces, y lo congelado no cambia más (lo
 * impide además el trigger `atencion_servicios_reparto_de_protesis`).
 */
export async function congelarRepartoDeAbonos(tx: Tx, businessId: string, visitId: string): Promise<void> {
  const deLaAtencion = { visitId, visit: { is: { businessId } } }
  const abonos = await tx.visitService.findMany({
    where: { AND: [deLaAtencion, { protesisId: { not: null }, odontologoCents: null }] },
    select: {
      id: true,
      priceCents: true,
      byOwner: true,
      protesis: { select: { businessId: true, byOwner: true, pbOdontologo: true, pbClinica: true, pbTecnico: true } },
    },
    orderBy: { id: "asc" },
    take: MAXIMO_DE_LINEAS_POR_ATENCION,
  })
  for (const abono of abonos) {
    // Inalcanzable: el trigger ya exige que la prótesis sea del negocio de la atención.
    if (!abono.protesis || abono.protesis.businessId !== businessId) throw new ErrorDeAtencion(404, MENSAJE_PROTESIS_NO_ENCONTRADA)
    const reparto = repartirMonto(abono.priceCents, abono.protesis, abono.protesis.byOwner || abono.byOwner)
    const { count } = await tx.visitService.updateMany({
      where: { AND: [{ id: abono.id, odontologoCents: null }, deLaAtencion] },
      data: reparto,
    })
    if (count !== 1) throw new ErrorDeAtencion(409, "La atención cambió mientras tanto: vuelve a cargar el tablero.")
  }
}
