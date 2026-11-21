import { Prisma } from "@prisma/client"
import { EN_EL_EQUIPO } from "@/lib/equipo-activo"
import { esMedioDePago } from "@/lib/medios-de-pago"
import {
  MAXIMO_DE_PAQUETES_POR_COBRO,
  estadoDelPaquete,
  montoADevolver,
  nombreDelPaquete,
  restantesDe,
  valorPorSesion,
  venceAtDe,
  type EstadoDelPaquete,
} from "@/lib/paquetes"
import type { Actor } from "@/lib/permisos"

/**
 * (servidor) Lo que los paquetes de sesiones leen y escriben. Las reglas
 * están en `lib/paquetes.ts`. Todo va acotado al negocio del actor: un
 * paquete, una clienta o una línea de otro negocio no existen (404).
 */

type Db = Prisma.TransactionClient

export class ErrorDePaquete extends Error {
  constructor(
    readonly codigo: 400 | 404 | 409,
    mensaje: string
  ) {
    super(mensaje)
  }
}

/** Las sesiones que cuentan: las de atenciones que no están anuladas. */
const USOS_VIVOS = { where: { linea: { visit: { is: { status: { not: "anulada" } } } } }, select: { id: true } } as const

const SELECCION_DE_PAQUETE_DE_CLIENTE = {
  id: true,
  customerId: true,
  serviceId: true,
  serviceName: true,
  sesiones: true,
  priceCents: true,
  valorPorSesionCents: true,
  vendidoAt: true,
  venceAt: true,
  devueltoAt: true,
  devueltoCents: true,
  devueltoMedio: true,
  devueltoPorNombre: true,
  lineaDeVenta: { select: { visit: { select: { status: true } } } },
  usos: USOS_VIVOS,
} satisfies Prisma.PaqueteDeClienteSelect

type PaqueteLeido = Prisma.PaqueteDeClienteGetPayload<{ select: typeof SELECCION_DE_PAQUETE_DE_CLIENTE }>

export interface PaqueteDeClienteVisto {
  id: string
  servicioId: string
  servicio: string
  sesiones: number
  usadas: number
  restantes: number
  estado: EstadoDelPaquete
  vendidoEl: Date
  venceEl: Date | null
  devueltoEl: Date | null
  /** En centavos. `null` para quien no ve montos (`veMontosDePaquetes`). */
  precioCents: number | null
  valorPorSesionCents: number | null
  devueltoCents: number | null
  /** Lo que se devolvería hoy, sólo si está activo o vencido y para quien ve montos. */
  aDevolverCents: number | null
}

function paraEstado(paquete: PaqueteLeido) {
  return {
    sesiones: paquete.sesiones,
    usadas: paquete.usos.length,
    venceAt: paquete.venceAt,
    devueltoAt: paquete.devueltoAt,
    ventaAnulada: paquete.lineaDeVenta.visit.status === "anulada",
  }
}

function verPaquete(paquete: PaqueteLeido, ahora: Date, conMontos: boolean): PaqueteDeClienteVisto {
  const forma = paraEstado(paquete)
  const estado = estadoDelPaquete(forma, ahora)
  const devolvible = estado === "activo" || estado === "vencido"
  return {
    id: paquete.id,
    servicioId: paquete.serviceId,
    servicio: paquete.serviceName,
    sesiones: paquete.sesiones,
    usadas: forma.usadas,
    restantes: restantesDe(forma),
    estado,
    vendidoEl: paquete.vendidoAt,
    venceEl: paquete.venceAt,
    devueltoEl: paquete.devueltoAt,
    precioCents: conMontos ? paquete.priceCents : null,
    valorPorSesionCents: conMontos ? paquete.valorPorSesionCents : null,
    devueltoCents: conMontos ? paquete.devueltoCents : null,
    aDevolverCents: conMontos && devolvible ? montoADevolver({ ...paquete, usadas: forma.usadas }) : null,
  }
}

/** Los paquetes de una clienta del negocio, el más nuevo primero. La pertenencia de la clienta la verifica quien llama. */
export async function paquetesDeLaClienta(
  db: Db,
  businessId: string,
  customerId: string,
  ahora: Date,
  conMontos: boolean
): Promise<PaqueteDeClienteVisto[]> {
  const paquetes = await db.paqueteDeCliente.findMany({
    where: { businessId, customerId },
    select: SELECCION_DE_PAQUETE_DE_CLIENTE,
    orderBy: [{ vendidoAt: "desc" }, { id: "desc" }],
    take: 100,
  })
  return paquetes.map((paquete) => verPaquete(paquete, ahora, conMontos))
}

// ─── En el cobro ─────────────────────────────────────────────────────────────

export interface VentaPedida {
  /** La definición (`PaqueteDeSesiones.id`) que se vende. */
  paqueteId: string
}

export interface UsoPedido {
  /** La línea de la atención que se paga con una sesión. */
  lineaId: string
  /** El paquete de la clienta del que sale la sesión... */
  paqueteDeClienteId?: string
  /** ...o el índice, dentro de `ventas`, del paquete que se vende en este mismo cobro. */
  venta?: number
}

export interface PaquetesDelCobro {
  ventas: readonly VentaPedida[]
  usos: readonly UsoPedido[]
}

export const SIN_PAQUETES: PaquetesDelCobro = { ventas: [], usos: [] }

/** Lo que valida la forma antes de tocar la base; el mensaje se muestra en la caja. */
export function errorDePaquetesPedidos({ ventas, usos }: PaquetesDelCobro): string | null {
  if (ventas.length > MAXIMO_DE_PAQUETES_POR_COBRO || usos.length > MAXIMO_DE_PAQUETES_POR_COBRO * 2) {
    return "Son demasiados paquetes para un solo cobro."
  }
  if (new Set(usos.map((uso) => uso.lineaId)).size !== usos.length) return "Un servicio usa una sola sesión de paquete."
  for (const uso of usos) {
    const deUnVendido = uso.paqueteDeClienteId !== undefined
    const deEsteCobro = uso.venta !== undefined
    if (deUnVendido === deEsteCobro) return "Indica de qué paquete sale la sesión."
    if (deEsteCobro && !ventas[uso.venta as number]) return "Indica de qué paquete sale la sesión."
  }
  return null
}

const PIDE_CLIENTA = "Para vender o usar un paquete, la atención tiene que ser de una clienta de tu lista: así queda guardado a su nombre."

/**
 * Dentro de la transacción del cobro, después de tomar la atención y antes
 * de leer sus líneas y validar los pagos:
 *
 * 1. Cada venta agrega una línea a la atención (el paquete entero, a nombre
 *    de quien cobra, con la comisión congelada en 0 %: se gana al atender
 *    cada sesión) y crea el paquete de la clienta.
 * 2. Cada uso deja la línea con el valor de la sesión y la marca como usada.
 *
 * Devuelve cuánto del total queda pagado con paquetes: el cobro registra ese
 * monto con el medio `paquete` y exige que los demás pagos sumen el resto.
 */
export async function aplicarPaquetesEnElCobro(
  tx: Db,
  actor: Actor,
  visitId: string,
  pedido: PaquetesDelCobro,
  ahora: Date,
  quienCobra: { memberId: string | null; nombre: string | null }
): Promise<{ prepagoCents: number; avisos: AvisoDeSaldo[] }> {
  if (pedido.ventas.length === 0 && pedido.usos.length === 0) return { prepagoCents: 0, avisos: [] }
  const businessId = actor.businessId

  const atencion = await tx.visit.findFirst({ where: { id: visitId, businessId }, select: { customerId: true } })
  if (!atencion) throw new ErrorDePaquete(404, "Atención no encontrada")
  if (!atencion.customerId) throw new ErrorDePaquete(400, PIDE_CLIENTA)
  const customerId = atencion.customerId

  // 1. Las ventas.
  const vendidos: { id: string; serviceId: string; sesiones: number; valorPorSesionCents: number; usadas: number }[] = []
  for (const venta of pedido.ventas) {
    const definicion = await tx.paqueteDeSesiones.findFirst({
      where: { id: venta.paqueteId, businessId, active: true, service: { is: { active: true } } },
      select: { id: true, serviceId: true, sesiones: true, priceCents: true, vigenciaMeses: true, service: { select: { name: true } } },
    })
    if (!definicion) throw new ErrorDePaquete(404, "Ese paquete ya no está disponible. Vuelve a abrir el cobro.")

    // A nombre de quien cobra. La dueña no es miembro: `byOwner`, sin comisión.
    // Un miembro lleva la comisión congelada en 0 %: no queda "pendiente de %".
    const deUnMiembro = quienCobra.memberId
      ? await tx.businessMember.findFirst({ where: { id: quienCobra.memberId, businessId, ...EN_EL_EQUIPO }, select: { id: true } })
      : null
    const linea = await tx.visitService.create({
      data: {
        visitId,
        serviceId: definicion.serviceId,
        serviceName: nombreDelPaquete(definicion.sesiones, definicion.service.name),
        memberId: deUnMiembro?.id ?? null,
        byOwner: !deUnMiembro,
        professionalName: quienCobra.nombre ?? "",
        priceCents: definicion.priceCents,
        tipo: "servicio",
        ...(deUnMiembro ? { commissionPercent: 0, commissionCents: 0, commissionAt: ahora } : {}),
      },
      select: { id: true },
    })
    const valor = valorPorSesion(definicion.priceCents, definicion.sesiones)
    const vendido = await tx.paqueteDeCliente.create({
      data: {
        businessId,
        customerId,
        serviceId: definicion.serviceId,
        serviceName: definicion.service.name,
        paqueteId: definicion.id,
        sesiones: definicion.sesiones,
        priceCents: definicion.priceCents,
        valorPorSesionCents: valor,
        lineaDeVentaId: linea.id,
        vendidoAt: ahora,
        venceAt: venceAtDe(ahora, definicion.vigenciaMeses),
      },
      select: { id: true },
    })
    vendidos.push({ id: vendido.id, serviceId: definicion.serviceId, sesiones: definicion.sesiones, valorPorSesionCents: valor, usadas: 0 })
  }

  // 2. Los usos.
  let prepagoCents = 0
  const tocados = new Map<string, AvisoDeSaldo>()
  for (const uso of pedido.usos) {
    const linea = await tx.visitService.findFirst({
      where: { id: uso.lineaId, visitId, visit: { is: { businessId } } },
      select: {
        id: true,
        tipo: true,
        serviceId: true,
        protesisId: true,
        commissionAt: true,
        paqueteVendido: { select: { id: true } },
        usoDePaquete: { select: { id: true } },
      },
    })
    if (!linea) throw new ErrorDePaquete(404, "Ese servicio ya no está en la atención. Vuelve a abrir el cobro.")
    if (linea.tipo !== "servicio" || !linea.serviceId || linea.protesisId || linea.paqueteVendido || linea.commissionAt) {
      throw new ErrorDePaquete(400, "Con un paquete se paga sólo un servicio de la atención.")
    }
    if (linea.usoDePaquete) throw new ErrorDePaquete(409, "Ese servicio ya usó una sesión de paquete.")

    let paquete: { id: string; serviceId: string; sesiones: number; valorPorSesionCents: number; restantes: number; servicio: string | null }
    if (uso.venta !== undefined) {
      const vendido = vendidos[uso.venta]
      if (!vendido) throw new ErrorDePaquete(400, "Indica de qué paquete sale la sesión.")
      paquete = { ...vendido, restantes: vendido.sesiones - vendido.usadas, servicio: null }
      vendido.usadas += 1
    } else {
      // El candado de la fila: dos cobros a la vez no gastan la misma última sesión.
      await tx.$queryRaw`SELECT id FROM paquetes_de_clientes WHERE id = ${uso.paqueteDeClienteId} AND "businessId" = ${businessId} FOR UPDATE`
      const leido = await tx.paqueteDeCliente.findFirst({
        where: { id: uso.paqueteDeClienteId, businessId, customerId },
        select: SELECCION_DE_PAQUETE_DE_CLIENTE,
      })
      if (!leido) throw new ErrorDePaquete(404, "Ese paquete no es de esta clienta.")
      const forma = paraEstado(leido)
      const estado = estadoDelPaquete(forma, ahora)
      if (estado !== "activo") {
        const porque: Record<Exclude<EstadoDelPaquete, "activo">, string> = {
          agotado: "A ese paquete ya no le quedan sesiones.",
          vencido: "Ese paquete está vencido.",
          devuelto: "Ese paquete fue devuelto.",
          anulado: "La venta de ese paquete fue anulada.",
        }
        throw new ErrorDePaquete(409, porque[estado])
      }
      paquete = {
        id: leido.id,
        serviceId: leido.serviceId,
        sesiones: leido.sesiones,
        valorPorSesionCents: leido.valorPorSesionCents,
        restantes: restantesDe(forma),
        servicio: leido.serviceName,
      }
    }
    if (paquete.restantes <= 0) throw new ErrorDePaquete(409, "A ese paquete ya no le quedan sesiones.")
    if (paquete.serviceId !== linea.serviceId) throw new ErrorDePaquete(400, "Ese paquete es de otro servicio.")

    // La línea queda con lo que vale la sesión: es la base de la comisión de
    // quien atiende, y lo que el medio `paquete` paga.
    await tx.visitService.updateMany({
      where: { id: linea.id, visitId, commissionAt: null },
      data: { priceCents: paquete.valorPorSesionCents },
    })
    await tx.usoDePaquete.create({ data: { businessId, paqueteId: paquete.id, lineaId: linea.id } })
    prepagoCents += paquete.valorPorSesionCents
    if (paquete.servicio !== null) {
      tocados.set(paquete.id, { paqueteId: paquete.id, servicio: paquete.servicio, sesiones: paquete.sesiones, restantes: paquete.restantes - 1 })
    }
  }

  return { prepagoCents, avisos: [...tocados.values()].filter((aviso) => aviso.restantes <= 1) }
}

/** Un paquete al que, después de este cobro, le queda una sesión o ninguna: para avisarle a la clienta. */
export interface AvisoDeSaldo {
  paqueteId: string
  servicio: string
  sesiones: number
  restantes: number
}

// ─── Anular la atención donde se vendió ──────────────────────────────────────

/**
 * Por qué no se puede anular una atención: vendió un paquete del que ya se
 * usaron sesiones (en otras atenciones) o que ya se devolvió. `null` si se
 * puede: anularla deja el paquete sin valor, y las sesiones que esta atención
 * usó de otros paquetes vuelven solas (dejan de contar).
 */
export async function motivoParaNoAnularPorPaquetes(db: Db, businessId: string, visitId: string): Promise<string | null> {
  const vendidos = await db.paqueteDeCliente.findMany({
    where: { businessId, lineaDeVenta: { is: { visitId } } },
    select: { devueltoAt: true, usos: { where: { linea: { visitId: { not: visitId }, visit: { is: { status: { not: "anulada" } } } } }, select: { id: true } } },
    take: MAXIMO_DE_PAQUETES_POR_COBRO,
  })
  if (vendidos.some((paquete) => paquete.devueltoAt)) {
    return "En esta atención se vendió un paquete que ya fue devuelto: no se anula."
  }
  if (vendidos.some((paquete) => paquete.usos.length > 0)) {
    return "En esta atención se vendió un paquete del que ya se usaron sesiones. Si hay que devolver plata, devuelve el paquete desde la ficha de la clienta."
  }
  return null
}

// ─── Devolver ────────────────────────────────────────────────────────────────

/**
 * Devuelve lo no usado de un paquete (sólo la dueña; el endpoint lo verifica).
 * Desde ese momento no se puede usar. Devuelve el monto, en centavos.
 */
export async function devolverPaquete(
  tx: Db,
  businessId: string,
  id: string,
  medio: string,
  ahora: Date,
  quien: { id: string | null; nombre: string }
): Promise<{ devueltoCents: number }> {
  if (!esMedioDePago(medio)) throw new ErrorDePaquete(400, "Elige con qué medio se devuelve la plata.")
  await tx.$queryRaw`SELECT id FROM paquetes_de_clientes WHERE id = ${id} AND "businessId" = ${businessId} FOR UPDATE`
  const paquete = await tx.paqueteDeCliente.findFirst({ where: { id, businessId }, select: SELECCION_DE_PAQUETE_DE_CLIENTE })
  if (!paquete) throw new ErrorDePaquete(404, "Paquete no encontrado")
  const forma = paraEstado(paquete)
  const estado = estadoDelPaquete(forma, ahora)
  if (estado !== "activo" && estado !== "vencido") {
    const porque: Record<Exclude<EstadoDelPaquete, "activo" | "vencido">, string> = {
      agotado: "Ya se usaron todas las sesiones: no queda nada que devolver.",
      devuelto: "Este paquete ya fue devuelto.",
      anulado: "La venta de este paquete fue anulada.",
    }
    throw new ErrorDePaquete(409, porque[estado])
  }
  const devueltoCents = montoADevolver({ ...paquete, usadas: forma.usadas })
  const { count } = await tx.paqueteDeCliente.updateMany({
    where: { id, businessId, devueltoAt: null },
    data: { devueltoAt: ahora, devueltoCents, devueltoMedio: medio, devueltoPorId: quien.id, devueltoPorNombre: quien.nombre },
  })
  if (count === 0) throw new ErrorDePaquete(409, "Este paquete ya fue devuelto.")
  return { devueltoCents }
}
