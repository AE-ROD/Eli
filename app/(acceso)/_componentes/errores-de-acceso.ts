/**
 * El mensaje de la pantalla de iniciar sesión cuando NextAuth vuelve con
 * `?error=...` (un ingreso con Google que no se completó). El código
 * `CuentaConContrasena` lo pone el callback `signIn` de `lib/auth.ts`.
 */
export function mensajeDeErrorDeAcceso(codigo: string | null): string {
  if (!codigo) return ""
  if (codigo === "CuentaConContrasena") return "Esta cuenta usa correo y contraseña. Entra con ellos."
  return "No se pudo iniciar sesión con Google. Verifica que tu cuenta esté habilitada."
}
