import { describe, it, expect } from "vitest"
import { mensajeDeErrorDeAcceso } from "./errores-de-acceso"

describe("mensajeDeErrorDeAcceso", () => {
  it("una cuenta con contraseña que intentó entrar con Google: le dice cómo entrar", () => {
    expect(mensajeDeErrorDeAcceso("CuentaConContrasena")).toBe("Esta cuenta usa correo y contraseña. Entra con ellos.")
  })

  it("una sesión revocada que el proxy cerró: le pide volver a entrar", () => {
    expect(mensajeDeErrorDeAcceso("SesionCerrada")).toBe("Tu sesión se cerró. Vuelve a entrar.")
  })

  it("cualquier otro error de NextAuth sigue con el mensaje genérico de Google", () => {
    expect(mensajeDeErrorDeAcceso("AccessDenied")).toBe(
      "No se pudo iniciar sesión con Google. Verifica que tu cuenta esté habilitada."
    )
  })

  it("sin error, nada", () => {
    expect(mensajeDeErrorDeAcceso(null)).toBe("")
  })
})
