import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { enviarConfirmacionCliente, enviarAvisoProfesional } from "@/lib/email"
import { reservaSchema } from "@/lib/validaciones"
import { horaAMinutos } from "@/lib/horario-dia"
import { cabeEnAtencion, franjasDeAtencion } from "@/lib/horario-de-atencion"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import {
  MAX_RESERVAS_FUTURAS_POR_CONTACTO,
  MAX_RESERVAS_PUBLICAS_POR_DIA,
  MENSAJE_FECHA_MUY_LEJANA,
  MENSAJE_HORA_PASADA,
  MENSAJE_TOPE_POR_CONTACTO,
  MENSAJE_TOPE_POR_NEGOCIO,
  WHERE_RESERVA_PUBLICA,
  compartenContacto,
  esElMismoCliente,
  fechaNoReservable,
  normalizarEmail,
  normalizarTelefono,
  yaPasoLaHora,
} from "@/lib/reserva-publica"

const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Cuántas veces se intenta la transacción de la reserva ante un conflicto de serialización. */
const INTENTOS_ANTE_CONFLICTO = 3

const HORARIO_TOMADO = "El horario ya no está disponible"

type Resultado =
  | { tipo: "creada"; cita: { id: string } }
  | { tipo: "rechazada"; error: string; status: number }

interface Reserva {
  negocioId: string
  servicio: { id: string; name: string; price: number | null }
  datos: z.infer<typeof reservaSchema>
  startTime: Date
  endTime: Date
  ahora: Date
}

/** P2034: Postgres no pudo ordenar la transacción con otra concurrente; hay que reintentarla. */
function esConflictoDeSerializacion(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
}

async function reservarEnTransaccion(reserva: Reserva): Promise<Resultado> {
  for (let intento = 1; ; intento++) {
    try {
      return await prisma.$transaction((tx) => reservar(tx, reserva), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (!esConflictoDeSerializacion(error)) throw error
      if (intento >= INTENTOS_ANTE_CONFLICTO) return { tipo: "rechazada", error: HORARIO_TOMADO, status: 409 }
    }
  }
}

/** Lo que se lee y escribe dentro de la transacción. Lo que rechaza no escribe nada. */
async function reservar(
  tx: Prisma.TransactionClient,
  { negocioId, servicio, datos, startTime, endTime, ahora }: Reserva
): Promise<Resultado> {
  const conflicto = await tx.appointment.findFirst({
    where: {
      businessId: negocioId,
      status: { notIn: ["cancelada"] },
      OR: [
        { startTime: { gte: startTime, lt: endTime } },
        { endTime: { gt: startTime, lte: endTime } },
        { startTime: { lte: startTime }, endTime: { gte: endTime } },
      ],
    },
    select: { id: true },
  })
  if (conflicto) return { tipo: "rechazada", error: HORARIO_TOMADO, status: 409 }

  // Topes anti-abuso (`lib/reserva-publica.ts`): cuántas reservas públicas
  // recibió el negocio en 24 horas (sin las canceladas: cancelar libera
  // el cupo), y cuántas futuras tiene este contacto.
  const reservasDelDia = await tx.appointment.count({
    where: {
      businessId: negocioId,
      ...WHERE_RESERVA_PUBLICA,
      status: { not: "cancelada" },
      createdAt: { gte: new Date(ahora.getTime() - MS_POR_DIA) },
    },
  })
  if (reservasDelDia >= MAX_RESERVAS_PUBLICAS_POR_DIA) {
    return { tipo: "rechazada", error: MENSAJE_TOPE_POR_NEGOCIO, status: 429 }
  }

  const contacto = { email: datos.email, telefono: datos.telefono }
  if (normalizarEmail(contacto.email) || normalizarTelefono(contacto.telefono)) {
    // El email y el teléfono guardados pueden estar escritos de cualquier
    // forma: se comparan normalizados acá, sobre las reservas públicas
    // futuras del negocio. Son acotadas: a lo sumo 50 por día y a no más
    // de 90 días de hoy. Sólo se traen el email y el teléfono.
    const futuras = await tx.appointment.findMany({
      where: {
        businessId: negocioId,
        ...WHERE_RESERVA_PUBLICA,
        status: { not: "cancelada" },
        startTime: { gte: ahora },
      },
      select: { customer: { select: { email: true, phone: true } } },
    })
    const delContacto = futuras.filter((cita) => cita.customer && compartenContacto(cita.customer, contacto))
    if (delContacto.length >= MAX_RESERVAS_FUTURAS_POR_CONTACTO) {
      return { tipo: "rechazada", error: MENSAJE_TOPE_POR_CONTACTO, status: 429 }
    }
  }

  // Se reutiliza un cliente del negocio sólo si coinciden el email y el
  // nombre completo, normalizados (`esElMismoCliente`); si no, uno nuevo. La
  // cédula sola nunca vincula: con la de otra persona, la reserva quedaba en
  // su historial (M6).
  const email = normalizarEmail(datos.email)
  const candidatos = email
    ? await tx.customer.findMany({
        where: { businessId: negocioId, email: { equals: email, mode: "insensitive" } },
        select: { id: true, name: true, lastName: true, email: true },
        orderBy: { createdAt: "asc" },
      })
    : []
  let cliente: { id: string } | undefined = candidatos.find((candidato) => esElMismoCliente(candidato, datos))

  if (!cliente) {
    cliente = await tx.customer.create({
      data: {
        name: datos.nombre,
        lastName: datos.apellido,
        cedula: datos.cedula || null,
        email,
        phone: datos.telefono || null,
        businessId: negocioId,
      },
      select: { id: true },
    })
  }

  const cita = await tx.appointment.create({
    data: {
      title: servicio.name,
      serviceId: servicio.id,
      startTime,
      endTime,
      status: "pendiente",
      clientComments: datos.comentarios || null,
      price: servicio.price,
      customerId: cliente.id,
      businessId: negocioId,
    },
    select: { id: true },
  })

  return { tipo: "creada", cita }
}
import { diaDeLaSemana, existeLaHora, instanteEn, zonaDelNegocio } from "@/lib/zona-horaria"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { permitido } = await verificarLimite("reserva", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiadas solicitudes, intenta más tarde" }, { status: 429 })
  }

  const { slug } = await params

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      timezone: true,
      user: { select: { email: true } },
    },
  })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  try {
    const cuerpo = await request.json()
    const datos = reservaSchema.parse(cuerpo)

    const servicio = await prisma.service.findFirst({
      where: { id: datos.servicioId, businessId: negocio.id, active: true },
    })
    if (!servicio) return NextResponse.json({ error: "Servicio no disponible" }, { status: 404 })

    // La fecha y la hora son las del reloj del negocio (`Business.timezone`):
    // la cita se guarda en el instante UTC que les corresponde ahí, no en el
    // de la zona del servidor.
    const zona = zonaDelNegocio(negocio.timezone)

    // Un día que no existe ("2026-02-30") o fuera de los años aceptados, una
    // hora fuera de 00:00–23:59, o una que el reloj del negocio se salta por
    // el horario de verano, no es un horario de atención de nadie. Es la
    // misma regla con la que `disponibilidad` descarta horas.
    if (!existeLaHora(datos.fecha, datos.hora, zona)) {
      return NextResponse.json(
        { error: "Ese horario está fuera de la atención del negocio. Elige otra hora." },
        { status: 409 }
      )
    }

    // Ni horas que ya pasaron ni fechas a más de `DIAS_MAXIMOS_DE_ANTICIPACION`
    // días, en el reloj del negocio: la misma regla con la que `disponibilidad`
    // ofrece las horas (`lib/reserva-publica.ts`).
    const ahora = new Date()
    if (yaPasoLaHora(datos.fecha, datos.hora, ahora, zona)) {
      return NextResponse.json({ error: MENSAJE_HORA_PASADA }, { status: 409 })
    }
    if (fechaNoReservable(datos.fecha, ahora, zona) === "muy-lejana") {
      return NextResponse.json({ error: MENSAJE_FECHA_MUY_LEJANA }, { status: 409 })
    }

    const startTime = instanteEn(datos.fecha, datos.hora, zona)
    const endTime = new Date(startTime.getTime() + servicio.duration * 60000)

    // La hora tiene que caer entera dentro del horario de atención de ese día,
    // con la misma regla que ofrece las horas (`franjasDeAtencion`). El día de
    // la semana se saca igual que en `disponibilidad/route.ts` y la hora se
    // compara en minutos como texto "HH:MM", igual que las franjas: así lo que
    // se ofrece y lo que se acepta no pueden dar distinto.
    const diaSemana = diaDeLaSemana(datos.fecha)
    const filasDelDia = await prisma.workSchedule.findMany({
      where: { businessId: negocio.id, dayOfWeek: diaSemana, active: true },
      select: { memberId: true, startTime: true, endTime: true },
      orderBy: { startTime: "asc" },
    })
    const inicioMin = horaAMinutos(datos.hora)
    if (!cabeEnAtencion(franjasDeAtencion(filasDelDia), inicioMin, inicioMin + servicio.duration)) {
      return NextResponse.json(
        { error: "Ese horario está fuera de la atención del negocio. Elige otra hora." },
        { status: 409 }
      )
    }

    // El chequeo de choque, los topes y la creación del cliente y la cita van
    // en una sola transacción `Serializable` (A4): sueltos, dos confirmaciones
    // al mismo tiempo veían las dos el horario libre y creaban las dos su
    // cita. Postgres aborta con P2034 a la que no puede ordenar; se reintenta
    // y, si sigue chocando, el horario se da por tomado.
    const resultado = await reservarEnTransaccion({
      negocioId: negocio.id,
      servicio,
      datos,
      startTime,
      endTime,
      ahora,
    })
    if (resultado.tipo === "rechazada") {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status })
    }
    const cita = resultado.cita

    // Enviar emails en paralelo (sin bloquear la respuesta si fallan)
    const emailsPromises: Promise<unknown>[] = []

    if (datos.email) {
      emailsPromises.push(
        enviarConfirmacionCliente({
          emailCliente: datos.email,
          nombreCliente: `${datos.nombre} ${datos.apellido}`,
          nombreNegocio: negocio.name,
          servicio: servicio.name,
          fecha: datos.fecha,
          hora: datos.hora,
          duracion: servicio.duration,
        }).catch(() => null)
      )
    }

    emailsPromises.push(
      enviarAvisoProfesional({
        emailProfesional: negocio.user.email,
        nombreNegocio: negocio.name,
        nombreCliente: `${datos.nombre} ${datos.apellido}`,
        servicio: servicio.name,
        fecha: datos.fecha,
        hora: datos.hora,
        comentarios: datos.comentarios,
      }).catch(() => null)
    )

    await Promise.all(emailsPromises)

    return NextResponse.json({ citaId: cita.id, mensaje: "Reserva confirmada" }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Público: el primer mensaje, legible, y no los issues crudos de zod.
      return NextResponse.json({ error: error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
