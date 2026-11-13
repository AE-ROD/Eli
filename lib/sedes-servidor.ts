import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { telefonoChileno } from "@/lib/campos-del-panel"
import { franjaGuardableEnUnaSede, filasDeLaGrilla, grillaDeFilas, type DiaDeLaGrilla, type GrillaDeSede } from "@/lib/grilla-de-sede"
import { whereDeSedes, type Actor } from "@/lib/permisos"
import { planConocido } from "@/lib/planes"
import { registrarError } from "@/lib/registro-de-errores"
import {
  MENSAJE_NOMBRE_DE_SEDE_REPETIDO,
  MENSAJE_PLAN_SIN_SEDES,
  MENSAJE_RECHAZO_DE_LA_BASE,
  MENSAJE_SEDE_CON_CITAS,
  MENSAJE_SEDE_NO_ENCONTRADA,
  choquesDeLaSede,
  decidirAltaDeSede,
  decidirBorrado,
  decidirConversion,
  decidirDesactivacion,
  decidirReactivacion,
  mensajeDeChoques,
  nombreDeSedeRepetido,
  type Rechazo,
} from "@/lib/reglas-de-sedes"
import { MAX_SEDES, ordenarSedes } from "@/lib/sedes"

/**
 * El lado servidor de las sedes (etapa 9): lo que leen y escriben los
 * endpoints de `/api/configuracion/sedes/**`, dentro de la transacción que ya
 * abrió el endpoint (`tx`). Las decisiones puras están en
 * `lib/reglas-de-sedes.ts`; acá se leen los datos, se aplican y se escribe.
 *
 * Reglas que atraviesan todo (CLAUDE.md, regla 1):
 * - El negocio sale siempre del actor (la sesión), nunca del pedido. Una sede
 *   ajena o inexistente es "no encontrada" (404), igual que cualquier id.
 * - Todo lo que cambia sedes toma el candado del negocio
 *   (`tomarCandadoDePlanYSedes`) antes de leer, la misma clave que usan los
 *   cuatro triggers de la migración: dos pedidos a la vez no pasan cada uno
 *   por su lado una regla que se contradice con la del otro.
 * - El plan se lee de la BASE dentro de la transacción (`exigirPlanIndependiente`),
 *   no del token: el token puede ir un paso atrás de un cambio de plan.
 * - Los triggers de la base son la segunda barrera. Estas funciones validan
 *   antes y responden con un mensaje claro; `respuestaDeErrorDeSedes` traduce
 *   igual un rechazo de la base a 409, nunca a 500.
 */

type Db = Prisma.TransactionClient

// ─── Lo que viaja a la pantalla ──────────────────────────────────────────────

/** Una sede como la ve la pantalla de Configuración. */
export interface SedeDelPanel {
  id: string
  nombre: string
  direccion: string
  comuna: string
  /** E.164 (+56...) o null. */
  telefono: string | null
  orden: number
  activo: boolean
  /** La grilla semanal: sólo los días con franjas, de domingo (0) a sábado (6). */
  horarios: DiaDeLaGrilla[]
  /** Horas pendientes o confirmadas por delante en esta sede. */
  horasFuturas: number
}

/** Los estados de una hora que sigue en pie: pendiente o confirmada. */
export const ESTADOS_DE_HORA_POR_DELANTE = ["pendiente", "confirmada"] as const

/** Las citas que siguen por delante (`startTime` en el futuro) y en pie. Se combina con `businessId` y `sedeId`, no los reemplaza. */
export const whereDeHorasPorDelante = (ahora: Date) =>
  ({ status: { in: [...ESTADOS_DE_HORA_POR_DELANTE] }, startTime: { gt: ahora } }) satisfies Prisma.AppointmentWhereInput

export const seleccionDeSede = (ahora: Date) =>
  ({
    id: true,
    nombre: true,
    direccion: true,
    comuna: true,
    telefono: true,
    orden: true,
    activo: true,
    horarios: { where: { active: true }, select: { dayOfWeek: true, startTime: true, endTime: true } },
    _count: { select: { citas: { where: whereDeHorasPorDelante(ahora) } } },
  }) satisfies Prisma.SedeSelect

type FilaDeSede = Prisma.SedeGetPayload<{ select: ReturnType<typeof seleccionDeSede> }>

export function aSedeDelPanel(fila: FilaDeSede): SedeDelPanel {
  return {
    id: fila.id,
    nombre: fila.nombre,
    direccion: fila.direccion,
    comuna: fila.comuna,
    telefono: fila.telefono,
    orden: fila.orden,
    activo: fila.activo,
    horarios: grillaDeFilas(fila.horarios),
    horasFuturas: fila._count.citas,
  }
}

/** Todas las sedes del negocio del actor, activas e inactivas, en el orden de la lista. */
export async function leerSedes(db: Pick<Db, "sede">, actor: Actor, ahora: Date = new Date()): Promise<SedeDelPanel[]> {
  const filas = await db.sede.findMany({ where: whereDeSedes(actor), select: seleccionDeSede(ahora) })
  return ordenarSedes(filas.map(aSedeDelPanel))
}

/** Una sede del negocio del actor, o `null`: la de otro negocio no se encuentra. */
export async function leerSede(db: Pick<Db, "sede">, actor: Actor, id: string, ahora: Date = new Date()): Promise<SedeDelPanel | null> {
  const fila = await db.sede.findFirst({ where: whereDeSedes(actor, { id }), select: seleccionDeSede(ahora) })
  return fila ? aSedeDelPanel(fila) : null
}

// ─── Lo que llega del navegador ──────────────────────────────────────────────

export const LARGO_MAXIMO_DEL_NOMBRE_DE_SEDE = 40
export const LARGO_MAXIMO_DE_LA_DIRECCION = 200
export const LARGO_MAXIMO_DE_LA_COMUNA = 80
export const ORDEN_MAXIMO_DE_SEDE = 999

const textoObligatorio = (queEs: string, max: number, articulo: "el" | "la") =>
  z
    .string({ required_error: `Escribe ${articulo} ${queEs}`, invalid_type_error: `Escribe ${articulo} ${queEs}` })
    .trim()
    .min(1, `Escribe ${articulo} ${queEs}`)
    .max(max, `${articulo === "el" ? "El" : "La"} ${queEs} no puede tener más de ${max} caracteres`)

const nombreDeSede = () => textoObligatorio("nombre de la sede", LARGO_MAXIMO_DEL_NOMBRE_DE_SEDE, "el")
const direccionDeSede = () => textoObligatorio("dirección de la sede", LARGO_MAXIMO_DE_LA_DIRECCION, "la")
const comunaDeSede = () => textoObligatorio("comuna de la sede", LARGO_MAXIMO_DE_LA_COMUNA, "la")
/** E.164 chileno, o vacío/null para quitarlo. */
const telefonoDeSede = () => telefonoChileno().nullable().optional()

export const ordenDeSede = () =>
  z
    .number({ invalid_type_error: "El orden tiene que ser un número" })
    .int("El orden tiene que ser un número entero")
    .min(0, "El orden no puede ser negativo")
    .max(ORDEN_MAXIMO_DE_SEDE, `El orden no puede ser mayor que ${ORDEN_MAXIMO_DE_SEDE}`)

const datosDeSedeObjeto = z.object({
  nombre: nombreDeSede(),
  direccion: direccionDeSede(),
  comuna: comunaDeSede(),
  telefono: telefonoDeSede(),
})

/** El cuerpo de `POST /api/configuracion/sedes`. */
export const datosDeSedeSchema = datosDeSedeObjeto
export type DatosDeSede = z.infer<typeof datosDeSedeSchema>

/** El cuerpo de `PUT /api/configuracion/sedes/[id]`: lo que no viene no cambia. `telefono: null` lo quita. */
export const edicionDeSedeSchema = z
  .object({
    nombre: nombreDeSede().optional(),
    direccion: direccionDeSede().optional(),
    comuna: comunaDeSede().optional(),
    telefono: telefonoDeSede(),
    orden: ordenDeSede().optional(),
    activo: z.boolean({ invalid_type_error: "Activo tiene que ser sí o no" }).optional(),
  })
  .refine(
    (datos) =>
      datos.nombre !== undefined ||
      datos.direccion !== undefined ||
      datos.comuna !== undefined ||
      datos.telefono !== undefined ||
      datos.orden !== undefined ||
      datos.activo !== undefined,
    { message: "No hay nada que cambiar" }
  )
export type EdicionDeSede = z.infer<typeof edicionDeSedeSchema>

/** El cuerpo de `POST /api/configuracion/sedes/convertir`. */
export const conversionASedesSchema = z
  .object({ principal: datosDeSedeObjeto, nueva: datosDeSedeObjeto })
  .refine((datos) => !nombreDeSedeRepetido(datos.nueva.nombre, [{ id: "principal", nombre: datos.principal.nombre }]), {
    message: "Las dos sedes necesitan nombres distintos",
    path: ["nueva", "nombre"],
  })
export type ConversionASedes = z.infer<typeof conversionASedesSchema>

// ─── Rechazos ────────────────────────────────────────────────────────────────

/**
 * Un pedido que no se puede cumplir, lanzado desde dentro de la transacción
 * para que se deshaga entera. El endpoint lo responde con `status` y `cuerpo`.
 */
export class RechazoDeSedes extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly cuerpo: { error: string } & Record<string, unknown>
  ) {
    super(cuerpo.error)
    this.name = "RechazoDeSedes"
  }
}

const rechazoDe = (decision: Rechazo) => new RechazoDeSedes(decision.status, { error: decision.error, ...decision.extra })
const noEncontrada = () => new RechazoDeSedes(404, { error: MENSAJE_SEDE_NO_ENCONTRADA })

/** Lanza si la decisión es un rechazo. */
function exigir(decision: { ok: true } | Rechazo): void {
  if (!decision.ok) throw rechazoDe(decision)
}

/** El rechazo de la base por una regla (un trigger o un CHECK): `check_violation`, 23514. */
export function esRechazoDeLaBase(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientUnknownRequestError) return /\b23514\b/.test(error.message)
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2004" || /\b23514\b/.test(error.message)
  return false
}

/**
 * Otra operación tenía el candado del negocio y esta no alcanzó, o dos
 * transacciones se cruzaron: Postgres cortó una (deadlock, 40P01), no llegó al
 * candado a tiempo (55P03) o Prisma venció la transacción (P2028) o la dio por
 * conflictiva (P2034). No es un error nuestro: se vuelve a intentar.
 */
export function esConflictoDeConcurrencia(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034" || error.code === "P2028" || /\b(40P01|55P03)\b/.test(error.message)
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /\b(40P01|55P03)\b|deadlock detected|lock timeout/i.test(error.message)
  }
  return false
}

export const MENSAJE_CONFLICTO_DE_CONCURRENCIA = "Hubo otro cambio al mismo tiempo. Espera un momento e intenta de nuevo."

/** El único `(businessId, nombre)` de la base. */
const esNombreRepetido = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"

/** Una sede con citas no se borra: la FK de las citas la frena (NO ACTION). */
const esSedeConCitas = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003"

/**
 * Lo que dice la base cuando un trigger rechaza, en palabras de quien usa la
 * pantalla. Sólo se mira el tipo de regla: el texto crudo de la base no llega a
 * la persona.
 */
export function mensajeDeRechazoDeLaBase(error: unknown): string {
  const texto = error instanceof Error ? error.message : ""
  if (/hasta 5 sedes activas/.test(texto)) return `Un negocio tiene hasta ${MAX_SEDES} sedes activas. Desactiva una antes`
  if (/sólo el plan Independiente tiene sedes/.test(texto)) return MENSAJE_PLAN_SIN_SEDES
  if (/se pisa con la de la sede/.test(texto)) return "El horario se pisa con el de otra sede el mismo día. Una sola persona no puede estar en dos sedes a la vez"
  if (/no pasa al plan Equipo con sedes activas/.test(texto)) return "Todavía hay sedes activas. Desactívalas antes de pasar al plan Equipo"
  if (/no pasa al plan Independiente con integrantes/.test(texto)) return "Tu negocio tiene integrantes o invitaciones pendientes. Quítalos antes de pasar al plan Independiente"
  if (/horarios_laborales_sede_horas_check/.test(texto)) return "Las horas van como HH:MM, de 00:00 a 23:59, y el inicio antes del fin"
  return MENSAJE_RECHAZO_DE_LA_BASE
}

/**
 * La respuesta de un error que salió de una transacción de sedes: un rechazo
 * nuestro, un nombre repetido, una sede con citas, un rechazo de la base
 * (segunda barrera) o, si no es nada de eso, un 500 sin datos. `contexto` es lo
 * que se registra ("guardando la sede").
 */
export function respuestaDeErrorDeSedes(error: unknown, contexto: string): NextResponse {
  if (error instanceof RechazoDeSedes) return NextResponse.json(error.cuerpo, { status: error.status })
  if (esNombreRepetido(error)) return NextResponse.json({ error: MENSAJE_NOMBRE_DE_SEDE_REPETIDO }, { status: 409 })
  if (esRechazoDeLaBase(error)) return NextResponse.json({ error: mensajeDeRechazoDeLaBase(error) }, { status: 409 })
  if (esConflictoDeConcurrencia(error)) return NextResponse.json({ error: MENSAJE_CONFLICTO_DE_CONCURRENCIA }, { status: 409 })
  registrarError(contexto, error)
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
}

// ─── Candado y plan ──────────────────────────────────────────────────────────

/**
 * El candado del negocio para todo lo de planes y sedes: la misma clave que
 * toman los triggers de la migración (`hashtext('plan-y-sedes:' || businessId)`).
 * Es de la transacción (`pg_advisory_xact_lock`) y reentrante: tomarlo acá y
 * otra vez dentro del trigger, en la misma transacción, no espera a nadie.
 * Va PRIMERO, antes de leer lo que se decide.
 */
export async function tomarCandadoDePlanYSedes(tx: Pick<Db, "$executeRaw">, businessId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan-y-sedes:${businessId}`}))`
}

/** El plan que tiene la base ahora (no el del token), o `null` si no hay negocio o el plan no se conoce. */
export async function planDeLaBase(db: Pick<Db, "business">, businessId: string) {
  const negocio = await db.business.findUnique({ where: { id: businessId }, select: { plan: true } })
  return planConocido(negocio?.plan)
}

/** Las sedes son del plan Independiente: lo lee de la base, y si no lo es, 409. */
export async function exigirPlanIndependiente(db: Pick<Db, "business">, businessId: string): Promise<void> {
  if ((await planDeLaBase(db, businessId)) !== "independiente") {
    throw new RechazoDeSedes(409, { error: MENSAJE_PLAN_SIN_SEDES })
  }
}

/** Cuántas horas pendientes o confirmadas hay por delante en el negocio, o en una sede. */
export function contarHorasPorDelante(db: Pick<Db, "appointment">, businessId: string, ahora: Date, sedeId?: string): Promise<number> {
  return db.appointment.count({ where: { businessId, ...(sedeId ? { sedeId } : {}), ...whereDeHorasPorDelante(ahora) } })
}

const ordenAlFinal = (ultimo: number | null | undefined): number =>
  ultimo === null || ultimo === undefined ? 0 : Math.min(ultimo + 1, ORDEN_MAXIMO_DE_SEDE)

const sedesParaDecidir = (db: Pick<Db, "sede">, actor: Actor) =>
  db.sede.findMany({ where: whereDeSedes(actor), select: { id: true, nombre: true, orden: true, activo: true } })

/** Las franjas activas de las sedes ACTIVAS del negocio, para revisar solapes con otra sede. */
async function franjasDeLasSedesActivas(db: Pick<Db, "workSchedule">, businessId: string) {
  const filas = await db.workSchedule.findMany({
    where: { businessId, active: true, sedeId: { not: null }, sede: { is: { activo: true } } },
    select: { sedeId: true, dayOfWeek: true, startTime: true, endTime: true },
  })
  return filas.flatMap((fila) => (fila.sedeId ? [{ sedeId: fila.sedeId, dayOfWeek: fila.dayOfWeek, startTime: fila.startTime, endTime: fila.endTime }] : []))
}

// ─── Las operaciones (dentro de la transacción, con el candado ya tomado) ─────

/** Agrega una sede a un negocio que ya está en modo sedes. Va al final de la lista. */
export async function crearSede(tx: Db, actor: Actor, datos: DatosDeSede): Promise<SedeDelPanel> {
  await exigirPlanIndependiente(tx, actor.businessId)
  const sedes = await sedesParaDecidir(tx, actor)
  exigir(decidirAltaDeSede({ activas: sedes.filter((sede) => sede.activo).length }))
  if (nombreDeSedeRepetido(datos.nombre, sedes)) throw new RechazoDeSedes(409, { error: MENSAJE_NOMBRE_DE_SEDE_REPETIDO })

  const creada = await tx.sede.create({
    data: {
      businessId: actor.businessId,
      nombre: datos.nombre,
      direccion: datos.direccion,
      comuna: datos.comuna,
      telefono: datos.telefono ?? null,
      orden: ordenAlFinal(Math.max(-1, ...sedes.map((sede) => sede.orden))),
    },
    select: { id: true },
  })
  const sede = await leerSede(tx, actor, creada.id)
  if (!sede) throw noEncontrada()
  return sede
}

/**
 * El negocio pasa de "cero sedes" a dos, en una sola transacción: crea la
 * sede principal (con lo que manda la pantalla, que trae la dirección actual
 * del negocio), le pasa el horario general (`memberId` NULL y `sedeId` NULL),
 * le pone esa sede a las horas por delante y a las inscripciones activas de la
 * lista de espera, y crea la nueva (sin horario todavía).
 *
 * Del horario general sólo pasan las franjas que una sede puede guardar ("HH:MM"
 * válido, inicio < fin: el CHECK de la base). Una fila general que no cumple
 * (una hora rota que se coló antes) se queda como estaba. Las horas pasadas y
 * las canceladas no se tocan.
 */
export async function convertirASedes(tx: Db, actor: Actor, datos: ConversionASedes, ahora: Date = new Date()): Promise<SedeDelPanel[]> {
  const { businessId } = actor
  await exigirPlanIndependiente(tx, businessId)
  const sedes = await sedesParaDecidir(tx, actor)
  exigir(decidirConversion({ activas: sedes.filter((sede) => sede.activo).length }))
  for (const nombre of [datos.principal.nombre, datos.nueva.nombre]) {
    if (nombreDeSedeRepetido(nombre, sedes)) throw new RechazoDeSedes(409, { error: MENSAJE_NOMBRE_DE_SEDE_REPETIDO })
  }

  const primerOrden = ordenAlFinal(Math.max(-1, ...sedes.map((sede) => sede.orden)))
  const principal = await tx.sede.create({
    data: { businessId, ...datosParaGuardar(datos.principal), orden: primerOrden },
    select: { id: true },
  })
  await tx.sede.create({
    data: { businessId, ...datosParaGuardar(datos.nueva), orden: ordenAlFinal(primerOrden) },
    select: { id: true },
  })

  const generales = await tx.workSchedule.findMany({
    where: { businessId, memberId: null, sedeId: null },
    select: { id: true, startTime: true, endTime: true },
  })
  const aMover = generales.filter(franjaGuardableEnUnaSede).map((fila) => fila.id)
  if (aMover.length > 0) {
    await tx.workSchedule.updateMany({ where: { businessId, id: { in: aMover } }, data: { sedeId: principal.id } })
  }

  await tx.appointment.updateMany({
    where: { businessId, sedeId: null, ...whereDeHorasPorDelante(ahora) },
    data: { sedeId: principal.id },
  })
  await tx.inscripcionEnEspera.updateMany({
    where: { businessId, sedeId: null, estado: "activa" },
    data: { sedeId: principal.id },
  })

  return leerSedes(tx, actor, ahora)
}

const datosParaGuardar = (datos: DatosDeSede) => ({
  nombre: datos.nombre,
  direccion: datos.direccion,
  comuna: datos.comuna,
  telefono: datos.telefono ?? null,
})

/**
 * Edita una sede. Desactivarla se bloquea si tiene horas por delante (y, si
 * era la única activa, si el negocio tiene alguna); reactivarla, si ya hay
 * `MAX_SEDES` activas o si su horario guardado se pisaría con el de otra sede
 * activa.
 */
export async function editarSede(tx: Db, actor: Actor, id: string, datos: EdicionDeSede, ahora: Date = new Date()): Promise<SedeDelPanel> {
  const { businessId } = actor
  await exigirPlanIndependiente(tx, businessId)
  const sedes = await sedesParaDecidir(tx, actor)
  const actual = sedes.find((sede) => sede.id === id)
  if (!actual) throw noEncontrada()

  if (datos.nombre !== undefined && nombreDeSedeRepetido(datos.nombre, sedes, id)) {
    throw new RechazoDeSedes(409, { error: MENSAJE_NOMBRE_DE_SEDE_REPETIDO })
  }

  const otrasActivas = sedes.filter((sede) => sede.id !== id && sede.activo).length

  if (datos.activo === false && actual.activo) {
    exigir(
      decidirDesactivacion({
        horasFuturasDeLaSede: await contarHorasPorDelante(tx, businessId, ahora, id),
        otrasActivas,
        horasFuturasDelNegocio: otrasActivas === 0 ? await contarHorasPorDelante(tx, businessId, ahora) : 0,
      })
    )
  }

  if (datos.activo === true && !actual.activo) {
    const propias = await tx.workSchedule.findMany({
      where: { businessId, sedeId: id, active: true },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    })
    const ajenas = (await franjasDeLasSedesActivas(tx, businessId)).filter((franja) => franja.sedeId !== id)
    const nombres = new Map(sedes.map((sede) => [sede.id, sede.nombre]))
    exigir(
      decidirReactivacion({
        otrasActivas,
        choques: choquesDeLaSede(id, [...propias.map((franja) => ({ sedeId: id, ...franja })), ...ajenas], (sedeId) => nombres.get(sedeId) ?? "otra sede"),
      })
    )
  }

  await tx.sede.updateMany({
    where: { id, businessId },
    data: {
      ...(datos.nombre !== undefined && { nombre: datos.nombre }),
      ...(datos.direccion !== undefined && { direccion: datos.direccion }),
      ...(datos.comuna !== undefined && { comuna: datos.comuna }),
      ...(datos.telefono !== undefined && { telefono: datos.telefono }),
      ...(datos.orden !== undefined && { orden: datos.orden }),
      ...(datos.activo !== undefined && { activo: datos.activo }),
    },
  })

  const sede = await leerSede(tx, actor, id, ahora)
  if (!sede) throw noEncontrada()
  return sede
}

/**
 * Borra una sede que nunca tuvo horas; se lleva su horario y sus inscripciones
 * de la lista de espera (CASCADE). Con una sola cita, de cualquier estado y
 * fecha, no: se desactiva.
 */
export async function borrarSede(tx: Db, actor: Actor, id: string): Promise<void> {
  const { businessId } = actor
  await exigirPlanIndependiente(tx, businessId)
  const existente = await tx.sede.findFirst({ where: whereDeSedes(actor, { id }), select: { id: true } })
  if (!existente) throw noEncontrada()

  exigir(decidirBorrado({ citas: await tx.appointment.count({ where: { businessId, sedeId: id } }) }))
  try {
    await tx.sede.deleteMany({ where: { id, businessId } })
  } catch (error) {
    // Una hora que entró entre el conteo y el borrado: la FK de las citas la frena.
    if (esSedeConCitas(error)) throw new RechazoDeSedes(409, { error: MENSAJE_SEDE_CON_CITAS })
    throw error
  }
}

/**
 * Reemplaza TODA la grilla de una sede (vacía = no atiende). Las franjas que se
 * guardan no pueden pisarse con las de otra sede ACTIVA (`choquesEntreSedes`),
 * esté la sede activa o no: el trigger `horarios_sedes_sin_pisarse` no mira si
 * la sede de la franja que se escribe está activa, así que una sede desactivada
 * tampoco guarda un horario que ya chocaría. (Las franjas de las OTRAS sedes
 * inactivas no cuentan para nadie.)
 */
export async function guardarHorarioDeSede(tx: Db, actor: Actor, id: string, grilla: GrillaDeSede, ahora: Date = new Date()): Promise<SedeDelPanel> {
  const { businessId } = actor
  await exigirPlanIndependiente(tx, businessId)
  const sedes = await sedesParaDecidir(tx, actor)
  const sede = sedes.find((candidata) => candidata.id === id)
  if (!sede) throw noEncontrada()

  const nuevas = filasDeLaGrilla(grilla, { businessId, sedeId: id })
  if (nuevas.length > 0) {
    const ajenas = (await franjasDeLasSedesActivas(tx, businessId)).filter((franja) => franja.sedeId !== id)
    const nombres = new Map(sedes.map((candidata) => [candidata.id, candidata.nombre]))
    const choques = choquesDeLaSede(
      id,
      [...nuevas.map((fila) => ({ sedeId: id, dayOfWeek: fila.dayOfWeek, startTime: fila.startTime, endTime: fila.endTime })), ...ajenas],
      (sedeId) => nombres.get(sedeId) ?? "otra sede"
    )
    if (choques.length > 0) throw new RechazoDeSedes(409, { error: mensajeDeChoques(choques), choques })
  }

  // Reemplazar es borrar y crear bajo el candado del negocio (ya tomado):
  // dos guardados a la vez no duplican la grilla.
  await tx.workSchedule.deleteMany({ where: { businessId, sedeId: id } })
  if (nuevas.length > 0) await tx.workSchedule.createMany({ data: nuevas })

  const actualizada = await leerSede(tx, actor, id, ahora)
  if (!actualizada) throw noEncontrada()
  return actualizada
}
