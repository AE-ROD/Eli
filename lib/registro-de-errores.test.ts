import { describe, it, expect, vi, afterEach } from "vitest"
import { registrarError } from "./registro-de-errores"

/**
 * Un error de Prisma trae en el mensaje y en `meta` los argumentos de la
 * consulta (emails, nombres, hashes de token). En los logs sólo va lo que
 * sirve para diagnosticar sin datos: el nombre y el código.
 */
describe("registrarError", () => {
  afterEach(() => vi.restoreAllMocks())

  it("registra sólo el contexto, el nombre y el código del error", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = Object.assign(new Error("Unique constraint failed on email ana@x.com"), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: { target: ["email"], valor: "ana@x.com" },
    })

    registrarError("creando invitación", error)

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith("Error creando invitación:", {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain("ana@x.com")
  })

  it("sin código, sólo el nombre; y algo que no es un Error no se vuelca crudo", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})

    registrarError("x", new TypeError("datos de alguien"))
    registrarError("x", "un string con datos de alguien")
    registrarError("x", null)

    expect(log.mock.calls).toEqual([
      ["Error x:", { name: "TypeError", code: undefined }],
      ["Error x:", { name: "string", code: undefined }],
      ["Error x:", { name: "null", code: undefined }],
    ])
    expect(JSON.stringify(log.mock.calls)).not.toContain("datos de alguien")
  })

  it("un código que no es string no se registra", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})

    registrarError("x", Object.assign(new Error("m"), { code: { datos: "ana@x.com" } }))

    expect(log).toHaveBeenCalledWith("Error x:", { name: "Error", code: undefined })
  })
})
