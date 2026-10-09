import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  MAXIMO_DE_LINEAS_POR_ATENCION,
  MAXIMO_DE_PAGOS,
  deCentavos,
  errorDeCantidadDeLineas,
  errorDeTotal,
  idDeProfesional,
  totalEnCentavos,
  type LineaDeAtencion,
} from "@/lib/atenciones"
import { nombreDeMedio } from "@/lib/medios-de-pago"
import {
  puedeVerCita,
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
    select: { id: true, businessId: true, status: true, appointmentId: true, startedAt: true },
  })
}

const SELECCION_DE_LINEA = {
  id: true,
  serviceId: true,
  serviceName: true,
  memberId: true,
  byOwner: true,
  professionalName: true,
  priceCents: true,
} satisfies Prisma.VisitServiceSelect

const SELECCION_DE_PAGO = {
  id: true,
  method: true,
  amountCents: true,
} satisfies Prisma.VisitPaymentSelect

/**
 * Las líneas y los pagos de una atención que ve el actor. Pasan por
 * `lib/permisos.ts`: al profesional la base ni siquiera le devuelve las
 * líneas de otros ni un solo pago. Los `take` son los topes de
 * `lib/atenciones.ts`, que se validan al escribir y al cobrar: una atención
 * cobrada nunca tiene más, así que leer con ellos trae todo y el total que se
 * muestra sale de las mismas líneas que se cobraron. Una abierta sólo puede
 * pasarse si entre varios profesionales, cada uno dentro de su tope, cargan
 * más de la cuenta (`lineasDeLaAtencion`); no se cobra hasta que dueño o
 * encargado la corrigen.
 */
function lineasQueVe(actor: Actor) {
  return {
    where: whereDeLineas(actor),
    select: SELECCION_DE_LINEA,
    orderBy: { id: "asc" },
    take: MAXIMO_DE_LINEAS_POR_ATENCION,
  } satisfies Prisma.Visit$servicesArgs
}

function pagosQueVe(actor: Actor) {
  return {
    where: whereDePagos(actor),
    select: SELECCION_DE_PAGO,
    orderBy: { createdAt: "asc" },
    take: MAXIMO_DE_PAGOS,
  } satisfies Prisma.Visit$paymentsArgs
}

/** De la reserva de origen, lo que precarga el editor cuando la atención todavía no tiene líneas. */
const SELECCION_DE_RESERVA = {
  businessId: true,
  memberId: true,
  serviceId: true,
  title: true,
  price: true,
  member: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.AppointmentSelect

/**
 * Qué se lee de una atención según quién mira, para el tablero.
 *
 * `totalCents` sólo se le pide a la base para quien puede verlo: al
 * profesional no le viaja, y así tampoco sale de la base. Prisma lo tipa como
 * presente igual (un `select` con `boolean` no se distingue de uno con
 * `true`); lo lee sólo código que ya preguntó `puedeVerTodoElTablero`.
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
    totalCents: puedeVerTodoElTablero(actor),
    services: lineasQueVe(actor),
    payments: pagosQueVe(actor),
    appointment: { select: SELECCION_DE_RESERVA },
  } satisfies Prisma.VisitSelect
}

/**
 * Lo que leen los reportes, de lo cobrado y de lo anulado: lo mismo que el
 * tablero salvo la reserva de origen, que el historial no muestra y que en un
 * período largo serían miles de lecturas de más.
 */
export function seleccionParaReporte(actor: Actor) {
  return {
    id: true,
    customerId: true,
    customerName: true,
    paidAt: true,
    voidedAt: true,
    voidReason: true,
    voidedByName: true,
    totalCents: puedeVerTodoElTablero(actor),
    services: lineasQueVe(actor),
    payments: pagosQueVe(actor),
  } satisfies Prisma.VisitSelect
}

type AtencionLeida = Prisma.VisitGetPayload<{ select: ReturnType<typeof seleccionDeAtencion> }>
type LineaLeida = AtencionLeida["services"][number]
type PagoLeido = AtencionLeida["payments"][number]
type ReservaLeida = NonNullable<AtencionLeida["appointment"]>

/**
 * Toma la atención para escribirla, sólo si sigue en `estado`, y le aplica
 * `datos`. Va primero en cada transacción que escribe una atención:
 *
 * - El UPDATE condicionado bloquea la fila hasta que la transacción termina.
 *   Dos cobros a la vez (un doble clic) no pasan los dos, y nadie cambia las
 *   líneas de una atención mientras se la cobra.
 * - Si otro la movió entretanto, no matchea: se responde 409 en vez de pisar
 *   lo que hizo, y lo que se valide después se valida sobre lo último.
 * - Acota por el negocio del actor, no sólo por el id. Hoy cada endpoint
 *   llega acá con un id que ya verificó con `whereDeAtenciones`, pero una
 *   escritura no puede depender de que el llamador se acuerde: si alguna vez
 *   llega un id ajeno, no matchea y no se escribe nada en otro negocio.
 *
 * `condicion` es lo que además tiene que seguir siendo cierto (deshacer una
 * llegada exige que no haya empezado). Va en un `AND` aparte, para que no
 * pueda pisar el id, el negocio ni el estado.
 */
export async function tomarAtencion(
  tx: Prisma.TransactionClient,
  actor: Actor,
  id: string,
  estado: string,
  datos: Prisma.VisitUpdateManyMutationInput,
  condicion: Prisma.VisitWhereInput = {}
): Promise<void> {
  const { count } = await tx.visit.updateMany({
    where: { AND: [{ id, businessId: actor.businessId, status: estado }, condicion] },
    data: datos,
  })
  if (count === 0) {
    throw new ErrorDeAtencion(409, "La atención cambió mientras tanto: vuelve a cargar el tablero.")
  }
}

/** La línea como la leen las reglas de `lib/atenciones.ts`, que hablan en unidades. */
function paraReglas(linea: { memberId: string | null; byOwner: boolean; priceCents: number }): LineaDeAtencion {
  return { memberId: linea.memberId, byOwner: linea.byOwner, price: deCentavos(linea.priceCents) }
}

const SELECCION_PARA_REGLAS = { memberId: true, byOwner: true, priceCents: true } satisfies Prisma.VisitServiceSelect

/**
 * Las líneas de una atención para validarla. Va dentro de la transacción y
 * después de `tomarAtencion`, para que nadie las cambie en el medio.
 *
 * - Los topes de servicios y de total se validan sobre las líneas que ve el
 *   actor (`whereDeLineas`): todas para dueño y encargado, sólo las suyas para
 *   el profesional. Sobre la atención entera, el 400 le diría al profesional
 *   lo que no ve: probando precios o cantidades en sus líneas deduciría cuánto
 *   suman o cuántas son las de los demás. La atención entera se sigue
 *   validando donde actúan dueño o encargado, que la ven completa: al
 *   editarla, al moverla y al cobrarla, que es cuando el total se congela.
 * - Primero se cuentan, y si pasan del tope es un 400. Leerlas con `take` y
 *   seguir habría validado (y al cobrar, congelado) el total de una parte.
 *   Después se mira que el total quepa en la columna (`TOTAL_MAXIMO_CENTAVOS`).
 * - `lineas`, para los requisitos de `requisitoFaltante`, son todas: un
 *   requisito se cumple o no sobre la atención entera.
 * - `totalCentavos` es el de las líneas que ve el actor: el de la atención
 *   entera sólo para dueño y encargado, los únicos que cobran.
 */
export async function lineasDeLaAtencion(tx: Prisma.TransactionClient, actor: Actor, visitId: string) {
  const queVe = whereDeLineas(actor, { visitId })

  const demasiadas = errorDeCantidadDeLineas(await tx.visitService.count({ where: queVe }))
  if (demasiadas) throw new ErrorDeAtencion(400, demasiadas)

  const vistas = await tx.visitService.findMany({
    where: queVe,
    select: SELECCION_PARA_REGLAS,
    orderBy: { id: "asc" },
    take: MAXIMO_DE_LINEAS_POR_ATENCION,
  })
  const totalCentavos = totalEnCentavos(vistas)
  const excedido = errorDeTotal(totalCentavos)
  if (excedido) throw new ErrorDeAtencion(400, excedido)

  // Dueño y encargado ya leyeron todas.
  const todas = puedeVerTodoElTablero(actor)
    ? vistas
    : await tx.visitService.findMany({
        where: { visitId, visit: { is: { businessId: actor.businessId } } },
        select: SELECCION_PARA_REGLAS,
        orderBy: { id: "asc" },
        take: MAXIMO_DE_LINEAS_POR_ATENCION,
      })

  return { lineas: todas.map(paraReglas), totalCentavos }
}

/**
 * El nombre de un usuario dentro del negocio del actor: su dueño o uno de sus
 * miembros; si no es ninguno, `null`. Es lo que se copia al cobrar y al anular
 * (`paidByName`, `voidedByName`), igual que `professionalName` en las líneas:
 * si después deja el negocio, el historial sigue diciendo quién fue.
 */
export async function nombreEnElNegocio(
  db: Prisma.TransactionClient,
  actor: Actor,
  usuarioId: string | null
): Promise<string | null> {
  if (!usuarioId) return null
  const [negocio, miembro] = await Promise.all([
    db.business.findFirst({
      where: { id: actor.businessId, userId: usuarioId },
      select: { user: { select: { name: true } } },
    }),
    db.businessMember.findFirst({
      where: { businessId: actor.businessId, userId: usuarioId },
      select: { user: { select: { name: true } } },
    }),
  ])
  return negocio?.user.name ?? miembro?.user.name ?? null
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

/** En la base va en centavos; por la API, en unidades con hasta dos decimales. */
export function formatearLinea(linea: LineaLeida) {
  return {
    id: linea.id,
    servicioId: linea.serviceId,
    servicio: linea.serviceName,
    // `id` en null: quien la hizo ya no está en el equipo (el nombre quedó copiado).
    profesional: { id: idDeProfesional(linea), nombre: linea.professionalName },
    precio: deCentavos(linea.priceCents),
  }
}

export function formatearPago(pago: PagoLeido) {
  return {
    id: pago.id,
    medio: pago.method,
    nombreMedio: nombreDeMedio(pago.method),
    monto: deCentavos(pago.amountCents),
  }
}

/**
 * El total que ve dueño o encargado, en unidades: el congelado al cobrar, o
 * mientras está abierta, la suma viva de sus líneas.
 */
export function totalVisible(atencion: { totalCents: number | null; services: readonly { priceCents: number }[] }) {
  return deCentavos(atencion.totalCents ?? totalEnCentavos(atencion.services))
}

/**
 * De qué reserva nació la atención, para que el editor precargue el servicio
 * cuando todavía no hay líneas: la llegada no siempre puede armar la línea
 * sola (una cita sin profesional, o con un servicio escrito que no está en el
 * catálogo). `servicioId` es el de la cita, que puede ya no estar activo.
 *
 * `null` si no nació de una cita, si la cita se borró, o si el actor no ve
 * esa cita: un profesional ve la atención de la cita de un colega cuando
 * tiene una línea en ella, y eso no le muestra la agenda del colega.
 */
function reservaDe(actor: Actor, cita: ReservaLeida | null) {
  if (!cita || !puedeVerCita(actor, cita)) return null
  return {
    servicioId: cita.serviceId,
    titulo: cita.title,
    precio: cita.price,
    profesional: cita.member ? { id: cita.member.id, nombre: cita.member.user.name } : null,
  }
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
    reserva: reservaDe(actor, atencion.appointment),
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
    total: totalVisible(atencion),
    pagos: atencion.payments.map(formatearPago),
  }
}

/** Nombre y apellido, como lo escribe el recordatorio por correo. */
export function nombreDeCliente(cliente: { name: string; lastName: string | null }): string {
  return [cliente.name, cliente.lastName].filter(Boolean).join(" ")
}
