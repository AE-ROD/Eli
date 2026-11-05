import type { Prisma } from "@prisma/client"
import {
  franjasDeAtencion,
  fusionarFranjas,
  horarioSemanalDeAtencion,
  type FilaDeHorarioSemanal,
  type FranjaDelDia,
} from "@/lib/horario-de-atencion"
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

/**
 * Si un miembro con este rol puede tener citas a su nombre. La misma regla
 * del selector de profesional del panel (#140) y de la reserva pública: una
 * cita del encargado quedaba en una agenda que nadie atiende (#144).
 */
export function atiendeCitas(role: string): boolean {
  return (ROLES_QUE_ATIENDEN as readonly string[]).includes(role)
}

/** El 400 al asignar una cita (crear o reasignar) a un miembro que no atiende. */
export const MENSAJE_MIEMBRO_NO_ATIENDE = "Esa persona no atiende citas: asígnala a un profesional del equipo o déjala sin asignar"

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

/**
 * Las filas de horario que cuentan para la reserva pública: las generales
 * del negocio (`memberId` null) y las de quienes atienden
 * (`profesionales`, los de `leerProfesionalesQueAtienden`). Un día sin filas
 * generales usa la unión de las de los miembros (`franjasDeAtencion`), y ahí
 * entraba el horario de un encargado, que no recibe reservas: ese día salía
 * con atención en la página y en la reserva (#168). El panel lee lo mismo
 * con `leerHorarioDeQuienesAtienden`.
 */
export function filasDeQuienesAtienden<F extends { memberId: string | null }>(
  filas: F[],
  profesionales: Pick<ProfesionalQueAtiende, "id">[]
): F[] {
  const atienden = new Set(profesionales.map((profesional) => profesional.id))
  return filas.filter((fila) => fila.memberId === null || atienden.has(fila.memberId))
}

/** Tope de filas de horario que se leen: siete días por persona, con margen. */
const TOPE_DE_FILAS_DE_HORARIO = 500

/**
 * El horario activo del negocio que cuenta para saber cuándo atiende: las
 * filas generales y las de quienes atienden (`filasDeQuienesAtienden`). Lo
 * usan la fila virtual, las horas que dibuja la agenda y las advertencias de
 * horario del panel: el horario personal de un encargado no abre el negocio
 * un día sin horario general (#168).
 */
export async function leerHorarioDeQuienesAtienden(
  db: Pick<Prisma.TransactionClient, "businessMember" | "workSchedule">,
  businessId: string
): Promise<FilaDeHorarioSemanal[]> {
  const [atienden, filas] = await Promise.all([
    db.businessMember.findMany({
      where: { businessId, role: { in: [...ROLES_QUE_ATIENDEN] } },
      select: { id: true },
    }),
    db.workSchedule.findMany({
      where: { businessId, active: true },
      select: { memberId: true, dayOfWeek: true, startTime: true, endTime: true },
      orderBy: { startTime: "asc" },
      take: TOPE_DE_FILAS_DE_HORARIO,
    }),
  ])
  return filasDeQuienesAtienden(filas, atienden)
}

export function haceElServicio(profesional: Pick<ProfesionalQueAtiende, "serviceIds">, serviceId: string): boolean {
  return profesional.serviceIds.length === 0 || profesional.serviceIds.includes(serviceId)
}

/** Si hace TODOS los servicios de una reserva con varios (#89a): uno solo que no haga lo deja fuera. */
export function haceLosServicios(profesional: Pick<ProfesionalQueAtiende, "serviceIds">, serviceIds: string[]): boolean {
  return serviceIds.length > 0 && serviceIds.every((serviceId) => haceElServicio(profesional, serviceId))
}

/** El 400 al dejar en el panel una cita con servicios a quien no los hace todos. */
export const MENSAJE_PROFESIONAL_NO_HACE = "Ese profesional no hace todos los servicios elegidos: elige otro o quítalos"

/**
 * Si el miembro hace todos esos servicios según lo que tiene acotado
 * (`MemberService`; sin filas, hace todos). Lo usan crear una cita con
 * servicios en el panel y reasignarla (#159), con la regla de la reserva
 * pública.
 */
export async function elMiembroHaceLosServicios(
  db: Pick<Prisma.TransactionClient, "memberService">,
  businessId: string,
  memberId: string,
  serviceIds: string[]
): Promise<boolean> {
  const queHace = await db.memberService.findMany({
    where: { businessId, memberId },
    select: { serviceId: true },
    take: 500,
  })
  return haceLosServicios({ serviceIds: queHace.map((fila) => fila.serviceId) }, serviceIds)
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
  return candidatosDelDiaDeLaSemana(filasDeLaSemana, hayProfesionales, profesionales, diaDeLaSemana(fecha))
}

/** `candidatosDelDia` con el día de la semana (0 domingo a 6 sábado) en vez de la fecha. */
function candidatosDelDiaDeLaSemana(
  filasDeLaSemana: FilaDeHorarioSemanal[],
  hayProfesionales: boolean,
  profesionales: string[],
  dia: number
): Candidato[] {
  if (!hayProfesionales) {
    return [{ memberId: null, franjas: franjasDeAtencion(filasDeLaSemana.filter((fila) => fila.dayOfWeek === dia)) }]
  }
  return profesionales.map((memberId) => ({
    memberId,
    franjas: franjasParaElDia(filasDeLaSemana, memberId, dia)?.franjas ?? [],
  }))
}

/**
 * El horario que publica la página del negocio (la mini página, su "Abierto
 * ahora" y los días que ofrece el calendario de la reserva), por día:
 * exactamente el que la reserva ofrece (QA#4).
 *
 * - **Con profesionales** (`profesionalIds`, los de
 *   `profesionalesConHorarioPublicado`): la unión del horario efectivo de cada
 *   uno, `franjasParaElDia`, el mismo con que `candidatosDelDia` les ofrece
 *   horas (el propio si cargó alguno; si no, el del negocio). El del negocio
 *   no se suma aparte: si todos tienen horario propio, la reserva no ofrece
 *   ninguna hora fuera de él (el negocio de 09:00 a 18:00 y Carla, la única,
 *   de 14:00 a 20:00 publica de 14:00 a 20:00, y los días en que Carla no
 *   atiende quedan cerrados aunque el negocio tenga horario).
 * - **Lista vacía:** el negocio tiene profesionales pero ninguno puede tomar
 *   una reserva (ninguno hace un servicio activo): la reserva no ofrece nada,
 *   y no se publica ninguna hora.
 * - **`null`, negocio sin profesionales:** el carril único, con el horario del
 *   negocio (`horarioSemanalDeAtencion`).
 *
 * El horario propio de un encargado, o de quien no hace ningún servicio
 * activo, no se publica: no recibe reservas.
 */
export function horarioSemanalPublicado(filas: FilaDeHorarioSemanal[], profesionalIds: string[] | null): FranjaDelDia[] {
  if (profesionalIds === null) return horarioSemanalDeAtencion(filas)
  return [0, 1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) =>
    fusionarFranjas(
      profesionalIds.flatMap((memberId) => franjasParaElDia(filas, memberId, dayOfWeek)?.franjas ?? [])
    ).map((franja) => ({ dayOfWeek, ...franja }))
  )
}

/**
 * Los días de la semana (0 domingo a 6 sábado) en que un profesional tiene
 * horario efectivo (`franjasParaElDia`, el mismo con que se le ofrecen horas).
 * El calendario de la reserva los usa para no dejar elegir un día en que
 * quien atiende no trabaja (N3).
 */
export function diasConHorarioDelProfesional(filas: FilaDeHorarioSemanal[], memberId: string): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((dia) => (franjasParaElDia(filas, memberId, dia)?.franjas.length ?? 0) > 0)
}

/**
 * De quiénes se publica el horario propio (`horarioSemanalPublicado`): los
 * que la reserva de verdad puede ofrecer. Son los de
 * `leerProfesionalesQueAtienden` (rol que atiende, con su tope) que hacen al
 * menos uno de los servicios activos del negocio. Un miembro que atiende pero
 * no hace ningún servicio activo nunca recibe una reserva: publicar su
 * horario abría en la página horas que la reserva no ofrece.
 */
export function profesionalesConHorarioPublicado(
  profesionales: Pick<ProfesionalQueAtiende, "id" | "serviceIds">[],
  serviciosActivos: string[]
): string[] {
  return profesionales
    .filter((profesional) => serviciosActivos.some((serviceId) => haceElServicio(profesional, serviceId)))
    .map((profesional) => profesional.id)
}

/**
 * Cada cuántos minutos, como mucho, se ofrece una hora de inicio. Antes el
 * paso era la duración del servicio: con uno de 90 minutos sólo se ofrecían
 * las 09:00, 10:30, 12:00…, y una cita a las 10:00 dejaba fuera las 11:30 y
 * las 12:00 aunque estuvieran libres (QA#2). `confirmar` y reagendar
 * aceptan sólo estas horas (`candidatosQueOfrecen`, #46).
 */
export const PASO_MAXIMO_ENTRE_HORAS = 30

/**
 * Las horas de inicio de un tramo de `duracion` minutos dentro de una franja,
 * desde que abre y cada `PASO_MAXIMO_ENTRE_HORAS` minutos (o cada `duracion`,
 * si el servicio dura menos: uno de 15 minutos sigue ofreciéndose cada 15).
 */
export function horasDeLaFranja(franja: FranjaHorario, duracion: number): string[] {
  const horas: string[] = []
  if (!(duracion > 0)) return horas
  const paso = Math.min(duracion, PASO_MAXIMO_ENTRE_HORAS)
  const fin = horaAMinutos(franja.endTime)
  for (let minuto = horaAMinutos(franja.startTime); minuto + duracion <= fin; minuto += paso) {
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
 *
 * Con `soloBloqueos`, las citas no cuentan: son las horas que el día podría
 * llegar a ofrecer si se liberaran todas (`hayHorasPosiblesDelDia`).
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
    soloBloqueos?: boolean
  }
): Promise<string[]> {
  const { businessId, zona, fecha, duracion, candidatos, ahora, ignorarCitaId, soloBloqueos = false } = consulta
  const dia = rangoDelDiaEn(fecha, zona)
  const libres = new Set<string>()

  for (const candidato of candidatos) {
    const horas = candidato.franjas
      .flatMap((franja) => horasDeLaFranja(franja, duracion))
      .filter((hora) => existeLaHora(fecha, hora, zona) && !yaPasoLaHora(fecha, hora, ahora, zona))
    const pendientes = horas.filter((hora) => !libres.has(hora))
    if (pendientes.length === 0) continue

    const leida = await ocupacionDelCandidato(db, {
      businessId,
      memberId: candidato.memberId,
      desde: dia.desde,
      hasta: dia.hasta,
      ignorarCitaId,
    })
    const ocupacion = soloBloqueos ? { citas: [], bloqueos: leida.bloqueos } : leida
    for (const hora of pendientes) {
      if (estaLibre(ocupacion, tramoDeLaReserva(fecha, hora, duracion, zona))) libres.add(hora)
    }
  }

  return [...libres].sort((a, b) => horaAMinutos(a) - horaAMinutos(b))
}

/**
 * Si el día tiene alguna hora que podría liberarse: en horario, no pasada y
 * fuera de los bloqueos, aunque hoy esté tomada por una cita. Un día cerrado,
 * bloqueado entero o cuyas horas ya pasaron no tiene ninguna, y ahí no se
 * ofrece la lista de espera: ninguna cancelación le va a abrir una hora
 * (QA#26).
 */
export async function hayHorasPosiblesDelDia(
  db: BaseDeAgendaPublica,
  consulta: Omit<Parameters<typeof horasLibresDelDia>[1], "soloBloqueos" | "ignorarCitaId">
): Promise<boolean> {
  const candidatos = consulta.candidatos.filter((candidato) => candidato.franjas.length > 0)
  if (candidatos.length === 0) return false
  return (await horasLibresDelDia(db, { ...consulta, candidatos, soloBloqueos: true })).length > 0
}

/**
 * Si el día puede llegar a ofrecer alguna hora a nivel del negocio: para
 * cualquiera que haga los servicios, sea quien sea. Es lo que decide si se
 * ofrece (y se acepta) la lista de espera.
 *
 * - `sin-atencion`: nadie que haga los servicios atiende ese día (cerrado).
 * - `sin-horas-posibles`: alguien atiende, pero todas sus horas están
 *   bloqueadas (por el negocio o por cada uno) o ya pasaron.
 * - `con-horas-posibles`: alguna hora, aunque hoy esté tomada, se puede liberar.
 *
 * No se mira al profesional elegido a propósito: con él, un día bloqueado
 * entero sólo para esa persona (vacaciones, licencia) daba "sin lista de
 * espera" y uno sólo lleno no, y la página pública dejaba deducir su agenda
 * personal. A nivel del negocio la respuesta sólo dice lo que ya es del
 * negocio: cerrado, bloqueado para todos o sin nadie que lo haga.
 */
export async function horasPosiblesEnElNegocio(
  db: Pick<Prisma.TransactionClient, "businessMember" | "workSchedule"> & BaseDeAgendaPublica,
  consulta: { businessId: string; serviceIds: string[]; fecha: string; zona: string; duracion: number; ahora: Date }
): Promise<"sin-atencion" | "sin-horas-posibles" | "con-horas-posibles"> {
  const { businessId, serviceIds, fecha, zona, duracion, ahora } = consulta
  const reserva = await candidatosDeLaReserva(db, { businessId, serviceIds, profesionalId: null, fecha })
  const candidatos = reserva.tipo === "ok" ? reserva.candidatos.filter((candidato) => candidato.franjas.length > 0) : []
  if (candidatos.length === 0) return "sin-atencion"
  const posibles = await hayHorasPosiblesDelDia(db, { businessId, zona, fecha, duracion, candidatos, ahora })
  return posibles ? "con-horas-posibles" : "sin-horas-posibles"
}

/**
 * Los candidatos que ofrecen esa hora: una de las de `horasDeLaFranja` en
 * alguna de sus franjas, la misma grilla con que `horasLibresDelDia` las
 * ofrece. Así el tramo [inicio, inicio + duración) cabe entero en su horario.
 * Antes bastaba que cupiera, y `confirmar` aceptaba horas que la
 * disponibilidad nunca ofreció, como las 09:17 (#46).
 */
export function candidatosQueOfrecen(candidatos: Candidato[], hora: string, duracion: number): Candidato[] {
  return candidatos.filter((candidato) =>
    candidato.franjas.some((franja) => horasDeLaFranja(franja, duracion).includes(hora))
  )
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
  const leidos = await leerQuienesPuedenTomarla(db, consulta)
  if (leidos.tipo === "profesional-no-disponible") return leidos
  const { profesionales, elegidos, filas } = leidos
  return {
    tipo: "ok",
    profesionales,
    candidatos: candidatosDelDia(filas, profesionales.length > 0, elegidos, consulta.fecha),
  }
}

/**
 * Los días de la semana (0 domingo a 6 sábado) en que alguno de los
 * candidatos de la reserva tiene horario: con los mismos candidatos que
 * `candidatosDeLaReserva`, para que el calendario de reagendar no deje elegir
 * un día cerrado (QA#19). `null` si el profesional ya no puede tomarla.
 */
export async function diasConAtencionDeLaReserva(
  db: Pick<Prisma.TransactionClient, "businessMember" | "workSchedule">,
  consulta: { businessId: string; serviceIds: string[]; profesionalId: string | null }
): Promise<number[] | null> {
  const leidos = await leerQuienesPuedenTomarla(db, consulta)
  if (leidos.tipo === "profesional-no-disponible") return null
  const { profesionales, elegidos, filas } = leidos
  return [0, 1, 2, 3, 4, 5, 6].filter((dia) =>
    candidatosDelDiaDeLaSemana(filas, profesionales.length > 0, elegidos, dia).some((candidato) => candidato.franjas.length > 0)
  )
}

/** Lo que leen `candidatosDeLaReserva` y `diasConAtencionDeLaReserva`: el equipo, los elegidos y el horario de la semana. */
async function leerQuienesPuedenTomarla(
  db: Pick<Prisma.TransactionClient, "businessMember" | "workSchedule">,
  consulta: { businessId: string; serviceIds: string[]; profesionalId: string | null }
): Promise<
  | { tipo: "ok"; profesionales: ProfesionalQueAtiende[]; elegidos: string[]; filas: FilaDeHorarioSemanal[] }
  | { tipo: "profesional-no-disponible" }
> {
  const { businessId, serviceIds, profesionalId } = consulta
  const [profesionales, filas] = await Promise.all([
    leerProfesionalesQueAtienden(db, businessId),
    db.workSchedule.findMany({
      where: { businessId, active: true },
      select: { memberId: true, dayOfWeek: true, startTime: true, endTime: true },
      orderBy: { startTime: "asc" },
    }),
  ])
  const queLoHacen = profesionales.filter((profesional) => haceLosServicios(profesional, serviceIds))
  // Sólo el horario general y el de quienes atienden (#168).
  const filasQueCuentan = filasDeQuienesAtienden(filas, profesionales)
  let elegidos = queLoHacen
  if (profesionalId) {
    elegidos = queLoHacen.filter((profesional) => profesional.id === profesionalId)
    if (elegidos.length === 0) return { tipo: "profesional-no-disponible" }
  }
  return { tipo: "ok", profesionales, elegidos: elegidos.map((profesional) => profesional.id), filas: filasQueCuentan }
}
