import { describe, it, expect } from "vitest"
import { createHash } from "node:crypto"
import { generarToken, hashDeToken } from "./tokens"

describe("tokens de un solo uso (lib/tokens.ts)", () => {
  it("el token es aleatorio, de 32 bytes en base64url, y se guarda sólo su hash", () => {
    const { token, tokenHash } = generarToken()

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(tokenHash).not.toBe(token)
    expect(tokenHash).toBe(hashDeToken(token))
    expect(generarToken().token).not.toBe(token)
  })

  it("el hash es sha256 en hex minúscula del texto en UTF-8: lo mismo que calcula la migración en Postgres", () => {
    // `encode(sha256(convert_to('abc', 'UTF8')), 'hex')` en Postgres 16.
    expect(hashDeToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(hashDeToken("ñandú")).toBe(createHash("sha256").update(Buffer.from("ñandú", "utf8")).digest("hex"))
  })

  it("un token de antes (un cuid en claro) sigue funcionando: la migración guardó su hash", () => {
    const cuid = "clx9k2m8a0000qz8h3f7d2b1c"
    expect(hashDeToken(cuid)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashDeToken(cuid)).toBe(createHash("sha256").update(cuid).digest("hex"))
  })
})
