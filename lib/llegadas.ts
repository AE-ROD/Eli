import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { esPrecioValido } from "@/lib/atenciones"
import { lineasPedidasSchema, resolverLineas, type LineaResuelta } from "@/lib/lineas-de-atencion"
import { puedeVerTodoElTablero, whereDeAgenda, whereDeClientes, type Actor } from "@/lib/permisos"
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

export const llegadaConReservaSchema = z.object({
  citaId: z.string().min(1),
})

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

/**
 * La línea que se precarga al llegar una reserva: sólo si la cita ya dice qué
 * servicio, quién lo hace y cuánto cuesta. Si falta el precio no se inventa
 * un cero, que se cobraría como cortesía sin que nadie lo decidiera.
 */
function lineaDeLaReserva(cita: {
  serviceId: string | null
  memberId: string | null
  price: number | null
  service: { name: string; price: number | null } | null
  member: { user: { name: string } } | null
}): LineaResuelta | null {
  if (!cita.serviceId || !cita.memberId || !cita.service || !cita.member) return null
  const precio = cita.price ?? cita.service.price
  if (precio === null || !esPrecioValido(precio)) return null
  return {
    serviceId: cita.serviceId,
    serviceName: cita.service.name,
    memberId: cita.memberId,
    byOwner: false,
    professionalName: cita.member.user.name,
    price: precio,
  }
}

/**
 * Llegó alguien con reserva: la cita pasa al tablero como atención en espera.
 * La cita tiene que ser visible para el actor (`whereDeAgenda`): una ajena da
 * 404 igual que una que no existe.
 */
export async function registrarLlegada(actor: Actor, usuarioId: string | null, citaId: string) {
  const cita = await prisma.appointment.findFirst({
    where: whereDeAgenda(actor, { id: citaId }),
    select: {
      id: true,
      status: true,
      price: true,
      serviceId: true,
      memberId: true,
      customerId: true,
      customer: { select: { name: true, lastName: true } },
      service: { select: { name: true, price: true } },
      member: { select: { user: { select: { name: true } } } },
      visit: { select: { id: true } },
    },
  })

  if (!cita) throw new ErrorDeAtencion(404, "Cita no encontrada")
  if (cita.visit) throw new ErrorDeAtencion(409, "Esta reserva ya está en el tablero")
  if (!ESTADOS_DE_RESERVA.includes(cita.status)) {
    throw new ErrorDeAtencion(409, "La reserva está cancelada o ya se completó")
  }

  const linea = lineaDeLaReserva(cita)

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
