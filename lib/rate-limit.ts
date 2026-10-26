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

/**
 * Cuánto se espera a Upstash antes de darlo por caído. La librería trae 5 s
 * por defecto y, al vencer, deja pasar la petición (`success: true` con
 * `reason: "timeout"`); acá se acorta para no colgar el login ni la reserva, y
 * `verificarLimite` trata ese vencimiento como un error más.
 */
const TIMEOUT_UPSTASH_MS = 1500

function crearLimitador(prefix: string, tokens: number, ventana: `${number} ${"s" | "m" | "h"}`) {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, ventana),
    prefix: `eli:${prefix}`,
    timeout: TIMEOUT_UPSTASH_MS,
  })
}

// Login: 10 intentos por minuto por IP
const limitadorLogin = crearLimitador("login", 10, "1 m")
// Registro y recuperación de contraseña: 5 por 10 minutos por IP
const limitadorAuth = crearLimitador("auth", 5, "10 m")
// Reserva pública: 20 por hora por IP
const limitadorReserva = crearLimitador("reserva", 20, "1 h")
// Lectura pública, sin sesión (las horas libres de la página de reservas): 60
// por minuto por IP. Cada día que se toca en el calendario, y cada cambio de
// servicio, es una consulta. Quien elige turno recorre unos cuantos días y ni
// apurado llega a una por segundo, así que sobra margen para varias personas
// detrás de la misma IP (el wifi del local, una operadora móvil). El de
// `reserva` (20 por hora) cortaría a alguien que revisa tres semanas. A un
// script lo deja en una consulta por segundo, y cada una son 3 o 4 lecturas
// a la base.
const limitadorLecturaPublica = crearLimitador("lectura-publica", 60, "1 m")
// Panel autenticado, lectura (GET): un calendario abierto dispara varias
// consultas por minuto sin que sea abuso — el límite es alto a propósito,
// bien por encima del uso normal.
const limitadorPanelLectura = crearLimitador("panel-lectura", 200, "1 m")
// Panel autenticado, escritura (POST/PUT/PATCH/DELETE): crear o editar una
// fila es más caro que leerla, así que el tope es menor que el de lectura,
// pero sigue siendo generoso frente al uso real de un negocio.
const limitadorPanelEscritura = crearLimitador("panel-escritura", 60, "1 m")
// Solicitudes de soporte (/api/soporte): 5 por hora, por IP y además por
// usuario si hay sesión. Cada una manda dos correos (a soporte y el acuse), así
// que el tope es bajo: nadie reporta más de un puñado de fallas por hora.
const limitadorSoporte = crearLimitador("soporte", 5, "1 h")

export type TipoLimite =
  | "login"
  | "auth"
  | "reserva"
  | "lecturaPublica"
  | "panelLectura"
  | "panelEscritura"
  | "soporte"

const limitadores: Record<TipoLimite, Ratelimit | null> = {
  login: limitadorLogin,
  auth: limitadorAuth,
  reserva: limitadorReserva,
  lecturaPublica: limitadorLecturaPublica,
  panelLectura: limitadorPanelLectura,
  panelEscritura: limitadorPanelEscritura,
  soporte: limitadorSoporte,
}

/**
 * Qué hacer si Upstash falla en ejecución (error o timeout).
 *
 * Los tipos que un anónimo puede abusar —login, registro/recuperación/
 * invitaciones, reserva pública y solicitudes de soporte (cada una manda
 * correos a una dirección que escribe quien la envía)— fallan CERRADO: si no se puede contar, no se
 * deja pasar, porque una caída del proveedor no puede abrir la puerta a fuerza
 * bruta ni a reservas en masa. El resto falla abierto: las lecturas (página
 * pública de horas libres y GET del panel) y también las escrituras del panel,
 * que exigen sesión y ya están acotadas por usuario y por permisos; cortarlas
 * dejaría a un negocio sin cobrar ni agendar por una caída ajena.
 */
const fallaAbiertoSiUpstashFalla: Record<TipoLimite, boolean> = {
  login: false,
  auth: false,
  reserva: false,
  soporte: false,
  panelEscritura: true,
  lecturaPublica: true,
  panelLectura: true,
}

function primerValor(cabecera: string | null): string | null {
  const valor = cabecera?.split(",")[0].trim()
  return valor ? valor : null
}

/**
 * IP del cliente para el rate limit.
 *
 * SUPONE QUE EL DESPLIEGUE ESTÁ DETRÁS DE VERCEL. Vercel fija
 * `x-vercel-forwarded-for` y `x-real-ip` con la IP real y sobrescribe lo que
 * mande el cliente; `x-forwarded-for`, en cambio, puede traer valores que el
 * cliente inventó, así que sólo se usa como último recurso. Si algún día se
 * despliega en otro lado (o detrás de otro proxy), esta función debe revisarse:
 * sin un proxy de confianza que fije estas cabeceras, cualquiera elige su IP
 * y se salta el límite.
 */
export function obtenerIp(request: NextRequest | { headers: Headers }): string {
  return (
    primerValor(request.headers.get("x-vercel-forwarded-for")) ??
    primerValor(request.headers.get("x-real-ip")) ??
    primerValor(request.headers.get("x-forwarded-for")) ??
    "127.0.0.1"
  )
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
 * agotada, timeout) depende del tipo: ver `fallaAbiertoSiUpstashFalla`.
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
    if (resultado.reason === "timeout") throw new Error(`Upstash no respondió en ${TIMEOUT_UPSTASH_MS} ms`)
    return { permitido: resultado.success, restantes: resultado.remaining }
  } catch (error) {
    const abierto = fallaAbiertoSiUpstashFalla[tipo]
    console.error(
      `[rate-limit] Error consultando Upstash para "${tipo}": ` +
        (abierto ? "se deja pasar la petición (fail-open)." : "se bloquea la petición (fail-closed)."),
      error,
    )
    return abierto ? { permitido: true, restantes: Infinity } : { permitido: false, restantes: 0 }
  }
}
