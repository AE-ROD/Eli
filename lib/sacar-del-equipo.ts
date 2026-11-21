import type { Prisma } from "@prisma/client"
import { ESTADOS_ACTIVOS } from "@/lib/atenciones"
import { leerNegocioParaLiquidar } from "@/lib/liquidacion"
import { inicioDelPeriodoEn } from "@/lib/periodos-de-liquidacion"
import { EN_EL_EQUIPO } from "@/lib/equipo-activo"

/**
 * (servidor) Sacar a alguien del equipo. No se borra: se archiva
 * (`lib/equipo-activo.ts`). Las reglas, decididas por el dueño del producto:
 *
 * - **Horas por delante: bloquean.** Si tiene citas pendientes, confirmadas o
 *   en curso que todavía no terminan, o una atención abierta en el Tablero, no
 *   se la saca: primero se mueven a otra persona o se cancelan. Así ninguna
 *   clienta queda con una hora con alguien que ya no está.
 * - **Plata pendiente: avisa, no bloquea.** Lo cobrado sin liquidar, sus
 *   propinas y adelantos siguen en Liquidaciones y se le pueden pagar después.
 * - **Al sacarla:** pierde el acceso al negocio en la próxima revalidación de
 *   su sesión (5 minutos como máximo), deja de aparecer en la reserva pública y
 *   en los selectores, se borran su horario y sus bloqueos que no terminaron, y
 *   sus inscripciones activas en la lista de espera pasan a "cualquiera".
 * - Quién saca a quién está en `puedeSacarDelEquipo` (`lib/permisos.ts`).
 */

type Db = Prisma.TransactionClient

/** Las citas que todavía cuentan como "por delante": no terminaron y siguen vivas. */
const ESTADOS_DE_CITA_POR_DELANTE = ["pendiente", "confirmada", "en-progreso"] as const

export interface ResumenDeSalida {
  /** Citas suyas pendientes, confirmadas o en curso que todavía no terminan. */
  citasPorDelante: number
  /** Atenciones del Tablero sin cobrar con alguna línea suya. */
  atencionesAbiertas: number
  /** Si le queda algo por liquidar: lo cobrado, propinas, adelantos, vales o ajustes. */
  tienePlataPendiente: boolean
}

/** El miembro, sólo si es de este negocio y está en el equipo. `null` = 404. */
export async function miembroParaSacar(db: Db, businessId: string, memberId: string) {
  return db.businessMember.findFirst({
    where: { id: memberId, businessId, ...EN_EL_EQUIPO },
    select: { id: true, businessId: true, role: true, userId: true, user: { select: { name: true } } },
  })
}

export async function resumenDeSalida(db: Db, businessId: string, memberId: string, ahora: Date): Promise<ResumenDeSalida> {
  const { zona, liquidarDesde } = await leerNegocioParaLiquidar(db, businessId)
  // Lo cobrado antes de "Liquidar desde" nunca entra a una liquidación: no es plata pendiente.
  const corte = liquidarDesde ? inicioDelPeriodoEn(liquidarDesde, zona) : null
  const desdeElCorte = corte ? { gte: corte } : undefined

  const [citasPorDelante, atencionesAbiertas, lineas, propinas, movimientos] = await Promise.all([
    db.appointment.count({
      where: { businessId, memberId, status: { in: [...ESTADOS_DE_CITA_POR_DELANTE] }, endTime: { gt: ahora } },
    }),
    db.visit.count({
      where: { businessId, status: { in: [...ESTADOS_ACTIVOS] }, services: { some: { memberId } } },
    }),
    db.visitService.count({
      where: {
        memberId,
        byOwner: false,
        liquidacionId: null,
        visit: { is: { businessId, status: "finalizada", ...(desdeElCorte ? { paidAt: desdeElCorte } : {}) } },
      },
    }),
    db.propinaDeAtencion.count({
      where: {
        businessId,
        memberId,
        liquidacionId: null,
        visit: { is: { status: "finalizada", ...(desdeElCorte ? { paidAt: desdeElCorte } : {}) } },
      },
    }),
    db.movimientoDeLiquidacion.count({ where: { businessId, memberId, liquidacionId: null, anuladoAt: null } }),
  ])

  return { citasPorDelante, atencionesAbiertas, tienePlataPendiente: lineas + propinas + movimientos > 0 }
}

/** Por qué no se la puede sacar todavía, en palabras de la dueña; `null` si se puede. */
export function motivoParaNoSacar(resumen: ResumenDeSalida, nombre: string): string | null {
  const { citasPorDelante: citas, atencionesAbiertas: abiertas } = resumen
  if (citas > 0) {
    return citas === 1
      ? `${nombre} tiene 1 hora por delante. Muévela a otra persona o cancélala desde la Agenda, y después vuelve a intentarlo.`
      : `${nombre} tiene ${citas} horas por delante. Muévelas a otra persona o cancélalas desde la Agenda, y después vuelve a intentarlo.`
  }
  if (abiertas > 0) {
    const atenciones = abiertas === 1 ? "una atención abierta" : `${abiertas} atenciones abiertas`
    return abiertas === 1
      ? `${nombre} tiene ${atenciones} en el Tablero. Cóbrala o anúlala, y después vuelve a intentarlo.`
      : `${nombre} tiene ${atenciones} en el Tablero. Cóbralas o anúlalas, y después vuelve a intentarlo.`
  }
  return null
}

/**
 * La archiva. Llamar dentro de una transacción, con el resumen recién leído en
 * la misma transacción y después de tomar el candado de la fila (`FOR UPDATE`).
 */
export async function archivarMiembro(db: Db, businessId: string, memberId: string, ahora: Date): Promise<void> {
  await db.businessMember.update({ where: { id: memberId }, data: { archivadoEn: ahora } })
  await Promise.all([
    db.workSchedule.deleteMany({ where: { businessId, memberId } }),
    db.timeBlock.deleteMany({ where: { businessId, memberId, endTime: { gt: ahora } } }),
    db.inscripcionEnEspera.updateMany({ where: { businessId, memberId, estado: "activa" }, data: { memberId: null } }),
  ])
}
