import type { Prisma } from "@prisma/client"
import { fusionarFranjas } from "@/lib/horario-de-atencion"
import { franjaValida, horaAMinutos, type FranjaHorario } from "@/lib/horario-dia"
import type { PlanId } from "@/lib/planes"

/**
 * Las sedes del plan Independiente (etapa 9): hasta `MAX_SEDES` locales de un
 * mismo negocio, cada uno con su dirección y su horario semanal
 * (`WorkSchedule.sedeId`). Cálculo puro: entra lo que ya trajo la base y salen
 * las decisiones; nada acá lee ni escribe datos.
 *
 * Reglas de datos que esto supone (la base las asegura con CHECK y triggers,
 * ver la migración `20261112120000_etapa_9_planes_y_sedes`; la aplicación las
 * valida antes para dar un error claro):
 * - Cero filas en `sedes` = **sede implícita**: el local es el del negocio
 *   (`Business.address` y `comuna`), y sus horarios tienen `sedeId` NULL. Es
 *   todo negocio de hoy y todo plan Equipo.
 * - Con una o más sedes activas, toda cita nueva lleva `sedeId`
 *   (`sedeParaReservar`).
 * - Dos franjas activas de sedes activas distintas del mismo negocio no se
 *   pisan el mismo día de la semana (`choquesEntreSedes`): la dueña no está en
 *   dos lugares a la vez. Tocarse (una termina cuando la otra empieza) está
 *   permitido.
 * - El modo de varias sedes es el plan Independiente con dos o más sedes
 *   activas (`modoDeSedes`). Con una sola, el negocio se comporta como hoy.
 */

/** Cuántas sedes activas tiene, como mucho, un negocio. Lo hace respetar `sedes_reglas` en la base. */
export const MAX_SEDES = 5

/**
 * Los minutos que hacen falta para ir de una sede a otra: dos franjas de sedes
 * distintas el mismo día tienen que dejar al menos esto entre sí. Hoy es 0
 * (tocarse está permitido); está nombrada para poder cambiarla en un solo
 * lugar. Ojo: el trigger `horarios_sedes_sin_pisarse` de la base lo tiene
 * escrito con 0, así que subirla exige también una migración nueva que lo
 * reemplace; la aplicación, mientras tanto, sería más estricta que la base.
 */
export const HOLGURA_ENTRE_SEDES_MIN = 0

/** Una sede del negocio, como la leen las pantallas y la reserva. */
export interface SedeDelNegocio {
  id: string
  nombre: string
  direccion: string
  comuna: string
  /** E.164 (+56...) o null. */
  telefono: string | null
  /** 0 a 999: el orden de la lista. */
  orden: number
  activo: boolean
}

/** `una`: como hoy (sin sedes, o una sola). `varias`: el plan Independiente con dos o más sedes activas. */
export type ModoDeSedes = "una" | "varias"

/** El plan que habilita tener sedes. Es un id de `lib/planes.ts`. */
const PLAN_CON_SEDES = "independiente" satisfies PlanId

/**
 * El modo del negocio. Sólo cuentan las sedes con `activo` en true (se pueden
 * pasar todas o sólo las activas). Falla cerrado: un plan que no se conoce, o
 * que falta (`null`, `undefined`), y un plan Equipo, son siempre `una`, aunque
 * lleguen sedes de más.
 */
export function modoDeSedes(plan: string | null | undefined, sedesActivas: readonly Pick<SedeDelNegocio, "activo">[]): ModoDeSedes {
  if (plan !== PLAN_CON_SEDES) return "una"
  return sedesActivas.filter((sede) => sede.activo === true).length >= 2 ? "varias" : "una"
}

/**
 * Las sedes en el orden de la lista: por `orden`, y a igual `orden` por nombre
 * (sin distinguir mayúsculas ni tildes). Es estable: lo que empata en todo
 * queda como venía. No toca el arreglo que recibe.
 */
export function ordenarSedes<S extends Pick<SedeDelNegocio, "nombre" | "orden">>(sedes: readonly S[]): S[] {
  return [...sedes].sort(
    (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
  )
}

/**
 * Las filas de horario de una sede. Con `sedeId` en null, las que no tienen
 * sede (el horario general de siempre). Una fila sin el campo cuenta como
 * "sin sede".
 */
export function filasDeLaSede<F extends { sedeId?: string | null }>(filas: readonly F[], sedeId: string | null): F[] {
  return filas.filter((fila) => (fila.sedeId ?? null) === sedeId)
}

/** Una franja semanal de una sede, para revisar que no se pise con la de otra. */
export interface FranjaDeSede extends FranjaHorario {
  sedeId: string
  /** 0 domingo a 6 sábado. */
  dayOfWeek: number
  /**
   * `false`: la franja no cuenta (está inactiva, o su sede lo está). Sin el
   * dato cuenta. Quien arma la lista decide: igual que el trigger de la base,
   * conviene marcar `false` las de sedes inactivas que NO se están escribiendo,
   * y dejar las que se escriben (así se valida lo que se guarda antes de
   * reactivar la sede).
   */
  vigente?: boolean
}

/** Dos franjas de sedes distintas que se pisan el mismo día. */
export interface ChoqueEntreSedes<F extends FranjaDeSede = FranjaDeSede> {
  dayOfWeek: number
  a: F
  b: F
}

/**
 * Los pares de franjas que se pisan: el mismo día de la semana, de sedes
 * distintas, y `inicio < fin del otro` y `fin > inicio del otro` (con
 * `HOLGURA_ENTRE_SEDES_MIN` de por medio). Tocarse no es pisarse, con la
 * holgura de hoy (0). Dos franjas de la MISMA sede no se comparan: ésas se
 * fusionan al leerlas (`fusionarFranjas`).
 *
 * Es la misma regla del trigger `horarios_sedes_sin_pisarse`: la API de sedes
 * la corre antes de guardar para responder con un error claro en vez del
 * rechazo de la base. Las franjas que no se pueden medir (`inicio >= fin`, o
 * una hora mal escrita) se ignoran: su validación de forma es de quien llama.
 * Los pares salen en el orden en que vienen las franjas.
 */
export function choquesEntreSedes<F extends FranjaDeSede>(franjas: readonly F[]): ChoqueEntreSedes<F>[] {
  const cuentan = franjas.filter((franja) => franja.vigente !== false && franjaValida(franja))
  const choques: ChoqueEntreSedes<F>[] = []
  for (let i = 0; i < cuentan.length; i++) {
    for (let j = i + 1; j < cuentan.length; j++) {
      const a = cuentan[i]
      const b = cuentan[j]
      if (a.sedeId === b.sedeId || a.dayOfWeek !== b.dayOfWeek) continue
      const seToca =
        horaAMinutos(a.startTime) < horaAMinutos(b.endTime) + HOLGURA_ENTRE_SEDES_MIN &&
        horaAMinutos(a.endTime) + HOLGURA_ENTRE_SEDES_MIN > horaAMinutos(b.startTime)
      if (seToca) choques.push({ dayOfWeek: a.dayOfWeek, a, b })
    }
  }
  return choques
}

/**
 * La sede donde queda una reserva nueva, de las sedes del negocio y de la que
 * eligió el cliente (`sedeIdElegida`, que llega del navegador: no se le cree).
 *
 * - Sin sedes activas: `null`. La cita va sin sede, como hoy, y el id que
 *   llegue se ignora.
 * - Con una sola sede activa y sin elección: ella (el cliente no ve "¿Dónde?").
 * - Con una elección: sólo si es una sede ACTIVA de `sedes`. Una inactiva, una
 *   que no existe o la de otro negocio no valen (`null`), también cuando hay
 *   una sola sede.
 * - Con dos o más sedes activas y sin elección: `null` (hay que elegir).
 *
 * Así, **un `null` con alguna sede activa en la lista significa "la elección
 * falta o no vale"**, y quien llama responde 400; sólo con cero sedes activas
 * un `null` es "sin sede". `sedes` son las del negocio de la sesión o del
 * slug (nunca las de otro): por eso el id ajeno no se encuentra.
 */
export function sedeParaReservar<S extends Pick<SedeDelNegocio, "id" | "activo">>(
  sedes: readonly S[],
  sedeIdElegida: string | null | undefined
): S | null {
  const activas = sedes.filter((sede) => sede.activo === true)
  if (activas.length === 0) return null
  if (sedeIdElegida === undefined || sedeIdElegida === null || sedeIdElegida === "") {
    return activas.length === 1 ? activas[0] : null
  }
  return activas.find((sede) => sede.id === sedeIdElegida) ?? null
}

/** Dónde se atiende una cita, para mostrarlo (la mini página, "Cómo llegar", los correos). */
export interface LugarDeLaCita {
  /** El nombre de la sede. Sin sede no hay: el negocio ya tiene su nombre. */
  nombre?: string
  direccion: string | null
  comuna: string | null
}

const textoONull = (texto: string | null | undefined) => (texto ?? "").trim() || null

/**
 * La dirección de una cita: la de su sede si la tiene y, si no, la del
 * negocio (`Business.address` y `comuna`), que es lo que hoy leen la mini
 * página y "Cómo llegar". Los textos salen recortados y un texto vacío es
 * `null`. La sede cuenta aunque se haya desactivado: una cita que ya se dio
 * en ella sigue apuntando ahí.
 */
export function direccionDeLaCita(datos: {
  sede: Pick<SedeDelNegocio, "nombre" | "direccion" | "comuna"> | null | undefined
  negocio: { address?: string | null; comuna?: string | null }
}): LugarDeLaCita {
  const { sede, negocio } = datos
  if (sede) {
    return { nombre: sede.nombre, direccion: textoONull(sede.direccion), comuna: textoONull(sede.comuna) }
  }
  return { direccion: textoONull(negocio.address), comuna: textoONull(negocio.comuna) }
}

/** Una fila de horario con su sede, como la lee la página pública. */
export interface FilaDeHorarioDeSede extends FranjaHorario {
  sedeId: string | null
  /** 0 domingo a 6 sábado. */
  dayOfWeek: number
  /** `false` la saca del resumen (el horario público se arma con las activas). */
  active?: boolean
}

/** Un día de la semana con atención, con sus franjas ya fusionadas y ordenadas. */
export interface DiaDeHorarioDeSede {
  dayOfWeek: number
  franjas: FranjaHorario[]
}

/** Los días que comparten exactamente las mismas franjas: `Lun, Mié: 09:00–13:00`. */
export interface GrupoDeDias {
  /** Los días (0 domingo a 6 sábado), de lunes a domingo. */
  dias: number[]
  franjas: FranjaHorario[]
  /** Ya escrito para mostrar: "Lun, Mié: 09:00–13:00" o "Vie: 09:00–13:00 y 15:00–19:00". */
  texto: string
}

export interface HorarioDeLaSede<S> {
  sede: S
  /** Los días con atención, de lunes a domingo. Un día sin franjas no sale. */
  dias: DiaDeHorarioDeSede[]
  /** Lo mismo agrupado por franjas iguales, en el orden del primer día de cada grupo. */
  grupos: GrupoDeDias[]
}

const SEMANA_DESDE_EL_LUNES = [1, 2, 3, 4, 5, 6, 0]
const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

/** `a, b y c`. */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes.join("")
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`
}

/**
 * El horario semanal de cada sede ACTIVA, para la página pública, en el orden
 * de la lista (`ordenarSedes`): sus días de lunes a domingo, cada uno con sus
 * franjas ordenadas y con las que se pisan o se tocan fusionadas
 * (`fusionarFranjas`: 09–12 y 12–15 son 09:00–15:00), y además los días que
 * comparten las mismas franjas agrupados. Una sede activa sin horario cargado
 * sale con `dias` y `grupos` vacíos. Las sedes inactivas, las filas de otra
 * sede o sin sede y las filas con `active` en false no cuentan.
 */
export function resumenDeHorarioPorSede<S extends Pick<SedeDelNegocio, "id" | "nombre" | "orden" | "activo">>(
  sedes: readonly S[],
  filas: readonly FilaDeHorarioDeSede[]
): HorarioDeLaSede<S>[] {
  return ordenarSedes(sedes.filter((sede) => sede.activo === true)).map((sede) => {
    const delaSede = filasDeLaSede(filas, sede.id).filter((fila) => fila.active !== false)
    const dias = SEMANA_DESDE_EL_LUNES.flatMap((dayOfWeek) => {
      const franjas = fusionarFranjas(delaSede.filter((fila) => fila.dayOfWeek === dayOfWeek))
      return franjas.length > 0 ? [{ dayOfWeek, franjas }] : []
    })

    const porFranjas = new Map<string, { dias: number[]; franjas: FranjaHorario[] }>()
    for (const dia of dias) {
      const clave = dia.franjas.map((franja) => `${franja.startTime}-${franja.endTime}`).join("|")
      const grupo = porFranjas.get(clave)
      if (grupo) grupo.dias.push(dia.dayOfWeek)
      else porFranjas.set(clave, { dias: [dia.dayOfWeek], franjas: dia.franjas })
    }
    const grupos = [...porFranjas.values()].map((grupo) => ({
      ...grupo,
      texto: `${grupo.dias.map((dia) => DIA_CORTO[dia]).join(", ")}: ${enumerar(
        grupo.franjas.map((franja) => `${franja.startTime}–${franja.endTime}`)
      )}`,
    }))

    return { sede, dias, grupos }
  })
}

/**
 * Las franjas de horario que cuentan hoy: las sin sede (el horario general de
 * siempre) y las de una sede ACTIVA. Es lo que lee cualquier consulta de
 * horarios que no pide una sede en particular. En un negocio sin sedes todas
 * las filas tienen `sedeId` NULL, así que no filtra nada: es el horario de
 * siempre. Con sedes es la unión de las de todas las activas ("¿atiende ese
 * día en alguna sede?"). Las de una sede desactivada quedan guardadas pero no
 * cuentan para nadie.
 *
 * Es un `OR` de nivel superior: si el `where` donde se usa ya tiene su propio
 * `OR`, va dentro de un `AND: [WHERE_HORARIO_VIGENTE]`. Se combina con
 * `businessId` y `active` como cualquier otro filtro; no los reemplaza.
 */
export const WHERE_HORARIO_VIGENTE = {
  OR: [{ sedeId: null }, { sede: { is: { activo: true } } }],
} satisfies Prisma.WorkScheduleWhereInput

/**
 * El filtro de horarios para una sede: con `sedeId`, sólo las filas de ESA sede
 * y sólo si está activa; sin él (`undefined` o `null`), `WHERE_HORARIO_VIGENTE`.
 * No filtra por negocio: va siempre junto a `businessId`, y la FK compuesta
 * (sedeId, businessId) asegura que una sede ajena no tenga filas en este
 * negocio, así que el id de otro negocio no devuelve nada.
 */
export function whereDelHorarioDeLaSede(sedeId?: string | null): Prisma.WorkScheduleWhereInput {
  if (sedeId === undefined || sedeId === null) return WHERE_HORARIO_VIGENTE
  return { sedeId, sede: { is: { activo: true } } }
}
