import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto"

/**
 * El token del enlace "Dejar de recibir estos correos" de los correos
 * promocionales a un cliente ("te toca" y pedir reseña).
 *
 * Misma forma que el de los correos de prueba (`lib/baja-de-correos.ts`):
 * `<customerId en base64url>.<firma en base64url>`, con la firma un
 * HMAC-SHA256 del customerId y la clave derivada de `NEXTAUTH_SECRET` con
 * HKDF. El contexto es otro (`CONTEXTO`), así que la clave también: un token
 * de baja de un dueño no da de baja a un cliente, ni al revés, aunque los ids
 * coincidieran. Nada se guarda en la base: se verifica recalculando la firma.
 *
 * Sin vencimiento, a propósito: el enlace va en correos que se leen semanas
 * después, y lo único que permite es apagar los promocionales de ese cliente.
 * Deja de valer si cambia `NEXTAUTH_SECRET` o si se pasa a un contexto `v2`.
 */

const CONTEXTO = "eli:baja-cliente:v1"
const LARGO_DE_FIRMA = 32

function clave(): Buffer | null {
  const secreto = process.env.NEXTAUTH_SECRET
  if (!secreto) return null
  return Buffer.from(hkdfSync("sha256", secreto, Buffer.alloc(0), CONTEXTO, 32))
}

function firmar(customerId: string, llave: Buffer): Buffer {
  return createHmac("sha256", llave).update(customerId, "utf8").digest()
}

/**
 * El token de baja de un cliente. Lanza si falta `NEXTAUTH_SECRET`: sin un
 * enlace de baja que funcione, un correo promocional no se manda.
 */
export function tokenDeBajaDeCliente(customerId: string): string {
  const llave = clave()
  if (!llave) throw new Error("NEXTAUTH_SECRET no configurado: no se puede firmar el enlace de baja")
  return `${Buffer.from(customerId, "utf8").toString("base64url")}.${firmar(customerId, llave).toString("base64url")}`
}

/**
 * El customerId de un token de baja válido, o `null` si no lo es (forma rara,
 * firma que no coincide, o `NEXTAUTH_SECRET` ausente). Nunca lanza. La firma
 * se compara en tiempo constante.
 */
export function clienteDelTokenDeBaja(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 512) return null
  const partes = token.split(".")
  if (partes.length !== 2) return null
  const [idCodificado, firmaCodificada] = partes
  if (!/^[A-Za-z0-9_-]+$/.test(idCodificado) || !/^[A-Za-z0-9_-]+$/.test(firmaCodificada)) return null

  const llave = clave()
  if (!llave) return null

  const customerId = Buffer.from(idCodificado, "base64url").toString("utf8")
  const recibida = Buffer.from(firmaCodificada, "base64url")
  if (!customerId || recibida.length !== LARGO_DE_FIRMA) return null
  // Una sola forma escrita por token: el decodificador perdona caracteres de
  // relleno y bits sobrantes, y eso no tiene que dar otro token válido.
  if (Buffer.from(customerId, "utf8").toString("base64url") !== idCodificado) return null
  if (recibida.toString("base64url") !== firmaCodificada) return null

  return timingSafeEqual(recibida, firmar(customerId, llave)) ? customerId : null
}

function urlBase(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000"
}

/** Los dos enlaces de baja que lleva cada correo promocional a un cliente. */
export interface EnlacesDeBajaDeCliente {
  /** La página con el botón de confirmar: el enlace del pie del correo. */
  enlaceDeBaja: string
  /**
   * El POST de un clic (RFC 8058) para el encabezado `List-Unsubscribe`: Gmail
   * y Apple lo llaman sin abrir nada. Lleva el token en la consulta porque el
   * cuerpo que mandan es fijo (`List-Unsubscribe=One-Click`).
   */
  enlaceDeBajaEnUnClic: string
}

/** Lanza si falta `NEXTAUTH_SECRET`, como `tokenDeBajaDeCliente`. */
export function enlacesDeBajaDeCliente(customerId: string): EnlacesDeBajaDeCliente {
  const token = tokenDeBajaDeCliente(customerId)
  const base = urlBase()
  return {
    enlaceDeBaja: `${base}/baja-de-correos/cliente/${token}`,
    enlaceDeBajaEnUnClic: `${base}/api/correos/baja-de-cliente?token=${token}`,
  }
}
