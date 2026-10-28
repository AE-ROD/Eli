import type { Prisma } from "@prisma/client"
import { leerOcupacion } from "@/lib/ocupacion"
import { advertenciaDeBloqueo, advertenciaDeChoque, advertenciaDeHorario, type Advertencia, type Tramo } from "@/lib/mover-cita"
import { zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * Las advertencias de dejar una cita en `tramo` con `memberId`, al crearla o
 * al moverla desde el panel: choque con otra cita activa del profesional,
 * bloqueo suyo o de todo el negocio, y fuera del horario de atención. No
 * bloquean: el endpoint responde 409 con ellas y quien agenda decide si
 * guarda igual (`confirmarAdvertencias`).
 *
 * Todo se lee del negocio `businessId`, que el endpoint saca de la sesión;
 * `memberId` ya viene verificado como miembro de ese negocio. `citaId` es la
 * cita que se mueve (no choca consigo misma); al crear, `null`.
 *
 * Recibe la base en vez de importarla, como `lib/ocupacion.ts`.
 */
export async function advertenciasDeAgenda(
  db: Pick<Prisma.TransactionClient, "appointment" | "timeBlock" | "business" | "workSchedule" | "businessMember">,
  consulta: { businessId: string; citaId: string | null; tramo: Tramo; memberId: string | null }
): Promise<Advertencia[]> {
  const { businessId, citaId, tramo, memberId } = consulta
  const [negocio, filas, miembro, ocupacion] = await Promise.all([
    db.business.findUnique({ where: { id: businessId }, select: { timezone: true } }),
    db.workSchedule.findMany({
      where: { businessId, active: true },
      select: { memberId: true, dayOfWeek: true, startTime: true, endTime: true },
    }),
    memberId
      ? db.businessMember.findFirst({
          where: { id: memberId, businessId },
          select: { user: { select: { name: true } } },
        })
      : null,
    leerOcupacion(db, {
      businessId,
      memberId,
      desde: tramo.startTime,
      hasta: tramo.endTime,
      ignorarCitaId: citaId,
    }),
  ])
  const zona = zonaDelNegocio(negocio?.timezone)
  const nombre = miembro?.user?.name?.trim() || "El profesional"

  return [
    advertenciaDeChoque(nombre, ocupacion.citas.slice(0, 10), zona),
    advertenciaDeBloqueo(memberId ? nombre : null, ocupacion.bloqueos.slice(0, 10), zona),
    advertenciaDeHorario(tramo, filas, memberId, memberId ? nombre : null, zona),
  ].filter((advertencia): advertencia is Advertencia => advertencia !== null)
}
