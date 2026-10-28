import { resumenVacio, type ContextoDeCorrida, type ResumenDeTrabajo } from "@/lib/envios-a-clientes"

/**
 * (servidor) "Te toca" (#75): el correo al cliente al que ya le toca volver.
 *
 * STUB del paso 0 de la etapa 3: lo completa el frente B. La firma de
 * `ejecutarTeToca` es la que llama el cron (`lib/mensajes-a-clientes.ts`) y no
 * se cambia sin cambiarlo allá. Cada envío pasa por `enviarAClientes` (tipo
 * "te-toca"), que exige el consentimiento promocional y aplica el candado, el
 * cupo de la corrida y el tope diario.
 */
export async function ejecutarTeToca(_contexto: ContextoDeCorrida): Promise<ResumenDeTrabajo> {
  return resumenVacio()
}
