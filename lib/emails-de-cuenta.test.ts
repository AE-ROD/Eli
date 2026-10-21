import { describe, it, expect } from "vitest"
import * as validaciones from "./validaciones"
import { registroSchema, recuperarContrasenaSchema, reservaSchema } from "./validaciones"

/**
 * El email de una cuenta se guarda y se busca siempre igual: sin espacios en
 * las puntas y en minúsculas (B4). Si no, `Ana@x.com` y `ana@x.com` eran dos
 * cuentas, y quien se registró con mayúsculas no encontraba su cuenta al
 * entrar o al recuperar la contraseña.
 */
describe("emails de cuenta normalizados", () => {
  it("normalizarEmail quita los espacios de las puntas y pasa a minúsculas", () => {
    const normalizarEmail = (validaciones as Record<string, unknown>).normalizarEmail as (email: string) => string
    expect(typeof normalizarEmail).toBe("function")
    expect(normalizarEmail("  Ana.Perez@Correo.COM ")).toBe("ana.perez@correo.com")
  })

  it("el registro guarda el email normalizado", () => {
    const datos = registroSchema.parse({
      nombre: "Ana",
      email: "  Ana@Correo.COM ",
      contrasena: "password123",
      nombreNegocio: "Spa Ana",
      tipoNegocio: "salon",
    })
    expect(datos.email).toBe("ana@correo.com")
  })

  it("recuperar la contraseña busca por el email normalizado", () => {
    expect(recuperarContrasenaSchema.parse({ email: " Ana@Correo.COM " }).email).toBe("ana@correo.com")
  })

  it("el email del cliente de una reserva no es de cuenta: se deja como lo escribió (sin espacios)", () => {
    const datos = reservaSchema.parse({
      servicioId: "s1",
      fecha: "2026-10-20",
      hora: "10:00",
      nombre: "Ana",
      apellido: "Pérez",
      email: " Ana@Correo.com ",
    })
    expect(datos.email).toBe("Ana@Correo.com")
  })
})
