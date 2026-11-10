import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  ESTADOS_DE_CITA,
  MENSAJE_DE_HORARIO_INVERTIDO,
  notas,
  precioDeCita,
  puedeMarcarseNoVino,
  terminaDespuesDeEmpezar,
  titulo,
} from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import {
  actorDeSesion,
  esClinicaDental,
  gestionaElNegocio,
  memberIdParaCita,
  puedeAsignarSillon,
  puedeReactivarCita,
  puedeResolverPorConfirmar,
  puedeVerTodaLaAgenda,
  veAlertaDeAlergias,
  veSillones,
  whereDeAgenda,
  whereDeSillones,
  type Actor,
} from "@/lib/permisos"
import {
  ESTADOS_QUE_NO_SE_MUEVEN,
  MENSAJE_CITA_CERRADA,
  MENSAJE_CITA_CON_ATENCION,
  SIN_ATENCION_VIVA,
  sePuedeMover,
} from "@/lib/mover-cita"
import { advertenciasDeAgenda } from "@/lib/advertencias-de-agenda"
import { MENSAJE_CITA_CAMBIO, decidirReactivacion, problemaConLaAtencion } from "@/lib/reactivar-cita"
import { horaDeLaBase } from "@/lib/bloqueos-de-dinero"
import { ocupaElHorario } from "@/lib/ocupacion"
import {
  MENSAJE_MIEMBRO_NO_ATIENDE,
  MENSAJE_PROFESIONAL_NO_HACE,
  atiendeCitas,
  elMiembroHaceLosServicios,
} from "@/lib/agenda-publica"
import { programarAvisoDeHoraLiberada } from "@/lib/lista-de-espera"
import { estaPorConfirmar, mensajeDeReservaQueCambio } from "@/lib/por-confirmar"
import { avisarReservaConfirmadaPorElLocal } from "@/lib/aviso-de-reserva-confirmada"
import { duracionesQueSuman } from "@/lib/servicios-de-la-reserva"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import {
  MENSAJE_SILLON_DE_CITA_CERRADA,
  MENSAJE_SILLON_INACTIVO,
  MENSAJE_SILLON_NO_ENCONTRADO,
  SillonOcupado,
  asegurarSillonLibre,
  errorDeSillonOcupado,
  sillonDeLaCita,
  type ConsultaDeSillon,
} from "@/lib/sillones"
import { seleccionDeCitaDelPanel, soltarLoClinicoDeLaCita } from "@/lib/citas-de-la-clinica"
import { leerAlertaDeAlergias } from "@/lib/ficha-clinica-servidor"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { registrarError } from "@/lib/registro-de-errores"

const edicionDeCitaSchema = z.object({
  title: titulo().optional(),
  startTime: z.string().datetime("La fecha de inicio no es válida").optional(),
  endTime: z.string().datetime("La fecha de fin no es válida").optional(),
  status: z.enum(ESTADOS_DE_CITA).optional(),
  notes: notas().optional(),
  price: precioDeCita().optional(),
  /**
   * A qué profesional va la cita. `null` o `""` es "sin asignar". Sólo dueño y
   * encargado eligen: al profesional `memberIdParaCita` lo deja en sí mismo.
   */
  memberId: z.string().nullable().optional(),
  /**
   * Clínica dental: el sillón (`null` o vacío, sin sillón). Sólo cuenta si el
   * actor puede asignar sillón (`puedeAsignarSillon`); en otro rubro se
   * ignora, como el `memberId` del profesional, y nunca se guarda. Sin la
   * clave, la cita conserva el que tiene (también al moverla).
   */
  sillonId: sillonDeLaCita().optional(),
  /** Segundo envío: quien mueve ya vio las advertencias y guarda igual. */
  confirmarAdvertencias: z.boolean().optional(),
})

/** Por qué no se puede marcar "No vino". */
const NO_VINO_SIN_ESPERA = "Sólo se marca \"no vino\" en una cita pendiente o confirmada"
const NO_VINO_ANTES_DE_HORA = "Todavía no es la hora de la cita: si avisó que no viene, cancélala"
const NO_VINO_PERO_LLEGO = "El cliente ya llegó: la cita tiene una atención en el Tablero. Si fue un error, deshaz la llegada primero"
/**
 * Una cita cuyo cliente ya llegó (atención viva en el Tablero) no se cancela
 * desde la agenda: la atención quedaría colgando de una cita cancelada. Vale
 * para las por confirmar (#84) y para cualquier otra (#136). Lo mismo al
 * volver una "en progreso" a pendiente o confirmada: la atención quedaría
 * viva detrás de una cita que dice que el cliente todavía no llega.
 */
const MENSAJE_CANCELAR_CON_ATENCION = "Esta cita ya tiene una atención en el Tablero: anúlala ahí primero"

/** Borrar una cita cerrada: es historia del cliente (inasistencias, cancelaciones) y de la plata. */
const MENSAJE_BORRAR_CITA_CERRADA =
  "Una cita cancelada, completada o de alguien que no vino no se borra: queda en el historial"

/** Borrar una cita cuyo cliente ya llegó (o que otro cerró entretanto). */
const MENSAJE_BORRAR_CITA_CON_ATENCION =
  "Esta cita ya tiene una atención en el Tablero o cambió recién: vuelve a cargar la agenda"

/** Para deshacer, dentro de la transacción dental, lo que se soltó si la cita no se borró. */
class CitaQueNoSeBorra extends Error {}

/** Borrar una cita que algo de la ficha clínica todavía referencia. */
const MENSAJE_CITA_CON_REGISTROS_CLINICOS =
  "Esta cita tiene registros de la ficha clínica o del plan de tratamiento. Vuelve a cargar la agenda e inténtalo de nuevo, o cancélala en vez de borrarla."

/**
 * Una cita con servicios del catálogo (filas de `cita_servicios`, #89a) se
 * llama como ellos: el título a mano dejaría a la cita diciendo una cosa y a
 * sus filas otra (#138). Sólo se rechaza si de verdad cambia.
 */
const MENSAJE_TITULO_CON_SERVICIOS =
  "Esta cita es de servicios del catálogo: su nombre sale de ellos y no se cambia a mano"
const mensajeDeDuracionConServicios = (cuantos: number) =>
  `Esta cita tiene ${cuantos} servicios: tiene que durar al menos ${cuantos} minutos y no más de 24 horas por servicio`

/** Lo que dura una cita, en minutos enteros (como `duracionAlReagendar`). */
function minutosEntre(inicio: Date, fin: Date): number {
  return Math.ceil((fin.getTime() - inicio.getTime()) / 60_000)
}

type FilaAjustada = { orden: number; duration: number }

/**
 * Escribe las duraciones nuevas de las filas, por `orden` y acotado al
 * negocio. Los precios no se tocan: lo que se cobró o se cobrará por cada
 * servicio no depende de cuánto dure.
 */
async function ajustarFilas(
  db: Pick<Prisma.TransactionClient, "appointmentService">,
  businessId: string,
  citaId: string,
  filas: FilaAjustada[]
) {
  for (const fila of filas) {
    await db.appointmentService.updateMany({
      where: { appointmentId: citaId, businessId, orden: fila.orden },
      data: { duration: fila.duration },
    })
  }
}

/** La zona del negocio, para escribir las horas de un mensaje en su reloj. */
async function zonaDeLaClinica(businessId: string): Promise<string> {
  const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } })
  return zonaDelNegocio(negocio?.timezone)
}

/**
 * Si el pedido sólo cambia el estado. `confirmarAdvertencias` no cuenta: no
 * es un dato de la cita, sólo la respuesta a un aviso.
 */
function soloCambiaElEstado(datos: z.infer<typeof edicionDeCitaSchema>): boolean {
  return Object.entries(datos).every(
    ([campo, valor]) => valor === undefined || campo === "status" || campo === "confirmarAdvertencias"
  )
}

/** Si la cita tiene una atención no anulada en el Tablero: el cliente llegó. */
async function tieneAtencionViva(businessId: string, citaId: string): Promise<boolean> {
  const atencion = await prisma.visit.findFirst({
    where: { appointmentId: citaId, businessId, status: { not: "anulada" } },
    select: { id: true },
  })
  return atencion !== null
}

/**
 * Pide un `Actor`, no `Actor | null`: sin sesión no hay cita, y el handler ya
 * cortó con 401 antes de llegar acá (misma convención que `memberIdParaCita`
 * en `lib/permisos.ts`). Así el compilador es el que obliga a poner la guarda
 * primero, en vez de convertir "no hay sesión" en un 404 silencioso.
 */
async function verificarCita(actor: Actor, id: string) {
  return prisma.appointment.findFirst({ where: whereDeAgenda(actor, { id }) })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const cita = await prisma.appointment.findFirst({
    where: whereDeAgenda(actor, { id }),
    // Columnas explícitas (`lib/citas-de-la-clinica.ts`): ni el hash del
    // enlace, ni las comisiones. Fuera de una clínica dental, sin el sillón
    // ni `primeraVez`, como en la lista (`GET /api/citas`).
    select: seleccionDeCitaDelPanel(veSillones(actor)),
  })

  if (!cita) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  // Clínica dental: la alerta de alergias del paciente, para todo rol de la
  // clínica (también el encargado, que lo recibe). Sólo esa columna, y nada
  // de un paciente eliminado: lo asegura el lector (`leerAlertaDeAlergias`).
  // Sin ficha o sin nada anotado, `null`. En otro rubro la clave no viaja.
  if (!veAlertaDeAlergias(actor)) return NextResponse.json(cita)
  const alergias = cita.customerId ? await leerAlertaDeAlergias(prisma, actor, cita.customerId) : null
  return NextResponse.json({ ...cita, alergias })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await verificarCita(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  try {
    const cuerpo = await leerJsonConTope(request)
    const datos = edicionDeCitaSchema.parse(cuerpo)

    // Una reserva por confirmar (#84) la confirma o la cancela sólo quien
    // gestiona el negocio: cualquier otro cambio de estado, también.
    const resuelvePorConfirmar = estaPorConfirmar(existente) && datos.status !== undefined && datos.status !== existente.status
    if (resuelvePorConfirmar && !puedeResolverPorConfirmar(actor)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    // Se compara lo que queda después del cambio: si se mueve sólo el inicio
    // o sólo el fin, contra lo guardado. Antes una cita podía quedar
    // terminando antes de empezar.
    const inicio = datos.startTime ? new Date(datos.startTime) : existente.startTime
    const fin = datos.endTime ? new Date(datos.endTime) : existente.endTime
    if (datos.startTime || datos.endTime) {
      if (!terminaDespuesDeEmpezar(inicio, fin)) {
        return NextResponse.json({ error: MENSAJE_DE_HORARIO_INVERTIDO }, { status: 400 })
      }
    }

    // El profesional no reasigna: `memberIdParaCita` lo deja en sí mismo, y
    // como sólo llega a sus propias citas, para él no cambia nada. `|| null`:
    // el string vacío es "sin asignar", como al crear.
    const memberId =
      datos.memberId !== undefined ? memberIdParaCita(actor, datos.memberId || null) : existente.memberId

    if (memberId && memberId !== existente.memberId) {
      const miembro = await prisma.businessMember.findFirst({
        where: { id: memberId, businessId: actor.businessId },
        select: { id: true, role: true },
      })
      if (!miembro) {
        return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })
      }
      // Sólo al cambiar de miembro: una cita que ya era suya no se toca (#144).
      if (!atiendeCitas(miembro.role)) {
        return NextResponse.json({ error: MENSAJE_MIEMBRO_NO_ATIENDE }, { status: 400 })
      }
      // Una cita con servicios del catálogo va a quien los hace todos, como al
      // crearla. Las filas de un servicio que se borró del catálogo
      // (`serviceId` null) no cuentan: ya no hay contra qué comparar.
      const servicios = await prisma.appointmentService.findMany({
        where: { appointmentId: existente.id, businessId: actor.businessId },
        select: { serviceId: true },
      })
      const serviceIds = servicios.flatMap((fila) => (fila.serviceId ? [fila.serviceId] : []))
      if (serviceIds.length > 0 && !(await elMiembroHaceLosServicios(prisma, actor.businessId, memberId, serviceIds))) {
        return NextResponse.json({ error: MENSAJE_PROFESIONAL_NO_HACE }, { status: 400 })
      }
    }

    // Clínica dental: el sillón. Sin la clave, o en otro rubro (donde
    // `puedeAsignarSillon` dice que no y lo pedido se ignora), la cita
    // conserva el que tiene, también al moverla.
    const sillonId =
      puedeAsignarSillon(actor) && datos.sillonId !== undefined ? datos.sillonId : existente.sillonId
    const cambiaElSillon = sillonId !== existente.sillonId
    if (cambiaElSillon) {
      // Cambiar de sillón no es mover: se puede con el paciente ya en la sala
      // de espera ("Asignar sillón"), pero no en una cita cerrada.
      if (!sePuedeMover(existente.status)) {
        return NextResponse.json({ error: MENSAJE_SILLON_DE_CITA_CERRADA }, { status: 409 })
      }
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
    }

    // Sacar la cita de cancelada, completada o "no vino" es reactivarla:
    // sólo dueña y encargado, y con sus reglas (`lib/reactivar-cita.ts`).
    const reactivacion = decidirReactivacion({
      desde: existente.status,
      hacia: datos.status,
      inicio: existente.startTime,
      ahora: new Date(),
      puede: puedeReactivarCita(actor),
    })
    if (reactivacion.tipo === "rechazada") {
      return NextResponse.json({ error: reactivacion.mensaje }, { status: reactivacion.status })
    }

    if (
      existente.status === "en-progreso" &&
      (datos.status === "pendiente" || datos.status === "confirmada") &&
      (await tieneAtencionViva(actor.businessId, existente.id))
    ) {
      return NextResponse.json({ error: MENSAJE_CANCELAR_CON_ATENCION }, { status: 409 })
    }

    // "No vino" sólo para una reserva que seguía esperando, cuya hora ya
    // llegó y cuyo cliente no está en el Tablero: si no, el contador de
    // inasistencias de la ficha mentiría.
    if (datos.status === "no-asistio" && existente.status !== "no-asistio") {
      if (!puedeMarcarseNoVino(existente.status)) {
        return NextResponse.json({ error: NO_VINO_SIN_ESPERA }, { status: 409 })
      }
      if (existente.startTime.getTime() > Date.now()) {
        return NextResponse.json({ error: NO_VINO_ANTES_DE_HORA }, { status: 409 })
      }
      const llego = await prisma.visit.findFirst({
        where: { appointmentId: existente.id, businessId: actor.businessId, status: { not: "anulada" } },
        select: { id: true },
      })
      if (llego) {
        return NextResponse.json({ error: NO_VINO_PERO_LLEGO }, { status: 409 })
      }
    }

    // Sólo cuenta como mover si se pidió cambiar el horario o el profesional y
    // algo de eso es distinto de lo guardado: un cambio de estado no se mueve.
    const pideMover = datos.startTime !== undefined || datos.endTime !== undefined || datos.memberId !== undefined
    const seMueve =
      pideMover &&
      (inicio.getTime() !== existente.startTime.getTime() ||
      fin.getTime() !== existente.endTime.getTime() ||
      memberId !== existente.memberId)

    if (seMueve) {
      if (!sePuedeMover(existente.status)) {
        return NextResponse.json({ error: MENSAJE_CITA_CERRADA }, { status: 409 })
      }

      // Una cita cuyo cliente ya llegó vive en el Tablero: moverla dejaría la
      // atención colgada de un horario que no es el suyo. Una atención anulada
      // ya no cuenta.
      const atencion = await prisma.visit.findFirst({
        where: { appointmentId: existente.id, businessId: actor.businessId, status: { not: "anulada" } },
        select: { id: true },
      })
      if (atencion) {
        return NextResponse.json({ error: MENSAJE_CITA_CON_ATENCION }, { status: 409 })
      }
    }

    // El sillón tiene que estar libre si la cita queda en uno ocupando su
    // horario y algo de eso cambia: otro sillón, otra hora, o vuelve a ocupar
    // (se reactiva). No es una advertencia: un sillón atiende a uno a la vez
    // (`lib/sillones.ts`). Se mira antes que las advertencias, para no pedir
    // que se confirmen y después rechazar igual; la revisión que vale es la
    // de la transacción que escribe, con el sillón trabado.
    const estadoFinal = datos.status ?? existente.status
    const cambiaElHorario =
      (datos.startTime !== undefined || datos.endTime !== undefined) &&
      (inicio.getTime() !== existente.startTime.getTime() || fin.getTime() !== existente.endTime.getTime())
    const vuelveAOcupar = !ocupaElHorario(existente.status) && ocupaElHorario(estadoFinal)
    const consultaDeSillon: (ConsultaDeSillon & { zona: string }) | null =
      sillonId && ocupaElHorario(estadoFinal) && (cambiaElSillon || cambiaElHorario || vuelveAOcupar)
        ? {
            businessId: actor.businessId,
            sillonId,
            tramo: { startTime: inicio, endTime: fin },
            ignorarCitaId: existente.id,
            zona: await zonaDeLaClinica(actor.businessId),
            // Las horas de las citas que chocan, sólo a quien ve toda la agenda.
            mostrarHorarios: puedeVerTodaLaAgenda(actor),
          }
        : null
    if (consultaDeSillon) {
      const ocupado = await errorDeSillonOcupado(prisma, consultaDeSillon)
      if (ocupado) throw ocupado
    }

    if (seMueve && !datos.confirmarAdvertencias) {
      const advertencias = await advertenciasDeAgenda(prisma, {
        businessId: actor.businessId,
        citaId: existente.id,
        tramo: { startTime: inicio, endTime: fin },
        memberId,
      })
      if (advertencias.length > 0) {
        return NextResponse.json(
          { error: advertencias.map((advertencia) => advertencia.mensaje).join(" "), advertencias },
          { status: 409 }
        )
      }
    }

    // Las filas de `cita_servicios` (#138) siguen a la cita: con un título a
    // mano dejarían de describirla (409), y si cambia lo que dura se reparten
    // las duraciones para que sumen lo nuevo (`duracionesQueSuman`). Sin
    // filas (citas de antes o del panel con texto libre) no hay nada que
    // mantener.
    const cambiaElTitulo = datos.title !== undefined && datos.title !== existente.title
    const cambiaLaDuracion =
      seMueve && minutosEntre(inicio, fin) !== minutosEntre(existente.startTime, existente.endTime)
    let filasAjustadas: FilaAjustada[] = []
    if (cambiaElTitulo || cambiaLaDuracion) {
      const filas = await prisma.appointmentService.findMany({
        where: { appointmentId: existente.id, businessId: actor.businessId },
        orderBy: { orden: "asc" },
        select: { orden: true, duration: true },
      })
      if (filas.length > 0 && cambiaElTitulo) {
        return NextResponse.json({ error: MENSAJE_TITULO_CON_SERVICIOS }, { status: 409 })
      }
      if (filas.length > 0 && cambiaLaDuracion) {
        const duraciones = duracionesQueSuman(
          filas.map((fila) => fila.duration),
          minutosEntre(inicio, fin)
        )
        if (!duraciones) {
          return NextResponse.json({ error: mensajeDeDuracionConServicios(filas.length) }, { status: 400 })
        }
        filasAjustadas = filas.map((fila, indice) => ({ orden: fila.orden, duration: duraciones[indice] }))
      }
    }

    // Una cancelada o de "no vino" que vuelve ocupa otra vez su horario: se avisa si choca,
    // y quien reactiva decide (`confirmarAdvertencias`), como al mover. Si se
    // mueve a la vez, ya respondió 409 arriba (una cita cerrada no se mueve).
    if (reactivacion.tipo === "reactivar" && reactivacion.avisarChoques && !datos.confirmarAdvertencias) {
      const advertencias = await advertenciasDeAgenda(prisma, {
        businessId: actor.businessId,
        citaId: existente.id,
        tramo: { startTime: inicio, endTime: fin },
        memberId,
      })
      if (advertencias.length > 0) {
        return NextResponse.json(
          { error: advertencias.map((advertencia) => advertencia.mensaje).join(" "), advertencias },
          { status: 409 }
        )
      }
    }

    // La hora de la cancelación sale de la base, como la de la anulación de
    // la atención (que también cancela la cita): una sola fuente de hora
    // aunque las instancias tengan relojes desfasados (#149). Sólo se pide
    // cuando de verdad se cancela.
    const canceladaEn =
      datos.status === "cancelada" && existente.status !== "cancelada" ? await horaDeLaBase(prisma) : null

    const cambiaElInicio =
      datos.startTime !== undefined && new Date(datos.startTime).getTime() !== existente.startTime.getTime()
    // "No vino" suelta lo agendado en la cita como cancelarla (clínica dental)
    // y, como mover, se escribe sólo si el cliente no llegó entretanto.
    const marcaNoVino = datos.status === "no-asistio" && existente.status !== "no-asistio"

    // Por `existente.id`, no por `id`: si alguien borra la verificación de
    // arriba, `existente` queda sin declarar y el build falla. La garantía deja
    // de depender de que el próximo lea las dos líneas en orden.
    const actualizacion = {
      where: { id: existente.id },
      data: {
        ...(datos.title && { title: datos.title }),
        ...(datos.startTime && { startTime: new Date(datos.startTime) }),
        // A otra hora le corresponde su propio recordatorio: el de la hora
        // anterior (si ya salió) no la cubre, y el cron sólo manda a las que
        // no lo tienen marcado.
        ...(cambiaElInicio && { reminderSentAt: null }),
        ...(datos.endTime && { endTime: new Date(datos.endTime) }),
        ...(memberId !== existente.memberId && { memberId }),
        ...(cambiaElSillon && { sillonId }),
        ...(datos.status && { status: datos.status }),
        ...(datos.notes !== undefined && { notes: datos.notes || null }),
        ...(datos.price !== undefined && { price: datos.price }),
        ...(reactivacion.tipo === "reactivar" && reactivacion.limpiarCancelacion && { canceladaPor: null, canceladaEn: null }),
        // Cancelarla desde el panel deja quién y cuándo, como el enlace del
        // cliente (#121). Sólo al pasar a cancelada: re-enviar "cancelada"
        // no pisa la hora ni el autor de la primera cancelación.
        ...(canceladaEn && { canceladaPor: "negocio", canceladaEn }),
      },
      // Columnas explícitas: ni el hash del enlace, ni las comisiones.
      select: seleccionDeCitaDelPanel(veSillones(actor)),
    } satisfies Prisma.AppointmentUpdateArgs

    // Resolver una por confirmar (#84) es condicional: sólo si sigue
    // pendiente, en este negocio. Dos "Confirmar" a la vez pasaban los dos y
    // al cliente le llegaban dos correos; ahora sólo el que la cambió avisa.
    // El otro ve cómo quedó: si quedó como pedía y no pedía nada más, 200 sin
    // otro correo; si otro la resolvió distinto, o el pedido traía además
    // horario, profesional, notas o precio (que se perderían en silencio), 409.
    //
    // Si el cliente ya llegó (tiene una atención viva en el Tablero), la
    // reserva está resuelta: confirmarla no le manda el correo, y cancelarla
    // responde 409 (primero se anula la atención). La condición va en la
    // misma escritura: una llegada que entre entretanto no deja una cancelada
    // con su atención colgando.
    if (resuelvePorConfirmar && reactivacion.tipo !== "reactivar") {
      const cancela = datos.status === "cancelada"
      // Cancelar, marcar "No vino" o moverla: sólo si el cliente no llegó.
      const sinLlegada = cancela || marcaNoVino || seMueve
      // La cita y sus filas en la misma transacción: o cambian las dos o ninguna.
      const { count } = await prisma.$transaction(async (tx) => {
        if (consultaDeSillon) await asegurarSillonLibre(tx, consultaDeSillon)
        const escrita = await tx.appointment.updateMany({
          where: {
            id: existente.id,
            businessId: actor.businessId,
            status: "pendiente",
            confirmacionPorFaltas: true,
            ...(sinLlegada && SIN_ATENCION_VIVA),
          },
          data: actualizacion.data,
        })
        if (escrita.count === 1) await ajustarFilas(tx, actor.businessId, existente.id, filasAjustadas)
        // Clínica dental: lo agendado en esta cita vuelve a "por agendar".
        if (escrita.count === 1 && (cancela || marcaNoVino) && esClinicaDental(actor)) {
          await soltarLoClinicoDeLaCita(tx, actor.businessId, existente.id, "cancela")
        }
        return escrita
      })
      const cita = await prisma.appointment.findFirst({
        where: { id: existente.id, businessId: actor.businessId },
        select: actualizacion.select,
      })
      if (!cita) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
      if (count !== 1) {
        // Sigue por confirmar: lo único que pudo frenarla es su atención.
        if (sinLlegada && estaPorConfirmar(cita)) {
          const mensaje = cancela ? MENSAJE_CANCELAR_CON_ATENCION : marcaNoVino ? NO_VINO_PERO_LLEGO : MENSAJE_CITA_CON_ATENCION
          return NextResponse.json({ error: mensaje }, { status: 409 })
        }
        if (cita.status === datos.status && soloCambiaElEstado(datos)) return NextResponse.json(cita)
        return NextResponse.json({ error: mensajeDeReservaQueCambio(datos.status) }, { status: 409 })
      }
      // Confirmada por el local: se le avisa al cliente, después de responder,
      // salvo que ya esté en el local.
      if (datos.status === "confirmada" && !(await tieneAtencionViva(actor.businessId, existente.id))) {
        avisarReservaConfirmadaPorElLocal({ businessId: actor.businessId, citaId: existente.id })
      }
      if (!ocupaElHorario(cita.status) || seMueve) {
        programarAvisoDeHoraLiberada({ businessId: actor.businessId, inicio: existente.startTime })
      }
      return NextResponse.json(cita)
    }

    // Cancelar cualquier otra cita también es condicional (#136): si el
    // cliente ya llegó, 409 y primero se anula la atención en el Tablero. La
    // condición va en la misma escritura, como en las por confirmar: una
    // llegada que entre entretanto no deja una cancelada con su atención viva.
    if (reactivacion.tipo !== "reactivar" && datos.status === "cancelada" && existente.status !== "cancelada") {
      const { count } = await prisma.$transaction(async (tx) => {
        const escrita = await tx.appointment.updateMany({
          where: { id: existente.id, businessId: actor.businessId, ...SIN_ATENCION_VIVA },
          data: actualizacion.data,
        })
        if (escrita.count === 1) await ajustarFilas(tx, actor.businessId, existente.id, filasAjustadas)
        // Clínica dental: lo agendado en esta cita vuelve a "por agendar".
        if (escrita.count === 1 && esClinicaDental(actor)) {
          await soltarLoClinicoDeLaCita(tx, actor.businessId, existente.id, "cancela")
        }
        return escrita
      })
      const cita = await prisma.appointment.findFirst({
        where: { id: existente.id, businessId: actor.businessId },
        select: actualizacion.select,
      })
      if (!cita) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
      if (count !== 1) return NextResponse.json({ error: MENSAJE_CANCELAR_CON_ATENCION }, { status: 409 })
      if (ocupaElHorario(existente.status)) {
        programarAvisoDeHoraLiberada({ businessId: actor.businessId, inicio: existente.startTime })
      }
      return NextResponse.json(cita)
    }

    if (reactivacion.tipo !== "reactivar") {
      // Con filas que ajustar, en la misma transacción: la cita y sus filas
      // quedan diciendo lo mismo o no cambia ninguna. Con un sillón que
      // revisar, también: se traba el sillón y se mira de nuevo que esté libre.
      //
      // Mover y marcar "No vino" se escriben sólo si el cliente no llegó
      // (`SIN_ATENCION_VIVA` en el `where`): la revisión de arriba es de antes,
      // y una llegada que entre entretanto no puede quedar colgando de una cita
      // en otra hora o de una que dice que no vino. "No vino", además, sólo si
      // la cita sigue en el estado con que se decidió. Y en una clínica dental
      // suelta lo agendado en ella, como cancelar.
      const condicionada = seMueve || marcaNoVino
      const sueltaLoClinico = marcaNoVino && esClinicaDental(actor)
      const resultadoDeLaEscritura =
        filasAjustadas.length > 0 || consultaDeSillon || condicionada || sueltaLoClinico
          ? await prisma.$transaction(async (tx) => {
              if (consultaDeSillon) await asegurarSillonLibre(tx, consultaDeSillon)
              if (condicionada) {
                const { count } = await tx.appointment.updateMany({
                  where: {
                    id: existente.id,
                    businessId: actor.businessId,
                    ...(marcaNoVino && { status: existente.status }),
                    AND: [SIN_ATENCION_VIVA],
                  },
                  data: actualizacion.data,
                })
                if (count === 0) {
                  // Lo más probable es que el cliente haya llegado; si no, la cita cambió.
                  const llego = await tx.visit.findFirst({
                    where: { appointmentId: existente.id, businessId: actor.businessId, status: { not: "anulada" } },
                    select: { id: true },
                  })
                  return { rechazo: llego ? (marcaNoVino ? NO_VINO_PERO_LLEGO : MENSAJE_CITA_CON_ATENCION) : MENSAJE_CITA_CAMBIO }
                }
              } else {
                await tx.appointment.update(actualizacion)
              }
              await ajustarFilas(tx, actor.businessId, existente.id, filasAjustadas)
              if (sueltaLoClinico) await soltarLoClinicoDeLaCita(tx, actor.businessId, existente.id, "cancela")
              const escrita = await tx.appointment.findFirst({
                where: { id: existente.id, businessId: actor.businessId },
                select: actualizacion.select,
              })
              return escrita ? { escrita } : { rechazo: MENSAJE_CITA_CAMBIO }
            })
          : { escrita: await prisma.appointment.update(actualizacion) }
      if ("rechazo" in resultadoDeLaEscritura) {
        return NextResponse.json({ error: resultadoDeLaEscritura.rechazo }, { status: 409 })
      }
      const cita = resultadoDeLaEscritura.escrita
      // Si dejó libre su horario (se canceló, o se movió de hora o de
      // profesional), a la lista de espera de ese día, después de responder.
      const libera = datos.status !== undefined && !ocupaElHorario(datos.status)
      if (ocupaElHorario(existente.status) && (libera || seMueve)) {
        programarAvisoDeHoraLiberada({ businessId: actor.businessId, inicio: existente.startTime })
      }
      return NextResponse.json(cita)
    }

    // La atención se revisa en la misma transacción que reactiva: un cobro o
    // un cierre de caja que entre entretanto no se cuela.
    // Y sólo si la cita sigue en el estado con que se decidió reactivarla, y
    // en este negocio: si otro la cambió entretanto, 409 y no se pisa.
    const resultado = await prisma.$transaction(async (tx) => {
      const problema = await problemaConLaAtencion(tx, actor.businessId, existente.id)
      if (problema) return { problema }
      // Las reglas con hora (una cancelada que ya pasó no vuelve) se miran de
      // nuevo con la hora de la base, después de los candados: la misma
      // fuente de hora que el cobro, la caja y la anulación.
      const decision = decidirReactivacion({
        desde: existente.status,
        hacia: datos.status,
        inicio: existente.startTime,
        ahora: await horaDeLaBase(tx),
        puede: puedeReactivarCita(actor),
      })
      if (decision.tipo === "rechazada") return { problema: { mensaje: decision.mensaje } }
      // Vuelve a ocupar su horario: si tiene sillón, que siga libre.
      if (consultaDeSillon) await asegurarSillonLibre(tx, consultaDeSillon)
      const { count } = await tx.appointment.updateMany({
        where: { id: existente.id, businessId: actor.businessId, status: existente.status },
        data: actualizacion.data,
      })
      if (count === 0) return { problema: { mensaje: MENSAJE_CITA_CAMBIO } }
      const cita = await tx.appointment.findFirst({
        where: { id: existente.id, businessId: actor.businessId },
        select: actualizacion.select,
      })
      return { cita }
    })
    // Con el código, si lo hay: "corregir-con-ajuste" (#134), como la anulación.
    if (resultado.problema) {
      const { mensaje, codigo } = resultado.problema
      return NextResponse.json({ error: mensaje, ...(codigo && { codigo }) }, { status: 409 })
    }
    return NextResponse.json(resultado.cita)
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
    // La cita se borró entre la lectura y la escritura (`update` no la encontró).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
    }
    registrarError("editando una cita", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

/**
 * DELETE /api/citas/[id] — borra la cita. Ninguna pantalla lo usa hoy (la
 * agenda cancela, no borra); queda para el panel con las mismas guardas que
 * cancelar, y algunas más, porque borrar no deja rastro:
 * - Sólo quien gestiona el negocio (dueña y encargado). El profesional
 *   cancela, no borra. Primero la pertenencia (404), después el rol (401).
 * - No una cita cerrada (cancelada, completada o "no vino"): es historia del
 *   cliente (inasistencias, quién canceló) y de la plata. 409.
 * - No una cita cuyo cliente ya llegó (atención viva en el Tablero): la
 *   atención quedaría colgando. La condición va en la misma escritura
 *   (`SIN_ATENCION_VIVA`), como al cancelar. 409.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await verificarCita(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }
  // Borrar es de quien gestiona el negocio. También resuelve una por
  // confirmar (#84), que sólo resuelve quien gestiona el negocio.
  if (!gestionaElNegocio(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  if (!sePuedeMover(existente.status)) {
    return NextResponse.json({ error: MENSAJE_BORRAR_CITA_CERRADA }, { status: 409 })
  }

  // La escritura repite las condiciones: si entretanto se cerró o el cliente
  // llegó, no se borra (y lo clínico que se soltó vuelve atrás).
  const borrable = {
    id: existente.id,
    businessId: actor.businessId,
    status: { notIn: [...ESTADOS_QUE_NO_SE_MUEVEN] },
    AND: [SIN_ATENCION_VIVA],
  } satisfies Prisma.AppointmentWhereInput

  let borradas = 0
  try {
    if (esClinicaDental(actor)) {
      // Clínica dental: las prestaciones del plan y las evoluciones que
      // apuntan a la cita se sueltan antes, en la misma transacción (con FK NO
      // ACTION, si no, la base rechaza el borrado). `lib/citas-de-la-clinica.ts`.
      borradas = await prisma.$transaction(async (tx) => {
        await soltarLoClinicoDeLaCita(tx, actor.businessId, existente.id, "borra")
        const { count } = await tx.appointment.deleteMany({ where: borrable })
        // No se borró: se deshace lo que se soltó.
        if (count === 0) throw new CitaQueNoSeBorra()
        return count
      })
    } else {
      // Acotado al negocio, como en la rama dental: la escritura no depende
      // sólo de la verificación de arriba.
      borradas = (await prisma.appointment.deleteMany({ where: borrable })).count
    }
  } catch (error) {
    if (error instanceof CitaQueNoSeBorra) {
      borradas = 0
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      // Algo de la ficha clínica todavía apunta a la cita (una sesión que aún
      // no sabe que el negocio es dental, o algo que se ligó entretanto): la
      // base no la deja borrar. Se dice qué hacer en vez de un 500.
      return NextResponse.json({ error: MENSAJE_CITA_CON_REGISTROS_CLINICOS }, { status: 409 })
    } else {
      registrarError("borrando una cita", error)
      return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
    }
  }
  if (borradas === 0) {
    return NextResponse.json({ error: MENSAJE_BORRAR_CITA_CON_ATENCION }, { status: 409 })
  }
  if (ocupaElHorario(existente.status)) {
    programarAvisoDeHoraLiberada({ businessId: actor.businessId, inicio: existente.startTime })
  }

  return NextResponse.json({ mensaje: "Cita eliminada" })
}
