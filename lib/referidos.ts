import type { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizarCodigoInvitacion, pruebaExtendidaPorReferido } from "@/lib/prueba"

/**
 * Referidos entre negocios (`docs/PRODUCTO.md`, sección 4), del lado del
 * servidor: quién invitó a un negocio nuevo y el premio a quien invita.
 *
 * Quien crea su cuenta con el enlace de otro negocio queda con `invitadoPorId`.
 * Cuando ese negocio recibe su primera reserva pública, quien lo invitó suma
 * `DIAS_EXTRA_POR_REFERIDO` días a su prueba, una sola vez en total.
 */

/**
 * La cookie que lleva el código de invitación entre la ida y la vuelta de
 * Google: el usuario se crea en el `signIn` y el negocio después, en
 * completar-perfil. httpOnly (el navegador no la lee), SameSite=Lax (viaja en
 * la vuelta de Google, que es una navegación de primer nivel) y corta.
 */
export const COOKIE_DE_INVITACION = "eli-invita"

/** Media hora: alcanza para pasar por Google y completar el perfil. */
export const DURACION_DE_LA_COOKIE_S = 30 * 60

/** El único lugar que la lee: el navegador no la manda a ninguna otra ruta. */
const RUTA_DE_LA_COOKIE = "/api/auth/completar-perfil"

const OPCIONES_DE_LA_COOKIE = {
  httpOnly: true,
  sameSite: "lax",
  path: RUTA_DE_LA_COOKIE,
} as const

/** Pone en `respuesta` la cookie con un código ya normalizado. */
export function guardarCookieDeInvitacion(respuesta: NextResponse, codigo: string): void {
  respuesta.cookies.set(COOKIE_DE_INVITACION, codigo, {
    ...OPCIONES_DE_LA_COOKIE,
    secure: process.env.NODE_ENV === "production",
    maxAge: DURACION_DE_LA_COOKIE_S,
  })
}

/** La vence. Con la misma ruta: una cookie sólo la pisa otra con su `path`. */
export function borrarCookieDeInvitacion(respuesta: NextResponse): void {
  respuesta.cookies.set(COOKIE_DE_INVITACION, "", {
    ...OPCIONES_DE_LA_COOKIE,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  })
}

/**
 * El id del negocio dueño de `codigo`, o `null` si no hay ninguno.
 *
 * El código es lo único que viene de afuera y sólo sirve para esta búsqueda:
 * mal formado ni se consulta. Un negocio no se invita a sí mismo: si el dueño
 * del código es quien se está registrando (`userIdQueSeRegistra`), no cuenta.
 * Quien llama ignora `null` en silencio y crea la cuenta igual: así el
 * registro no dice si un código existe.
 */
export async function negocioQueInvita(codigo: unknown, userIdQueSeRegistra?: string): Promise<string | null> {
  const normalizado = normalizarCodigoInvitacion(codigo)
  if (!normalizado) return null

  const negocio = await prisma.business.findUnique({
    where: { codigoInvitacion: normalizado },
    select: { id: true, userId: true },
  })
  if (!negocio) return null
  if (userIdQueSeRegistra && negocio.userId === userIdQueSeRegistra) return null
  return negocio.id
}

/**
 * Qué pasó al contabilizar: `"premiado"` si quien invita sumó sus días,
 * `"contado"` si el referido contó pero quien invita ya tenía su premio, y
 * `"nada"` si no había nada que contar (no fue invitado, o ya contó).
 */
export type ResultadoDelReferido = "premiado" | "contado" | "nada"

/**
 * Cuenta la primera reserva pública de `negocioId` para quien lo invitó.
 *
 * Todo en una transacción y con escrituras condicionadas, para que dos
 * reservas simultáneas no premien dos veces:
 *
 * 1. Marca al invitado (`referidoContabilizadoAt`) sólo si todavía no contó.
 *    Postgres bloquea la fila: la segunda reserva espera, vuelve a evaluar la
 *    condición, ve la marca de la primera y actualiza 0 filas. Ahí se corta.
 * 2. A quien invita le suma los días sólo si nunca recibió un premio
 *    (`extensionPorReferidoAt` en null), con el mismo bloqueo: si dos
 *    invitados distintos reservan a la vez, uno solo lo premia.
 *
 * El referido cuenta aunque quien invita ya tenga su premio: un referido
 * cuenta una sola vez y no queda esperando a que se libere otro.
 */
export async function contabilizarReferido(negocioId: string, ahora: Date = new Date()): Promise<ResultadoDelReferido> {
  return prisma.$transaction(async (tx) => {
    const invitado = await tx.business.findUnique({
      where: { id: negocioId },
      select: { invitadoPorId: true },
    })
    const quienInvita = invitado?.invitadoPorId
    if (!quienInvita || quienInvita === negocioId) return "nada"

    const marcado = await tx.business.updateMany({
      where: { id: negocioId, invitadoPorId: quienInvita, referidoContabilizadoAt: null },
      data: { referidoContabilizadoAt: ahora },
    })
    if (marcado.count === 0) return "nada"

    const anfitrion = await tx.business.findUnique({
      where: { id: quienInvita },
      select: { pruebaTerminaEl: true, extensionPorReferidoAt: true },
    })
    if (!anfitrion || anfitrion.extensionPorReferidoAt) return "contado"

    const premiado = await tx.business.updateMany({
      where: { id: quienInvita, extensionPorReferidoAt: null },
      data: {
        extensionPorReferidoAt: ahora,
        pruebaTerminaEl: pruebaExtendidaPorReferido(anfitrion.pruebaTerminaEl, ahora),
      },
    })
    return premiado.count > 0 ? "premiado" : "contado"
  })
}
