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
  /** Cuándo mandó sus últimos mensajes (para el tope por minuto). */
  envios: number[]
}

const global = globalThis as typeof globalThis & { __eliConexionesDeWhatsapp?: Map<string, Conexion> }

export const conexiones: Map<string, Conexion> = (global.__eliConexionesDeWhatsapp ??= new Map())
