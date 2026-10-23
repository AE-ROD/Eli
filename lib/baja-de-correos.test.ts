import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { tokenDeBaja, usuarioDelTokenDeBaja } from "./baja-de-correos"

describe("lib/baja-de-correos", () => {
  beforeEach(() => {
    vi.stubEnv("NEXTAUTH_SECRET", "secreto-de-prueba")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("un token propio devuelve su userId", () => {
    const token = tokenDeBaja("usuario-1")
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
    expect(usuarioDelTokenDeBaja(token)).toBe("usuario-1")
  })

  it("es estable: el mismo usuario da siempre el mismo token (no vence)", () => {
    expect(tokenDeBaja("usuario-1")).toBe(tokenDeBaja("usuario-1"))
    expect(tokenDeBaja("usuario-1")).not.toBe(tokenDeBaja("usuario-2"))
  })

  it("no acepta la firma de un usuario pegada al id de otro", () => {
    const [, firmaDe1] = tokenDeBaja("usuario-1").split(".")
    const idDe2 = Buffer.from("usuario-2").toString("base64url")
    expect(usuarioDelTokenDeBaja(`${idDe2}.${firmaDe1}`)).toBeNull()
  })

  it("no acepta una firma alterada en un solo carácter", () => {
    const token = tokenDeBaja("usuario-1")
    const ultimo = token.at(-1) === "A" ? "B" : "A"
    expect(usuarioDelTokenDeBaja(token.slice(0, -1) + ultimo)).toBeNull()
  })

  it("no acepta un token firmado con otro secreto", () => {
    const token = tokenDeBaja("usuario-1")
    vi.stubEnv("NEXTAUTH_SECRET", "otro-secreto")
    expect(usuarioDelTokenDeBaja(token)).toBeNull()
  })

  it("la clave no es el secreto de las sesiones tal cual: un HMAC directo con NEXTAUTH_SECRET no sirve", async () => {
    const { createHmac } = await import("node:crypto")
    const firma = createHmac("sha256", "secreto-de-prueba").update("usuario-1").digest("base64url")
    const id = Buffer.from("usuario-1").toString("base64url")
    expect(usuarioDelTokenDeBaja(`${id}.${firma}`)).toBeNull()
  })

  it.each([
    ["vacío", ""],
    ["sin punto", "abc"],
    ["con tres partes", "a.b.c"],
    ["con caracteres fuera de base64url", "dXN1YXJpby0x.ab+/="],
    ["con una firma corta", `${Buffer.from("usuario-1").toString("base64url")}.abc`],
    ["larguísimo", "a".repeat(600) + ".b"],
  ])("un token %s no es válido y no lanza", (_caso, token) => {
    expect(usuarioDelTokenDeBaja(token)).toBeNull()
  })

  it.each([undefined, null, 123, { token: "x" }])("algo que no es texto (%j) no es válido", (valor) => {
    expect(usuarioDelTokenDeBaja(valor)).toBeNull()
  })

  it("sin NEXTAUTH_SECRET: firmar lanza y verificar falla cerrado", () => {
    const token = tokenDeBaja("usuario-1")
    vi.stubEnv("NEXTAUTH_SECRET", "")
    expect(() => tokenDeBaja("usuario-1")).toThrow()
    expect(usuarioDelTokenDeBaja(token)).toBeNull()
  })
})
