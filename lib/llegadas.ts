import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { aCentavos, errorDeTotal, esPrecioValido, mismoNombreDeServicio, totalEnCentavos } from "@/lib/atenciones"
import { lineasPedidasSchema, resolverLineas, type LineaResuelta } from "@/lib/lineas-de-atencion"
import { diaEn, esZonaHorariaValida } from "@/lib/reportes"
import {
  profesionalParaLinea,
  puedeVerTodoElTablero,
  whereDeAgenda,
  whereDeClientes,
  type Actor,
} from "@/lib/permisos"
import { ErrorDeAtencion, formatearAtencion, nombreDeCliente, seleccionDeAtencion } from "@/lib/tablero"

/**
 * Cómo entra alguien al tablero de atenciones: con reserva (la cita "llegó")
 * o sin reserva. Lo usa `POST /api/atenciones`; vive acá para que el archivo
 * de la ruta se quede en lo HTTP.
 */

/** Las citas que todavía pueden "llegar": ni canceladas ni completadas. */
export const ESTADOS_DE_RESERVA = ["pendiente", "confirmada", "en-progreso"]

/** Si la cita ya no tiene su ficha de cliente, la atención igual necesita un nombre que mostrar. */
const CLIENTE_SIN_FICHA = "Cliente sin ficha"

/**
 * Cuán lejos de ahora puede estar una reserva para marcar que llegó, cuando
 * el pedido no trae la zona de quien la marca, o trae una que el servidor no
 * reconoce: 24 horas hacia atrás o hacia adelante. Sin zona, el servidor no
 * sabe en qué huso está el local y no puede decir "hoy" con el calendario.
 * Con 24 horas a cada lado caben las reservas de hoy en cualquier huso (salvo
 * los extremos del día de 25 horas del cambio de hora), y una de pasado
 * mañana o de la semana pasada, que es un clic en la tarjeta equivocada, no.
 * Una de mañana temprano sí cabe: por eso la pantalla manda la zona
 * (`llegadaConReservaSchema`).
 */
const VENTANA_DE_LLEGADA_MS = 24 * 60 * 60 * 1000

export const llegadaConReservaSchema = z.object({
  citaId: z.string().min(1),
  /**
   * La zona IANA del dispositivo de quien marca la llegada
   * (`America/Santiago`), la misma con que pide el tablero del día. Con ella,
   * "de hoy" es el día calendario en esa zona; sin ella, la ventana de
   * `VENTANA_DE_LLEGADA_MS`.
   *
   * Un texto que no es una zona que el servidor reconozca
   * (`esZonaHorariaValida`) cuenta como si no hubiera venido: `Etc/Unknown`,
   * de un equipo sin zona configurada, o una zona más nueva que la base de
   * zonas del servidor. Con un 400, "Llegó" fallaría en cada reintento y sin
   * salida, mientras el tablero carga igual (arma el día con `desde`/`hasta`
   * del navegador). No amplía nada: la ventana es lo que el servidor acepta
   * sin zona, y el día de cualquier zona cabe en ella. Lo que no es texto sí
   * es un pedido mal armado: 400.
   */
  zona: z
    .string()
    .transform((zona) => (esZonaHorariaValida(zona) ? zona : undefined))
    .optional(),
})

export type LlegadaConReserva = z.infer<typeof llegadaConReservaSchema>

export const llegadaSinReservaSchema = z
  .object({
    clienteId: z.string().min(1).optional(),
    clienteNuevo: z
      .object({
        nombre: z.string().trim().min(2).max(100),
        telefono: z.string().trim().max(30).optional(),
      })
      .optional(),
    lineas: lineasPedidasSchema.optional(),
    notas: z.string().max(1000).optional(),
  })
  .refine((datos) => !!datos.clienteId !== !!datos.clienteNuevo, {
    message: "Indica un cliente existente o uno nuevo, uno de los dos",
    path: ["clienteId"],
  })

export type LlegadaSinReserva = z.infer<typeof llegadaSinReservaSchema>

interface CitaQueLlega {
  title: string
  price: number | null
  serviceId: string | null
  memberId: string | null
  service: { id: string; name: string; price: number | null; active: boolean } | null
  member: { user: { name: string } } | null
}

/**
 * El servicio de la reserva. Si la cita lo guarda por id (la reserva
 * pública), ése, mientras siga activo: una línea nueva no puede ser de un
 * servicio que ya no se ofrece. Si no (la agenda guarda el servicio como
 * texto en `title`), el servicio activo del negocio que se llama igual; si
 * hay dos con ese nombre no se adivina cuál.
 */
async function servicioDeLaReserva(actor: Actor, cita: CitaQueLlega) {
  if (cita.serviceId) return cita.service?.active ? cita.service : null

  const activos = await prisma.service.findMany({
    where: { businessId: actor.businessId, active: true },
    select: { id: true, name: true, price: true },
    orderBy: { name: "asc" },
    take: 200,
  })
  const conEseNombre = activos.filter((servicio) => mismoNombreDeServicio(servicio.name, cita.title))
  return conEseNombre.length === 1 ? conEseNombre[0] : null
}

/**
 * La línea que se precarga al llegar una reserva, o `null` si la reserva no
 * dice lo suficiente:
 *
 * - El servicio, como lo encuentra `servicioDeLaReserva`.
 * - Quién lo hace: el profesional de la cita, o quien marca la llegada si es
 *   profesional (`profesionalParaLinea`, la misma regla que al anotar). Si
 *   queda sin nadie (dueño o encargado con una cita sin asignar), no se
 *   precarga: toda línea nace con su profesional, y el editor se abre con la
 *   reserva (`reserva` en la atención) para que alguien diga quién.
 * - El precio de la cita o, si no tiene, el del catálogo. Si falta no se
 *   inventa un cero, que se cobraría como cortesía sin que nadie lo decidiera.
 */
async function lineaDeLaReserva(actor: Actor, cita: CitaQueLlega): Promise<LineaResuelta | null> {
  const { memberId } = profesionalParaLinea(actor, { memberId: cita.memberId, byOwner: false })
  if (!memberId) return null

  const servicio = await servicioDeLaReserva(actor, cita)
  if (!servicio) return null

  const precio = cita.price ?? servicio.price
  if (precio === null || !esPrecioValido(precio)) return null

  // Con `whereDeAgenda`, el profesional sólo llega a sus propias citas: quien
  // hace la línea es casi siempre el de la cita, cuyo nombre ya vino. Si no,
  // se busca dentro del negocio.
  const nombre =
    memberId === cita.memberId && cita.member
      ? cita.member.user.name
      : (
          await prisma.businessMember.findFirst({
            where: { id: memberId, businessId: actor.businessId },
            select: { user: { select: { name: true } } },
          })
        )?.user.name
  if (!nombre) return null

  return {
    serviceId: servicio.id,
    serviceName: servicio.name,
    memberId,
    byOwner: false,
    professionalName: nombre,
    priceCents: aCentavos(precio),
  }
}

/**
 * Si la reserva es de hoy: con la zona de quien marca la llegada, si empieza
 * dentro de su día calendario (`diaEn`); sin ella, si está a menos de
 * `VENTANA_DE_LLEGADA_MS` de ahora.
 */
function esDeHoy(inicio: Date, ahora: Date, zona: string | undefined): boolean {
  if (!zona) return Math.abs(inicio.getTime() - ahora.getTime()) <= VENTANA_DE_LLEGADA_MS
  const hoy = diaEn(ahora, zona)
  return inicio >= hoy.desde && inicio < hoy.hasta
}

/**
 * Llegó alguien con reserva: la cita pasa al tablero como atención en espera.
 * La cita tiene que ser visible para el actor (`whereDeAgenda`): una ajena da
 * 404 igual que una que no existe. Y tiene que ser de hoy (`esDeHoy`): una de
 * otro día no está llegando, es un clic en la tarjeta equivocada.
 */
export async function registrarLlegada(actor: Actor, usuarioId: string | null, { citaId, zona }: LlegadaConReserva) {
  const cita = await prisma.appointment.findFirst({
    where: whereDeAgenda(actor, { id: citaId }),
    select: {
      id: true,
      status: true,
      startTime: true,
      title: true,
      price: true,
      serviceId: true,
      memberId: true,
      customerId: true,
      customer: { select: { name: true, lastName: true } },
      service: { select: { id: true, name: true, price: true, active: true } },
      member: { select: { user: { select: { name: true } } } },
      visit: { select: { id: true } },
    },
  })

  if (!cita) throw new ErrorDeAtencion(404, "Cita no encontrada")
  if (cita.visit) throw new ErrorDeAtencion(409, "Esta reserva ya está en el tablero")
  if (!ESTADOS_DE_RESERVA.includes(cita.status)) {
    throw new ErrorDeAtencion(409, "La reserva está cancelada o ya se completó")
  }
  if (!esDeHoy(cita.startTime, new Date(), zona)) {
    throw new ErrorDeAtencion(409, "Esta reserva no es de hoy: sólo se marca la llegada de las reservas del día.")
  }

  const linea = await lineaDeLaReserva(actor, cita)

  try {
    const atencion = await prisma.visit.create({
      data: {
        businessId: actor.businessId,
        customerId: cita.customerId,
        customerName: cita.customer ? nombreDeCliente(cita.customer) : CLIENTE_SIN_FICHA,
        appointmentId: cita.id,
        createdById: usuarioId,
        ...(linea && { services: { create: [linea] } }),
      },
      select: seleccionDeAtencion(actor),
    })
    return formatearAtencion(actor, atencion)
  } catch (error) {
    // Dos personas marcaron "Llegó" a la vez: `appointmentId` es único, así
    // que la segunda choca acá en vez de crear una atención duplicada.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ErrorDeAtencion(409, "Esta reserva ya está en el tablero")
    }
    throw error
  }
}

/**
 * Llegó alguien sin reserva. Con cliente existente o uno nuevo, que se crea en
 * la misma transacción: si algo falla no queda un cliente suelto.
 */
export async function anotarSinReserva(actor: Actor, usuarioId: string | null, datos: LlegadaSinReserva) {
  // Una atención sin líneas sólo la ven dueño y encargado: si el profesional
  // la creara vacía, nunca podría volver a verla.
  if (!puedeVerTodoElTablero(actor) && !datos.lineas?.length) {
    throw new ErrorDeAtencion(400, "Agrega el servicio que vas a hacer: la atención queda a tu nombre.")
  }

  return prisma.$transaction(async (tx) => {
    // `clienteId` se comprueba antes de ir a la consulta y no se confía en el
    // `refine` del esquema: un `id: undefined` Prisma lo ignora, y la consulta
    // devolvería cualquier cliente del negocio.
    const cliente = datos.clienteNuevo
      ? await tx.customer.create({
          data: {
            name: datos.clienteNuevo.nombre,
            phone: datos.clienteNuevo.telefono || null,
            businessId: actor.businessId,
          },
          select: { id: true, name: true, lastName: true },
        })
      : datos.clienteId
        ? await tx.customer.findFirst({
            where: whereDeClientes(actor, { id: datos.clienteId }),
            select: { id: true, name: true, lastName: true },
          })
        : null
    if (!cliente) throw new ErrorDeAtencion(404, "Cliente no encontrado")

    const lineas = await resolverLineas(tx, actor, datos.lineas ?? [])
    // Son todas las líneas de la atención: si su total no cabe, no se crea.
    const excedido = errorDeTotal(totalEnCentavos(lineas))
    if (excedido) throw new ErrorDeAtencion(400, excedido)

    const atencion = await tx.visit.create({
      data: {
        businessId: actor.businessId,
        customerId: cliente.id,
        customerName: nombreDeCliente(cliente),
        notes: datos.notas || null,
        createdById: usuarioId,
        ...(lineas.length > 0 && { services: { create: lineas } }),
      },
      select: seleccionDeAtencion(actor),
    })
    return formatearAtencion(actor, atencion)
  })
}
