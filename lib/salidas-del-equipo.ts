import { prisma } from "@/lib/prisma"

/**
 * (servidor) De qué equipos sacaron a esta cuenta hace poco, para explicárselo
 * al entrar. A quien sacan del equipo se le archiva la membresía
 * (`lib/equipo-activo.ts`) y su sesión pierde ese negocio: sin otro negocio
 * cae en `/completar-perfil`, que es el formulario para crear el suyo, y con
 * otros en `/elegir-negocio`. Sin un aviso no entiende qué pasó.
 *
 * Es sólo un aviso: no decide nada de acceso (eso sigue en `lib/auth.ts` y el
 * proxy). Del negocio sale únicamente el nombre.
 */

/** Cuántos días se sigue avisando. Después, quien vuelve a crear su negocio ya no lo ve. */
export const DIAS_DE_AVISO_DE_SALIDA = 30

/** Cuántos negocios se nombran como máximo. */
export const MAXIMO_DE_SALIDAS = 3

/** Cuántas membresías archivadas se leen como máximo antes de descartar y cortar. */
const MAXIMO_A_LEER = 20

const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Los nombres de los negocios de cuyo equipo salió la cuenta en los últimos
 * `DIAS_DE_AVISO_DE_SALIDA` días, el más reciente primero, hasta
 * `MAXIMO_DE_SALIDAS`.
 *
 * - Sólo membresías de ESTA cuenta (`userId` de la sesión, nunca del
 *   navegador) y archivadas. Si la volvieron a invitar y aceptó, la membresía
 *   se reactiva (`archivadoEn` vuelve a `null`) y deja de aparecer.
 * - No cuenta el negocio del que la cuenta es dueña: a la dueña que además
 *   atendía en su negocio no se le dice que "ya no es parte" de lo suyo.
 * - Sin cuenta, nada (falla cerrado).
 */
export async function negociosDeLosQueSalio(userId: string | null | undefined, ahora: Date): Promise<string[]> {
  if (!userId) return []

  const desde = new Date(ahora.getTime() - DIAS_DE_AVISO_DE_SALIDA * MS_POR_DIA)
  const membresias = await prisma.businessMember.findMany({
    where: { userId, archivadoEn: { gte: desde } },
    orderBy: { archivadoEn: "desc" },
    take: MAXIMO_A_LEER,
    select: { business: { select: { name: true, userId: true } } },
  })

  return membresias
    .filter((membresia) => membresia.business.userId !== userId)
    .slice(0, MAXIMO_DE_SALIDAS)
    .map((membresia) => membresia.business.name)
}
