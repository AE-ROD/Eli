import { z } from "zod"
import { aCentavos, TOTAL_MAXIMO_CENTAVOS } from "@/lib/atenciones"
import { CARAS, esPiezaValida, sonCarasValidas } from "@/lib/odontograma"
import {
  ESTADOS_DE_PRESTACION,
  type EstadoDeEtapa,
  type EstadoDePrestacion,
  type TotalesDelPlan,
} from "@/lib/plan-de-tratamiento"

/**
 * Cómo se edita el plan de tratamiento por la API
 * (`app/api/clientes/[id]/plan/…`): los esquemas de cada pedido, las reglas
 * de estado de etapas y prestaciones, y la forma de la respuesta. Funciones
 * puras; lo que lee y escribe la base está en
 * `lib/plan-de-tratamiento-servidor.ts`, los totales y la propuesta desde el
 * odontograma en `lib/plan-de-tratamiento.ts`, y quién ve y edita el plan en
 * `lib/permisos.ts`.
 *
 * Los tipos `…Respuesta` son la forma exacta del JSON (fechas como texto
 * ISO): la pantalla los importa con `import type`.
 */

// ─── Topes ───────────────────────────────────────────────────────────────────

/** Etapas por versión del plan, y prestaciones por etapa. Un plan real no se acerca. */
export const MAXIMO_DE_ETAPAS = 30
export const MAXIMO_DE_PRESTACIONES_POR_ETAPA = 100

/** El valor más alto de una prestación: el CHECK `prestaciones_del_plan_valorCents_check`. */
export const VALOR_MAXIMO_CENTAVOS = TOTAL_MAXIMO_CENTAVOS

/** El nombre de la etapa que arma "Desde el odontograma". */
export const NOMBRE_DE_LA_ETAPA_DEL_ODONTOGRAMA = "Tratamiento indicado"

// ─── Mensajes ────────────────────────────────────────────────────────────────

export const MENSAJE_VERSION_NO_VIGENTE = "Esa versión del plan ya no está vigente. Recarga para ver la actual."
export const MENSAJE_ETAPA_APROBADA =
  "La etapa ya está aprobada: sólo se cambia el estado, la cita y quién hace cada prestación. Para cambiar algo más, vuelve a ponerla por aprobar."
export const MENSAJE_SIN_PLAN = "El paciente no tiene un plan de tratamiento. Créalo primero."
export const MENSAJE_ODONTOGRAMA_SIN_HALLAZGOS =
  "El odontograma no tiene caries ni extracciones indicadas: no hay nada que proponer. Arma el plan vacío o márcalo primero."

// ─── Esquemas de los pedidos ─────────────────────────────────────────────────

/** De dónde sale una versión nueva: la propuesta del odontograma, una copia de la vigente o nada. */
export const ORIGENES_DE_VERSION = ["odontograma", "copia", "vacio"] as const
export type OrigenDeVersion = (typeof ORIGENES_DE_VERSION)[number]

export const nuevaVersionSchema = z.object({
  desde: z.enum(ORIGENES_DE_VERSION, {
    errorMap: () => ({ message: "Elige cómo armar el plan: desde el odontograma, copiando el vigente o vacío" }),
  }),
})

const nombreDeEtapa = () =>
  z
    .string({ required_error: "Escribe el nombre de la etapa", invalid_type_error: "Escribe el nombre de la etapa" })
    .trim()
    .min(1, "Escribe el nombre de la etapa")
    .max(80, "El nombre de la etapa no puede tener más de 80 caracteres")

/** La posición (1, 2, 3…) de una etapa en el plan o de una prestación en su etapa. */
const posicion = () =>
  z
    .number({ invalid_type_error: "La posición no es válida" })
    .int("La posición no es válida")
    .min(1, "La posición no es válida")
    .max(999, "La posición no es válida")

export const nuevaEtapaSchema = z.object({ nombre: nombreDeEtapa() })

/**
 * Lo que se hace con una etapa: registrar que se le presentó al paciente (no
 * se le manda nada por ningún canal), aprobarla, o devolverla a "por
 * aprobar" para poder cambiarla.
 */
export const ACCIONES_DE_ETAPA = ["presentar", "aprobar", "volver-a-por-aprobar"] as const
export type AccionDeEtapa = (typeof ACCIONES_DE_ETAPA)[number]

export const edicionDeEtapaSchema = z
  .object({
    nombre: nombreDeEtapa().optional(),
    /** Mover la etapa a esa posición; las demás se corren. */
    orden: posicion().optional(),
    accion: z
      .enum(ACCIONES_DE_ETAPA, { errorMap: () => ({ message: "Esa acción no existe para una etapa" }) })
      .optional(),
  })
  .refine((pedido) => Object.values(pedido).some((valor) => valor !== undefined), "No hay nada que cambiar")

const id = (mensaje: string) => z.string({ invalid_type_error: mensaje }).trim().min(1, mensaje).max(100, mensaje)

const piezaDePrestacion = () =>
  z
    .number({
      required_error: "Elige la pieza, o boca completa",
      invalid_type_error: "Esa pieza no existe en el odontograma.",
    })
    .int("Esa pieza no existe en el odontograma.")
    .nullable()

const carasDePrestacion = () =>
  z.array(z.string().max(2), { invalid_type_error: "Las caras no son válidas" }).max(CARAS.length, "Las caras no son válidas")

const nombreDePrestacion = () =>
  z
    .string({ invalid_type_error: "Escribe qué prestación es" })
    .trim()
    .min(1, "Escribe qué prestación es")
    .max(120, "El nombre de la prestación no puede tener más de 120 caracteres")

const valorEnCentavos = () =>
  z
    .number({ invalid_type_error: "El valor no es válido" })
    .int("El valor va en centavos enteros")
    .min(0, "El valor no puede ser negativo")
    .max(VALOR_MAXIMO_CENTAVOS, "El valor es demasiado alto")

/**
 * Quién hace la prestación: `memberId` (un miembro del equipo), o
 * `delDueño: true` (el dueño, que no es miembro: queda `memberId` en null con
 * su nombre). Los dos a la vez no.
 */
const profesional = {
  memberId: id("El profesional no es válido").nullable().optional(),
  delDueño: z.boolean({ invalid_type_error: "El profesional no es válido" }).optional(),
}

const sinDosProfesionales = (pedido: { memberId?: string | null; delDueño?: boolean }) =>
  !(pedido.delDueño === true && pedido.memberId)

const MENSAJE_DOS_PROFESIONALES = "Elige un solo profesional: un miembro del equipo o el dueño"

export const nuevaPrestacionSchema = z
  .object({
    /** Pieza FDI, o `null` para toda la boca. */
    pieza: piezaDePrestacion(),
    caras: carasDePrestacion().default([]),
    /** Un servicio activo del negocio: si no vienen `nombre` o `valorCents`, se copian de él. */
    serviceId: id("El servicio no es válido").nullable().optional(),
    nombre: nombreDePrestacion().optional(),
    valorCents: valorEnCentavos().optional(),
    ...profesional,
  })
  .superRefine((pedido, ctx) => {
    const error = errorDePiezaYCaras(pedido.pieza, pedido.caras)
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ["caras"] })
    if (!pedido.serviceId && pedido.nombre === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Escribe qué prestación es o elige un servicio", path: ["nombre"] })
    }
    if (!sinDosProfesionales(pedido)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_DOS_PROFESIONALES })
  })

export type NuevaPrestacion = z.infer<typeof nuevaPrestacionSchema>

const IDS_DE_ESTADO_DE_PRESTACION = ESTADOS_DE_PRESTACION.map((estado) => estado.id) as [
  EstadoDePrestacion,
  ...EstadoDePrestacion[],
]

export const edicionDePrestacionSchema = z
  .object({
    pieza: piezaDePrestacion().optional(),
    caras: carasDePrestacion().optional(),
    /** `null` la desvincula del servicio (el nombre queda). */
    serviceId: id("El servicio no es válido").nullable().optional(),
    nombre: nombreDePrestacion().optional(),
    valorCents: valorEnCentavos().optional(),
    ...profesional,
    estado: z
      .enum(IDS_DE_ESTADO_DE_PRESTACION, {
        errorMap: () => ({ message: "El estado tiene que ser por agendar, agendada o realizada" }),
      })
      .optional(),
    /** La cita en que se agendó: de este paciente. `null` la desvincula. */
    appointmentId: id("La cita no es válida").nullable().optional(),
    /** Mover la prestación a esa posición dentro de su etapa. */
    orden: posicion().optional(),
  })
  .refine((pedido) => Object.values(pedido).some((valor) => valor !== undefined), "No hay nada que cambiar")
  .refine(sinDosProfesionales, MENSAJE_DOS_PROFESIONALES)

export type EdicionDePrestacion = z.infer<typeof edicionDePrestacionSchema>

// ─── Reglas ──────────────────────────────────────────────────────────────────

/**
 * Por qué la pieza y las caras de una prestación no se pueden guardar, o
 * `null`. Las mismas reglas que los CHECKs de `prestaciones_del_plan`, y lo
 * que la base no revisa (que no se repitan), con `sonCarasValidas`.
 */
export function errorDePiezaYCaras(pieza: number | null, caras: readonly unknown[]): string | null {
  if (pieza === null) return caras.length === 0 ? null : "Una prestación de boca completa no lleva caras."
  if (!esPiezaValida(pieza)) return "Esa pieza no existe en el odontograma."
  if (new Set(caras).size !== caras.length) return "Una cara está repetida."
  if (!sonCarasValidas(pieza, caras)) return `Esas caras no son de la pieza ${pieza}.`
  return null
}

/** Lo único que se cambia de una prestación de una etapa aprobada (su presupuesto ya se aceptó). */
const CAMPOS_EN_ETAPA_APROBADA: readonly string[] = ["estado", "appointmentId", "memberId", "delDueño"]

/** Los campos del pedido que no se pueden cambiar en una prestación de una etapa aprobada. */
export function camposBloqueadosEnEtapaAprobada(pedido: Record<string, unknown>): string[] {
  return Object.entries(pedido)
    .filter(([campo, valor]) => valor !== undefined && !CAMPOS_EN_ETAPA_APROBADA.includes(campo))
    .map(([campo]) => campo)
}

/** El valor sugerido de un servicio (`Service.price`, en pesos), en centavos; 0 sin precio. */
export function valorSugeridoDe(precio: number | null | undefined): number {
  if (typeof precio !== "number" || !Number.isFinite(precio) || precio < 0) return 0
  return Math.min(aCentavos(precio), VALOR_MAXIMO_CENTAVOS)
}

export interface EstadoGuardado {
  estado: string
  appointmentId: string | null
  realizadaEn: Date | null
}

export type ResultadoDeEstado = { ok: true; cambio: EstadoGuardado } | { ok: false; error: string }

/**
 * El estado de una prestación después de un pedido que trae `estado` o
 * `appointmentId` (o los dos), con las reglas de los CHECKs:
 *
 * - "por-agendar" no tiene cita: pasar a por agendar la desvincula, y una
 *   cita en una prestación por agendar se rechaza (hay que marcarla agendada).
 * - "agendada" exige cita: la que viene o la que ya tenía.
 * - "realizada" lleva cuándo: `ahora` al pasar a realizada, o el que ya tenía
 *   si ya lo estaba. La cita es opcional (se pudo hacer fuera de una cita).
 *
 * Cualquier paso entre estados vale (también volver atrás, para corregir).
 * Quien llama verifica que una cita nueva sea del paciente.
 */
export function estadoSiguienteDePrestacion(
  actual: EstadoGuardado,
  pedido: { estado?: EstadoDePrestacion; appointmentId?: string | null },
  ahora: Date
): ResultadoDeEstado {
  const estado = pedido.estado ?? actual.estado
  const cita = pedido.appointmentId !== undefined ? pedido.appointmentId : actual.appointmentId

  if (estado === "por-agendar") {
    if (pedido.appointmentId) {
      return { ok: false, error: "Una prestación por agendar no tiene cita: márcala como agendada." }
    }
    return { ok: true, cambio: { estado, appointmentId: null, realizadaEn: null } }
  }
  if (estado === "agendada") {
    if (!cita) return { ok: false, error: "Para marcarla como agendada hay que elegir la cita." }
    return { ok: true, cambio: { estado, appointmentId: cita, realizadaEn: null } }
  }
  if (estado === "realizada") {
    const realizadaEn = actual.estado === "realizada" && actual.realizadaEn ? actual.realizadaEn : ahora
    return { ok: true, cambio: { estado, appointmentId: cita, realizadaEn } }
  }
  return { ok: false, error: "El estado tiene que ser por agendar, agendada o realizada" }
}

export interface EtapaParaAccion {
  estado: string
  /** Cuántas prestaciones tiene. */
  prestaciones: number
}

export interface CambioDeEtapa {
  estado?: EstadoDeEtapa
  presentadaEn?: Date | null
  aprobadaEn?: Date | null
  aprobadaPorNombre?: string | null
}

/**
 * Lo que una acción le cambia a una etapa, o por qué no se puede (409):
 *
 * - "presentar": registra cuándo se le presentó al paciente (presentarla de
 *   nuevo actualiza la fecha). Sólo por aprobar y con alguna prestación.
 * - "aprobar": por aprobar → aprobada, con cuándo y quién (el nombre de quien
 *   lo registra). Con alguna prestación.
 * - "volver-a-por-aprobar": aprobada → por aprobar, sin aprobación y sin la
 *   fecha de presentación: lo que se cambie habrá que presentarlo de nuevo.
 */
export function cambioPorAccion(
  etapa: EtapaParaAccion,
  accion: AccionDeEtapa,
  quien: { ahora: Date; nombre: string }
): { ok: true; cambio: CambioDeEtapa } | { ok: false; error: string } {
  const aprobada = etapa.estado === "aprobada"
  if (accion === "volver-a-por-aprobar") {
    if (!aprobada) return { ok: false, error: "La etapa ya está por aprobar." }
    return { ok: true, cambio: { estado: "por-aprobar", presentadaEn: null, aprobadaEn: null, aprobadaPorNombre: null } }
  }
  if (aprobada) return { ok: false, error: "La etapa ya está aprobada." }
  if (etapa.prestaciones === 0) {
    return { ok: false, error: "La etapa no tiene prestaciones: agrega alguna antes de presentarla o aprobarla." }
  }
  if (accion === "presentar") return { ok: true, cambio: { presentadaEn: quien.ahora } }
  return { ok: true, cambio: { estado: "aprobada", aprobadaEn: quien.ahora, aprobadaPorNombre: quien.nombre } }
}

/** Por qué no se puede borrar una etapa, o `null`: sólo por aprobar y sin nada agendado ni realizado. */
export function errorAlBorrarEtapa(etapa: { estado: string; prestaciones: readonly { estado: string }[] }): string | null {
  if (etapa.estado === "aprobada") return "Una etapa aprobada no se borra. Vuelve a ponerla por aprobar primero."
  if (etapa.prestaciones.some((prestacion) => prestacion.estado !== "por-agendar")) {
    return "La etapa tiene prestaciones agendadas o realizadas: no se borra."
  }
  return null
}

/** Por qué no se puede borrar una prestación, o `null`: sólo en una etapa por aprobar y si está por agendar. */
export function errorAlBorrarPrestacion(prestacion: { estado: string }, etapa: { estado: string }): string | null {
  if (etapa.estado === "aprobada") return MENSAJE_ETAPA_APROBADA
  if (prestacion.estado !== "por-agendar") return "La prestación ya está agendada o realizada: no se borra."
  return null
}

/**
 * Las posiciones nuevas al mover `id` a la posición `posicion` (1, 2, 3…;
 * una más allá del final la deja al final) dentro de `filas`, que vienen en
 * su orden actual. Todas quedan numeradas de corrido desde 1. Devuelve sólo
 * las que cambian. Sin `id` (o con un `id` que no está), sólo renumera: es lo
 * que se usa después de borrar una.
 */
export function reordenar(
  filas: readonly { id: string; orden: number }[],
  idQueSeMueve: string | null,
  posicionPedida = 1
): { id: string; orden: number }[] {
  const resto = filas.filter((fila) => fila.id !== idQueSeMueve)
  const movida = filas.find((fila) => fila.id === idQueSeMueve)
  const enOrden = [...resto]
  if (movida) enOrden.splice(Math.min(Math.max(posicionPedida, 1), filas.length) - 1, 0, movida)
  return enOrden
    .map((fila, indice) => ({ id: fila.id, orden: indice + 1, antes: fila.orden }))
    .filter((fila) => fila.orden !== fila.antes)
    .map(({ id: idDeFila, orden }) => ({ id: idDeFila, orden }))
}

// ─── Respuesta ───────────────────────────────────────────────────────────────

/** La cita de una prestación agendada, si quien mira la ve en su agenda. */
export interface CitaDePrestacionRespuesta {
  id: string
  /** ISO. */
  startTime: string
  status: string
}

export interface PrestacionRespuesta {
  id: string
  orden: number
  /** Pieza FDI; `null` es "Boca". */
  pieza: number | null
  /** Letras de cara ("O", "M"…) en el orden de `CARAS`. */
  caras: string[]
  serviceId: string | null
  nombre: string
  /** `null` con `profesionalNombre` es el dueño; los dos en `null`, sin asignar. */
  memberId: string | null
  profesionalNombre: string | null
  estado: EstadoDePrestacion
  valorCents: number
  appointmentId: string | null
  /** ISO, sólo en las realizadas. */
  realizadaEn: string | null
  /** Fecha y estado de la cita, si quien mira la ve en su agenda (el odontólogo, sólo las suyas). */
  cita: CitaDePrestacionRespuesta | null
}

export interface EtapaRespuesta {
  id: string
  orden: number
  nombre: string
  estado: EstadoDeEtapa
  /** ISO. Presentada y por aprobar = "presupuesto por responder". */
  presentadaEn: string | null
  aprobadaEn: string | null
  aprobadaPorNombre: string | null
  subtotalCents: number
  prestaciones: PrestacionRespuesta[]
}

export interface PlanVigenteRespuesta {
  id: string
  version: number
  creadoPorNombre: string
  /** ISO. */
  createdAt: string
  totales: TotalesDelPlan
  etapas: EtapaRespuesta[]
}

export interface PlanRespuesta {
  /** El plan vigente, o `null` si el paciente no tiene. */
  plan: PlanVigenteRespuesta | null
  /** Las versiones anteriores, de la más nueva a la más vieja: sólo número y fecha (ISO). */
  versionesAnteriores: { version: number; createdAt: string }[]
  /** Si quien mira puede editar el plan (dueño y odontólogos; el encargado, no). */
  puedeEditar: boolean
}
