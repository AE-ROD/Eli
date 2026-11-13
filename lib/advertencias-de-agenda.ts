import type { Prisma } from "@prisma/client"
import { leerHorarioDeQuienesAtienden } from "@/lib/agenda-publica"
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
 * `sedeId` (opcional, plan Independiente) es la sede de la cita, que el
 * endpoint ya verificó como sede activa del negocio: el "fuera de horario" se
 * compara contra el horario de ESA sede y el mensaje la nombra. Sin él, contra
 * el horario vigente del negocio: en uno sin sedes, el de siempre. El choque y
 * el bloqueo no dependen de la sede: quien atiende no está en dos lugares a la
 * vez, así que una cita o un bloqueo en cualquier sede cuenta (ver
 * `lib/agenda-publica.ts`).
 *
 * Recibe la base en vez de importarla, como `lib/ocupacion.ts`.
 */
export async function advertenciasDeAgenda(
  db: Pick<Prisma.TransactionClient, "appointment" | "timeBlock" | "business" | "workSchedule" | "businessMember" | "sede">,
  consulta: { businessId: string; citaId: string | null; tramo: Tramo; memberId: string | null; sedeId?: string | null }
): Promise<Advertencia[]> {
  const { businessId, citaId, tramo, memberId, sedeId } = consulta
  const [negocio, filas, miembro, ocupacion, sede] = await Promise.all([
    db.business.findUnique({ where: { id: businessId }, select: { timezone: true } }),
    // Sin el horario personal de quien no atiende (#168).
    leerHorarioDeQuienesAtienden(db, businessId, sedeId),
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
    // Sólo el nombre, para el mensaje; la sede es del negocio de la sesión y está activa.
    sedeId ? db.sede.findFirst({ where: { id: sedeId, businessId, activo: true }, select: { nombre: true } }) : null,
  ])
  const zona = zonaDelNegocio(negocio?.timezone)
  const nombre = miembro?.user?.name?.trim() || "El profesional"

  return [
    advertenciaDeChoque(nombre, ocupacion.citas.slice(0, 10), zona),
    advertenciaDeBloqueo(memberId ? nombre : null, ocupacion.bloqueos.slice(0, 10), zona),
    advertenciaDeHorario(tramo, filas, memberId, memberId ? nombre : null, zona, sede?.nombre ?? null),
  ].filter((advertencia): advertencia is Advertencia => advertencia !== null)
}
