/** Lo que NextAuth (o el proxy) devuelve cuando se pasó el límite de intentos de login (`lib/auth.ts`, `proxy.ts`). */
export const DEMASIADOS_INTENTOS = "DemasiadosIntentos"

const MENSAJE_DEMASIADOS_INTENTOS = "Demasiados intentos. Espera un minuto y vuelve a intentarlo."

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
  return "No se pudo iniciar sesión con Google. Verifica que tu cuenta esté habilitada."
}

/**
 * El mensaje cuando `signIn("credentials")` no entra. Antes cualquier fallo
 * decía "Correo o contraseña incorrectos", también el límite de intentos y
 * una caída del servidor: quien escribía bien su contraseña se quedaba
 * probando otras. `null` (sin código) es que no hubo respuesta.
 */
export function mensajeDeErrorAlEntrar(codigo: string | null | undefined): string {
  if (codigo === "CredentialsSignin") return "Correo o contraseña incorrectos"
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
