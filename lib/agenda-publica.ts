import type { Prisma } from "@prisma/client"
import { cabeEnAtencion, franjasDeAtencion, type FilaDeHorarioSemanal } from "@/lib/horario-de-atencion"
import { horaAMinutos, minutosAHora, type FranjaHorario } from "@/lib/horario-dia"
import { franjasParaElDia } from "@/lib/mover-cita"
import { imagenPublica } from "@/lib/pagina-del-negocio"
import { ESTADOS_QUE_LIBERAN, estaLibre, leerOcupacion, type Ocupacion, type Tramo } from "@/lib/ocupacion"
import { yaPasoLaHora } from "@/lib/reserva-publica"
import { diaDeLaSemana, existeLaHora, instanteEn, rangoDelDiaEn } from "@/lib/zona-horaria"

/**
 * La agenda de la reserva pública por profesional: quién atiende, qué horas
 * tiene libres y a quién se le asigna una reserva. La usan `disponibilidad`
 * (ofrecer horas), `confirmar` (aceptarlas) y el enlace para reagendar, con
 * las mismas funciones: lo que se ofrece y lo que se acepta no pueden dar
 * distinto (issue #46). La base se recibe, como en `lib/ocupacion.ts`, para
 * poder llamarla con el `tx` de la transacción de `confirmar`.
 *
 * Reglas
 * ──────
 * - **Quién atiende:** los miembros con rol profesional (`worker`). El
 *   encargado no, hasta que exista el indicador "también atiende citas" (ver
 *   PRODUCTO.md §10); el dueño no es miembro y tampoco se ofrece cuando hay
 *   profesionales.
 * - **Qué hace:** `MemberService`; sin filas, hace todos los servicios.
 * - **Su horario:** el propio si cargó alguno, si no el del negocio
 *   (`franjasParaElDia`, la misma regla de las advertencias del panel).
 * - **Qué lo ocupa:** sus citas activas, sus bloqueos y los de todo el
 *   negocio (`leerOcupacion`), y además las citas activas **sin asignar**:
 *   las reservas públicas de antes de esto quedaron sin profesional y no se
 *   sabe quién las atiende, así que ocupan a todos (como hasta ahora).
 * - **Negocio sin profesionales** (el dueño solo, o con un encargado): un
 *   único carril, como siempre. Horario del negocio (`franjasDeAtencion`),
 *   ocupado por cualquier cita activa del negocio y por los bloqueos de todo
 *   el negocio. La cita queda sin asignar (`memberId` null).
 */

export const ROLES_QUE_ATIENDEN = ["worker"] as const

/** Tope de profesionales que se leen: ningún local tiene cien. */
const TOPE_DE_PROFESIONALES = 100

export type BaseDeAgendaPublica = Pick<Prisma.TransactionClient, "appointment" | "timeBlock">

export interface ProfesionalQueAtiende {
  id: string
  nombre: string
  especialidad: string | null
  /** Ya saneada con `imagenPublica`: sólo una ruta del mismo sitio, o null. */
  fotoUrl: string | null
  /** Los servicios que hace; vacío = todos. */
  serviceIds: string[]
}

/** Los profesionales del negocio que atienden, en el orden en que entraron. Nada de su correo ni de su teléfono. */
export async function leerProfesionalesQueAtienden(
  db: Pick<Prisma.TransactionClient, "businessMember">,
  businessId: string
): Promise<ProfesionalQueAtiende[]> {
  const miembros = await db.businessMember.findMany({
    where: { businessId, role: { in: [...ROLES_QUE_ATIENDEN] } },
    select: {
      id: true,
      especialidad: true,
      fotoUrl: true,
      user: { select: { name: true } },
      memberServices: { where: { businessId }, select: { serviceId: true } },
    },
    orderBy: { createdAt: "asc" },
    take: TOPE_DE_PROFESIONALES,
  })
  return miembros.map((miembro) => ({
    id: miembro.id,
    nombre: miembro.user.name.trim(),
    especialidad: miembro.especialidad,
    // Se sanea acá, igual que en la mini página, para que ningún consumidor
    // público devuelva una URL externa o con otro esquema.
    fotoUrl: imagenPublica(miembro.fotoUrl),
    serviceIds: miembro.memberServices.map((fila) => fila.serviceId),
  }))
}

export function haceElServicio(profesional: Pick<ProfesionalQueAtiende, "serviceIds">, serviceId: string): boolean {
  return profesional.serviceIds.length === 0 || profesional.serviceIds.includes(serviceId)
}

/** Si hace TODOS los servicios de una reserva con varios (#89a): uno solo que no haga lo deja fuera. */
export function haceLosServicios(profesional: Pick<ProfesionalQueAtiende, "serviceIds">, serviceIds: string[]): boolean {
  return serviceIds.length > 0 && serviceIds.every((serviceId) => haceElServicio(profesional, serviceId))
}

/** Quien puede tomar la reserva ese día y en qué franjas. `memberId` null = el carril único del negocio sin profesionales. */
export interface Candidato {
  memberId: string | null
  franjas: FranjaHorario[]
}

/**
 * Los candidatos de un día. `profesionales` son los que atienden y hacen el
 * servicio (ya filtrados, y acotados al elegido si el cliente eligió uno);
 * `hayProfesionales` dice si el negocio tiene alguno: si tiene pero ninguno
 * hace el servicio, no hay candidatos (no se cae al carril del negocio).
 */
export function candidatosDelDia(
  filasDeLaSemana: FilaDeHorarioSemanal[],
  hayProfesionales: boolean,
  profesionales: string[],
  fecha: string
): Candidato[] {
  const dia = diaDeLaSemana(fecha)
  if (!hayProfesionales) {
    return [{ memberId: null, franjas: franjasDeAtencion(filasDeLaSemana.filter((fila) => fila.dayOfWeek === dia)) }]
  }
  return profesionales.map((memberId) => ({
    memberId,
    franjas: franjasParaElDia(filasDeLaSemana, memberId, dia)?.franjas ?? [],
  }))
}

/** Las horas de inicio de un tramo de `duracion` minutos dentro de una franja, cada `duracion` minutos desde que abre. */
export function horasDeLaFranja(franja: FranjaHorario, duracion: number): string[] {
  const horas: string[] = []
  if (!(duracion > 0)) return horas
  const fin = horaAMinutos(franja.endTime)
  for (let minuto = horaAMinutos(franja.startTime); minuto + duracion <= fin; minuto += duracion) {
    horas.push(minutosAHora(minuto))
  }
  return horas
}

/**
 * Lo que ocupa a un candidato en [desde, hasta): `leerOcupacion` más las
 * citas que lo ocupan sin ser suyas. Con profesional, las sin asignar; en el
 * carril del negocio, todas las del negocio.
 */
export async function ocupacionDelCandidato(
  db: BaseDeAgendaPublica,
  consulta: { businessId: string; memberId: string | null; desde: Date; hasta: Date; ignorarCitaId?: string | null }
): Promise<Ocupacion> {
  const { businessId, memberId, desde, hasta, ignorarCitaId } = consulta
  const [propia, compartidas] = await Promise.all([
    leerOcupacion(db, consulta),
    db.appointment.findMany({
      where: {
        businessId,
        ...(memberId ? { memberId: null } : {}),
        status: { notIn: [...ESTADOS_QUE_LIBERAN] },
        ...(ignorarCitaId ? { id: { not: ignorarCitaId } } : {}),
        startTime: { lt: hasta },
        endTime: { gt: desde },
      },
      select: { id: true, memberId: true, status: true, startTime: true, endTime: true },
      orderBy: { startTime: "asc" },
      take: 500,
    }),
  ])
  return { citas: [...propia.citas, ...compartidas], bloqueos: propia.bloqueos }
}

/** El tramo de una reserva: la hora en el reloj del negocio y la duración del servicio. */
export function tramoDeLaReserva(fecha: string, hora: string, duracion: number, zona: string): Tramo {
  const startTime = instanteEn(fecha, hora, zona)
  return { startTime, endTime: new Date(startTime.getTime() + duracion * 60000) }
}

/**
 * Las horas libres de un día: la unión de las de cada candidato (con uno
 * solo, las suyas). Sin horas pasadas ni horas que el reloj se salta por el
 * horario de verano: `confirmar` las rechaza.
 */
export async function horasLibresDelDia(
  db: BaseDeAgendaPublica,
  consulta: {
    businessId: string
    zona: string
    fecha: string
    duracion: number
    candidatos: Candidato[]
    ahora: Date
    ignorarCitaId?: string | null
  }
): Promise<string[]> {
  const { businessId, zona, fecha, duracion, candidatos, ahora, ignorarCitaId } = consulta
  const dia = rangoDelDiaEn(fecha, zona)
  const libres = new Set<string>()

  for (const candidato of candidatos) {
    const horas = candidato.franjas
      .flatMap((franja) => horasDeLaFranja(franja, duracion))
      .filter((hora) => existeLaHora(fecha, hora, zona) && !yaPasoLaHora(fecha, hora, ahora, zona))
    const pendientes = horas.filter((hora) => !libres.has(hora))
    if (pendientes.length === 0) continue

    const ocupacion = await ocupacionDelCandidato(db, {
      businessId,
      memberId: candidato.memberId,
      desde: dia.desde,
      hasta: dia.hasta,
      ignorarCitaId,
    })
    for (const hora of pendientes) {
      if (estaLibre(ocupacion, tramoDeLaReserva(fecha, hora, duracion, zona))) libres.add(hora)
    }
  }

  return [...libres].sort((a, b) => horaAMinutos(a) - horaAMinutos(b))
}

/** Los candidatos cuyo horario cubre entero el tramo [inicio, inicio + duración) de esa hora. */
export function candidatosQueCubren(candidatos: Candidato[], hora: string, duracion: number): Candidato[] {
  const inicio = horaAMinutos(hora)
  return candidatos.filter((candidato) => cabeEnAtencion(candidato.franjas, inicio, inicio + duracion))
}

export type Asignacion = { libre: true; memberId: string | null } | { libre: false }

/**
 * A quién va la reserva, re-verificado con la base que se le pasa (el `tx`
 * de `confirmar`). De los candidatos libres en el tramo, el que tiene menos
 * citas activas ese día; si empatan, el de id menor: el criterio es estable y
 * reparte la carga.
 */
export async function asignarCandidatoLibre(
  db: BaseDeAgendaPublica,
  consulta: {
    businessId: string
    candidatos: Candidato[]
    tramo: Tramo
    dia: { desde: Date; hasta: Date }
    ignorarCitaId?: string | null
  }
): Promise<Asignacion> {
  const { businessId, candidatos, tramo, dia, ignorarCitaId } = consulta
  const libres: { memberId: string | null; citasDelDia: number }[] = []

  for (const candidato of candidatos) {
    const ocupacion = await ocupacionDelCandidato(db, {
      businessId,
      memberId: candidato.memberId,
      desde: tramo.startTime,
      hasta: tramo.endTime,
      ignorarCitaId,
    })
    if (!estaLibre(ocupacion, tramo)) continue
    // Con un solo candidato no hace falta contar.
    const citasDelDia =
      candidatos.length === 1 || candidato.memberId === null
        ? 0
        : await db.appointment.count({
            where: {
              businessId,
              memberId: candidato.memberId,
              status: { notIn: [...ESTADOS_QUE_LIBERAN] },
              startTime: { gte: dia.desde, lt: dia.hasta },
            },
          })
    libres.push({ memberId: candidato.memberId, citasDelDia })
  }

  if (libres.length === 0) return { libre: false }
  libres.sort((a, b) => a.citasDelDia - b.citasDelDia || ((a.memberId ?? "") < (b.memberId ?? "") ? -1 : 1))
  return { libre: true, memberId: libres[0].memberId }
}

export type CandidatosDeLaReserva =
  | { tipo: "ok"; candidatos: Candidato[]; profesionales: ProfesionalQueAtiende[] }
  | { tipo: "profesional-no-disponible" }

/**
 * Los candidatos de una reserva: los profesionales que atienden y hacen
 * TODOS los servicios (#89a; sólo el elegido, si el cliente eligió uno), con
 * su horario de ese día. Un profesional que no existe, es de otro negocio, no
 * atiende o no hace alguno de los servicios da `profesional-no-disponible`,
 * sin distinguir por qué. Los servicios llegan ya validados como del negocio
 * (`leerServiciosDeLaReserva`).
 */
export async function candidatosDeLaReserva(
  db: Pick<Prisma.TransactionClient, "businessMember" | "workSchedule">,
  consulta: { businessId: string; serviceIds: string[]; profesionalId: string | null; fecha: string }
): Promise<CandidatosDeLaReserva> {
  const { businessId, serviceIds, profesionalId, fecha } = consulta
  const [profesionales, filas] = await Promise.all([
    leerProfesionalesQueAtienden(db, businessId),
    db.workSchedule.findMany({
      where: { businessId, active: true },
      select: { memberId: true, dayOfWeek: true, startTime: true, endTime: true },
      orderBy: { startTime: "asc" },
    }),
  ])
  const queLoHacen = profesionales.filter((profesional) => haceLosServicios(profesional, serviceIds))
  let elegidos = queLoHacen
  if (profesionalId) {
    elegidos = queLoHacen.filter((profesional) => profesional.id === profesionalId)
    if (elegidos.length === 0) return { tipo: "profesional-no-disponible" }
  }
  return {
    tipo: "ok",
    profesionales,
    candidatos: candidatosDelDia(filas, profesionales.length > 0, elegidos.map((profesional) => profesional.id), fecha),
  }
}
