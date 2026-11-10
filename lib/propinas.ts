import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { MAXIMO_DE_PROPINAS, PROFESIONAL_DUEÑO, aCentavos, esMontoDePagoValido } from "@/lib/atenciones"
import { esMedioDePago } from "@/lib/medios-de-pago"
import type { Actor } from "@/lib/permisos"
import { ErrorDeAtencion } from "@/lib/tablero"

/**
 * Propinas (#66): lo que el cliente deja para quien lo atendió, aparte del
 * total. Van 100 % al profesional, sin descontar comisión de tarjeta, y se le
 * pagan en la liquidación; la de la dueña no entra a ninguna.
 *
 * Viven en su propia tabla (`atencion_propinas`) y no en los pagos: los pagos
 * siguen sumando exactamente el total, así que los ingresos del inicio y de
 * los reportes (que suman pagos) no cambian con o sin propina.
 *
 * Se anotan al cobrar, así que las registra quien cobra
 * (`puedeRegistrarPropina`). Una atención anulada antes de liquidar deja de
 * contar por su estado: la propina queda, pero la liquidación sólo suma las
 * de atenciones finalizadas.
 */

/** Un id de miembro es un cuid; 64 sobra y corta un valor absurdo. */
const LARGO_MAXIMO_DE_ID = 64

/**
 * Sólo la forma. Que el medio exista y que el monto sea válido lo decide
 * `errorDePropinas`, con un mensaje que se puede mostrar en la caja.
 */
export const propinaPedidaSchema = z.object({
  /** Id de miembro, o `duenio` para la dueña. */
  profesional: z.string().min(1).max(LARGO_MAXIMO_DE_ID),
  /** En unidades, con hasta dos decimales. */
  monto: z.number(),
  medio: z.string(),
})

export const propinasPedidasSchema = z
  .array(propinaPedidaSchema)
  .max(MAXIMO_DE_PROPINAS, `Hasta ${MAXIMO_DE_PROPINAS} propinas por cobro.`)

export type PropinaPedida = z.infer<typeof propinaPedidaSchema>

/** Por qué las propinas no se pueden registrar, o `null` si están bien. */
export function errorDePropinas(propinas: readonly PropinaPedida[]): string | null {
  if (propinas.length > MAXIMO_DE_PROPINAS) return `Hasta ${MAXIMO_DE_PROPINAS} propinas por cobro.`
  if (propinas.some((propina) => !esMedioDePago(propina.medio))) {
    return "Hay una propina con un medio de pago que no existe."
  }
  if (propinas.some((propina) => !esMontoDePagoValido(propina.monto))) {
    return "Cada propina tiene que ser mayor que cero y con hasta dos decimales."
  }
  return null
}

/** Una propina lista para insertar, salvo `businessId` y `visitId`. */
export interface PropinaResuelta {
  memberId: string | null
  byOwner: boolean
  professionalName: string
  method: string
  amountCents: number
}

/** El 400 de una propina para alguien que no atendió esa atención. */
export const MENSAJE_PROPINA_A_QUIEN_NO_ATENDIO =
  "Una propina sólo puede ir a quien atendió esta atención: elige a alguien con un servicio o producto en ella."

/**
 * Valida a quién va cada propina y arma lo que se guarda. El nombre se copia
 * de la base, nunca del cuerpo. Un miembro de otro negocio, o uno que no
 * existe, da 404 como en el resto de los endpoints. Sólo puede recibirla
 * quien atendió esa atención (§7: "para quien atendió"): un miembro con
 * alguna línea suya en `visitId`, o la dueña si tiene una línea a su nombre;
 * cualquier otro, 400. La forma, el medio y el monto ya los validó
 * `errorDePropinas`.
 */
export async function resolverPropinas(
  db: Prisma.TransactionClient,
  actor: Actor,
  visitId: string,
  pedidas: readonly PropinaPedida[]
): Promise<PropinaResuelta[]> {
  if (pedidas.length === 0) return []

  const idsDeMiembros = [
    ...new Set(pedidas.flatMap((pedida) => (pedida.profesional === PROFESIONAL_DUEÑO ? [] : [pedida.profesional]))),
  ]
  const llevaALaDueña = pedidas.some((pedida) => pedida.profesional === PROFESIONAL_DUEÑO)

  const [miembros, negocio, lineas] = await Promise.all([
    idsDeMiembros.length === 0
      ? Promise.resolve([])
      : db.businessMember.findMany({
          where: { businessId: actor.businessId, id: { in: idsDeMiembros } },
          select: { id: true, user: { select: { name: true } } },
          take: idsDeMiembros.length,
        }),
    llevaALaDueña
      ? db.business.findUnique({ where: { id: actor.businessId }, select: { user: { select: { name: true } } } })
      : Promise.resolve(null),
    db.visitService.findMany({
      where: { visitId, visit: { is: { businessId: actor.businessId } } },
      select: { memberId: true, byOwner: true },
    }),
  ])
  const atendieron = new Set(
    lineas.flatMap((linea) => (linea.byOwner ? [PROFESIONAL_DUEÑO] : linea.memberId ? [linea.memberId] : []))
  )

  return pedidas.map((pedida) => {
    const deLaDueña = pedida.profesional === PROFESIONAL_DUEÑO
    const nombre = deLaDueña
      ? negocio?.user.name
      : miembros.find((miembro) => miembro.id === pedida.profesional)?.user.name
    if (nombre === undefined) throw new ErrorDeAtencion(404, "Profesional no encontrado")
    if (!atendieron.has(pedida.profesional)) throw new ErrorDeAtencion(400, MENSAJE_PROPINA_A_QUIEN_NO_ATENDIO)
    return {
      memberId: deLaDueña ? null : pedida.profesional,
      byOwner: deLaDueña,
      professionalName: nombre,
      method: pedida.medio,
      amountCents: aCentavos(pedida.monto),
    }
  })
}
