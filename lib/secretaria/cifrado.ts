import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Cifrado de los tokens de acceso de WhatsApp (`CanalDeWhatsapp.accessTokenCifrado`)
 * con AES-256-GCM y la llave `WHATSAPP_TOKEN_KEY` (32 bytes en base64). El
 * formato guardado es `v1:<iv>:<tag>:<cifrado>`, todo en base64. Sin llave
 * válida falla cerrado: no se cifra ni se descifra nada.
 */

const VERSION = "v1"

export class LlaveDeCifradoInvalida extends Error {
  constructor() {
    super("WHATSAPP_TOKEN_KEY no está configurada o no son 32 bytes en base64")
  }
}

function llave(): Buffer {
  const valor = process.env.WHATSAPP_TOKEN_KEY
  const bytes = valor ? Buffer.from(valor, "base64") : Buffer.alloc(0)
  if (bytes.length !== 32) throw new LlaveDeCifradoInvalida()
  return bytes
}

export function cifrarToken(token: string): string {
  const iv = randomBytes(12)
  const cifrador = createCipheriv("aes-256-gcm", llave(), iv)
  const cifrado = Buffer.concat([cifrador.update(token, "utf8"), cifrador.final()])
  const tag = cifrador.getAuthTag()
  return [VERSION, iv.toString("base64"), tag.toString("base64"), cifrado.toString("base64")].join(":")
}

/** Lanza si el texto no es de este formato o fue alterado (GCM verifica el tag). */
export function descifrarToken(guardado: string): string {
  const [version, iv, tag, cifrado] = guardado.split(":")
  if (version !== VERSION || !iv || !tag || !cifrado) throw new Error("Token cifrado con un formato desconocido")
  const descifrador = createDecipheriv("aes-256-gcm", llave(), Buffer.from(iv, "base64"))
  descifrador.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([descifrador.update(Buffer.from(cifrado, "base64")), descifrador.final()]).toString("utf8")
}
