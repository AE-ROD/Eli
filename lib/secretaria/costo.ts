import { PRECIO_USD_POR_MILLON } from "@/lib/secretaria/config"

/** Lo que reporta la API por llamada (`response.usage`), sólo lo que se cobra. */
export interface UsoDeTokens {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export interface TokensSumados {
  entrada: number
  salida: number
  escrituraDeCache: number
  lecturaDeCache: number
}

export const SIN_TOKENS: TokensSumados = { entrada: 0, salida: 0, escrituraDeCache: 0, lecturaDeCache: 0 }

export function sumarUso(total: TokensSumados, uso: UsoDeTokens): TokensSumados {
  return {
    entrada: total.entrada + uso.input_tokens,
    salida: total.salida + uso.output_tokens,
    escrituraDeCache: total.escrituraDeCache + (uso.cache_creation_input_tokens ?? 0),
    lecturaDeCache: total.lecturaDeCache + (uso.cache_read_input_tokens ?? 0),
  }
}

/** Todos los tokens de entrada (con los del caché), para el registro. */
export function tokensDeEntrada(tokens: TokensSumados): number {
  return tokens.entrada + tokens.escrituraDeCache + tokens.lecturaDeCache
}

/**
 * El costo en microdólares (millonésimas de dólar), redondeado hacia arriba:
 * con precios en USD por millón, un token cuesta `precio` microdólares.
 */
export function costoEnMicrodolares(tokens: TokensSumados): number {
  const costo =
    tokens.entrada * PRECIO_USD_POR_MILLON.entrada +
    tokens.salida * PRECIO_USD_POR_MILLON.salida +
    tokens.escrituraDeCache * PRECIO_USD_POR_MILLON.escrituraDeCache +
    tokens.lecturaDeCache * PRECIO_USD_POR_MILLON.lecturaDeCache
  return Math.ceil(costo)
}

/** El período de consumo ("AAAA-MM") de un instante, en el reloj del negocio. */
export function periodoDe(instante: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit" }).formatToParts(
    instante
  )
  const año = partes.find((parte) => parte.type === "year")?.value
  const mes = partes.find((parte) => parte.type === "month")?.value
  return `${año}-${mes}`
}

/** Qué porcentaje del presupuesto (en centavos) se gastó (en microdólares). Sin presupuesto, agotado. */
export function porcentajeGastado(costoMicrodolares: number, presupuestoCentavos: number): number {
  if (presupuestoCentavos <= 0) return 100
  return (costoMicrodolares / (presupuestoCentavos * 10_000)) * 100
}
