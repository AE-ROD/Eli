import Anthropic from "@anthropic-ai/sdk"

/**
 * El cliente de la API de Anthropic, uno por proceso. Toma `ANTHROPIC_API_KEY`
 * del entorno del servidor. Está aparte para que las pruebas lo reemplacen.
 */
let cliente: Anthropic | null = null

export function clienteDelModelo(): Pick<Anthropic, "messages"> {
  return (cliente ??= new Anthropic({ timeout: 30_000, maxRetries: 2 }))
}
