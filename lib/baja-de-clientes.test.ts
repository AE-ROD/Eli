import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { clienteDelTokenDeBaja, enlacesDeBajaDeCliente, tokenDeBajaDeCliente } from "./baja-de-clientes"
import { tokenDeBaja, usuarioDelTokenDeBaja } from "./baja-de-correos"

describe("lib/baja-de-clientes", () => {
  beforeEach(() => {
    vi.stubEnv("NEXTAUTH_SECRET", "secreto-de-prueba")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("un token propio devuelve su customerId", () => {
    const token = tokenDeBajaDeCliente("cliente-1")
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
    expect(clienteDelTokenDeBaja(token)).toBe("cliente-1")
  })

  it("es estable (no vence) y distinto por cliente", () => {
    expect(tokenDeBajaDeCliente("cliente-1")).toBe(tokenDeBajaDeCliente("cliente-1"))
    expect(tokenDeBajaDeCliente("cliente-1")).not.toBe(tokenDeBajaDeCliente("cliente-2"))
  })

  it("contexto propio: un token de baja de un dueño no da de baja a un cliente, ni al revés", () => {
    expect(clienteDelTokenDeBaja(tokenDeBaja("mismo-id"))).toBeNull()
    expect(usuarioDelTokenDeBaja(tokenDeBajaDeCliente("mismo-id"))).toBeNull()
  })

  it("no acepta la firma de un cliente pegada al id de otro", () => {
    const [, firmaDe1] = tokenDeBajaDeCliente("cliente-1").split(".")
    const idDe2 = Buffer.from("cliente-2").toString("base64url")
    expect(clienteDelTokenDeBaja(`${idDe2}.${firmaDe1}`)).toBeNull()
  })

  it("no acepta una firma alterada en un solo carácter", () => {
    const token = tokenDeBajaDeCliente("cliente-1")
    const ultimo = token.at(-1) === "A" ? "B" : "A"
    expect(clienteDelTokenDeBaja(token.slice(0, -1) + ultimo)).toBeNull()
  })

  it("una sola forma escrita: el mismo token con relleno no vale", () => {
    const [id, firma] = tokenDeBajaDeCliente("cliente-1").split(".")
    expect(clienteDelTokenDeBaja(`${id}=.${firma}`)).toBeNull()
    expect(clienteDelTokenDeBaja(`${id}.${firma}=`)).toBeNull()
  })

  it("no acepta un token firmado con otro secreto", () => {
    const token = tokenDeBajaDeCliente("cliente-1")
    vi.stubEnv("NEXTAUTH_SECRET", "otro-secreto")
    expect(clienteDelTokenDeBaja(token)).toBeNull()
  })

  it.each([
    ["vacío", ""],
    ["sin punto", "abc"],
    ["con tres partes", "a.b.c"],
    ["con caracteres fuera de base64url", "Y2xpZW50ZS0x.ab+/="],
    ["con una firma corta", `${Buffer.from("cliente-1").toString("base64url")}.abc`],
    ["larguísimo", "a".repeat(600) + ".b"],
  ])("un token %s no es válido y no lanza", (_caso, token) => {
    expect(clienteDelTokenDeBaja(token)).toBeNull()
  })

  it.each([undefined, null, 123, { token: "x" }])("algo que no es texto (%j) no es válido", (valor) => {
    expect(clienteDelTokenDeBaja(valor)).toBeNull()
  })

  it("sin NEXTAUTH_SECRET: firmar lanza y verificar falla cerrado", () => {
    const token = tokenDeBajaDeCliente("cliente-1")
    vi.stubEnv("NEXTAUTH_SECRET", "")
    expect(() => tokenDeBajaDeCliente("cliente-1")).toThrow()
    expect(() => enlacesDeBajaDeCliente("cliente-1")).toThrow()
    expect(clienteDelTokenDeBaja(token)).toBeNull()
  })

  it("los enlaces: la página con botón y el POST de un clic, los dos con el mismo token", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://eli.test")
    const token = tokenDeBajaDeCliente("cliente-1")

    expect(enlacesDeBajaDeCliente("cliente-1")).toEqual({
      enlaceDeBaja: `https://eli.test/baja-de-correos/cliente/${token}`,
      enlaceDeBajaEnUnClic: `https://eli.test/api/correos/baja-de-cliente?token=${token}`,
    })
  })
})
