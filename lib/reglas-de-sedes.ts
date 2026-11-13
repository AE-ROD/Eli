import { choquesEntreSedes, MAX_SEDES, type ChoqueEntreSedes, type FranjaDeSede } from "@/lib/sedes"

/**
 * Las decisiones de los endpoints de sedes (`/api/configuracion/sedes/**`),
 * sin base: entra lo que el endpoint ya leyó (cuántas sedes activas hay,
 * cuántas horas por delante, qué franjas se pisan) y sale si se puede o el
 * 409 con su mensaje. Así cada regla se prueba sola y el endpoint sólo
 * orquesta.
 *
 * Los triggers de la migración `20261112120000_etapa_9_planes_y_sedes` son la
 * SEGUNDA barrera: repiten el tope de 5, el plan y los solapes. Estas reglas
 * corren antes para responder con un mensaje claro, y nunca dependen de
 * capturar el rechazo de la base.
 *
 * "Hay sedes" quiere decir "hay sedes ACTIVAS", igual que `modoDeSedes`,
 * `sedeParaReservar` y `WHERE_HORARIO_VIGENTE` (`lib/sedes.ts`): una sede
 * desactivada es historia (sus citas pasadas siguen apuntando a ella) y no
 * cambia cómo se comporta el negocio.
 */

/** Un rechazo: el código HTTP y lo que se le dice a quien lo recibe. */
export interface Rechazo {
  ok: false
  status: 409
  error: string
  /** Datos extra para la pantalla (cuántas horas, qué días se pisan). */
  extra?: Record<string, unknown>
}

export type Decision = { ok: true } | Rechazo

const SI: Decision = { ok: true }
const no = (error: string, extra?: Record<string, unknown>): Rechazo => ({ ok: false, status: 409, error, ...(extra ? { extra } : {}) })

/** "1 hora", "3 horas". */
export function textoDeHoras(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? "hora" : "horas"}`
}

const DIAS_DE_LA_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

/** El nombre del día (0 domingo a 6 sábado), en minúscula. */
export const nombreDelDia = (dayOfWeek: number): string => DIAS_DE_LA_SEMANA[dayOfWeek] ?? ""

/** `a`, `a y b`, `a, b y c`. */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join("")
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`
}

// ─── Mensajes ────────────────────────────────────────────────────────────────

export const MENSAJE_SEDE_NO_ENCONTRADA = "Sede no encontrada"
export const MENSAJE_NOMBRE_DE_SEDE_REPETIDO = "Ya hay una sede con ese nombre. Una sede desactivada también conserva el suyo"
export const MENSAJE_SIN_SEDES_TODAVIA =
  "Tu negocio todavía no tiene sedes. Conviértelo primero: la sede principal queda con la dirección actual del negocio"
export const MENSAJE_YA_HAY_SEDES = "Tu negocio ya tiene sedes: agrega las otras una por una"
export const MENSAJE_PLAN_SIN_SEDES = "Las sedes son del plan Independiente, y tu negocio está en otro plan"
export const MENSAJE_HORARIO_POR_SEDE = "El horario se configura por sede"
export const MENSAJE_SEDE_CON_CITAS = "Esta sede tiene horas (pasadas o por delante), así que no se puede borrar. Desactívala"
export const MENSAJE_NO_SE_PUEDE_LEER_EL_PLAN = "No pudimos leer el plan del negocio. Vuelve a intentarlo"
export const MENSAJE_RECHAZO_DE_LA_BASE = "La base no aceptó el cambio porque rompe una regla de las sedes. Revisa los datos e inténtalo de nuevo"

// ─── Las decisiones ──────────────────────────────────────────────────────────

/** Una sede nueva: el negocio ya tiene que estar en modo sedes (se convierte antes) y no pasar del tope. */
export function decidirAltaDeSede(datos: { activas: number }): Decision {
  if (datos.activas === 0) return no(MENSAJE_SIN_SEDES_TODAVIA)
  if (datos.activas >= MAX_SEDES) return no(`Un negocio tiene hasta ${MAX_SEDES} sedes activas. Desactiva una para agregar otra`)
  return SI
}

/** Pasar de "cero sedes" a dos: sólo si hoy no hay ninguna activa. */
export function decidirConversion(datos: { activas: number }): Decision {
  return datos.activas === 0 ? SI : no(MENSAJE_YA_HAY_SEDES)
}

/**
 * Desactivar una sede activa.
 * - Con horas por delante (pendientes o confirmadas) en ella, no: hay que
 *   moverlas o cancelarlas primero. Se dice cuántas son.
 * - Si era la única activa, tampoco con horas por delante en el negocio
 *   (sin ninguna sede activa no queda dónde atenderlas).
 */
export function decidirDesactivacion(datos: {
  horasFuturasDeLaSede: number
  otrasActivas: number
  horasFuturasDelNegocio: number
}): Decision {
  if (datos.horasFuturasDeLaSede > 0) {
    return no(
      `Esta sede tiene ${textoDeHoras(datos.horasFuturasDeLaSede)} por delante. Muévelas o cancélalas antes de desactivarla`,
      { horasFuturas: datos.horasFuturasDeLaSede }
    )
  }
  if (datos.otrasActivas === 0 && datos.horasFuturasDelNegocio > 0) {
    return no(
      `Es tu única sede activa y el negocio tiene ${textoDeHoras(datos.horasFuturasDelNegocio)} por delante. Sin una sede activa no hay dónde atenderlas`,
      { horasFuturas: datos.horasFuturasDelNegocio }
    )
  }
  return SI
}

/** Los choques de una grilla con otras sedes, como los muestra la pantalla: un renglón por día y sede, de lunes a domingo. */
export interface ChoqueParaMostrar {
  dayOfWeek: number
  conSede: string
}

/**
 * Lo que `choquesEntreSedes` encontró, reducido a los que tocan a `sedeId` y
 * escrito con el nombre de la OTRA sede. Sin repetir (dos franjas que se pisan
 * el mismo día con la misma sede son un solo renglón) y de lunes a domingo.
 */
export function choquesParaMostrar(
  choques: readonly ChoqueEntreSedes[],
  sedeId: string,
  nombreDeLaSede: (sedeId: string) => string
): ChoqueParaMostrar[] {
  const vistos = new Set<string>()
  const lista: ChoqueParaMostrar[] = []
  for (const choque of choques) {
    const otra = choque.a.sedeId === sedeId ? choque.b : choque.b.sedeId === sedeId ? choque.a : null
    if (!otra) continue
    const conSede = nombreDeLaSede(otra.sedeId)
    const clave = `${choque.dayOfWeek}|${conSede}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    lista.push({ dayOfWeek: choque.dayOfWeek, conSede })
  }
  const lunesPrimero = (dia: number) => (dia + 6) % 7
  return lista.sort((a, b) => lunesPrimero(a.dayOfWeek) - lunesPrimero(b.dayOfWeek) || a.conSede.localeCompare(b.conSede, "es"))
}

/** Las franjas de la sede `sedeId` contra las de las demás sedes ACTIVAS: los choques que la tocan. */
export function choquesDeLaSede(
  sedeId: string,
  franjas: readonly FranjaDeSede[],
  nombreDeLaSede: (sedeId: string) => string
): ChoqueParaMostrar[] {
  return choquesParaMostrar(choquesEntreSedes(franjas), sedeId, nombreDeLaSede)
}

/** El mensaje de un horario (o una reactivación) que se pisa con otra sede. */
export function mensajeDeChoques(choques: readonly ChoqueParaMostrar[]): string {
  const renglones = choques.map((choque) => `el ${nombreDelDia(choque.dayOfWeek)} con ${choque.conSede}`)
  return `El horario se pisa con otra sede: ${enumerar(renglones)}. Una sola persona no puede estar en dos sedes a la vez`
}

/**
 * Reactivar una sede inactiva: cabe en el tope de activas y su horario (que
 * quedó guardado mientras estaba apagada) no se pisa con el de otra sede
 * activa.
 */
export function decidirReactivacion(datos: { otrasActivas: number; choques: readonly ChoqueParaMostrar[] }): Decision {
  if (datos.otrasActivas >= MAX_SEDES) {
    return no(`Ya tienes ${MAX_SEDES} sedes activas. Desactiva una para reactivar ésta`)
  }
  if (datos.choques.length > 0) return no(mensajeDeChoques(datos.choques), { choques: datos.choques })
  return SI
}

/** Borrar una sede: sólo si nunca tuvo horas (ni pasadas ni canceladas). Con horas se desactiva. */
export function decidirBorrado(datos: { citas: number }): Decision {
  return datos.citas > 0 ? no(MENSAJE_SEDE_CON_CITAS, { citas: datos.citas }) : SI
}

/** Si el nombre ya lo tiene otra sede (sin distinguir mayúsculas ni tildes). */
export function nombreDeSedeRepetido(
  nombre: string,
  sedes: readonly { id: string; nombre: string }[],
  exceptoId?: string
): boolean {
  return sedes.some((sede) => sede.id !== exceptoId && sede.nombre.localeCompare(nombre, "es", { sensitivity: "base" }) === 0)
}
