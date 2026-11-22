import { prisma } from "@/lib/prisma"
import { enviarVerificacionDeCorreo } from "@/lib/email"
import { enviarBienvenida } from "@/lib/enviar-correo-de-prueba"
import { registrarError } from "@/lib/registro-de-errores"
import { generarToken, hashDeToken } from "@/lib/tokens"
import { urlBase } from "@/lib/url-base"

/**
 * (servidor) Confirmar que el correo de una cuenta es de quien la creó.
 *
 * La regla del producto (PRODUCTO.md, "Cuentas"): la cuenta funciona igual sin
 * confirmar, pero los correos del ciclo de prueba (bienvenida, consejo, avisos
 * de fin) no salen hasta que confirme, y el panel le muestra un aviso. Los
 * correos operativos (reservas, recordatorios, invitaciones, recuperar la
 * contraseña) no dependen de esto.
 *
 * Una cuenta queda confirmada (`User.emailVerificadoEn`) cuando:
 * - abre el enlace de "Confirma tu correo" y aprieta el botón (`confirmarCorreo`);
 * - entra con Google, que ya entrega el correo verificado (`lib/auth.ts`);
 * - se crea aceptando una invitación al equipo: hizo clic en un enlace que
 *   llegó a ese correo (`app/api/equipo/invitacion/[token]/aceptar`);
 * - restablece la contraseña, por el mismo motivo
 *   (`app/api/auth/restablecer-contrasena`).
 *
 * El token es de `lib/tokens.ts`: 32 bytes al azar que viajan sólo en el
 * enlace del correo. La base guarda su sha256, uno por cuenta: pedir otro
 * enlace pisa el anterior, y confirmar lo borra (un enlace sirve una vez).
 * El token nunca va a una respuesta ni a un log.
 */

/** Cuánto vale el enlace de "Confirma tu correo". El correo dice "48 horas". */
export const VIGENCIA_DE_LA_VERIFICACION_MS = 48 * 60 * 60 * 1000

/**
 * Un enlace nuevo: `token` va al correo y `datos` a la fila de la cuenta (al
 * crearla o al pedir otro). Sólo el hash llega a la base.
 */
export function nuevaVerificacion(ahora: Date = new Date()) {
  const { token, tokenHash } = generarToken()
  return {
    token,
    datos: {
      verificacionTokenHash: tokenHash,
      verificacionVenceEn: new Date(ahora.getTime() + VIGENCIA_DE_LA_VERIFICACION_MS),
      verificacionEnviadaEn: ahora,
    },
  }
}

/**
 * Lo que se escribe en la cuenta cuando queda confirmada: la fecha, y el
 * enlace pendiente borrado (ya no hace falta y no tiene que seguir sirviendo).
 */
export function correoVerificado(ahora: Date = new Date()) {
  return { emailVerificadoEn: ahora, verificacionTokenHash: null, verificacionVenceEn: null }
}

/**
 * Manda el correo "Confirma tu correo" con el enlace de ese token. No lanza:
 * devuelve si salió. Fallo es que lance (sin `NEXTAUTH_URL` en producción no
 * hay enlace que mandar), que Resend responda `{ error }`, o el `null` de
 * cuando no hay `RESEND_API_KEY`. Si falla, la persona lo pide de nuevo desde
 * el aviso del panel.
 */
export async function enviarEnlaceDeVerificacion(
  usuario: { email: string; name: string },
  token: string,
): Promise<boolean> {
  try {
    const resultado = await enviarVerificacionDeCorreo({
      emailUsuario: usuario.email,
      nombreUsuario: usuario.name,
      enlaceConfirmar: `${urlBase()}/verificar-correo/${token}`,
    })
    if (resultado?.error) {
      // Sólo el código de Resend: su mensaje puede repetir el destinatario.
      console.error("Error enviando la verificación de correo:", { name: resultado.error.name })
    }
    return resultado !== null && !resultado.error
  } catch (error) {
    registrarError("enviando la verificación de correo", error)
    return false
  }
}

/** Un token de `generarToken` mide 43 caracteres; nada más largo que esto se busca en la base. */
const LARGO_MAXIMO_DEL_TOKEN = 128

/**
 * Confirma la cuenta dueña de ese token. Devuelve su id, o `null` si el
 * enlace no sirve: no existe, venció o ya se usó (al usarse se borra, así que
 * la segunda vez no existe). Quien llama responde lo mismo en los tres casos.
 *
 * Lo que decide es el `updateMany`: lleva el hash y la vigencia en el `where`,
 * así que de dos pedidos simultáneos con el mismo enlace sólo uno marca la
 * fila (el otro ya no encuentra el hash) y la bienvenida no sale dos veces.
 */
export async function confirmarCorreo(token: unknown, ahora: Date = new Date()): Promise<{ userId: string } | null> {
  if (typeof token !== "string" || token === "" || token.length > LARGO_MAXIMO_DEL_TOKEN) return null
  const verificacionTokenHash = hashDeToken(token)

  const usuario = await prisma.user.findUnique({ where: { verificacionTokenHash }, select: { id: true } })
  if (!usuario) return null

  const marcado = await prisma.user.updateMany({
    where: { id: usuario.id, verificacionTokenHash, verificacionVenceEn: { gt: ahora } },
    data: correoVerificado(ahora),
  })
  return marcado.count === 1 ? { userId: usuario.id } : null
}

/**
 * La bienvenida del ciclo de prueba, que ya no sale al registrarse sino al
 * confirmar el correo. Sólo si la cuenta es dueña de un negocio y su prueba
 * sigue corriendo (con la prueba terminada, "bienvenida a tu prueba" ya no
 * tiene sentido). Una sola vez por negocio: `enviarBienvenida` respeta el
 * candado de `CorreoDeCuenta` y las bajas de correos.
 *
 * Pensada para correr después de responder (`after`): nunca lanza. Si el envío
 * falla, el cron la reintenta mientras su ventana siga abierta.
 */
export async function enviarBienvenidaAlConfirmar(userId: string, ahora: Date = new Date()): Promise<void> {
  try {
    const negocio = await prisma.business.findUnique({
      where: { userId },
      select: { id: true, pruebaTerminaEl: true },
    })
    if (!negocio || negocio.pruebaTerminaEl.getTime() <= ahora.getTime()) return
    await enviarBienvenida(negocio.id)
  } catch (error) {
    registrarError("mandando la bienvenida al confirmar el correo", error)
  }
}

export type ResultadoDeReenvio = "enviado" | "ya-verificado" | "fallido" | "sin-cuenta"

/**
 * Otro enlace para la cuenta de la sesión: guarda un token nuevo (el anterior
 * deja de servir) y manda el correo. El tope de reenvíos lo pone quien llama.
 */
export async function reenviarVerificacion(userId: string, ahora: Date = new Date()): Promise<ResultadoDeReenvio> {
  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, emailVerificadoEn: true },
  })
  if (!usuario) return "sin-cuenta"
  if (usuario.emailVerificadoEn) return "ya-verificado"

  const { token, datos } = nuevaVerificacion(ahora)
  // `emailVerificadoEn: null` en el `where`: si confirmó entre la lectura y
  // esta escritura, no se le deja un enlace pendiente que ya no hace falta.
  const guardado = await prisma.user.updateMany({ where: { id: usuario.id, emailVerificadoEn: null }, data: datos })
  if (guardado.count !== 1) return "ya-verificado"

  return (await enviarEnlaceDeVerificacion(usuario, token)) ? "enviado" : "fallido"
}

/** Para el aviso del panel: si la cuenta ya confirmó, y a qué correo va el enlace. */
export async function estadoDeVerificacion(userId: string): Promise<{ verificado: boolean; email: string } | null> {
  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerificadoEn: true },
  })
  return usuario ? { verificado: !!usuario.emailVerificadoEn, email: usuario.email } : null
}
