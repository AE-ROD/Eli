import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { ESTADOS_AL_CREAR, MENSAJE_DE_ESTADO_AL_CREAR, MENSAJE_DE_HORARIO_INVERTIDO, notas, precioDeCita, terminaDespuesDeEmpezar, titulo } from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { actorDeSesion, memberIdParaCita, whereDeAgenda, whereDeClientes } from "@/lib/permisos"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { esFechaCalendario, rangoDelDiaEn, zonaDelNegocio } from "@/lib/zona-horaria"
import { advertenciasDeAgenda } from "@/lib/advertencias-de-agenda"
import { ocupaElHorario } from "@/lib/ocupacion"

const citaSchema = z
  .object({
    title: titulo(),
    startTime: z.string().datetime("La fecha de inicio no es válida"),
    endTime: z.string().datetime("La fecha de fin no es válida"),
    // Sólo los estados iniciales: los demás se marcan sobre la cita, con las
    // reglas del PUT (`ESTADOS_AL_CREAR` explica por qué).
    status: z.enum(ESTADOS_AL_CREAR, { errorMap: () => ({ message: MENSAJE_DE_ESTADO_AL_CREAR }) }).optional(),
    notes: notas().optional(),
    price: precioDeCita().optional(),
    customerId: z.string(),
    memberId: z.string().nullable().optional(),
    /** Segundo envío: quien agenda ya vio las advertencias (choque, bloqueo, horario) y guarda igual. */
    confirmarAdvertencias: z.boolean().optional(),
  })
  .refine((cita) => terminaDespuesDeEmpezar(new Date(cita.startTime), new Date(cita.endTime)), {
    message: MENSAJE_DE_HORARIO_INVERTIDO,
    path: ["endTime"],
  })

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const fecha = searchParams.get("fecha")
  const desde = searchParams.get("desde")
  const hasta = searchParams.get("hasta")
  const customerId = searchParams.get("customerId")

  // `fecha`, `desde` y `hasta` son días calendario ("AAAA-MM-DD") del
  // negocio: el rango va de las 00:00 del primero a las 00:00 del día
  // siguiente al último, en la zona del negocio del actor. Con
  // `new Date(fecha)` + `setHours` era la medianoche de la zona del servidor
  // sobre un día leído en UTC: al oeste de UTC salía el día anterior.
  const [primerDia, ultimoDia] = desde && hasta ? [desde, hasta] : fecha ? [fecha, fecha] : [null, null]
  let rango: { gte: Date; lt: Date } | undefined

  if (primerDia && ultimoDia) {
    if (!esFechaCalendario(primerDia) || !esFechaCalendario(ultimoDia)) {
      return NextResponse.json({ error: "La fecha no es válida: tiene que ser un día real, con el formato AAAA-MM-DD" }, { status: 400 })
    }
    const negocio = await prisma.business.findUnique({
      where: { id: actor.businessId },
      select: { timezone: true },
    })
    const zona = zonaDelNegocio(negocio?.timezone)
    rango = { gte: rangoDelDiaEn(primerDia, zona).desde, lt: rangoDelDiaEn(ultimoDia, zona).hasta }
  }

  const citas = await prisma.appointment.findMany({
    where: whereDeAgenda(actor, {
      ...(customerId && { customerId }),
      ...(rango && { startTime: rango }),
    }),
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      notes: true,
      price: true,
      customerId: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
      memberId: true,
      member: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
      // "Por confirmar" en la agenda (#84).
      confirmacionPorFaltas: true,
      // Sólo para saber si el cliente ya llegó: una por confirmar con
      // atención viva en el Tablero ya está resuelta. No sale en la respuesta.
      visit: { select: { status: true } },
    },
    orderBy: { startTime: "asc" },
    // Siempre con tope: con un rango amplio, sin él se traía el histórico entero.
    take: 500,
  })

  return NextResponse.json(
    citas.map(({ visit, ...cita }) => ({ ...cita, conAtencion: visit ? visit.status !== "anulada" : false }))
  )
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const cuerpo = await request.json()
    const datos = citaSchema.parse(cuerpo)

    const cliente = await prisma.customer.findFirst({
      // Un cliente eliminado (anonimizado) responde como uno que no existe:
      // no se le cuelgan citas nuevas.
      where: whereDeClientes(actor, { AND: [{ id: datos.customerId }, clienteNoEliminado] }),
    })

    if (!cliente) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    // El worker no elige: memberIdParaCita ignora lo pedido y devuelve su propio id.
    // `|| null` y no `?? null`: el string vacío es "sin asignar", no un id.
    // Con `??` se colaba hasta el insert y reventaba contra la foreign key.
    const memberId = memberIdParaCita(actor, datos.memberId || null)

    if (memberId) {
      const miembro = await prisma.businessMember.findFirst({
        where: { id: memberId, businessId: actor.businessId },
      })
      if (!miembro) {
        return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })
      }
    }

    const tramo = { startTime: new Date(datos.startTime), endTime: new Date(datos.endTime) }
    const status = datos.status ?? "pendiente"

    // Como al mover: un choque, un bloqueo o quedar fuera del horario no
    // impiden agendar desde el panel, pero se avisan primero. Hoy toda cita
    // nueva ocupa el horario (`ESTADOS_AL_CREAR`); la guarda queda por si se
    // suma un estado inicial que no lo ocupe.
    if (!datos.confirmarAdvertencias && ocupaElHorario(status)) {
      const advertencias = await advertenciasDeAgenda(prisma, {
        businessId: actor.businessId,
        citaId: null,
        tramo,
        memberId,
      })
      if (advertencias.length > 0) {
        return NextResponse.json(
          { error: advertencias.map((advertencia) => advertencia.mensaje).join(" "), advertencias },
          { status: 409 }
        )
      }
    }

    const cita = await prisma.appointment.create({
      data: {
        title: datos.title,
        startTime: tramo.startTime,
        endTime: tramo.endTime,
        status,
        notes: datos.notes || null,
        price: datos.price ?? null,
        customerId: datos.customerId,
        memberId,
        businessId: actor.businessId,
      },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        member: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
      },
    })

    return NextResponse.json(cita, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    console.error("Error creando cita:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
