/**
 * Cuándo se renueva la sesión del navegador.
 *
 * El callback `jwt` de `lib/auth.ts` vuelve a contrastar la cuenta con la base
 * cada `REVALIDAR_CADA_MS`, para que un cambio de rol o una baja del equipo
 * llegue en ese plazo. La intención es una consulta cada cinco minutos por
 * sesión y no una por petición.
 *
 * Pero `getServerSession` NO renueva la cookie: la revalidación que corre en
 * una petición del servidor se descarta. Sólo la renueva
 * `GET /api/auth/session`, que el navegador pide al cargar la página y al volver
 * el foco. Con el panel abierto y navegando sin recargar, pasados cinco minutos
 * cada petición (la del layout, la de la página, cada `/api/*`) repetía la
 * revalidación y sus consultas, y ninguna la guardaba.
 *
 * Por eso, dentro del panel, el navegador relee la sesión cada
 * `INTERVALO_DE_RELECTURA_S`: un poco MÁS que el plazo y nunca menos, porque con
 * cinco minutos justos el temporizador puede disparar unos milisegundos antes,
 * no encontrar vencida la revalidación y dejar otros cinco minutos sin renovar.
 * Fuera del panel (la landing, la reserva pública) no se relee: allí nadie
 * navega con una sesión que renovar.
 */

/**
 * Cada cuánto el token se vuelve a contrastar con la base. Con JWT no hay
 * sesión en el servidor que borrar: sin esta revisión, un miembro eliminado o
 * una contraseña restablecida dejaban la sesión vieja viva hasta que venciera.
 * Cinco minutos es el máximo que alguien conserva un acceso que ya perdió.
 */
export const REVALIDAR_CADA_MS = 5 * 60 * 1000

/** Lo que el navegador espera de más sobre el plazo, para no adelantarse. */
export const MARGEN_DE_RELECTURA_S = 5

/** Cada cuántos segundos se relee la sesión dentro del panel. */
export const INTERVALO_DE_RELECTURA_S = REVALIDAR_CADA_MS / 1000 + MARGEN_DE_RELECTURA_S

/** Si la ruta es del panel: `/dashboard` o cualquier cosa debajo. */
export function enElPanel(pathname: string | null | undefined): boolean {
  if (typeof pathname !== "string") return false
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/")
}

/**
 * El `refetchInterval` de `SessionProvider` para una ruta: los segundos entre
 * relecturas dentro del panel y 0 (sin sondeo) fuera de él.
 */
export function intervaloDeRelectura(pathname: string | null | undefined): number {
  return enElPanel(pathname) ? INTERVALO_DE_RELECTURA_S : 0
}
