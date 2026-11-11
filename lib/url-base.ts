/**
 * La dirección pública de Eli para armar los enlaces que van en los correos
 * (restablecer la contraseña, unirse al equipo, darse de baja...), sin la
 * barra final.
 *
 * Sale de `NEXTAUTH_URL`. En producción, si falta, lanza: antes caía a
 * `http://localhost:3000` y los correos salían con enlaces que no llevan a
 * ningún lado, sin que nadie se enterara. Es mejor que el envío falle (queda
 * en el log y, donde hay cron, se reintenta) a mandar un enlace roto. Fuera
 * de producción sí cae a localhost, para el desarrollo y los tests.
 */
export function urlBase(): string {
  const configurada = process.env.NEXTAUTH_URL?.trim()
  if (configurada) return configurada.replace(/\/+$/, "")
  if (process.env.NODE_ENV === "production") {
    throw new Error("Falta NEXTAUTH_URL: sin ella los enlaces de los correos no llevan a ningún lado.")
  }
  return "http://localhost:3000"
}
