/**
 * El rechazo de la base a una hora, o a una inscripción de la lista de espera,
 * que queda viva en una sede desactivada (etapa 9, plan Independiente). Lo
 * levantan los triggers `citas_exigen_sede_activa` y
 * `lista_de_espera_exige_sede_activa`
 * (`20261112140000_etapa_9_endurecer_planes_y_sedes`): son la segunda barrera
 * de lo que la aplicación ya revisa (`leerSedesDeLaReserva`,
 * `decidirSedeDeLaCita`), pero la única que cubre la carrera con quien
 * desactiva la sede en el mismo instante (la aplicación lee la sede fuera de
 * la transacción que escribe, y la base la vuelve a mirar bajo el candado del
 * negocio).
 *
 * Es un `check_violation` (23514) de un trigger: Prisma lo trae como
 * `PrismaClientUnknownRequestError`, sin código propio, con el código de
 * Postgres y el texto de la excepción dentro del mensaje. Se reconoce por
 * ese texto, como `esRechazoPorPlan` (`lib/invitaciones-de-equipo.ts`):
 * `citas <id>: la sede <id> no está activa`.
 *
 * Lógica pura: sin base ni red.
 */

/**
 * Lo que ve quien reserva (o se anota en la lista de espera) cuando la sede se
 * desactivó mientras lo hacía. Es un 409: nada se guardó y puede volver a
 * elegir.
 */
export const MENSAJE_SEDE_YA_NO_DISPONIBLE = "Esa sede ya no está disponible. Elige otra."

/**
 * Lo que ve el panel al agendar una hora en una sede que se desactivó mientras
 * tanto (`POST /api/citas`).
 */
export const MENSAJE_SEDE_DESACTIVADA_AL_AGENDAR = "Esa sede se desactivó mientras agendabas la hora. Elige otra sede."

/**
 * Lo que ve el panel al reactivar o mover una hora cuya sede está desactivada
 * (`PATCH /api/citas/[id]`): la hora no vuelve a ponerse en pie en una sede que
 * ya no atiende. Para eso se agenda otra hora en una sede activa.
 */
export const MENSAJE_SEDE_DE_LA_HORA_DESACTIVADA =
  "La sede de esta hora está desactivada, así que no se puede reactivar ni mover ahí. Agenda otra hora en una sede activa."

/** `<tabla> <id>: la sede <id> no está activa`: el texto de los dos triggers. */
const TEXTO_DEL_TRIGGER = /\b(?:citas|lista_de_espera) \S+: la sede \S+ no está activa/

/** El código de Postgres de un `check_violation`: llega dentro del mensaje, no como `code`. */
const CODIGO_DE_CHECK_VIOLATION = /\b23514\b/

/**
 * Si el error es el rechazo de la base a una hora o una inscripción viva en
 * una sede desactivada. Pide las dos cosas, el código 23514 y el texto del
 * trigger: otro rechazo de la base (un CHECK, otro trigger de sedes) no cuenta.
 */
export function esRechazoPorSedeInactiva(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return CODIGO_DE_CHECK_VIOLATION.test(error.message) && TEXTO_DEL_TRIGGER.test(error.message)
}
