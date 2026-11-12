/**
 * Reglas puras del formulario de reserva pública: qué servicios se pueden
 * sumar a los ya elegidos, si el profesional de la URL sirve para ellos y qué
 * le falta a "Tus datos". El servidor revisa todo de nuevo al confirmar: esto
 * es para que la pantalla no lleve a un callejón sin salida.
 */

/** Quien atiende, con lo que importa acá: qué servicios hace (`null`: todos). */
interface QuienAtiende {
  id: string
  servicioIds: string[] | null
}

/** Lo hace: sin servicios definidos, hace todos. */
export const haceElServicio = (profesional: QuienAtiende, servicioId: string) =>
  profesional.servicioIds === null || profesional.servicioIds.includes(servicioId)

/** Hace todos (#89a): la reserva es con una sola persona. */
export const haceTodos = (profesional: QuienAtiende, servicioIds: readonly string[]) =>
  servicioIds.every((servicioId) => haceElServicio(profesional, servicioId))

/**
 * Los servicios que ve quien reserva con ese profesional: los que hace
 * (`servicioIds` en `null`: todos). Sin profesional ("cualquiera") ve todos.
 * Conserva el orden del catálogo.
 */
export function serviciosQueVe<S extends { id: string }>(profesional: QuienAtiende | null, servicios: readonly S[]): S[] {
  return profesional ? servicios.filter((servicio) => haceElServicio(profesional, servicio.id)) : [...servicios]
}

/**
 * Al elegir a un profesional con servicios ya elegidos: los que sigue
 * pudiendo hacer (`quedan`, en el orden en que se eligieron: es el orden en
 * que se hacen) y los que no (`quitados`). Sin profesional no se quita nada.
 */
export function separarLosQueNoHace<S extends { id: string }>(
  profesional: QuienAtiende | null,
  elegidos: readonly S[]
): { quedan: S[]; quitados: S[] } {
  if (!profesional) return { quedan: [...elegidos], quitados: [] }
  return {
    quedan: elegidos.filter((servicio) => haceElServicio(profesional, servicio.id)),
    quitados: elegidos.filter((servicio) => !haceElServicio(profesional, servicio.id)),
  }
}

/**
 * El aviso discreto de lo que se quitó al cambiar de profesional: "Quitamos
 * Barba y Tinte porque Carla no los hace." Sin nombres, una cadena vacía. La
 * lista la arma `Intl.ListFormat`, que también cambia "y" por "e" ante una "i".
 */
export function avisoDeServiciosQuitados(profesional: string, quitados: readonly { name: string }[]): string {
  if (quitados.length === 0) return ""
  const lista = new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(quitados.map((servicio) => servicio.name))
  return `Quitamos ${lista} porque ${profesional} no ${quitados.length === 1 ? "lo" : "los"} hace.`
}

/**
 * Los servicios que no se pueden sumar a los ya elegidos porque nadie del
 * equipo hace la combinación: la reserva es con una sola persona, que hace
 * todos seguidos. Sin equipo (no se leyó, o el negocio no tiene) no se
 * bloquea nada: atiende el dueño, que hace todo. Los ya elegidos nunca se
 * bloquean (siempre se pueden quitar).
 */
export function serviciosQueNoSePuedenSumar(
  servicioIds: readonly string[],
  elegidos: readonly string[],
  equipo: readonly QuienAtiende[] | null
): Set<string> {
  const bloqueados = new Set<string>()
  if (!equipo || equipo.length === 0) return bloqueados
  for (const servicioId of servicioIds) {
    if (elegidos.includes(servicioId)) continue
    const combinacion = [...elegidos, servicioId]
    if (!equipo.some((profesional) => haceTodos(profesional, combinacion))) bloqueados.add(servicioId)
  }
  return bloqueados
}

/**
 * Si el profesional elegido (el de `?profesional=`, o uno tocado) sigue
 * valiendo: es del equipo y hace todos los servicios elegidos. Con el equipo
 * sin leer no se decide (vale): lo revisa el servidor.
 */
export function profesionalSigueValiendo(
  profesionalId: string | null,
  equipo: readonly QuienAtiende[] | null,
  elegidos: readonly string[]
): boolean {
  if (!profesionalId || !equipo) return true
  const profesional = equipo.find((candidato) => candidato.id === profesionalId)
  return !!profesional && haceTodos(profesional, elegidos)
}

/** Lo que se pide en "Tus datos": nombre y apellido; el correo, opcional. */
export interface TusDatos {
  nombre: string
  apellido: string
  email: string
}

export type ErroresDeTusDatos = Partial<Record<keyof TusDatos, string>>

/** Las mismas cuentas que el servidor (`nombreSchema`): sin espacios en las puntas, al menos 2 letras. */
const LARGO_MINIMO_DEL_NOMBRE = 2

/**
 * Un correo con forma de correo: algo, arroba, dominio con punto, sin
 * espacios. El servidor lo revisa con la regla completa; esto evita el
 * viaje en los errores de tipeo comunes.
 */
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Qué le falta a cada campo, en el vocabulario de la página pública. Sin
 * errores, un objeto vacío. Un nombre de puros espacios cuenta como vacío.
 */
export function erroresDeTusDatos({ nombre, apellido, email }: TusDatos): ErroresDeTusDatos {
  const errores: ErroresDeTusDatos = {}
  const revisarNombre = (valor: string, campo: "nombre" | "apellido") => {
    const limpio = valor.trim()
    if (!limpio) return `Escribe tu ${campo}.`
    if (limpio.length < LARGO_MINIMO_DEL_NOMBRE) return `Tu ${campo} tiene que tener al menos ${LARGO_MINIMO_DEL_NOMBRE} letras.`
    return undefined
  }
  const errorDelNombre = revisarNombre(nombre, "nombre")
  if (errorDelNombre) errores.nombre = errorDelNombre
  const errorDelApellido = revisarNombre(apellido, "apellido")
  if (errorDelApellido) errores.apellido = errorDelApellido
  const correo = email.trim()
  if (correo && !FORMA_DE_CORREO.test(correo)) errores.email = "Revisa el correo: tiene que ser como nombre@correo.com."
  return errores
}

/** El orden de los campos en la pantalla: el foco va al primero que tiene un error. */
export const ORDEN_DE_TUS_DATOS: (keyof TusDatos)[] = ["nombre", "apellido", "email"]
