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

function esProduccion(): boolean {
  return process.env.NODE_ENV === "production"
}

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
 *
 * Sin credenciales configuradas el comportamiento depende del entorno:
 * - En producción, falla CERRADO: no se puede dejar login/registro/restablecer
 *   contraseña sin ningún tope porque una variable desapareció de Vercel.
 * - Fuera de producción, falla abierto: no tiene sentido bloquear el desarrollo
 *   local ni los tests por no tener Upstash configurado.
 *
 * Si Upstash está configurado pero falla en tiempo de ejecución (caída, cuota
 * agotada, etc.) se deja pasar la petición (fail-open): una caída transitoria
 * de un proveedor externo no debe tumbar el login de todo el mundo.
 */
export async function verificarLimite(tipo: TipoLimite, identificador: string): Promise<ResultadoLimite> {
  const limitador = limitadores[tipo]

  if (!limitador) {
    if (!avisoMostrado) {
      console.error(
        "[rate-limit] CONFIGURACIÓN FALTANTE: UPSTASH_REDIS_REST_URL/TOKEN no están definidos. " +
          (esProduccion()
            ? "Entorno de PRODUCCIÓN: se bloquean las peticiones hasta que se configure (fail-closed)."
            : "Entorno de desarrollo: se deja pasar sin límite (fail-open).")
      )
      avisoMostrado = true
    }

    if (esProduccion()) {
      return { permitido: false, restantes: 0 }
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
