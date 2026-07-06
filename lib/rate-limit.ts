import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import type { NextRequest } from "next/server"

const redisConfigurado =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

const redis = redisConfigurado
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

let avisoMostrado = false

function crearLimitador(prefix: string, tokens: number, ventana: `${number} ${"s" | "m" | "h"}`) {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, ventana),
    prefix: `eli:${prefix}`,
  })
}

// Login: 10 intentos por minuto por IP
const limitadorLogin = crearLimitador("login", 10, "1 m")
// Registro y recuperación de contraseña: 5 por 10 minutos por IP
const limitadorAuth = crearLimitador("auth", 5, "10 m")
// Reserva pública: 20 por hora por IP
const limitadorReserva = crearLimitador("reserva", 20, "1 h")

export type TipoLimite = "login" | "auth" | "reserva"

const limitadores: Record<TipoLimite, Ratelimit | null> = {
  login: limitadorLogin,
  auth: limitadorAuth,
  reserva: limitadorReserva,
}

export function obtenerIp(request: NextRequest | { headers: Headers }): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) return forwardedFor.split(",")[0].trim()
  return request.headers.get("x-real-ip") ?? "127.0.0.1"
}

export interface ResultadoLimite {
  permitido: boolean
  restantes: number
}

/**
 * Aplica rate limiting si Upstash está configurado (UPSTASH_REDIS_REST_URL/TOKEN).
 * Si no está configurado, o si Upstash falla/no responde (caída, cuota agotada, etc.),
 * deja pasar la petición (fail-open): un problema en Redis no debe tumbar login/registro/reserva.
 */
export async function verificarLimite(tipo: TipoLimite, identificador: string): Promise<ResultadoLimite> {
  const limitador = limitadores[tipo]

  if (!limitador) {
    if (!avisoMostrado) {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN no configurados: rate limiting desactivado."
      )
      avisoMostrado = true
    }
    return { permitido: true, restantes: Infinity }
  }

  try {
    const resultado = await limitador.limit(identificador)
    return { permitido: resultado.success, restantes: resultado.remaining }
  } catch (error) {
    console.error("[rate-limit] Error consultando Upstash, se deja pasar la petición:", error)
    return { permitido: true, restantes: Infinity }
  }
}
