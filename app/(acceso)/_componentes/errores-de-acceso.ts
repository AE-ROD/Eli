/** Lo que NextAuth (o el proxy) devuelve cuando se pasó el límite de intentos de login (`lib/auth.ts`, `proxy.ts`). */
export const DEMASIADOS_INTENTOS = "DemasiadosIntentos"

const MENSAJE_DEMASIADOS_INTENTOS = "Demasiados intentos. Espera un minuto y vuelve a intentarlo."

/** El correo o la contraseña no coinciden: la pantalla le suma el enlace para recuperarla (`ayudaDelError`). */
export const CREDENCIALES_INCORRECTAS = "Correo o contraseña incorrectos."

/** Lo que responde `POST /api/auth/restablecer-contrasena` cuando el enlace ya no sirve. */
const ENLACE_VENCIDO = "Enlace inválido o expirado"

/**
 * El mensaje de la pantalla de iniciar sesión cuando NextAuth vuelve con
 * `?error=...` (un ingreso con Google que no se completó). El código
 * `CuentaConContrasena` lo pone el callback `signIn` de `lib/auth.ts`;
 * `SesionCerrada`, el proxy cuando la sesión fue revocada (`proxy.ts`).
 */
export function mensajeDeErrorDeAcceso(codigo: string | null): string {
  if (!codigo) return ""
  if (codigo === "CuentaConContrasena") return "Esta cuenta usa correo y contraseña. Entra con ellos."
  if (codigo === "SesionCerrada") return "Tu sesión se cerró. Vuelve a entrar."
  if (codigo === DEMASIADOS_INTENTOS) return MENSAJE_DEMASIADOS_INTENTOS
  return "No se pudo entrar con Google. Inténtalo de nuevo o entra con tu correo y contraseña."
}

/**
 * El mensaje cuando `signIn("credentials")` no entra. Antes cualquier fallo
 * decía "Correo o contraseña incorrectos", también el límite de intentos y
 * una caída del servidor: quien escribía bien su contraseña se quedaba
 * probando otras. `null` (sin código) es que no hubo respuesta.
 */
export function mensajeDeErrorAlEntrar(codigo: string | null | undefined): string {
  if (codigo === "CredentialsSignin") return CREDENCIALES_INCORRECTAS
  if (codigo === DEMASIADOS_INTENTOS) return MENSAJE_DEMASIADOS_INTENTOS
  if (!codigo) return "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo."
  return "No se pudo iniciar sesión. Inténtalo de nuevo."
}

/** El aviso de la pantalla de iniciar sesión cuando se llega con `?aviso=...` después de algo que salió bien. */
export function avisoDeAcceso(codigo: string | null): string {
  if (codigo === "ContrasenaCambiada") return "Listo, tu contraseña quedó cambiada. Entra con la nueva."
  if (codigo === "CuentaCreada") return "Tu cuenta quedó creada. Inicia sesión para entrar."
  return ""
}

/** Lo que se puede hacer ante un error: el texto del enlace y a dónde lleva. */
export interface AyudaDelError {
  texto: string
  href: string
}

/**
 * El paso siguiente de un error de acceso, para ponerlo debajo del mensaje
 * (`AvisoDeError`): quien no recuerda su contraseña va a recuperarla, y quien
 * llegó con un enlace vencido pide otro. Sin ayuda, `null`.
 */
export function ayudaDelError(mensaje: string): AyudaDelError | null {
  if (mensaje === CREDENCIALES_INCORRECTAS) return { texto: "¿La olvidaste? Recupérala acá", href: "/recuperar-contrasena" }
  if (mensaje === ENLACE_VENCIDO) return { texto: "Este enlace ya no sirve. Pide uno nuevo acá", href: "/recuperar-contrasena" }
  return null
}
