import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { enviarCorreoDePrueba, type TipoCorreoDePrueba } from "@/lib/email"
import { tokenDeBaja } from "@/lib/baja-de-correos"
import type { CorreoQueToca } from "@/lib/correos-de-prueba"
import { diasEntre, fechaYMinutosEn, zonaDelNegocio } from "@/lib/zona-horaria"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * (servidor) Manda un correo del ciclo de prueba y lleva la cuenta en
 * `CorreoDeCuenta`, cuyo único `(businessId, tipo)` es el candado:
 *
 * 1. Se inserta la fila ANTES de enviar. Si ya existía (P2002), otro proceso
 *    lo mandó o lo está mandando: no se repite.
 * 2. Se envía. Fallo es: que lance, que Resend responda `{ error }`, o el
 *    `null` de cuando no hay `RESEND_API_KEY`.
 * 3. Si falló, se borra la fila: el cron lo reintenta al día siguiente
 *    mientras su ventana siga abierta (`lib/correos-de-prueba.ts`).
 *
 * Nada de esto lanza, y a los logs no va ningún dato personal.
 */

/** Lo que hace falta leer de un negocio para decidir y armar su correo. */
export const SELECCION_PARA_CORREO = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  createdAt: true,
  pruebaTerminaEl: true,
  recibeCorreosDePrueba: true,
  user: { select: { id: true, name: true, email: true, correosDesactivados: true } },
  correosDeCuenta: { select: { tipo: true } },
} satisfies Prisma.BusinessSelect

export type NegocioParaCorreo = Prisma.BusinessGetPayload<{ select: typeof SELECCION_PARA_CORREO }>

export type ResultadoDeCorreo = "enviado" | "ya-enviado" | "fallido"

function urlBase(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000"
}

/** Si el negocio y su dueño aceptan los correos del ciclo de prueba. */
export function recibeCorreos(negocio: NegocioParaCorreo): boolean {
  return negocio.recibeCorreosDePrueba && !negocio.user.correosDesactivados
}

export async function mandarCorreoDePrueba(
  negocio: NegocioParaCorreo,
  correo: CorreoQueToca,
): Promise<ResultadoDeCorreo> {
  const { tipo } = correo

  try {
    await prisma.correoDeCuenta.create({ data: { businessId: negocio.id, tipo }, select: { id: true } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "ya-enviado"
    registrarError(`guardando el correo de prueba "${tipo}"`, error)
    return "fallido"
  }

  let enviado = false
  try {
    const base = urlBase()
    const resultado = await enviarCorreoDePrueba(tipo, {
      emailDueno: negocio.user.email,
      nombreDueno: negocio.user.name,
      nombreNegocio: negocio.name,
      enlacePanel: `${base}/dashboard`,
      enlaceReservas: `${base}/reservar/${negocio.slug}`,
      enlaceDeBaja: `${base}/baja-de-correos/${tokenDeBaja(negocio.user.id)}`,
      ultimoDia: correo.ultimoDia,
      diasRestantes: correo.diasRestantes,
    })
    if (resultado?.error) {
      // Sólo el código de Resend: su mensaje puede repetir el destinatario.
      console.error(`Error enviando el correo de prueba "${tipo}":`, { name: resultado.error.name })
    }
    enviado = resultado !== null && !resultado.error
  } catch (error) {
    registrarError(`enviando el correo de prueba "${tipo}"`, error)
  }

  if (enviado) return "enviado"

  try {
    await prisma.correoDeCuenta.deleteMany({ where: { businessId: negocio.id, tipo } })
  } catch (error) {
    registrarError(`liberando el correo de prueba "${tipo}"`, error)
  }
  return "fallido"
}

/** El último día de la prueba y cuántos faltan, en la zona del negocio. */
function finDeLaPruebaEnSuZona(negocio: NegocioParaCorreo, ahora: Date) {
  const zona = zonaDelNegocio(negocio.timezone)
  const ultimoDia = fechaYMinutosEn(negocio.pruebaTerminaEl, zona).fecha
  return { ultimoDia, diasRestantes: diasEntre(fechaYMinutosEn(ahora, zona).fecha, ultimoDia) }
}

/**
 * La bienvenida de un negocio recién creado (registro y completar perfil).
 * Pensada para correr después de responder (`after`): nunca lanza, y si
 * falla el cron la reintenta desde el día siguiente.
 */
export async function enviarBienvenida(businessId: string): Promise<ResultadoDeCorreo | "no-corresponde"> {
  try {
    const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: SELECCION_PARA_CORREO })
    if (!negocio || !recibeCorreos(negocio)) return "no-corresponde"
    const tipo: TipoCorreoDePrueba = "bienvenida"
    return await mandarCorreoDePrueba(negocio, { tipo, ...finDeLaPruebaEnSuZona(negocio, new Date()) })
  } catch (error) {
    registrarError("preparando la bienvenida", error)
    return "fallido"
  }
}
