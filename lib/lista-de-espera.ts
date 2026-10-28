import { resumenVacio, type ContextoDeCorrida, type ResumenDeTrabajo } from "@/lib/envios-a-clientes"

/**
 * (servidor) La lista de espera (#74): "Avísame si se libera una hora".
 *
 * STUB del paso 0 de la etapa 3: lo completa el frente A (inscribirse, avisar
 * cuando se libera una hora, salir por token, marcar "reservó"). La firma de
 * `expirarListaDeEspera` es la que llama el cron (`lib/mensajes-a-clientes.ts`)
 * y no se cambia sin cambiarlo allá.
 */

/** Inscripciones activas de un mismo email en un negocio; la siguiente da 429. */
export const INSCRIPCIONES_ACTIVAS_POR_EMAIL = 3

/**
 * Cron diario: pasa a "expirada" las inscripciones activas de días ya
 * pasados (en la zona de cada negocio) y borra sus datos personales. No manda
 * nada. Corta al llegar a `contexto.hasta` y lo dice en `incompleto`.
 */
export async function expirarListaDeEspera(_contexto: ContextoDeCorrida): Promise<ResumenDeTrabajo> {
  return resumenVacio()
}
