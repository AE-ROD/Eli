import Anthropic from "@anthropic-ai/sdk"

/**
 * El cliente de la API de Anthropic, uno por proceso. Toma `ANTHROPIC_API_KEY`
 * del entorno del servidor. Está aparte para que las pruebas lo reemplacen.
 *
 * Modo de prueba (`SECRETARIA_MODO_PRUEBA=1`, sólo fuera de producción): no
 * llama a ninguna API y responde un texto fijo, para probar gratis la conexión
 * de WhatsApp (QR, recibir, "escribiendo…", responder). En producción
 * (`NODE_ENV=production`, que es `next start`) se ignora siempre.
 */
let cliente: Anthropic | null = null

export const RESPUESTA_DE_PRUEBA =
  "Hola, soy Eli en modo de prueba 👋 Recibí tu mensaje. Todavía no estoy conectada a la inteligencia artificial, así que no puedo agendar."

export function enModoDePrueba(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.SECRETARIA_MODO_PRUEBA === "1"
}

const modeloDePrueba: Pick<Anthropic, "messages"> = {
  messages: {
    create: (async () => ({
      id: "msg_prueba",
      type: "message",
      role: "assistant",
      model: "modo-de-prueba",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      content: [{ type: "text", text: RESPUESTA_DE_PRUEBA, citations: null }],
    })) as unknown as Anthropic["messages"]["create"],
  } as Anthropic["messages"],
}

export function clienteDelModelo(): Pick<Anthropic, "messages"> {
  if (enModoDePrueba()) return modeloDePrueba
  return (cliente ??= new Anthropic({ timeout: 30_000, maxRetries: 2 }))
}
