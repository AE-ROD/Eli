import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { enviarConfirmacionCliente, enviarAvisoProfesional } from "@/lib/email"
import { reservaSchema } from "@/lib/validaciones"
import { horaAMinutos } from "@/lib/horario-dia"
import { cabeEnAtencion, franjasDeAtencion } from "@/lib/horario-de-atencion"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { MENSAJE_FECHA_MUY_LEJANA, MENSAJE_HORA_PASADA, fechaNoReservable, yaPasoLaHora } from "@/lib/reserva-publica"
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

    // Verificar que el slot sigue libre
    const conflicto = await prisma.appointment.findFirst({
      where: {
        businessId: negocio.id,
        status: { notIn: ["cancelada"] },
        OR: [
          { startTime: { gte: startTime, lt: endTime } },
          { endTime: { gt: startTime, lte: endTime } },
          { startTime: { lte: startTime }, endTime: { gte: endTime } },
        ],
      },
    })
    if (conflicto) {
      return NextResponse.json({ error: "El horario ya no está disponible" }, { status: 409 })
    }

    // Buscar o crear cliente
    let cliente = await prisma.customer.findFirst({
      where: {
        businessId: negocio.id,
        OR: [
          ...(datos.email ? [{ email: datos.email }] : []),
          ...(datos.cedula ? [{ cedula: datos.cedula }] : []),
        ],
      },
    })

    if (!cliente) {
      cliente = await prisma.customer.create({
        data: {
          name: datos.nombre,
          lastName: datos.apellido,
          cedula: datos.cedula || null,
          email: datos.email || null,
          phone: datos.telefono || null,
          businessId: negocio.id,
        },
      })
    }

    // Crear la cita
    const cita = await prisma.appointment.create({
      data: {
        title: servicio.name,
        serviceId: servicio.id,
        startTime,
        endTime,
        status: "pendiente",
        clientComments: datos.comentarios || null,
        price: servicio.price,
        customerId: cliente.id,
        businessId: negocio.id,
      },
    })

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
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
