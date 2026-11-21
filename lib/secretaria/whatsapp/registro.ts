import type { WASocket } from "baileys"

/**
 * Las conexiones de WhatsApp vivas, una por negocio, en la memoria del proceso
 * de Next (el VPS corre un solo `next start`: deploy/eli.service). Va en
 * `globalThis` para que la recarga en caliente de `next dev` no abra una
 * segunda conexión con la misma sesión.
 */
export interface Conexion {
  negocioId: string
  canalId: string
  socket: WASocket
  /** El QR que hay que escanear, mientras se espera. */
  qr: string | null
  abierta: boolean
  /** La cerramos a propósito (desconectar): no se reconecta. */
  cerrando: boolean
  /** Reconexiones seguidas sin éxito. */
  intentos: number
  /** Ids de los mensajes que mandó la Secretaria: los demás "míos" son de la dueña. */
  enviados: Set<string>
  /** Cuándo mandó (o mandará) sus últimos mensajes, para el tope por minuto. */
  envios: number[]
  /** Los guardados de credenciales, en fila: uno a la vez y en orden. */
  guardando: Promise<void>
}

const global = globalThis as typeof globalThis & { __eliConexionesDeWhatsapp?: Map<string, Conexion> }

export const conexiones: Map<string, Conexion> = (global.__eliConexionesDeWhatsapp ??= new Map())

const globalAbriendo = globalThis as typeof globalThis & { __eliAbriendoWhatsapp?: Set<string> }

/** Negocios cuya conexión se está abriendo: dos pedidos a la vez no abren dos conexiones. */
export const abriendo: Set<string> = (globalAbriendo.__eliAbriendoWhatsapp ??= new Set())
