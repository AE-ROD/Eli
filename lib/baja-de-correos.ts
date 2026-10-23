import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto"

/**
 * El token del enlace "Dejar de recibir estos correos" de los correos del
 * ciclo de prueba.
 *
 * Es `<userId en base64url>.<firma en base64url>`, con la firma un
 * HMAC-SHA256 del userId. La clave del HMAC se deriva de `NEXTAUTH_SECRET`
 * con HKDF y un contexto fijo (`CONTEXTO`): nunca es el secreto de las
 * sesiones tal cual, así que una firma de baja no sirve para nada más. No se
 * guarda nada en la base: el enlace se verifica recalculando la firma.
 *
 * Sin vencimiento, a propósito: el enlace va en correos que se leen días o
 * semanas después y lo único que permite es apagar estos correos, nunca leer
 * ni cambiar otra cosa. Deja de valer si cambia `NEXTAUTH_SECRET` (que además
 * cierra todas las sesiones) o si se pasa a un contexto `v2`.
 */

const CONTEXTO = "eli:baja-de-correos:v1"
const LARGO_DE_FIRMA = 32

function clave(): Buffer | null {
  const secreto = process.env.NEXTAUTH_SECRET
  if (!secreto) return null
  return Buffer.from(hkdfSync("sha256", secreto, Buffer.alloc(0), CONTEXTO, 32))
}

function firmar(userId: string, llave: Buffer): Buffer {
  return createHmac("sha256", llave).update(userId, "utf8").digest()
}

/**
 * El token de baja de un usuario. Lanza si falta `NEXTAUTH_SECRET`: sin
 * enlace de baja que funcione, el correo no se manda.
 */
export function tokenDeBaja(userId: string): string {
  const llave = clave()
  if (!llave) throw new Error("NEXTAUTH_SECRET no configurado: no se puede firmar el enlace de baja")
  return `${Buffer.from(userId, "utf8").toString("base64url")}.${firmar(userId, llave).toString("base64url")}`
}

/**
 * El userId de un token de baja válido, o `null` si no lo es (forma rara,
 * firma que no coincide, o `NEXTAUTH_SECRET` ausente). Nunca lanza. La firma
 * se compara en tiempo constante.
 */
export function usuarioDelTokenDeBaja(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 512) return null
  const partes = token.split(".")
  if (partes.length !== 2) return null
  const [userIdCodificado, firmaCodificada] = partes
  if (!/^[A-Za-z0-9_-]+$/.test(userIdCodificado) || !/^[A-Za-z0-9_-]+$/.test(firmaCodificada)) return null

  const llave = clave()
  if (!llave) return null

  const userId = Buffer.from(userIdCodificado, "base64url").toString("utf8")
  const recibida = Buffer.from(firmaCodificada, "base64url")
  if (!userId || recibida.length !== LARGO_DE_FIRMA) return null
  // Una sola forma escrita por token: el decodificador perdona caracteres de
  // relleno y bits sobrantes, y eso no tiene que dar otro token válido.
  if (Buffer.from(userId, "utf8").toString("base64url") !== userIdCodificado) return null
  if (recibida.toString("base64url") !== firmaCodificada) return null

  return timingSafeEqual(recibida, firmar(userId, llave)) ? userId : null
}
