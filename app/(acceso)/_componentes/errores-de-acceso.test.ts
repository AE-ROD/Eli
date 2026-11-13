import { describe, it, expect } from "vitest"
import { avisoDeAcceso, mensajeDeErrorAlEntrar, mensajeDeErrorDeAcceso } from "./errores-de-acceso"

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

describe("mensajeDeErrorAlEntrar", () => {
  it("credenciales equivocadas, límite de intentos y sin conexión dicen cosas distintas", () => {
    expect(mensajeDeErrorAlEntrar("CredentialsSignin")).toBe("Correo o contraseña incorrectos")
    expect(mensajeDeErrorAlEntrar("DemasiadosIntentos")).toMatch(/demasiados intentos/i)
    expect(mensajeDeErrorAlEntrar(null)).toMatch(/conectar/i)
    expect(mensajeDeErrorAlEntrar("Otra cosa")).toBe("No se pudo iniciar sesión. Inténtalo de nuevo.")
  })

  it("el límite de intentos que llega por ?error= también se explica", () => {
    expect(mensajeDeErrorDeAcceso("DemasiadosIntentos")).toMatch(/demasiados intentos/i)
  })
})

describe("avisoDeAcceso", () => {
  it("después de restablecer la contraseña y de crear la cuenta sin poder entrar", () => {
    expect(avisoDeAcceso("ContrasenaCambiada")).toMatch(/contraseña quedó cambiada/i)
    expect(avisoDeAcceso("CuentaCreada")).toMatch(/inicia sesión/i)
    expect(avisoDeAcceso(null)).toBe("")
    expect(avisoDeAcceso("<script>")).toBe("")
  })
})
