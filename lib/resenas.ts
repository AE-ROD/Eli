import { resumenVacio, type ContextoDeCorrida, type ResumenDeTrabajo } from "@/lib/envios-a-clientes"

/**
 * (servidor) Pedir una reseña en Google (#77) el día siguiente a la visita.
 *
 * STUB del paso 0 de la etapa 3: lo completa el frente C. La firma de
 * `ejecutarResenas` es la que llama el cron (`lib/mensajes-a-clientes.ts`) y no
 * se cambia sin cambiarlo allá. Cada envío pasa por `enviarAClientes` (tipo
 * "resena"), que exige el consentimiento promocional (decisión e del dueño) y
 * aplica el candado, el cupo de la corrida y el tope diario. Una vez cada
 * `DIAS_ENTRE_RESENAS` por cliente lo mira este trabajo.
 */
export async function ejecutarResenas(_contexto: ContextoDeCorrida): Promise<ResumenDeTrabajo> {
  return resumenVacio()
}
