import { prisma } from "@/lib/prisma"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * A quién le llegan los avisos de la reserva pública al negocio (nueva
 * reserva, el cliente canceló o reagendó con su enlace): a la dueña y al
 * profesional de la cita, con el correo de su usuario (#114, #104).
 */

const mismaCasilla = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * El correo del usuario del profesional, leído por id Y negocio: un
 * `memberId` de otro negocio no da correo. Sin profesional, o si la lectura
 * falla, null: el cambio ya está hecho y la dueña igual se entera.
 */
export async function correoDelProfesional(negocioId: string, memberId: string | null): Promise<string | null> {
  if (!memberId) return null
  try {
    const miembro = await prisma.businessMember.findFirst({
      where: { id: memberId, businessId: negocioId },
      select: { user: { select: { email: true } } },
    })
    return miembro?.user?.email || null
  } catch (error) {
    registrarError("leyendo el correo del profesional para un aviso", error)
    return null
  }
}

/**
 * La dueña y los profesionales (sin los que no hay), una sola vez cada
 * casilla: si la dueña también es la profesional, o al reagendar el
 * profesional no cambió, le llega un solo correo.
 */
export function destinatariosDelAviso(correoDeLaDueña: string, correosDeProfesionales: (string | null)[]): string[] {
  const destinatarios = [correoDeLaDueña]
  for (const correo of correosDeProfesionales) {
    if (correo && !destinatarios.some((otro) => mismaCasilla(otro, correo))) destinatarios.push(correo)
  }
  return destinatarios
}

/**
 * Los correos de la dueña y de los profesionales de esos `memberIds` (al
 * reagendar, el de antes y el de ahora), sin repetir.
 */
export async function correosDelAviso(
  negocioId: string,
  correoDeLaDueña: string,
  memberIds: (string | null)[]
): Promise<string[]> {
  const distintos = [...new Set(memberIds.filter((id): id is string => Boolean(id)))]
  const correos = await Promise.all(distintos.map((memberId) => correoDelProfesional(negocioId, memberId)))
  return destinatariosDelAviso(correoDeLaDueña, correos)
}
