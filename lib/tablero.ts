import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { deCentavos, idDeProfesional, totalEnCentavos } from "@/lib/atenciones"
import { nombreDeMedio } from "@/lib/medios-de-pago"
import {
  puedeVerTodoElTablero,
  whereDeAtenciones,
  whereDeLineas,
  whereDePagos,
  type Actor,
} from "@/lib/permisos"

/**
 * Lo que comparten los endpoints del tablero de atenciones y de los reportes:
 * cómo se lee una atención de la base, cómo viaja al navegador y cómo se
 * responde un error. Las reglas en sí están en `lib/atenciones.ts` (qué se
 * puede hacer) y `lib/permisos.ts` (quién puede).
 */

// ─── Errores ─────────────────────────────────────────────────────────────────

/**
 * Un "no" con su código HTTP. Se lanza también desde dentro de una
 * transacción: así la transacción se deshace entera y el endpoint responde el
 * código y el mensaje que corresponden, en vez de un 500.
 */
export class ErrorDeAtencion extends Error {
  readonly status: 400 | 404 | 409

  constructor(status: 400 | 404 | 409, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

/** La respuesta para cualquier error de estos endpoints. `contexto` es para el log. */
export function respuestaDeError(error: unknown, contexto: string): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
  }
  if (error instanceof ErrorDeAtencion) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(`Error ${contexto}:`, error)
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
}

/**
 * El cuerpo JSON del pedido, o `undefined` si no vino o no es JSON. Así un
 * cuerpo roto lo rechaza zod con un 400, en vez de lanzar un `SyntaxError`
 * que termina en 500.
 */
export async function cuerpoDelPedido(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined)
}

// ─── Rango de fechas ─────────────────────────────────────────────────────────

const instanteSchema = z.string().datetime({ offset: true })

export type Rango = { ok: true; desde: Date; hasta: Date } | { ok: false; error: string }

/**
 * `desde` y `hasta` de la querystring, como instantes ISO. `hasta` es
 * exclusivo: el día se pide como [00:00 de hoy, 00:00 de mañana) en la zona
 * de quien mira, y es el navegador el que la conoce.
 *
 * `maximoMs` acota cuánto se puede pedir de una vez: sin tope, un rango de
 * años trae el histórico entero.
 */
export function leerRango(searchParams: URLSearchParams, maximoMs: number, cuanto: string): Rango {
  const desde = instanteSchema.safeParse(searchParams.get("desde"))
  const hasta = instanteSchema.safeParse(searchParams.get("hasta"))
  if (!desde.success || !hasta.success) {
    return { ok: false, error: "El período pedido no es válido: faltan sus fechas o no tienen zona horaria." }
  }

  const inicio = new Date(desde.data)
  const fin = new Date(hasta.data)
  if (fin <= inicio) return { ok: false, error: "El final del período tiene que ser posterior al inicio." }
  if (fin.getTime() - inicio.getTime() > maximoMs) {
    return { ok: false, error: `El período no puede pasar de ${cuanto}.` }
  }
  return { ok: true, desde: inicio, hasta: fin }
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/**
 * La atención, si el actor la ve. Pide un `Actor` y no `Actor | null`, como
 * `verificarCita`: el endpoint ya cortó con 401 antes de llegar acá. Si es de
 * otro negocio, o de un colega del profesional, da `null` igual que si no
 * existiera: el endpoint responde 404 y no confirma nada.
 */
export function buscarAtencion(actor: Actor, id: string) {
  return prisma.visit.findFirst({
    where: whereDeAtenciones(actor, { id }),
    select: { id: true, businessId: true, status: true, appointmentId: true },
  })
}

const SELECCION_DE_LINEA = {
  id: true,
  serviceId: true,
  serviceName: true,
  memberId: true,
  byOwner: true,
  professionalName: true,
  price: true,
} satisfies Prisma.VisitServiceSelect

const SELECCION_DE_PAGO = {
  id: true,
  method: true,
  amount: true,
} satisfies Prisma.VisitPaymentSelect

/**
 * Tope de líneas y de pagos que se leen de una atención. Son pocos (cada
 * pedido trae hasta 20), pero todo listado lleva `take`, y el mismo tope rige
 * en todas las lecturas para que el total que se muestra y el que se cobra
 * salgan de las mismas líneas.
 */
export const TOPE_POR_ATENCION = 100

/**
 * Qué se lee de una atención según quién mira. Las líneas y los pagos pasan
 * por `lib/permisos.ts`: al profesional la base ni siquiera le devuelve las
 * líneas de otros ni un solo pago.
 */
export function seleccionDeAtencion(actor: Actor) {
  return {
    id: true,
    status: true,
    customerId: true,
    customerName: true,
    appointmentId: true,
    notes: true,
    arrivedAt: true,
    startedAt: true,
    readyAt: true,
    paidAt: true,
    voidedAt: true,
    voidReason: true,
    total: true,
    services: {
      where: whereDeLineas(actor),
      select: SELECCION_DE_LINEA,
      orderBy: { id: "asc" },
      take: TOPE_POR_ATENCION,
    },
    payments: {
      where: whereDePagos(actor),
      select: SELECCION_DE_PAGO,
      orderBy: { createdAt: "asc" },
      take: TOPE_POR_ATENCION,
    },
  } satisfies Prisma.VisitSelect
}

type AtencionLeida = Prisma.VisitGetPayload<{ select: ReturnType<typeof seleccionDeAtencion> }>
type LineaLeida = AtencionLeida["services"][number]
type PagoLeido = AtencionLeida["payments"][number]

/**
 * Toma la atención para escribirla, sólo si sigue en `estado`, y le aplica
 * `datos`. Va primero en cada transacción que escribe una atención:
 *
 * - El UPDATE condicionado bloquea la fila hasta que la transacción termina.
 *   Dos cobros a la vez (un doble clic) no pasan los dos, y nadie cambia las
 *   líneas de una atención mientras se la cobra.
 * - Si otro la movió entretanto, no matchea: se responde 409 en vez de pisar
 *   lo que hizo, y lo que se valide después se valida sobre lo último.
 */
export async function tomarAtencion(
  tx: Prisma.TransactionClient,
  id: string,
  estado: string,
  datos: Prisma.VisitUpdateManyMutationInput
): Promise<void> {
  const { count } = await tx.visit.updateMany({ where: { id, status: estado }, data: datos })
  if (count === 0) {
    throw new ErrorDeAtencion(409, "La atención cambió mientras tanto: vuelve a cargar el tablero.")
  }
}

/**
 * Lee una atención recién verificada o creada, lista para responder. Acota
 * por negocio y no por `whereDeAtenciones` a propósito: un profesional que
 * acaba de quitar su última línea deja de ver la atención, y la respuesta a lo
 * que él mismo hizo no debe ser un 404. Lo que ve de ella sigue pasando por
 * `seleccionDeAtencion`.
 */
export async function leerAtencion(db: Prisma.TransactionClient, actor: Actor, id: string) {
  const atencion = await db.visit.findFirst({
    where: { id, businessId: actor.businessId },
    select: seleccionDeAtencion(actor),
  })
  if (!atencion) throw new ErrorDeAtencion(404, "Atención no encontrada")
  return formatearAtencion(actor, atencion)
}

// ─── Cómo viaja ──────────────────────────────────────────────────────────────

export function formatearLinea(linea: LineaLeida) {
  return {
    id: linea.id,
    servicioId: linea.serviceId,
    servicio: linea.serviceName,
    // `id` en null: quien la hizo ya no está en el equipo (el nombre quedó copiado).
    profesional: { id: idDeProfesional(linea), nombre: linea.professionalName },
    precio: linea.price,
  }
}

export function formatearPago(pago: PagoLeido) {
  return { id: pago.id, medio: pago.method, nombreMedio: nombreDeMedio(pago.method), monto: pago.amount }
}

/**
 * La atención como la ve cada uno. El profesional no recibe `total` ni
 * `pagos`: la clave no viaja, igual que `ingresosMes` en las estadísticas.
 * Para dueño y encargado, el total de una atención abierta es la suma viva de
 * sus líneas; el de una cobrada, el que quedó congelado al cobrarla.
 */
export function formatearAtencion(actor: Actor, atencion: AtencionLeida) {
  const visible = {
    id: atencion.id,
    estado: atencion.status,
    cliente: { id: atencion.customerId, nombre: atencion.customerName },
    citaId: atencion.appointmentId,
    notas: atencion.notes,
    llegoEn: atencion.arrivedAt,
    empezoEn: atencion.startedAt,
    terminoEn: atencion.readyAt,
    cobradaEn: atencion.paidAt,
    anuladaEn: atencion.voidedAt,
    motivoDeAnulacion: atencion.voidReason,
    lineas: atencion.services.map(formatearLinea),
  }

  if (!puedeVerTodoElTablero(actor)) return visible

  return {
    ...visible,
    total: atencion.total ?? deCentavos(totalEnCentavos(atencion.services)),
    pagos: atencion.payments.map(formatearPago),
  }
}

/** Nombre y apellido, como lo escribe el recordatorio por correo. */
export function nombreDeCliente(cliente: { name: string; lastName: string | null }): string {
  return [cliente.name, cliente.lastName].filter(Boolean).join(" ")
}
