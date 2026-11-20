import { describe, it, expect } from "vitest"
import {
  avisoDeAcceso,
  ayudaDelError,
  CREDENCIALES_INCORRECTAS,
  mensajeDeErrorAlEntrar,
  mensajeDeErrorDeAcceso,
} from "./errores-de-acceso"

describe("mensajeDeErrorDeAcceso", () => {
  it("una cuenta con contraseña que intentó entrar con Google: le dice cómo entrar", () => {
    expect(mensajeDeErrorDeAcceso("CuentaConContrasena")).toBe("Esta cuenta usa correo y contraseña. Entra con ellos.")
  })

  it("una sesión revocada que el proxy cerró: le pide volver a entrar", () => {
    expect(mensajeDeErrorDeAcceso("SesionCerrada")).toBe("Tu sesión se cerró. Vuelve a entrar.")
  })

  it("cualquier otro error de NextAuth dice qué hacer: reintentar o entrar con correo", () => {
    expect(mensajeDeErrorDeAcceso("AccessDenied")).toBe(
      "No se pudo entrar con Google. Inténtalo de nuevo o entra con tu correo y contraseña."
    )
  })

  it("sin error, nada", () => {
    expect(mensajeDeErrorDeAcceso(null)).toBe("")
  })
})

describe("mensajeDeErrorAlEntrar", () => {
  it("credenciales equivocadas, límite de intentos y sin conexión dicen cosas distintas", () => {
    expect(mensajeDeErrorAlEntrar("CredentialsSignin")).toBe("Correo o contraseña incorrectos.")
    expect(mensajeDeErrorAlEntrar("DemasiadosIntentos")).toMatch(/demasiados intentos/i)
    expect(mensajeDeErrorAlEntrar(null)).toMatch(/conectar/i)
    expect(mensajeDeErrorAlEntrar("Otra cosa")).toBe("No se pudo iniciar sesión. Inténtalo de nuevo.")
  })

  it("el límite de intentos que llega por ?error= también se explica", () => {
    expect(mensajeDeErrorDeAcceso("DemasiadosIntentos")).toMatch(/demasiados intentos/i)
  })
})

describe("ayudaDelError", () => {
  it("con el correo o la contraseña equivocados, ofrece recuperarla", () => {
    expect(ayudaDelError(CREDENCIALES_INCORRECTAS)).toEqual({
      texto: "¿La olvidaste? Recupérala acá",
      href: "/recuperar-contrasena",
    })
  })

  it("con el enlace de restablecer vencido, ofrece pedir otro", () => {
    expect(ayudaDelError("Enlace inválido o expirado")?.href).toBe("/recuperar-contrasena")
  })

  it("los demás errores no traen enlace", () => {
    expect(ayudaDelError("")).toBeNull()
    expect(ayudaDelError(mensajeDeErrorAlEntrar(null))).toBeNull()
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
