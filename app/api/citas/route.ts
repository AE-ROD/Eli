import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { ESTADOS_AL_CREAR, MENSAJE_DE_ESTADO_AL_CREAR, MENSAJE_DE_HORARIO_INVERTIDO, notas, precioDeCita, terminaDespuesDeEmpezar, titulo } from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { seleccionDeCitaDelPanel } from "@/lib/citas-de-la-clinica"
import { registrarError } from "@/lib/registro-de-errores"
import {
  actorDeSesion,
  memberIdParaCita,
  puedeAsignarSillon,
  puedeVerTodaLaAgenda,
  veSillones,
  whereDeAgenda,
  whereDeClientes,
  whereDeSillones,
} from "@/lib/permisos"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { esFechaCalendario, rangoDelDiaEn, zonaDelNegocio } from "@/lib/zona-horaria"
import { advertenciasDeAgenda } from "@/lib/advertencias-de-agenda"
import { ocupaElHorario } from "@/lib/ocupacion"
import {
  MENSAJE_MIEMBRO_NO_ATIENDE,
  MENSAJE_PROFESIONAL_NO_HACE,
  atiendeCitas,
  elMiembroHaceLosServicios,
} from "@/lib/agenda-publica"
import { servicioIdsSchema } from "@/lib/validaciones"
import {
  duracionesQueSuman,
  filasDeServicios,
  leerServiciosDeLaReserva,
  resumenDeLaReserva,
} from "@/lib/servicios-de-la-reserva"

/** Servicios elegidos que no son del negocio, no existen o ya no se ofrecen. Sin decir cuál. */
const MENSAJE_SERVICIO_NO_ENCONTRADO = "Servicio no encontrado"
const mensajeDeDuracionConServicios = (cuantos: number) =>
  `Con ${cuantos} servicios, la cita tiene que durar al menos ${cuantos} minutos y no más de 24 horas por servicio`
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import {
  MENSAJE_SILLON_INACTIVO,
  MENSAJE_SILLON_NO_ENCONTRADO,
  SillonOcupado,
  asegurarSillonLibre,
  errorDeSillonOcupado,
  sillonDeLaCita,
} from "@/lib/sillones"

/** La zona del negocio, para escribir las horas de un mensaje en su reloj. */
async function zonaDeLaClinica(businessId: string): Promise<string> {
  const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } })
  return zonaDelNegocio(negocio?.timezone)
}

const citaSchema = z
  .object({
    // Texto libre, para una cita sin servicio del catálogo. Con `servicioIds`
    // el título sale de los servicios y éste no se usa.
    title: titulo().optional(),
    /**
     * Servicios del catálogo (#159), en el orden en que se hacen: llenan
     * título, precio y las filas de `cita_servicios`, como la reserva pública.
     */
    servicioIds: servicioIdsSchema.optional(),
    startTime: z.string().datetime("La fecha de inicio no es válida"),
    endTime: z.string().datetime("La fecha de fin no es válida"),
    // Sólo los estados iniciales: los demás se marcan sobre la cita, con las
    // reglas del PUT (`ESTADOS_AL_CREAR` explica por qué).
    status: z.enum(ESTADOS_AL_CREAR, { errorMap: () => ({ message: MENSAJE_DE_ESTADO_AL_CREAR }) }).optional(),
    notes: notas().optional(),
    price: precioDeCita().optional(),
    customerId: z.string(),
    memberId: z.string().nullable().optional(),
    /**
     * Clínica dental: el sillón (`null` o vacío, sin sillón). Sólo cuenta si
     * el actor puede asignar sillón (`puedeAsignarSillon`); en otro rubro se
     * ignora, como el `memberId` del profesional, y nunca se guarda.
     */
    sillonId: sillonDeLaCita().optional(),
    /** Segundo envío: quien agenda ya vio las advertencias (choque, bloqueo, horario) y guarda igual. */
    confirmarAdvertencias: z.boolean().optional(),
  })
  .refine((cita) => cita.servicioIds !== undefined || cita.title !== undefined, {
    message: "Escribe el servicio o elige uno del catálogo",
    path: ["title"],
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
  // Clínica dental: el sillón y su nombre, la marca de primera vez y un
  // filtro opcional por sillón. En otro rubro no se piden ni se filtra: la
  // respuesta queda como siempre.
  const conSillones = veSillones(actor)
  const sillonId = conSillones ? searchParams.get("sillonId") : null

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
      ...(sillonId && { sillonId }),
    }),
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      notes: true,
      // Lo que el cliente escribió al reservar, para el detalle (#122).
      clientComments: true,
      price: true,
      customerId: true,
      customer: { select: { id: true, name: true, lastName: true, email: true, phone: true } },
      memberId: true,
      member: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
      // "Por confirmar" en la agenda (#84).
      confirmacionPorFaltas: true,
      // Quién canceló ("cliente" | "negocio") y cuándo, para el detalle (#134).
      canceladaPor: true,
      canceladaEn: true,
      // Sólo para saber si el cliente ya llegó: una por confirmar con
      // atención viva en el Tablero ya está resuelta. No sale en la respuesta.
      visit: { select: { status: true } },
      ...(conSillones && {
        sillonId: true,
        sillon: { select: { id: true, nombre: true } },
        primeraVez: true,
      }),
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
    const cuerpo = await leerJsonConTope(request)
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
        select: { id: true, role: true },
      })
      if (!miembro) {
        return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })
      }
      // Del negocio pero no atiende (el encargado): la cita quedaría en una
      // agenda que nadie atiende y fuera de la reserva pública (#144).
      if (!atiendeCitas(miembro.role)) {
        return NextResponse.json({ error: MENSAJE_MIEMBRO_NO_ATIENDE }, { status: 400 })
      }
    }

    // Clínica dental: el sillón, si se eligió uno. Tiene que ser de la
    // clínica (si no, 404, como lo ajeno) y estar activo. En otro rubro,
    // `puedeAsignarSillon` dice que no y lo pedido se ignora.
    const sillonId = puedeAsignarSillon(actor) ? (datos.sillonId ?? null) : null
    if (sillonId) {
      const sillon = await prisma.sillon.findFirst({
        where: whereDeSillones(actor, { id: sillonId }),
        select: { activo: true },
      })
      if (!sillon) {
        return NextResponse.json({ error: MENSAJE_SILLON_NO_ENCONTRADO }, { status: 404 })
      }
      if (!sillon.activo) {
        return NextResponse.json({ error: MENSAJE_SILLON_INACTIVO }, { status: 400 })
      }
    }

    const tramo = { startTime: new Date(datos.startTime), endTime: new Date(datos.endTime) }
    const status = datos.status ?? "pendiente"

    // Con servicios del catálogo (#159): se leen del catálogo del negocio, en
    // el servidor; lo que mande el navegador sobre nombres o duraciones no
    // cuenta. Uno que no es del negocio, no existe o está inactivo: 404.
    const servicios = datos.servicioIds
      ? await leerServiciosDeLaReserva(prisma, actor.businessId, datos.servicioIds)
      : null
    if (datos.servicioIds && !servicios) {
      return NextResponse.json({ error: MENSAJE_SERVICIO_NO_ENCONTRADO }, { status: 404 })
    }
    let duracionesDeLasFilas: number[] = []
    if (servicios) {
      // Si el profesional tiene acotado lo que hace (`MemberService`), tiene
      // que hacerlos todos, como en la reserva pública. Sin filas, hace todos.
      if (memberId) {
        const losHace = await elMiembroHaceLosServicios(
          prisma,
          actor.businessId,
          memberId,
          servicios.map((servicio) => servicio.id)
        )
        if (!losHace) {
          return NextResponse.json({ error: MENSAJE_PROFESIONAL_NO_HACE }, { status: 400 })
        }
      }
      // Las filas suman lo que dura la cita: si quien agenda la alargó o la
      // acortó, se reparte (`duracionesQueSuman`), igual que al editarla.
      const minutos = Math.ceil((tramo.endTime.getTime() - tramo.startTime.getTime()) / 60_000)
      const duraciones = duracionesQueSuman(servicios.map((servicio) => servicio.duration), minutos)
      if (!duraciones) {
        return NextResponse.json({ error: mensajeDeDuracionConServicios(servicios.length) }, { status: 400 })
      }
      duracionesDeLasFilas = duraciones
    }

    // El sillón ocupado no es una advertencia: un sillón atiende a uno a la
    // vez (`lib/sillones.ts`). Se mira antes que las advertencias, para no
    // pedir que se confirmen y después rechazar igual; la revisión que vale
    // es la de la transacción, con el sillón trabado.
    // Las horas de las citas que chocan, sólo a quien ve toda la agenda.
    const consultaDeSillon =
      sillonId && ocupaElHorario(status)
        ? {
            businessId: actor.businessId,
            sillonId,
            tramo,
            ignorarCitaId: null,
            zona: await zonaDeLaClinica(actor.businessId),
            mostrarHorarios: puedeVerTodaLaAgenda(actor),
          }
        : null
    if (consultaDeSillon) {
      const ocupado = await errorDeSillonOcupado(prisma, consultaDeSillon)
      if (ocupado) throw ocupado
    }

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

    const resumen = servicios ? resumenDeLaReserva(servicios) : null
    const creacion = {
      data: {
        // Con servicios, como la reserva pública: el título son sus nombres,
        // `serviceId` el primero y el precio la suma, salvo que se haya
        // escrito otro (el panel decide el precio, como al editarlo).
        title: resumen ? resumen.titulo : (datos.title as string),
        ...(servicios && { serviceId: servicios[0].id }),
        startTime: tramo.startTime,
        endTime: tramo.endTime,
        status,
        notes: datos.notes || null,
        price: datos.price ?? resumen?.precio ?? null,
        customerId: datos.customerId,
        memberId,
        ...(sillonId && { sillonId }),
        businessId: actor.businessId,
      },
      // Columnas explícitas (`lib/citas-de-la-clinica.ts`): ni el hash del
      // enlace, ni las comisiones; fuera de una clínica, sin sillón ni `primeraVez`.
      select: seleccionDeCitaDelPanel(veSillones(actor)),
    } satisfies Prisma.AppointmentCreateArgs

    // Con servicios, la cita y sus filas en la misma transacción, como en la
    // reserva pública (`app/api/reservar/[slug]/confirmar`). Con sillón,
    // también: se traba el sillón y se vuelve a mirar que esté libre.
    const cita =
      servicios || consultaDeSillon
        ? await prisma.$transaction(async (tx) => {
            if (consultaDeSillon) await asegurarSillonLibre(tx, consultaDeSillon)
            const creada = await tx.appointment.create(creacion)
            if (servicios) {
              await tx.appointmentService.createMany({
                data: filasDeServicios(actor.businessId, servicios).map((fila, indice) => ({
                  ...fila,
                  duration: duracionesDeLasFilas[indice],
                  appointmentId: creada.id,
                })),
              })
            }
            return creada
          })
        : await prisma.appointment.create(creacion)

    return NextResponse.json(cita, { status: 201 })
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    // El sillón ocupado (409 con `codigo: "sillon-ocupado"`).
    if (error instanceof SillonOcupado) {
      return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.status })
    }
    // Un cuerpo que no es JSON: es un pedido mal hecho, no un error del servidor.
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "El pedido no es un JSON válido" }, { status: 400 })
    }
    // Lo que se iba a ligar (cliente, profesional, sillón) se borró entretanto.
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2025" || error.code === "P2003")) {
      return NextResponse.json({ error: "Algo de la cita cambió recién: vuelve a cargar la agenda" }, { status: 409 })
    }
    // Sin volcar el error: uno de Prisma trae en `meta` los datos del cliente.
    registrarError("creando una cita", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
