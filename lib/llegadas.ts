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
import { ErrorDeAtencion, formatearAtencion, nombreCompletoDeCliente, seleccionDeAtencion } from "@/lib/tablero"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"

/**
 * Traba la fila del cliente hasta que termine la transacción (`FOR UPDATE`).
 *
 * La atención guarda una copia del nombre del cliente. Si se lee el nombre y
 * después se crea la atención, una eliminación (anonimización) confirmada
 * entre medio deja la atención nueva con el nombre real: su `updateMany` de
 * atenciones ya corrió y no la vio. Con la fila trabada, las dos operaciones
 * se ordenan: si la eliminación llegó primero, acá se espera a que termine y
 * se lee el cliente ya anonimizado; si llegó después, su primera escritura
 * (la ficha) espera a que esta atención exista, y su `updateMany` la alcanza.
 *
 * Se eligió el candado y no "crear y después revisar la marca" porque con
 * READ COMMITTED esa revisión también puede correr antes de que la
 * eliminación confirme, y la ventana seguiría abierta. Va parametrizado
 * (`$queryRaw` con plantilla): el id nunca se pega en el SQL.
 */
async function trabarCliente(tx: Prisma.TransactionClient, actor: Actor, clienteId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM clientes WHERE id = ${clienteId} AND "businessId" = ${actor.businessId} FOR UPDATE`
}

/**
 * Cómo entra alguien al tablero de atenciones: con reserva (la cita "llegó")
 * o sin reserva. Lo usa `POST /api/atenciones`; vive acá para que el archivo
 * de la ruta se quede en lo HTTP.
 */

/** Las citas que todavía pueden "llegar": ni canceladas, ni completadas, ni de alguien que no vino. */
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
  /** Varios servicios (#89a), en orden. Vacío en las citas de antes y en las del panel. */
  servicios: {
    serviceId: string | null
    price: number | null
    service: { id: string; name: string; price: number | null; active: boolean; businessId: string } | null
  }[]
}

/** Un servicio de la reserva ya resuelto contra el catálogo, con el precio que se le cobra. */
interface ServicioQueLlega {
  id: string
  name: string
  precio: number | null
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
 * Los servicios de la reserva, con su precio, o `null` si alguno no se puede
 * anotar. Con varios (#89a), los de `AppointmentService`, en orden, cada uno
 * con el precio copiado al reservar (o el del catálogo si no tenía); si uno
 * se borró o se desactivó, ninguno: precargar una parte cobraría de menos
 * sin que nadie lo decidiera. Sin filas (la cita de antes), el de siempre,
 * con el precio de la cita o el del catálogo.
 */
async function serviciosQueLlegan(actor: Actor, cita: CitaQueLlega): Promise<ServicioQueLlega[] | null> {
  if (cita.servicios.length > 0) {
    const resueltos: ServicioQueLlega[] = []
    for (const fila of cita.servicios) {
      if (!fila.service?.active || fila.service.businessId !== actor.businessId) return null
      resueltos.push({ id: fila.service.id, name: fila.service.name, precio: fila.price ?? fila.service.price })
    }
    return resueltos
  }
  const servicio = await servicioDeLaReserva(actor, cita)
  if (!servicio) return null
  return [{ id: servicio.id, name: servicio.name, precio: cita.price ?? servicio.price }]
}

/**
 * Las líneas que se precargan al llegar una reserva (una por servicio), o
 * `null` si la reserva no dice lo suficiente:
 *
 * - Los servicios, como los encuentra `serviciosQueLlegan`.
 * - Quién lo hace: el profesional de la cita, o quien marca la llegada si es
 *   profesional (`profesionalParaLinea`, la misma regla que al anotar). Si
 *   queda sin nadie (dueño o encargado con una cita sin asignar), no se
 *   precarga: toda línea nace con su profesional, y el editor se abre con la
 *   reserva (`reserva` en la atención) para que alguien diga quién.
 * - El precio de cada uno (ver `serviciosQueLlegan`). Si falta alguno no se
 *   inventa un cero, que se cobraría como cortesía sin que nadie lo decidiera.
 */
async function lineasDeLaReserva(actor: Actor, cita: CitaQueLlega): Promise<LineaResuelta[] | null> {
  const { memberId } = profesionalParaLinea(actor, { memberId: cita.memberId, byOwner: false })
  if (!memberId) return null

  const servicios = await serviciosQueLlegan(actor, cita)
  if (!servicios) return null
  if (servicios.some(({ precio }) => precio === null || !esPrecioValido(precio))) return null

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

  const lineas = servicios.map((servicio) => ({
    serviceId: servicio.id,
    serviceName: servicio.name,
    memberId,
    byOwner: false,
    professionalName: nombre,
    priceCents: aCentavos(servicio.precio as number),
  }))
  // Son todas las líneas de la atención nueva: si su total no cabe, no se precargan.
  if (errorDeTotal(totalEnCentavos(lineas))) return null
  return lineas
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
      service: { select: { id: true, name: true, price: true, active: true } },
      member: { select: { user: { select: { name: true } } } },
      // Las filas y sus servicios, sólo del negocio: la FK compuesta y el
      // trigger `cita_servicios_mismo_negocio` ya lo garantizan en la base,
      // y acá se vuelve a pedir porque no hay RLS detrás.
      servicios: {
        where: { businessId: actor.businessId },
        orderBy: { orden: "asc" },
        select: {
          serviceId: true,
          price: true,
          service: { select: { id: true, name: true, price: true, active: true, businessId: true } },
        },
      },
      visit: { select: { id: true } },
    },
  })

  if (!cita) throw new ErrorDeAtencion(404, "Cita no encontrada")
  if (cita.visit) throw new ErrorDeAtencion(409, "Esta reserva ya está en el tablero")
  if (!ESTADOS_DE_RESERVA.includes(cita.status)) {
    throw new ErrorDeAtencion(409, "La reserva está cancelada, marcada como \"no vino\" o ya se completó")
  }
  if (!esDeHoy(cita.startTime, new Date(), zona)) {
    throw new ErrorDeAtencion(409, "Esta reserva no es de hoy: solo se marca la llegada de las reservas del día.")
  }

  const lineas = await lineasDeLaReserva(actor, cita)

  try {
    return await prisma.$transaction(async (tx) => {
      // El nombre que se copia es el de ahora, con la fila trabada
      // (`trabarCliente`): si el cliente se eliminó, ya dice "Cliente
      // eliminado". La reserva sigue siendo válida: llegó alguien a su hora.
      let nombre = CLIENTE_SIN_FICHA
      if (cita.customerId) {
        await trabarCliente(tx, actor, cita.customerId)
        const cliente = await tx.customer.findFirst({
          where: whereDeClientes(actor, { id: cita.customerId }),
          select: { name: true, lastName: true },
        })
        if (cliente) nombre = nombreCompletoDeCliente(cliente)
      }

      const atencion = await tx.visit.create({
        data: {
          businessId: actor.businessId,
          customerId: cita.customerId,
          customerName: nombre,
          appointmentId: cita.id,
          createdById: usuarioId,
          ...(lineas && { services: { create: lineas } }),
        },
        select: seleccionDeAtencion(actor),
      })
      return formatearAtencion(actor, atencion)
    })
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
 * El cliente elegido para anotar sin reserva, con su fila trabada
 * (`trabarCliente`) y sólo si no se eliminó: a un cliente eliminado no se le
 * cuelgan atenciones nuevas, responde como uno que no existe.
 */
async function clienteVigenteTrabado(tx: Prisma.TransactionClient, actor: Actor, clienteId: string) {
  await trabarCliente(tx, actor, clienteId)
  return tx.customer.findFirst({
    where: whereDeClientes(actor, { AND: [{ id: clienteId }, clienteNoEliminado] }),
    select: { id: true, name: true, lastName: true },
  })
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
        ? await clienteVigenteTrabado(tx, actor, datos.clienteId)
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
        customerName: nombreCompletoDeCliente(cliente),
        notes: datos.notas || null,
        createdById: usuarioId,
        ...(lineas.length > 0 && { services: { create: lineas } }),
      },
      select: seleccionDeAtencion(actor),
    })
    return formatearAtencion(actor, atencion)
  })
}
