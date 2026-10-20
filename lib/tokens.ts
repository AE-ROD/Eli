import { createHash, randomBytes } from "node:crypto"

/**
 * Tokens de un solo uso que viajan en un enlace por correo: recuperar la
 * contraseña e invitar al equipo (M5 de la auditoría).
 *
 * Antes eran un `cuid()` guardado tal cual: un cuid no está hecho para ser
 * secreto (lleva la hora y un contador), y quien leyera la tabla tenía en la
 * mano enlaces vigentes para fijar la contraseña de cualquiera o entrar a un
 * negocio. Ahora son 32 bytes al azar y la base guarda sólo su sha256: el
 * token en claro existe únicamente en el enlace del correo. Nunca va a logs
 * ni a respuestas.
 */

/** sha256 en hex minúscula del texto en UTF-8. La migración que pasó los tokens viejos a hash calcula exactamente esto en Postgres. */
export function hashDeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

/** Un token nuevo: `token` va en el enlace, `tokenHash` a la base. */
export function generarToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, tokenHash: hashDeToken(token) }
}
