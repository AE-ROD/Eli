/**
 * Lo que la sección «Sedes y horarios» calcula sin pantalla (plan
 * Independiente, etapa 9): leer una sede como la manda el servidor (la API y
 * `page.tsx` mandan la misma forma), la semana que se edita (días con una o más franjas), el
 * choque de una sede con las otras mientras se edita, el cupo de sedes
 * activas, el horario de cada sede dicho en palabras y la revisión de los
 * datos de una sede antes de enviarlos.
 *
 * Las reglas de fondo viven en `lib/sedes.ts` (`MAX_SEDES`,
 * `choquesEntreSedes`, `resumenDeHorarioPorSede`, `ordenarSedes`): acá se
 * usan, no se repiten. Todo es puro: nada lee ni escribe datos.
 */

import { fusionarFranjas } from "@/lib/horario-de-atencion"
import { FRANJAS_MAXIMAS_POR_DIA } from "@/lib/grilla-de-sede"
import { franjaValida, horaAMinutos, type FranjaHorario } from "@/lib/horario-dia"
import { choquesEntreSedes, MAX_SEDES, ordenarSedes, resumenDeHorarioPorSede, type FranjaDeSede } from "@/lib/sedes"
import { aE164Chile, MENSAJE_DE_TELEFONO_ILEGIBLE } from "@/lib/telefono"
import type { ChoqueDelServidor, HorarioDeSedeDelDia, Sede } from "./_datos"
import { DIAS } from "./_horario"

// ─── Los textos de una sede ──────────────────────────────────────────────────

/** Los largos que la base exige (CHECK de `sedes`): nombre 1 a 40, dirección 1 a 200, comuna 1 a 80. */
export const LARGO_MAXIMO_DEL_NOMBRE_DE_SEDE = 40
export const LARGO_MAXIMO_DE_LA_DIRECCION = 200
export const LARGO_MAXIMO_DE_LA_COMUNA = 80
/** El teléfono se escribe como se quiera; el servidor lo guarda en E.164. */
export const LARGO_MAXIMO_DEL_TELEFONO = 30

/** Lo que se escribe en el formulario de una sede, tal cual. */
export interface DatosDeSede {
  nombre: string
  direccion: string
  comuna: string
  /** Vacío es «sin teléfono». */
  telefono: string
}

export const SEDE_VACIA: DatosDeSede = { nombre: "", direccion: "", comuna: "", telefono: "" }

/** Lo que va al servidor: recortado, y el teléfono en E.164 o `null`. */
export interface CuerpoDeSede {
  nombre: string
  direccion: string
  comuna: string
  telefono: string | null
}

export type CampoDeSede = keyof DatosDeSede
export type ErroresDeSede = Partial<Record<CampoDeSede, string>>

/** El formulario de una sede ya guardada, para editarla. */
export function datosDeLaSede(sede: Pick<Sede, "nombre" | "direccion" | "comuna" | "telefono">): DatosDeSede {
  return { nombre: sede.nombre, direccion: sede.direccion, comuna: sede.comuna, telefono: sede.telefono ?? "" }
}

/** Si dos nombres se leen igual: sin mayúsculas, sin tildes y sin espacios de más. */
export function mismoNombre(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), "es", { sensitivity: "base" }) === 0
}

/**
 * Revisa lo escrito antes de enviarlo: los tres textos son obligatorios, el
 * teléfono es opcional pero tiene que poder leerse como chileno, y el nombre
 * no puede repetir el de otra sede (`otras`; con `ignorarId`, sin contar la
 * que se está editando). El servidor vuelve a revisar todo: esto sólo ahorra
 * el viaje y pone cada error junto a su campo.
 */
export function revisarSede(
  datos: DatosDeSede,
  otras: readonly Pick<Sede, "id" | "nombre">[] = [],
  ignorarId?: string
): { ok: true; cuerpo: CuerpoDeSede } | { ok: false; errores: ErroresDeSede } {
  const errores: ErroresDeSede = {}
  const nombre = datos.nombre.trim()
  const direccion = datos.direccion.trim()
  const comuna = datos.comuna.trim()
  const telefonoEscrito = datos.telefono.trim()

  if (!nombre) errores.nombre = "Escribe el nombre de la sede"
  else if (nombre.length > LARGO_MAXIMO_DEL_NOMBRE_DE_SEDE) {
    errores.nombre = `El nombre no puede tener más de ${LARGO_MAXIMO_DEL_NOMBRE_DE_SEDE} caracteres`
  } else if (otras.some((otra) => otra.id !== ignorarId && mismoNombre(otra.nombre, nombre))) {
    errores.nombre = "Ya tienes una sede con ese nombre"
  }

  if (!direccion) errores.direccion = "Escribe la dirección de la sede"
  else if (direccion.length > LARGO_MAXIMO_DE_LA_DIRECCION) {
    errores.direccion = `La dirección no puede tener más de ${LARGO_MAXIMO_DE_LA_DIRECCION} caracteres`
  }

  if (!comuna) errores.comuna = "Escribe la comuna"
  else if (comuna.length > LARGO_MAXIMO_DE_LA_COMUNA) {
    errores.comuna = `La comuna no puede tener más de ${LARGO_MAXIMO_DE_LA_COMUNA} caracteres`
  }

  const telefono = telefonoEscrito ? aE164Chile(telefonoEscrito) : null
  if (telefonoEscrito && telefono === null) errores.telefono = MENSAJE_DE_TELEFONO_ILEGIBLE

  if (Object.keys(errores).length > 0) return { ok: false, errores }
  return { ok: true, cuerpo: { nombre, direccion, comuna, telefono } }
}

/** Los errores de las dos sedes del paso a varios lugares. */
export interface ErroresDeLaConversion {
  principal: ErroresDeSede
  nueva: ErroresDeSede
}

/**
 * Revisa las dos sedes del paso de «un solo lugar» a varios. Además de lo de
 * cada una, las dos tienen que llamarse distinto.
 */
export function revisarConversion(
  principal: DatosDeSede,
  nueva: DatosDeSede
): { ok: true; principal: CuerpoDeSede; nueva: CuerpoDeSede } | { ok: false; errores: ErroresDeLaConversion } {
  const primera = revisarSede(principal)
  const segunda = revisarSede(nueva)
  const errores: ErroresDeLaConversion = {
    principal: primera.ok ? {} : primera.errores,
    nueva: segunda.ok ? {} : segunda.errores,
  }
  if (!errores.nueva.nombre && !errores.principal.nombre && mismoNombre(principal.nombre, nueva.nombre)) {
    errores.nueva.nombre = "Elige un nombre distinto al de la otra sede"
  }
  if (!primera.ok || !segunda.ok || errores.nueva.nombre) return { ok: false, errores }
  return { ok: true, principal: primera.cuerpo, nueva: segunda.cuerpo }
}

// ─── La lista de sedes ───────────────────────────────────────────────────────

/** Cuántas sedes activas tiene, y si todavía puede agregar otra (`MAX_SEDES`). */
export function cupoDeSedes(sedes: readonly Pick<Sede, "activo">[]): {
  activas: number
  maximo: number
  quedan: number
  hayCupo: boolean
} {
  const activas = sedes.filter((sede) => sede.activo).length
  const quedan = Math.max(0, MAX_SEDES - activas)
  return { activas, maximo: MAX_SEDES, quedan, hayCupo: quedan > 0 }
}

/**
 * El horario de una sede dicho en palabras, uno por grupo de días con las
 * mismas franjas: «Lun, Mié: 09:00–13:00». Vacío si no tiene horario cargado.
 * Es el mismo texto que lee la página pública (`resumenDeHorarioPorSede`).
 */
export function horarioEnPalabras(sede: Pick<Sede, "id" | "nombre" | "orden" | "horarios">): string[] {
  const filas = sede.horarios.flatMap((dia) =>
    dia.franjas.map((franja) => ({ sedeId: sede.id, dayOfWeek: dia.dayOfWeek, ...franja }))
  )
  // Se pide como activa: una sede desactivada también muestra el horario que dejó guardado.
  const [resumen] = resumenDeHorarioPorSede([{ id: sede.id, nombre: sede.nombre, orden: sede.orden, activo: true }], filas)
  return resumen ? resumen.grupos.map((grupo) => grupo.texto) : []
}

// ─── La semana que se edita ──────────────────────────────────────────────────

/** Los días como se leen en Chile, de lunes a domingo (0 es domingo, como `Date.getDay()`). */
export const SEMANA_DE_LUNES_A_DOMINGO = [1, 2, 3, 4, 5, 6, 0] as const

/** Un día de la semana en el editor: sin franjas es un día sin atención. */
export interface DiaDeLaSemana {
  dayOfWeek: number
  franjas: FranjaHorario[]
}

const porInicio = (a: FranjaHorario, b: FranjaHorario) =>
  horaAMinutos(a.startTime) - horaAMinutos(b.startTime) || horaAMinutos(a.endTime) - horaAMinutos(b.endTime)

/**
 * Los siete días de lunes a domingo a partir de lo guardado, cada uno con sus
 * franjas por hora de inicio. Los días que no están no tienen atención. Copia:
 * editar la semana no toca la sede.
 */
export function semanaParaEditar(horarios: readonly HorarioDeSedeDelDia[]): DiaDeLaSemana[] {
  return SEMANA_DE_LUNES_A_DOMINGO.map((dayOfWeek) => ({
    dayOfWeek,
    franjas: horarios
      .filter((dia) => dia.dayOfWeek === dayOfWeek)
      .flatMap((dia) => dia.franjas.map((franja) => ({ startTime: franja.startTime, endTime: franja.endTime })))
      .sort(porInicio),
  }))
}

/** La franja con que arranca un día que se enciende. */
export const FRANJA_POR_DEFECTO: Readonly<FranjaHorario> = { startTime: "09:00", endTime: "18:00" }

/** Lo último que ofrece el campo de hora (`components/panel/campo-hora.tsx`): 23:55. */
const ULTIMO_MINUTO_QUE_SE_OFRECE = 23 * 60 + 55
/** Entre el fin de una franja y el inicio de la siguiente que se agrega. */
const PAUSA_ENTRE_FRANJAS_MIN = 60
const DURACION_DE_LA_FRANJA_NUEVA_MIN = 180
const DURACION_MINIMA_MIN = 30

const comoHora = (minutos: number) =>
  `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`

/**
 * La franja que se propone al agregar otra a un día: la primera, de 09:00 a
 * 18:00; las siguientes, una hora después de que termina la última, por tres
 * horas (sin pasar de las 23:55). `null` si ya no se puede agregar otra: el día
 * ya tiene las que acepta el servidor (`FRANJAS_MAXIMAS_POR_DIA`) o no queda
 * lugar en el día.
 */
export function franjaNueva(delDia: readonly FranjaHorario[]): FranjaHorario | null {
  if (delDia.length === 0) return { ...FRANJA_POR_DEFECTO }
  if (delDia.length >= FRANJAS_MAXIMAS_POR_DIA) return null
  const ultimoFin = Math.max(...delDia.filter(franjaValida).map((franja) => horaAMinutos(franja.endTime)))
  if (!Number.isFinite(ultimoFin)) return { ...FRANJA_POR_DEFECTO }
  const inicio = ultimoFin + PAUSA_ENTRE_FRANJAS_MIN
  if (inicio + DURACION_MINIMA_MIN > ULTIMO_MINUTO_QUE_SE_OFRECE) return null
  const fin = Math.min(inicio + DURACION_DE_LA_FRANJA_NUEVA_MIN, ULTIMO_MINUTO_QUE_SE_OFRECE)
  return { startTime: comoHora(inicio), endTime: comoHora(fin) }
}

export const MENSAJE_DE_FRANJA_AL_REVES = "La hora de término tiene que ser después de la de inicio."

/** Una franja que no se puede guardar: en qué día y cuál es. */
export interface ProblemaDeFranja {
  dayOfWeek: number
  /** Su lugar entre las franjas del día, desde 0. */
  indice: number
  mensaje: string
}

/** Las franjas que terminan antes (o justo cuando) empiezan. Con alguna, no se guarda. */
export function problemasDeLaSemana(semana: readonly DiaDeLaSemana[]): ProblemaDeFranja[] {
  return semana.flatMap((dia) =>
    dia.franjas.flatMap((franja, indice) =>
      franjaValida(franja) ? [] : [{ dayOfWeek: dia.dayOfWeek, indice, mensaje: MENSAJE_DE_FRANJA_AL_REVES }]
    )
  )
}

/**
 * Cada día con sus franjas ya fusionadas: las que se pisan o se tocan son una
 * sola (09–12 y 12–15 son 09–15), como las guarda y las lee el servidor. Las
 * franjas que no se pueden medir se descartan: quien llama las revisa antes
 * (`problemasDeLaSemana`).
 */
export function semanaFusionada(semana: readonly DiaDeLaSemana[]): DiaDeLaSemana[] {
  return semana.map((dia) => ({ dayOfWeek: dia.dayOfWeek, franjas: fusionarFranjas(dia.franjas) }))
}

/** Lo que se envía al guardar: sólo los días con atención, con sus franjas fusionadas. */
export function diasParaGuardar(semana: readonly DiaDeLaSemana[]): HorarioDeSedeDelDia[] {
  return semanaFusionada(semana).filter((dia) => dia.franjas.length > 0)
}

/**
 * Si lo que se ve difiere de lo guardado. Compara las franjas tal como están
 * escritas (ordenadas), no ya fusionadas: así una franja a medio escribir
 * también cuenta como cambio.
 */
export function huboCambios(guardada: readonly DiaDeLaSemana[], actual: readonly DiaDeLaSemana[]): boolean {
  const clave = (semana: readonly DiaDeLaSemana[]) =>
    JSON.stringify(
      semana.map((dia) => [
        dia.dayOfWeek,
        [...dia.franjas].sort(porInicio).map((franja) => [franja.startTime, franja.endTime]),
      ])
    )
  return clave(guardada) !== clave(actual)
}

/** Cuántos días de la semana tienen atención. */
export function diasConAtencion(semana: readonly DiaDeLaSemana[]): number {
  return semana.filter((dia) => dia.franjas.length > 0).length
}

// ─── Choques con las otras sedes ─────────────────────────────────────────────

/** Una franja de esta sede que se pisa con una de otra sede el mismo día. */
export interface ChoqueConOtraSede {
  dayOfWeek: number
  /** El nombre de la otra sede. */
  conSede: string
  estaFranja: FranjaHorario
  suFranja: FranjaHorario
}

/**
 * Los choques de la semana que se está editando en `sedeId` contra las demás
 * sedes ACTIVAS, tal como están guardadas (lo mismo que revisa el servidor).
 * Lo que se edita cuenta siempre, también si la sede está desactivada: así se
 * ve el choque antes de reactivarla. Tocarse (una termina cuando empieza la
 * otra) no es chocar. Salen de lunes a domingo y, dentro de un día, por hora.
 */
export function choquesConOtrasSedes(
  sedeId: string,
  semana: readonly DiaDeLaSemana[],
  sedes: readonly Pick<Sede, "id" | "nombre" | "activo" | "horarios">[]
): ChoqueConOtraSede[] {
  const propias: FranjaDeSede[] = semanaFusionada(semana).flatMap((dia) =>
    dia.franjas.map((franja) => ({ sedeId, dayOfWeek: dia.dayOfWeek, ...franja }))
  )
  const ajenas: FranjaDeSede[] = sedes
    .filter((sede) => sede.id !== sedeId && sede.activo)
    .flatMap((sede) =>
      sede.horarios.flatMap((dia) =>
        fusionarFranjas(dia.franjas).map((franja) => ({ sedeId: sede.id, dayOfWeek: dia.dayOfWeek, ...franja }))
      )
    )
  const nombres = new Map(sedes.map((sede) => [sede.id, sede.nombre]))

  const lugarEnLaSemana = (dayOfWeek: number) => SEMANA_DE_LUNES_A_DOMINGO.indexOf(dayOfWeek as 0)
  return choquesEntreSedes([...propias, ...ajenas])
    .filter((choque) => choque.a.sedeId === sedeId || choque.b.sedeId === sedeId)
    .map((choque) => {
      const propia = choque.a.sedeId === sedeId ? choque.a : choque.b
      const otra = propia === choque.a ? choque.b : choque.a
      return {
        dayOfWeek: choque.dayOfWeek,
        conSede: nombres.get(otra.sedeId) ?? "otra sede",
        estaFranja: { startTime: propia.startTime, endTime: propia.endTime },
        suFranja: { startTime: otra.startTime, endTime: otra.endTime },
      }
    })
    .sort(
      (a, b) =>
        lugarEnLaSemana(a.dayOfWeek) - lugarEnLaSemana(b.dayOfWeek) ||
        horaAMinutos(a.estaFranja.startTime) - horaAMinutos(b.estaFranja.startTime)
    )
}

const comoRango = (franja: FranjaHorario) => `${franja.startTime}–${franja.endTime}`

/** «Lunes: 09:00–13:00 se pisa con 12:00–15:00 de «Providencia»». */
export function textoDeChoque(choque: ChoqueConOtraSede): string {
  return `${DIAS[choque.dayOfWeek]}: ${comoRango(choque.estaFranja)} se pisa con ${comoRango(choque.suFranja)} de «${choque.conSede}»`
}

/** Los días de los choques, de lunes a domingo y sin repetir: «el lunes y el martes» lo arma quien muestre. */
export function diasDeLosChoques(choques: readonly Pick<ChoqueConOtraSede, "dayOfWeek">[]): string[] {
  const dias = new Set(choques.map((choque) => choque.dayOfWeek))
  return SEMANA_DE_LUNES_A_DOMINGO.filter((dia) => dias.has(dia)).map((dia) => DIAS[dia])
}

/**
 * Los choques que el servidor dice (`{ dayOfWeek, conSede }`) en palabras.
 * `conSede` puede ser el id o el nombre de la otra sede: si es el id de una
 * sede que se conoce, se dice su nombre.
 */
export function textosDeChoquesDelServidor(
  choques: readonly ChoqueDelServidor[],
  sedes: readonly Pick<Sede, "id" | "nombre">[]
): string[] {
  const nombres = new Map(sedes.map((sede) => [sede.id, sede.nombre]))
  return choques.map((choque) => `${DIAS[choque.dayOfWeek] ?? "Un día"}: con «${nombres.get(choque.conSede) ?? choque.conSede}»`)
}

// ─── Del servidor a una `Sede` ───────────────────────────────────────────────

const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null
const esHora = (valor: unknown): valor is string => typeof valor === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor)

/**
 * Una franja como la manda el servidor: `{ start, end }` (también se lee
 * `{ startTime, endTime }`, como se llama en `lib/horario-dia.ts`). `null` si
 * no tiene dos horas «HH:MM».
 */
function leerFranja(crudo: unknown): FranjaHorario | null {
  if (!esObjeto(crudo)) return null
  const inicio = crudo.start ?? crudo.startTime
  const fin = crudo.end ?? crudo.endTime
  return esHora(inicio) && esHora(fin) ? { startTime: inicio, endTime: fin } : null
}

function leerDia(crudo: unknown): HorarioDeSedeDelDia | null {
  if (!esObjeto(crudo) || !Number.isInteger(crudo.dayOfWeek) || !Array.isArray(crudo.franjas)) return null
  const dayOfWeek = crudo.dayOfWeek as number
  if (dayOfWeek < 0 || dayOfWeek > 6) return null
  const franjas = crudo.franjas.flatMap((franja) => leerFranja(franja) ?? [])
  return franjas.length > 0 ? { dayOfWeek, franjas } : null
}

/**
 * Una sede como la responde la API, con las franjas en el formato de la
 * pantalla. `null` si le faltan los datos básicos: el servidor no valida lo
 * que llega a la pantalla, pero una sede a medias no se dibuja.
 */
export function sedeDeLaRespuesta(crudo: unknown): Sede | null {
  if (!esObjeto(crudo)) return null
  const { id, nombre, direccion, comuna, telefono, orden, activo, horarios, horasFuturas } = crudo
  if (typeof id !== "string" || !id || typeof nombre !== "string") return null
  return {
    id,
    nombre,
    direccion: typeof direccion === "string" ? direccion : "",
    comuna: typeof comuna === "string" ? comuna : "",
    telefono: typeof telefono === "string" && telefono ? telefono : null,
    orden: typeof orden === "number" && Number.isFinite(orden) ? orden : 0,
    activo: activo !== false,
    horarios: Array.isArray(horarios) ? horarios.flatMap((dia) => leerDia(dia) ?? []) : [],
    horasFuturas: typeof horasFuturas === "number" && Number.isFinite(horasFuturas) && horasFuturas > 0 ? horasFuturas : 0,
  }
}

/** Una lista de sedes de la API, en el orden de la lista; `null` si no es una lista o trae una sede a medias. */
export function sedesDeLaRespuesta(crudo: unknown): Sede[] | null {
  if (!Array.isArray(crudo)) return null
  const sedes = crudo.map(sedeDeLaRespuesta)
  return sedes.every((sede): sede is Sede => sede !== null) ? ordenarSedes(sedes) : null
}

/** Los choques de un 409 de horarios: `{ error, choques: [{ dayOfWeek, conSede }] }`. Lo que no se entiende, se descarta. */
export function choquesDelCuerpo(cuerpo: unknown): ChoqueDelServidor[] {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.choques)) return []
  return cuerpo.choques.flatMap((choque): ChoqueDelServidor[] => {
    if (!esObjeto(choque) || !Number.isInteger(choque.dayOfWeek)) return []
    const dayOfWeek = choque.dayOfWeek as number
    if (dayOfWeek < 0 || dayOfWeek > 6) return []
    const conSede = typeof choque.conSede === "string" ? choque.conSede : ""
    return [{ dayOfWeek, conSede }]
  })
}
