import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { MAXIMO_DE_LINEAS_POR_ATENCION, PROFESIONAL_DUEÑO, aCentavos, esPrecioValido } from "@/lib/atenciones"
import { profesionalParaLinea, type Actor, type ProfesionalDeLinea } from "@/lib/permisos"
import { ErrorDeAtencion } from "@/lib/tablero"

/**
 * Cómo se convierte lo que manda el navegador en las líneas que se guardan.
 * Todo lo que se copia (nombre del servicio, nombre de quien lo hizo) sale de
 * la base y nunca del cuerpo: si no, cualquiera podría registrar "Color" a
 * nombre de un colega con el precio que quisiera y el historial lo creería.
 */

export const lineaPedidaSchema = z.object({
  servicioId: z.string().min(1),
  /**
   * Id de miembro, o `duenio` para el dueño. Para el profesional se ignora:
   * la línea queda a su nombre igual (`profesionalParaLinea`).
   */
  profesional: z.string().min(1).optional(),
  /** En unidades, con hasta dos decimales. Si no viene, el precio del catálogo. */
  precio: z
    .number()
    .refine(esPrecioValido, "El precio tiene que ser cero o más, sin pasar del tope, con hasta dos decimales")
    .optional(),
})

/**
 * Un pedido no trae más líneas de las que puede tener una atención: corta lo
 * absurdo antes de tocar la base. Que lo que quedó no pase de los topes lo
 * mira el endpoint después de escribir (`lineasDeLaAtencion`): la atención
 * entera si edita dueño o encargado, las líneas propias si edita un
 * profesional.
 */
export const lineasPedidasSchema = z.array(lineaPedidaSchema).max(MAXIMO_DE_LINEAS_POR_ATENCION)

export type LineaPedida = z.infer<typeof lineaPedidaSchema>

/** Una línea lista para insertar, salvo el `visitId`. El precio, en centavos como se guarda. */
export interface LineaResuelta {
  serviceId: string
  serviceName: string
  memberId: string | null
  byOwner: boolean
  professionalName: string
  priceCents: number
}

function profesionalPedido(valor: string | undefined): ProfesionalDeLinea {
  if (valor === PROFESIONAL_DUEÑO) return { memberId: null, byOwner: true }
  return { memberId: valor ?? null, byOwner: false }
}

const sinRepetidos = (valores: string[]) => [...new Set(valores)]

/**
 * Valida las líneas contra el negocio del actor y arma lo que se guarda.
 *
 * - El profesional de cada línea pasa por `profesionalParaLinea`: el
 *   profesional queda siempre a su nombre, aunque pida otro o pida al dueño.
 * - Toda línea nace con alguien que la hizo. Sin profesional no habría a
 *   quién atribuirle la comisión, y el tablero no podría avanzar.
 * - Servicio y miembro tienen que ser del negocio: uno ajeno o inexistente da
 *   404, igual que en el resto de los endpoints, y no confirma nada.
 * - Una línea nueva no puede ser de un servicio que el negocio dejó de
 *   ofrecer (400). Sí puede quedarse una que ya estaba: si no, una atención
 *   abierta con un servicio que se desactivó no se podría volver a guardar,
 *   ni siquiera para reasignar quién lo hizo. El pedido no trae ids de
 *   líneas, así que "ya estaba" se cuenta por servicio: se conservan tantas
 *   de ese servicio como había entre las que el pedido reemplaza
 *   (`serviciosReemplazados`).
 * - Sin precio en el cuerpo se usa el del catálogo; si el catálogo tampoco
 *   tiene uno que se pueda cobrar, se pide en vez de inventar un cero que se
 *   cobraría como cortesía.
 */
export async function resolverLineas(
  db: Prisma.TransactionClient,
  actor: Actor,
  pedidas: readonly LineaPedida[],
  serviciosReemplazados: readonly (string | null)[] = []
): Promise<LineaResuelta[]> {
  if (pedidas.length === 0) return []

  const asignaciones = pedidas.map((pedida) => profesionalParaLinea(actor, profesionalPedido(pedida.profesional)))
  if (asignaciones.some((asignada) => !asignada.byOwner && !asignada.memberId)) {
    throw new ErrorDeAtencion(400, "Cada servicio necesita a alguien que lo haga.")
  }

  const idsDeServicios = sinRepetidos(pedidas.map((pedida) => pedida.servicioId))
  const idsDeMiembros = sinRepetidos(asignaciones.flatMap((asignada) => (asignada.memberId ? [asignada.memberId] : [])))
  const llevaAlDueño = asignaciones.some((asignada) => asignada.byOwner)

  const [servicios, miembros, negocio] = await Promise.all([
    db.service.findMany({
      where: { businessId: actor.businessId, id: { in: idsDeServicios } },
      select: { id: true, name: true, price: true, active: true },
      take: idsDeServicios.length,
    }),
    idsDeMiembros.length === 0
      ? Promise.resolve([])
      : db.businessMember.findMany({
          where: { businessId: actor.businessId, id: { in: idsDeMiembros } },
          select: { id: true, user: { select: { name: true } } },
          take: idsDeMiembros.length,
        }),
    llevaAlDueño
      ? db.business.findUnique({ where: { id: actor.businessId }, select: { user: { select: { name: true } } } })
      : Promise.resolve(null),
  ])

  // Cuántas líneas de cada servicio había: son las que se pueden conservar
  // aunque el servicio ya no esté activo.
  const conservables = new Map<string, number>()
  for (const id of serviciosReemplazados) {
    if (id) conservables.set(id, (conservables.get(id) ?? 0) + 1)
  }

  const resueltas: LineaResuelta[] = []
  for (const [i, pedida] of pedidas.entries()) {
    const asignada = asignaciones[i]

    const servicio = servicios.find((s) => s.id === pedida.servicioId)
    if (!servicio) throw new ErrorDeAtencion(404, "Servicio no encontrado")

    if (!servicio.active) {
      const quedan = conservables.get(servicio.id) ?? 0
      if (quedan === 0) {
        throw new ErrorDeAtencion(400, `«${servicio.name}» ya no se ofrece: elige otro servicio.`)
      }
      conservables.set(servicio.id, quedan - 1)
    }

    const nombreProfesional = asignada.byOwner
      ? negocio?.user.name
      : miembros.find((m) => m.id === asignada.memberId)?.user.name
    if (nombreProfesional === undefined) throw new ErrorDeAtencion(404, "Profesional no encontrado")

    const precio = pedida.precio ?? servicio.price
    if (precio === null) {
      throw new ErrorDeAtencion(400, `«${servicio.name}» no tiene precio en el catálogo: indica cuánto se cobra.`)
    }
    // El del cuerpo ya lo validó zod; éste sólo puede ser el del catálogo,
    // que no tiene tope ni exige centavos exactos.
    if (!esPrecioValido(precio)) {
      throw new ErrorDeAtencion(400, `El precio de «${servicio.name}» en el catálogo no se puede cobrar así: indica cuánto se cobra.`)
    }

    resueltas.push({
      serviceId: servicio.id,
      serviceName: servicio.name,
      memberId: asignada.memberId,
      byOwner: asignada.byOwner,
      professionalName: nombreProfesional,
      priceCents: aCentavos(precio),
    })
  }
  return resueltas
}
