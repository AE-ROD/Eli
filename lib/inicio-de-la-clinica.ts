import { nombreCompletoDeCliente } from "@/lib/nombre-de-cliente"
import { puedeVerCita, type Actor } from "@/lib/permisos"

/**
 * El inicio de la clínica dental (`GET /api/dashboard/clinica`): "Sillones
 * ahora", la sala de espera y los presupuestos por responder. Funciones
 * puras: entra lo que ya trajo la base (filtrado por `lib/permisos.ts`) y la
 * hora, y sale lo que se muestra.
 *
 * Reglas de "Sillones ahora"
 * ──────────────────────────
 * - **Atendiendo**: entre las citas de hoy en ese sillón, una cuya atención
 *   del Tablero está "en atención" (empezó y todavía no pasó a por cobrar).
 *   Si la cita no tiene atención viva (sin atención, o anulada), cuenta la
 *   cita marcada "en progreso" a mano en la agenda. No se infiere de la hora:
 *   que la hora de una cita contenga "ahora" no dice que el paciente llegó.
 *   `desde` es cuándo empezó la atención (`startedAt`), o el inicio de la cita
 *   si no hay atención. Si hubiera dos, la que empezó último.
 * - **Libre**: si no. `libreHasta` es el inicio de la siguiente; `null` es
 *   libre el resto del día. Si ya pasó, la siguiente está atrasada.
 * - **Siguiente** (en los dos estados): la primera cita de hoy en el sillón,
 *   por hora, pendiente o confirmada, que no terminó y no se está atendiendo.
 *   Incluye a quien ya llegó y espera.
 */

// ─── Sillones ahora ──────────────────────────────────────────────────────────

export interface SillonDelInicio {
  id: string
  nombre: string
  orden: number
}

/** Una cita de hoy en un sillón, como la lee el endpoint. */
export interface CitaDelSillon {
  id: string
  sillonId: string | null
  title: string
  startTime: Date
  endTime: Date
  status: string
  customer: { id: string; name: string; lastName: string | null } | null
  member: { id: string; user: { name: string } } | null
  visit: { status: string; startedAt: Date | null } | null
}

export interface CitaParaElInicio {
  citaId: string
  titulo: string
  paciente: { id: string; nombre: string } | null
  odontologo: { id: string; nombre: string } | null
  inicio: Date
  fin: Date
}

export type EstadoDelSillon = SillonDelInicio &
  (
    | { estado: "atendiendo"; actual: CitaParaElInicio & { desde: Date }; siguiente: CitaParaElInicio | null; libreHasta: null }
    | { estado: "libre"; actual: null; siguiente: CitaParaElInicio | null; libreHasta: Date | null }
  )

const ESPERAN = ["pendiente", "confirmada"]

const atencionViva = (cita: CitaDelSillon) => (cita.visit && cita.visit.status !== "anulada" ? cita.visit : null)

/** Si se está atendiendo, desde cuándo; si no, `null`. */
function seAtiendeDesde(cita: CitaDelSillon): Date | null {
  const atencion = atencionViva(cita)
  if (atencion) return atencion.status === "en-atencion" ? (atencion.startedAt ?? cita.startTime) : null
  return cita.status === "en-progreso" ? cita.startTime : null
}

function paraElInicio(cita: CitaDelSillon): CitaParaElInicio {
  return {
    citaId: cita.id,
    titulo: cita.title,
    paciente: cita.customer ? { id: cita.customer.id, nombre: nombreCompletoDeCliente(cita.customer) } : null,
    odontologo: cita.member ? { id: cita.member.id, nombre: cita.member.user.name } : null,
    inicio: cita.startTime,
    fin: cita.endTime,
  }
}

/** Cada sillón activo, en el orden en que llega, con lo que pasa en él ahora. */
export function estadoDeLosSillones(
  sillones: readonly SillonDelInicio[],
  citas: readonly CitaDelSillon[],
  ahora: Date
): EstadoDelSillon[] {
  return sillones.map((sillon) => {
    const delSillon = citas
      .filter((cita) => cita.sillonId === sillon.id)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

    let actual: (CitaParaElInicio & { desde: Date }) | null = null
    for (const cita of delSillon) {
      const desde = seAtiendeDesde(cita)
      if (desde && (!actual || desde.getTime() > actual.desde.getTime())) actual = { ...paraElInicio(cita), desde }
    }

    const proxima = delSillon.find(
      (cita) =>
        ESPERAN.includes(cita.status) &&
        cita.endTime.getTime() > ahora.getTime() &&
        seAtiendeDesde(cita) === null &&
        cita.id !== actual?.citaId
    )
    const siguiente = proxima ? paraElInicio(proxima) : null

    return actual
      ? { ...sillon, estado: "atendiendo", actual, siguiente, libreHasta: null }
      : { ...sillon, estado: "libre", actual: null, siguiente, libreHasta: siguiente?.inicio ?? null }
  })
}

// ─── Sala de espera ──────────────────────────────────────────────────────────

/** Una atención en espera, como la lee el endpoint (con su reserva, si nació de una). */
export interface AtencionEnEspera {
  id: string
  customerId: string | null
  customerName: string
  arrivedAt: Date
  appointmentId: string | null
  appointment: {
    businessId: string
    memberId: string | null
    title: string
    sillon: { id: string; nombre: string } | null
  } | null
}

export interface PersonaEnEspera {
  atencionId: string
  /** La cita de la que nació, si el actor la ve; `null` si llegó sin reserva o la cita es de un colega. */
  citaId: string | null
  paciente: { id: string | null; nombre: string }
  minutos: number
  titulo: string | null
  /** El sillón de su cita; `null` sin sillón asignado (o sin cita que el actor vea). */
  sillon: { id: string; nombre: string } | null
}

export interface SalaDeEspera {
  cantidad: number
  /** Los minutos de quien más espera; `null` si no hay nadie. */
  mayorEsperaMinutos: number | null
  /** Los que más esperan primero, hasta `tope`. */
  lista: PersonaEnEspera[]
}

const minutosDesde = (instante: Date, ahora: Date) =>
  Math.max(0, Math.floor((ahora.getTime() - instante.getTime()) / 60_000))

/**
 * Quienes llegaron y todavía no pasan (atenciones "en espera"). De la cita de
 * origen (título y sillón) sólo se muestra lo que el actor puede ver
 * (`puedeVerCita`): un odontólogo ve la atención de la cita de un colega si
 * tiene una línea en ella, y eso no le abre la cita, como en el Tablero.
 */
export function salaDeEspera(
  actor: Actor,
  atenciones: readonly AtencionEnEspera[],
  ahora: Date,
  tope = 10
): SalaDeEspera {
  const ordenadas = [...atenciones].sort((a, b) => a.arrivedAt.getTime() - b.arrivedAt.getTime())
  const lista = ordenadas.slice(0, tope).map((atencion): PersonaEnEspera => {
    const cita = atencion.appointment && puedeVerCita(actor, atencion.appointment) ? atencion.appointment : null
    return {
      atencionId: atencion.id,
      citaId: cita ? atencion.appointmentId : null,
      paciente: { id: atencion.customerId, nombre: atencion.customerName },
      minutos: minutosDesde(atencion.arrivedAt, ahora),
      titulo: cita?.title ?? null,
      sillon: cita?.sillon ? { id: cita.sillon.id, nombre: cita.sillon.nombre } : null,
    }
  })
  return {
    cantidad: atenciones.length,
    mayorEsperaMinutos: ordenadas.length > 0 ? minutosDesde(ordenadas[0].arrivedAt, ahora) : null,
    lista,
  }
}

// ─── Presupuestos por responder ──────────────────────────────────────────────

/** Una etapa por aprobar ya presentada, de un plan vigente, como la lee el endpoint. */
export interface EtapaPorResponder {
  id: string
  nombre: string
  presentadaEn: Date | null
  planId: string
  plan: { customer: { id: string; name: string; lastName: string | null } }
  /** Sólo si quien mira ve montos: si no, ni se piden a la base. */
  prestaciones?: readonly { valorCents: number }[]
}

export interface PresupuestoPorResponder {
  etapaId: string
  planId: string
  etapa: string
  paciente: { id: string; nombre: string }
  presentadaEn: Date | null
  montoCents?: number
}

export interface PresupuestosPorResponder {
  cantidad: number
  totalCents?: number
  lista: PresupuestoPorResponder[]
}

/**
 * Cuántas etapas esperan respuesta, cuánto suman y las más recientes. Los
 * montos van sólo con `conMontos` (quien ve la plata del negocio, como los
 * ingresos del inicio): sin él, las claves no viajan. La lista conserva el
 * orden en que llegan (el endpoint las pide de la más reciente a la más vieja).
 */
export function presupuestosPorResponder(
  etapas: readonly EtapaPorResponder[],
  conMontos: boolean,
  tope = 5
): PresupuestosPorResponder {
  const monto = (etapa: EtapaPorResponder) =>
    (etapa.prestaciones ?? []).reduce((total, prestacion) => total + prestacion.valorCents, 0)
  const lista = etapas.slice(0, tope).map(
    (etapa): PresupuestoPorResponder => ({
      etapaId: etapa.id,
      planId: etapa.planId,
      etapa: etapa.nombre,
      paciente: { id: etapa.plan.customer.id, nombre: nombreCompletoDeCliente(etapa.plan.customer) },
      presentadaEn: etapa.presentadaEn,
      ...(conMontos && { montoCents: monto(etapa) }),
    })
  )
  return {
    cantidad: etapas.length,
    ...(conMontos && { totalCents: etapas.reduce((total, etapa) => total + monto(etapa), 0) }),
    lista,
  }
}
