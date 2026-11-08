import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { horaDeLaBase } from "@/lib/bloqueos-de-dinero"
import { ErrorClinico } from "@/lib/ficha-clinica-servidor"
import { esMedioDePago, nombreDeMedio } from "@/lib/medios-de-pago"
import {
  puedePagarAlLaboratorio,
  whereDeAbonosPorPagarAlLaboratorio,
  whereDeLaboratorios,
  whereDePagosAlLaboratorio,
  type Actor,
} from "@/lib/permisos"

/**
 * (servidor) "Por pagar al laboratorio" (clínica dental, sólo la dueña): la
 * parte del técnico (`tecnicoCents`) de cada abono de prótesis, congelada al
 * cobrarlo, se le debe al laboratorio de la prótesis desde que la prótesis
 * está entregada (se libera con la misma regla que la parte de la
 * odontóloga). "Marcar pagado" crea un `pagos_al_laboratorio` con el total y
 * liga sus líneas; anular el pago las suelta y vuelven a estar por pagar.
 *
 * No hay liquidación propia del laboratorio: es una lista de lo que se debe y
 * de lo que se pagó (quién, cuándo, con qué medio). El pago NO sale de la
 * caja del día: no cuenta en el cierre de caja, igual que los adelantos
 * (docs/PRODUCTO.md §7). Es plata que la dueña paga por fuera.
 *
 * Candados: pagar y anular traban la fila del laboratorio (`FOR UPDATE`), así
 * dos pagos al mismo laboratorio, o un pago y su anulación, van uno detrás
 * del otro. Pagar además traba las atenciones de las líneas: una anulación de
 * la atención en curso termina antes (y la línea ya no está por pagar), o
 * espera al pago y entonces lo ve (`atencionBloqueada`, motivo
 * "laboratorio").
 */

type Tx = Prisma.TransactionClient

export const MENSAJE_LABORATORIO_NO_ENCONTRADO = "Laboratorio no encontrado"
export const MENSAJE_PAGO_NO_ENCONTRADO = "Pago no encontrado"
export const MENSAJE_LINEA_NO_ENCONTRADA = "Línea no encontrada"
export const MENSAJE_NADA_POR_PAGAR = "No hay nada por pagar a este laboratorio."
export const MENSAJE_LINEA_NO_ESTA_POR_PAGAR =
  "Alguna de las líneas ya no está por pagar a este laboratorio (se pagó, es de otro laboratorio o la prótesis no se entregó): vuelve a cargar."
export const MENSAJE_PAGO_ANULADO = "Este pago ya está anulado."
export const MENSAJE_PASA_DEL_TOPE = "El pago pasa del máximo que se puede registrar de una vez: divídelo en dos."
export const MENSAJE_CAMBIO_A_MITAD = "Lo por pagar cambió mientras tanto: vuelve a cargar."

const TOPE_DE_CENTAVOS = 2_000_000_000
const MAXIMO_DE_LINEAS_POR_PAGO = 1000
const PAGOS_A_MOSTRAR = 200

// ─── Esquemas ────────────────────────────────────────────────────────────────

/** "Marcar pagado": el laboratorio, el medio, y las líneas que se pagan o "todo lo pendiente" de ese laboratorio. */
export const pagoAlLaboratorioSchema = z
  .object({
    laboratorioId: z.string().min(1).max(100),
    medio: z.string().refine(esMedioDePago, "Ese medio de pago no existe."),
    lineas: z.array(z.string().min(1).max(100)).min(1).max(MAXIMO_DE_LINEAS_POR_PAGO).optional(),
    todo: z.literal(true).optional(),
  })
  .refine((pedido) => (pedido.lineas === undefined) !== (pedido.todo === undefined), {
    message: "Indica las líneas que se pagan o todo lo pendiente, una de las dos.",
    path: ["lineas"],
  })

export type PagoAlLaboratorioPedido = z.infer<typeof pagoAlLaboratorioSchema>

// ─── Respuestas ──────────────────────────────────────────────────────────────

export interface LineaPorPagar {
  id: string
  visitId: string
  protesisId: string
  paciente: string
  detalle: string
  /** ISO: cuándo se cobró el abono. */
  cobradoEn: string | null
  /** ISO: cuándo se entregó la prótesis (desde ahí se debe). */
  entregadaEn: string | null
  abonoCents: number
  tecnicoCents: number
}

export interface PorPagarDeUnLaboratorio {
  laboratorio: { id: string; nombre: string; activo: boolean }
  totalCents: number
  lineas: LineaPorPagar[]
}

export interface PorPagarRespuesta {
  laboratorios: PorPagarDeUnLaboratorio[]
  totalCents: number
}

export interface PagoAlLaboratorioRespuesta {
  id: string
  laboratorio: { id: string; nombre: string }
  montoCents: number
  medio: string
  nombreMedio: string
  pagadoEn: string
  pagadoPorNombre: string
  anuladoEn: string | null
  anuladoPorNombre: string | null
  /** Cuántas líneas paga (un pago anulado ya las soltó: 0). */
  lineas: number
}

// ─── Lo por pagar ────────────────────────────────────────────────────────────

/**
 * Lo que se le debe a un laboratorio: abonos de atenciones cobradas (no
 * anuladas), con la parte del técnico congelada y mayor que cero, de
 * prótesis entregadas del negocio con laboratorio, y sin pago todavía.
 */
function porPagar(actor: Actor, extra: Prisma.VisitServiceWhereInput = {}) {
  return whereDeAbonosPorPagarAlLaboratorio(actor, {
    AND: [
      {
        pagoAlLaboratorioId: null,
        tecnicoCents: { gt: 0 },
        visit: { is: { businessId: actor.businessId, status: "finalizada" } },
        protesis: { is: { businessId: actor.businessId, entregadaEn: { not: null }, laboratorioId: { not: null } } },
      },
      extra,
    ],
  })
}

const SELECCION_POR_PAGAR = {
  id: true,
  visitId: true,
  protesisId: true,
  serviceName: true,
  priceCents: true,
  tecnicoCents: true,
  visit: { select: { paidAt: true, customerName: true } },
  protesis: { select: { entregadaEn: true, laboratorioId: true, laboratorioNombre: true } },
} satisfies Prisma.VisitServiceSelect

type LineaLeida = Prisma.VisitServiceGetPayload<{ select: typeof SELECCION_POR_PAGAR }>

function formatearLinea(linea: LineaLeida): LineaPorPagar {
  return {
    id: linea.id,
    visitId: linea.visitId,
    protesisId: linea.protesisId ?? "",
    paciente: linea.visit.customerName,
    detalle: linea.serviceName,
    cobradoEn: linea.visit.paidAt?.toISOString() ?? null,
    entregadaEn: linea.protesis?.entregadaEn?.toISOString() ?? null,
    abonoCents: linea.priceCents,
    tecnicoCents: linea.tecnicoCents ?? 0,
  }
}

const sumarTecnico = (lineas: readonly { tecnicoCents: number | null }[]) => lineas.reduce((total, l) => total + (l.tecnicoCents ?? 0), 0)

/** Lo que se le debe a cada laboratorio, por nombre, con sus líneas de la entrega más vieja a la más nueva. */
export async function leerPorPagar(actor: Actor): Promise<PorPagarRespuesta> {
  if (!puedePagarAlLaboratorio(actor)) throw new ErrorClinico(401, "No autorizado")
  const lineas = await prisma.visitService.findMany({ where: porPagar(actor), select: SELECCION_POR_PAGAR, orderBy: { id: "asc" } })
  const ids = [...new Set(lineas.flatMap((l) => (l.protesis?.laboratorioId ? [l.protesis.laboratorioId] : [])))]
  const laboratorios =
    ids.length === 0
      ? []
      : await prisma.laboratorio.findMany({
          where: whereDeLaboratorios(actor, { id: { in: ids } }),
          select: { id: true, nombre: true, activo: true },
        })

  const grupos: PorPagarDeUnLaboratorio[] = laboratorios.map((laboratorio) => {
    const suyas = lineas
      .filter((l) => l.protesis?.laboratorioId === laboratorio.id)
      .map(formatearLinea)
      .sort((a, b) => (a.entregadaEn ?? "").localeCompare(b.entregadaEn ?? "") || a.id.localeCompare(b.id))
    return { laboratorio, totalCents: sumarTecnico(suyas), lineas: suyas }
  })
  grupos.sort((a, b) => a.laboratorio.nombre.localeCompare(b.laboratorio.nombre, "es"))
  return { laboratorios: grupos, totalCents: grupos.reduce((total, g) => total + g.totalCents, 0) }
}

// ─── Pagos ───────────────────────────────────────────────────────────────────

const SELECCION_DE_PAGO = {
  id: true,
  laboratorioId: true,
  laboratorioNombre: true,
  montoCents: true,
  medio: true,
  pagadoEn: true,
  pagadoPorNombre: true,
  anuladoEn: true,
  anuladoPorNombre: true,
  lineas: { select: { id: true } },
} satisfies Prisma.PagoAlLaboratorioSelect

type PagoLeido = Prisma.PagoAlLaboratorioGetPayload<{ select: typeof SELECCION_DE_PAGO }>

function formatearPago(pago: PagoLeido): PagoAlLaboratorioRespuesta {
  return {
    id: pago.id,
    laboratorio: { id: pago.laboratorioId, nombre: pago.laboratorioNombre },
    montoCents: pago.montoCents,
    medio: pago.medio,
    nombreMedio: nombreDeMedio(pago.medio),
    pagadoEn: pago.pagadoEn.toISOString(),
    pagadoPorNombre: pago.pagadoPorNombre,
    anuladoEn: pago.anuladoEn?.toISOString() ?? null,
    anuladoPorNombre: pago.anuladoPorNombre,
    lineas: pago.lineas.length,
  }
}

/** Los pagos a laboratorios, del más nuevo al más viejo (anulados incluidos); `laboratorioId` los acota a uno. */
export async function leerPagos(actor: Actor, laboratorioId: string | null): Promise<PagoAlLaboratorioRespuesta[]> {
  if (!puedePagarAlLaboratorio(actor)) throw new ErrorClinico(401, "No autorizado")
  const pagos = await prisma.pagoAlLaboratorio.findMany({
    where: whereDePagosAlLaboratorio(actor, laboratorioId ? { laboratorioId } : {}),
    select: SELECCION_DE_PAGO,
    orderBy: [{ pagadoEn: "desc" }, { id: "desc" }],
    take: PAGOS_A_MOSTRAR,
  })
  return pagos.map(formatearPago)
}

async function trabarLaboratorio(tx: Tx, businessId: string, laboratorioId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM laboratorios WHERE id = ${laboratorioId} AND "businessId" = ${businessId} FOR UPDATE`
}

/** Traba las atenciones (en orden por id, para no cruzarse con otra transacción). */
async function trabarAtenciones(tx: Tx, businessId: string, ids: string[]): Promise<void> {
  const ordenados = [...new Set(ids)].sort()
  if (ordenados.length === 0) return
  await tx.$queryRaw`SELECT id FROM atenciones WHERE id IN (${Prisma.join(ordenados)}) AND "businessId" = ${businessId} ORDER BY id FOR UPDATE`
}

/**
 * "Marcar pagado": paga al laboratorio las líneas pedidas, o todo lo que se le
 * debe. Cada línea pedida tiene que estar por pagar a ESE laboratorio: una de
 * otra clínica o que no existe, 404; una de otro laboratorio, ya pagada, de
 * una prótesis sin entregar o de una atención anulada, 409. Sin nada por
 * pagar, 409. El monto es la suma de la parte del técnico de las líneas (lo
 * calcula el servidor). Responde el pago creado.
 */
export async function pagarAlLaboratorio(
  actor: Actor,
  pedido: PagoAlLaboratorioPedido,
  firma: { id: string; nombre: string }
): Promise<PagoAlLaboratorioRespuesta> {
  if (!puedePagarAlLaboratorio(actor)) throw new ErrorClinico(401, "No autorizado")
  return prisma.$transaction(async (tx) => {
    await trabarLaboratorio(tx, actor.businessId, pedido.laboratorioId)
    const laboratorio = await tx.laboratorio.findFirst({
      where: whereDeLaboratorios(actor, { id: pedido.laboratorioId }),
      select: { id: true, nombre: true },
    })
    if (!laboratorio) throw new ErrorClinico(404, MENSAJE_LABORATORIO_NO_ENCONTRADO)

    const delLaboratorio = { protesis: { is: { businessId: actor.businessId, laboratorioId: laboratorio.id } } }
    const pedidas = pedido.lineas ? [...new Set(pedido.lineas)] : null
    const candidatas = await tx.visitService.findMany({
      where: porPagar(actor, { AND: [delLaboratorio, pedidas ? { id: { in: pedidas } } : {}] }),
      select: { id: true, visitId: true, tecnicoCents: true },
      orderBy: { id: "asc" },
    })

    if (pedidas) {
      if (candidatas.length !== pedidas.length) {
        // Las que existen en la clínica (sean de lo que sean): si falta
        // alguna, no es de acá (404); si están todas, alguna no se debe (409).
        const existentes = await tx.visitService.count({ where: whereDeAbonosPorPagarAlLaboratorio(actor, { id: { in: pedidas } }) })
        if (existentes !== pedidas.length) throw new ErrorClinico(404, MENSAJE_LINEA_NO_ENCONTRADA)
        throw new ErrorClinico(409, MENSAJE_LINEA_NO_ESTA_POR_PAGAR)
      }
    } else if (candidatas.length === 0) {
      throw new ErrorClinico(409, MENSAJE_NADA_POR_PAGAR)
    }
    if (candidatas.length > MAXIMO_DE_LINEAS_POR_PAGO) throw new ErrorClinico(400, MENSAJE_PASA_DEL_TOPE)

    const montoCents = sumarTecnico(candidatas)
    if (montoCents <= 0) throw new ErrorClinico(409, MENSAJE_NADA_POR_PAGAR)
    if (montoCents > TOPE_DE_CENTAVOS) throw new ErrorClinico(400, MENSAJE_PASA_DEL_TOPE)

    // Las atenciones, trabadas: si entretanto alguna se anuló, el
    // `updateMany` de abajo ya no la toma y el conteo no cuadra (409).
    await trabarAtenciones(tx, actor.businessId, candidatas.map((l) => l.visitId))
    const ahora = await horaDeLaBase(tx)
    const pago = await tx.pagoAlLaboratorio.create({
      data: {
        businessId: actor.businessId,
        laboratorioId: laboratorio.id,
        laboratorioNombre: laboratorio.nombre,
        montoCents,
        medio: pedido.medio,
        pagadoEn: ahora,
        pagadoPorId: firma.id,
        pagadoPorNombre: firma.nombre,
      },
      select: { id: true },
    })
    const ids = candidatas.map((l) => l.id)
    const { count } = await tx.visitService.updateMany({
      where: porPagar(actor, { AND: [delLaboratorio, { id: { in: ids } }] }),
      data: { pagoAlLaboratorioId: pago.id },
    })
    if (count !== ids.length) throw new ErrorClinico(409, MENSAJE_CAMBIO_A_MITAD)

    const creado = await tx.pagoAlLaboratorio.findFirst({ where: whereDePagosAlLaboratorio(actor, { id: pago.id }), select: SELECCION_DE_PAGO })
    if (!creado) throw new ErrorClinico(404, MENSAJE_PAGO_NO_ENCONTRADO)
    return formatearPago(creado)
  })
}

/**
 * Anula un pago al laboratorio: queda en el historial con quién y cuándo, y
 * sus líneas vuelven a estar por pagar. Uno ya anulado, 409; ajeno, 404.
 */
export async function anularPagoAlLaboratorio(
  actor: Actor,
  pagoId: string,
  firma: { id: string; nombre: string }
): Promise<PagoAlLaboratorioRespuesta> {
  if (!puedePagarAlLaboratorio(actor)) throw new ErrorClinico(401, "No autorizado")
  return prisma.$transaction(async (tx) => {
    const pago = await tx.pagoAlLaboratorio.findFirst({ where: whereDePagosAlLaboratorio(actor, { id: pagoId }), select: { id: true, laboratorioId: true } })
    if (!pago) throw new ErrorClinico(404, MENSAJE_PAGO_NO_ENCONTRADO)
    await trabarLaboratorio(tx, actor.businessId, pago.laboratorioId)
    const ahora = await horaDeLaBase(tx)
    const { count } = await tx.pagoAlLaboratorio.updateMany({
      where: whereDePagosAlLaboratorio(actor, { id: pago.id, anuladoEn: null }),
      data: { anuladoEn: ahora, anuladoPorNombre: firma.nombre },
    })
    if (count !== 1) throw new ErrorClinico(409, MENSAJE_PAGO_ANULADO)
    await tx.visitService.updateMany({
      where: whereDeAbonosPorPagarAlLaboratorio(actor, { pagoAlLaboratorioId: pago.id }),
      data: { pagoAlLaboratorioId: null },
    })
    const anulado = await tx.pagoAlLaboratorio.findFirst({ where: whereDePagosAlLaboratorio(actor, { id: pago.id }), select: SELECCION_DE_PAGO })
    if (!anulado) throw new ErrorClinico(404, MENSAJE_PAGO_NO_ENCONTRADO)
    return formatearPago(anulado)
  })
}
