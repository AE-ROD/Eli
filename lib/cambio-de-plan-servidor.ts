import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { decidirCambioDePlan } from "@/lib/cambio-de-plan"
import { whereDeSedes, type Actor } from "@/lib/permisos"
import { PLANES, planConocido, type PlanId } from "@/lib/planes"
import { MENSAJE_NO_SE_PUEDE_LEER_EL_PLAN } from "@/lib/reglas-de-sedes"
import { RechazoDeSedes, whereDeHorasPorDelante } from "@/lib/sedes-servidor"

/**
 * El lado servidor del cambio de plan (`PATCH /api/configuracion/plan`): lee lo
 * que decide DENTRO de la transacción (el plan de la base, las sedes con sus
 * horas por delante, los integrantes y las invitaciones pendientes), pregunta
 * a `decidirCambioDePlan` (`lib/cambio-de-plan.ts`, donde están las reglas y la
 * decisión sobre las horas de la sede que se queda) y lo aplica. El endpoint
 * ya tomó el candado `plan-y-sedes:<negocio>` y verificó `puedeCambiarDePlan`.
 *
 * El orden de las escrituras al pasar a Equipo importa: el trigger
 * `negocios_cambio_de_plan` exige cero sedes ACTIVAS, así que el plan se
 * cambia al final, cuando las sedes ya se apagaron.
 */

type Db = Prisma.TransactionClient

const MENSAJE_PLAN_INVALIDO = "Elige el plan Independiente o el plan Equipo"

/** El cuerpo de `PATCH /api/configuracion/plan`. */
export const cambioDePlanSchema = z.object(
  {
    plan: z.enum(PLANES, { errorMap: () => ({ message: MENSAJE_PLAN_INVALIDO }) }),
    sedeQueSeQueda: z
      .string({ invalid_type_error: "La sede que se queda no es válida" })
      .trim()
      .max(100, "La sede que se queda no es válida")
      .nullish(),
  },
  { required_error: MENSAJE_PLAN_INVALIDO, invalid_type_error: MENSAJE_PLAN_INVALIDO }
)
export type CambioDePlan = z.infer<typeof cambioDePlanSchema>

/** Cambia el plan del negocio del actor y devuelve el que quedó. Lanza `RechazoDeSedes` si no se puede. */
export async function cambiarDePlan(tx: Db, actor: Actor, pedido: CambioDePlan, ahora: Date = new Date()): Promise<{ plan: PlanId }> {
  const { businessId } = actor

  const negocio = await tx.business.findUnique({ where: { id: businessId }, select: { plan: true } })
  if (!negocio) throw new RechazoDeSedes(404, { error: "Negocio no encontrado" })
  const planActual = planConocido(negocio.plan)
  if (!planActual) throw new RechazoDeSedes(409, { error: MENSAJE_NO_SE_PUEDE_LEER_EL_PLAN })

  const sedes = await tx.sede.findMany({
    where: whereDeSedes(actor),
    select: {
      id: true,
      nombre: true,
      direccion: true,
      comuna: true,
      activo: true,
      _count: { select: { citas: { where: whereDeHorasPorDelante(ahora) } } },
    },
  })
  const pasaAIndependiente = pedido.plan === "independiente" && planActual !== "independiente"

  const decision = decidirCambioDePlan({
    planActual,
    planPedido: pedido.plan,
    sedeQueSeQueda: pedido.sedeQueSeQueda,
    sedes: sedes.map((sede) => ({ id: sede.id, nombre: sede.nombre, activo: sede.activo, horasFuturas: sede._count.citas })),
    integrantes: pasaAIndependiente ? await tx.businessMember.count({ where: { businessId } }) : 0,
    invitacionesPendientes: pasaAIndependiente ? await tx.workerInvitation.count({ where: { businessId, acceptedAt: null } }) : 0,
  })

  switch (decision.tipo) {
    case "sin-cambios":
      return { plan: planActual }

    case "rechazado":
      throw new RechazoDeSedes(decision.status, { error: decision.error, ...decision.extra })

    case "a-independiente":
      await tx.business.update({ where: { id: businessId }, data: { plan: "independiente" } })
      return { plan: "independiente" }

    case "a-equipo": {
      const quedaLa = sedes.find((sede) => sede.id === decision.sedeQueSeQueda)
      if (quedaLa) {
        // Las horas por delante y las inscripciones activas de la sede que se
        // queda pasan a ser "del negocio" (sin sede). Las pasadas la conservan.
        await tx.appointment.updateMany({
          where: { businessId, sedeId: quedaLa.id, ...whereDeHorasPorDelante(ahora) },
          data: { sedeId: null },
        })
        await tx.inscripcionEnEspera.updateMany({
          where: { businessId, sedeId: quedaLa.id, estado: "activa" },
          data: { sedeId: null },
        })
        // Su horario pasa a ser el horario general del negocio.
        await tx.workSchedule.deleteMany({ where: { businessId, memberId: null, sedeId: null } })
        await tx.workSchedule.updateMany({ where: { businessId, sedeId: quedaLa.id }, data: { sedeId: null } })
        // Y su dirección, la del negocio.
        await tx.business.update({ where: { id: businessId }, data: { address: quedaLa.direccion, comuna: quedaLa.comuna } })
      }
      if (decision.sedesADesactivar.length > 0) {
        await tx.sede.updateMany({ where: { businessId, id: { in: decision.sedesADesactivar } }, data: { activo: false } })
      }
      await tx.business.update({ where: { id: businessId }, data: { plan: "equipo" } })
      return { plan: "equipo" }
    }
  }
}
