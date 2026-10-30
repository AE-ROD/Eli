import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { MAXIMO_DE_LINEAS_POR_ATENCION, PROFESIONAL_DUEÑO, aCentavos, esPrecioValido } from "@/lib/atenciones"
import { comisionParaCongelar, porcentajeDeLinea, type PorcentajesVigentes } from "@/lib/comisiones"
import { profesionalParaLinea, whereDeProductos, type Actor, type ProfesionalDeLinea } from "@/lib/permisos"
import { ErrorDeAtencion } from "@/lib/tablero"

/**
 * Cómo se convierte lo que manda el navegador en las líneas que se guardan.
 * Todo lo que se copia (nombre del servicio, nombre de quien lo hizo) sale de
 * la base y nunca del cuerpo: si no, cualquiera podría registrar "Color" a
 * nombre de un colega con el precio que quisiera y el historial lo creería.
 */

export const lineaPedidaSchema = z
  .object({
    /** Una línea es de un servicio o de un producto (#67): uno de los dos, nunca ambos. */
    servicioId: z.string().min(1).optional(),
    productoId: z.string().min(1).optional(),
    /**
     * Id de miembro, o `duenio` para el dueño. Para el profesional se ignora:
     * la línea queda a su nombre igual (`profesionalParaLinea`). En un
     * producto es quien lo vendió.
     */
    profesional: z.string().min(1).optional(),
    /** En unidades, con hasta dos decimales. Si no viene, el precio del catálogo. */
    precio: z
      .number()
      .refine(esPrecioValido, "El precio tiene que ser cero o más, sin pasar del tope, con hasta dos decimales")
      .optional(),
  })
  .refine((linea) => (linea.servicioId === undefined) !== (linea.productoId === undefined), {
    message: "Cada línea es un servicio o un producto: indica uno de los dos",
  })

/**
 * Un pedido no trae más líneas de las que puede tener una atención: corta lo
 * absurdo antes de tocar la base. Que lo que quedó no pase de los topes lo
 * mira el endpoint después de escribir (`lineasDeLaAtencion`): el de
 * servicios, sobre la atención entera, edite quien edite; el del total, sobre
 * la atención entera si edita dueño o encargado, y sobre sus líneas si edita
 * un profesional.
 */
export const lineasPedidasSchema = z.array(lineaPedidaSchema).max(MAXIMO_DE_LINEAS_POR_ATENCION)

export type LineaPedida = z.infer<typeof lineaPedidaSchema>

/**
 * Una línea lista para insertar, salvo el `visitId`. El precio, en centavos
 * como se guarda. Una de producto lleva `tipo` y `productId`, y `serviceId`
 * en null (lo exige un CHECK); `serviceName` guarda el nombre copiado en los
 * dos casos. Sin `tipo`, la base la guarda como servicio.
 */
export interface LineaResuelta {
  serviceId: string | null
  tipo?: "servicio" | "producto"
  productId?: string | null
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

/** Lo que ya tenía la atención entre las líneas que el pedido reemplaza: qué servicio o producto era cada una. */
export interface LineaReemplazada {
  serviceId: string | null
  productId: string | null
}

/**
 * Cuántas líneas de cada servicio o producto había entre las que se
 * reemplazan: son las que se pueden conservar aunque ya no esté activo.
 */
function contarConservables(reemplazadas: readonly LineaReemplazada[]) {
  const servicios = new Map<string, number>()
  const productos = new Map<string, number>()
  for (const linea of reemplazadas) {
    if (linea.serviceId) servicios.set(linea.serviceId, (servicios.get(linea.serviceId) ?? 0) + 1)
    if (linea.productId) productos.set(linea.productId, (productos.get(linea.productId) ?? 0) + 1)
  }
  return { servicios, productos }
}

/** Gasta una de las conservables de `id`; `false` si no quedaba ninguna. */
function gastarConservable(conservables: Map<string, number>, id: string): boolean {
  const quedan = conservables.get(id) ?? 0
  if (quedan === 0) return false
  conservables.set(id, quedan - 1)
  return true
}

/**
 * Valida las líneas contra el negocio del actor y arma lo que se guarda.
 *
 * - El profesional de cada línea pasa por `profesionalParaLinea`: el
 *   profesional queda siempre a su nombre, aunque pida otro o pida al dueño.
 *   En un producto, es quien lo vendió.
 * - Toda línea nace con alguien que la hizo. Sin profesional no habría a
 *   quién atribuirle la comisión, y el tablero no podría avanzar.
 * - Servicio, producto y miembro tienen que ser del negocio: uno ajeno o
 *   inexistente da 404, igual que en el resto de los endpoints, y no
 *   confirma nada.
 * - Una línea nueva no puede ser de un servicio que el negocio dejó de
 *   ofrecer ni de un producto que dejó de vender (400). Sí puede quedarse una
 *   que ya estaba: si no, una atención abierta con algo que se desactivó no
 *   se podría volver a guardar, ni siquiera para reasignar quién lo hizo. El
 *   pedido no trae ids de líneas, así que "ya estaba" se cuenta por servicio
 *   o producto: se conservan tantas como había entre las que el pedido
 *   reemplaza (`reemplazadas`).
 * - Sin precio en el cuerpo se usa el del catálogo; si el catálogo tampoco
 *   tiene uno que se pueda cobrar, se pide en vez de inventar un cero que se
 *   cobraría como cortesía.
 */
export async function resolverLineas(
  db: Prisma.TransactionClient,
  actor: Actor,
  pedidas: readonly LineaPedida[],
  reemplazadas: readonly LineaReemplazada[] = []
): Promise<LineaResuelta[]> {
  if (pedidas.length === 0) return []

  const asignaciones = pedidas.map((pedida) => profesionalParaLinea(actor, profesionalPedido(pedida.profesional)))
  if (asignaciones.some((asignada) => !asignada.byOwner && !asignada.memberId)) {
    throw new ErrorDeAtencion(400, "Cada servicio necesita a alguien que lo haga.")
  }

  const idsDeServicios = sinRepetidos(pedidas.flatMap((pedida) => (pedida.servicioId ? [pedida.servicioId] : [])))
  const idsDeProductos = sinRepetidos(pedidas.flatMap((pedida) => (pedida.productoId ? [pedida.productoId] : [])))
  const idsDeMiembros = sinRepetidos(asignaciones.flatMap((asignada) => (asignada.memberId ? [asignada.memberId] : [])))
  const llevaAlDueño = asignaciones.some((asignada) => asignada.byOwner)

  const [servicios, productos, miembros, negocio] = await Promise.all([
    idsDeServicios.length === 0
      ? Promise.resolve([])
      : db.service.findMany({
          where: { businessId: actor.businessId, id: { in: idsDeServicios } },
          select: { id: true, name: true, price: true, active: true },
          take: idsDeServicios.length,
        }),
    idsDeProductos.length === 0
      ? Promise.resolve([])
      : db.producto.findMany({
          where: whereDeProductos(actor, { id: { in: idsDeProductos } }),
          select: { id: true, name: true, priceCents: true, active: true },
          take: idsDeProductos.length,
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

  const conservables = contarConservables(reemplazadas)

  const resueltas: LineaResuelta[] = []
  for (const [i, pedida] of pedidas.entries()) {
    const asignada = asignaciones[i]

    const nombreProfesional = asignada.byOwner
      ? negocio?.user.name
      : miembros.find((m) => m.id === asignada.memberId)?.user.name

    if (pedida.productoId) {
      const producto = productos.find((p) => p.id === pedida.productoId)
      if (!producto) throw new ErrorDeAtencion(404, "Producto no encontrado")
      if (!producto.active && !gastarConservable(conservables.productos, producto.id)) {
        throw new ErrorDeAtencion(400, `«${producto.name}» ya no se vende: elige otro producto.`)
      }
      if (nombreProfesional === undefined) throw new ErrorDeAtencion(404, "Profesional no encontrado")

      // En el catálogo el precio del producto ya está en centavos.
      const priceCents = pedida.precio !== undefined ? aCentavos(pedida.precio) : producto.priceCents
      if (priceCents === null) {
        throw new ErrorDeAtencion(400, `«${producto.name}» no tiene precio en el catálogo: indica cuánto se cobra.`)
      }

      resueltas.push({
        serviceId: null,
        tipo: "producto",
        productId: producto.id,
        serviceName: producto.name,
        memberId: asignada.memberId,
        byOwner: asignada.byOwner,
        professionalName: nombreProfesional,
        priceCents,
      })
      continue
    }

    const servicio = servicios.find((s) => s.id === pedida.servicioId)
    if (!servicio) throw new ErrorDeAtencion(404, "Servicio no encontrado")

    if (!servicio.active && !gastarConservable(conservables.servicios, servicio.id)) {
      throw new ErrorDeAtencion(400, `«${servicio.name}» ya no se ofrece: elige otro servicio.`)
    }

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

// ─── Comisión congelada al cobrar (#65) ──────────────────────────────────────

/**
 * Las líneas todavía sin comisión congelada de la atención, con los % que
 * les tocan hoy (la cascada de `lib/comisiones.ts`). Los % se leen siempre
 * acotados al negocio: un `CommissionRate` o un producto de otro negocio
 * nunca entra a la cascada. Sirve para congelar al cobrar y para avisar,
 * antes de cobrar, qué líneas quedarían sin % (#118).
 */
async function lineasSinCongelarConSusPorcentajes(db: Prisma.TransactionClient, businessId: string, visitId: string) {
  const lineas = await db.visitService.findMany({
    where: { visitId, visit: { is: { businessId } }, commissionAt: null },
    select: {
      id: true,
      tipo: true,
      byOwner: true,
      memberId: true,
      serviceId: true,
      productId: true,
      priceCents: true,
    },
    orderBy: { id: "asc" },
    take: MAXIMO_DE_LINEAS_POR_ATENCION,
  })
  if (lineas.length === 0) return null

  const paraCascada = lineas.map((linea) => ({ ...linea, tipo: linea.tipo === "producto" ? ("producto" as const) : ("servicio" as const) }))
  const deMiembros = paraCascada.filter((linea) => !linea.byOwner && linea.memberId)
  const idsDeMiembros = sinRepetidos(deMiembros.flatMap((linea) => (linea.memberId ? [linea.memberId] : [])))
  const idsDeServicios = sinRepetidos(deMiembros.flatMap((linea) => (linea.serviceId ? [linea.serviceId] : [])))
  const idsDeProductos = sinRepetidos(deMiembros.flatMap((linea) => (linea.productId ? [linea.productId] : [])))

  const [miembros, excepciones, productos] = await Promise.all([
    idsDeMiembros.length === 0
      ? Promise.resolve([])
      : db.businessMember.findMany({
          where: { businessId, id: { in: idsDeMiembros } },
          select: { id: true, commissionPercent: true },
          take: idsDeMiembros.length,
        }),
    idsDeMiembros.length === 0 || idsDeServicios.length === 0
      ? Promise.resolve([])
      : db.commissionRate.findMany({
          where: { businessId, memberId: { in: idsDeMiembros }, serviceId: { in: idsDeServicios } },
          select: { memberId: true, serviceId: true, percent: true },
          take: idsDeMiembros.length * idsDeServicios.length,
        }),
    idsDeProductos.length === 0
      ? Promise.resolve([])
      : db.producto.findMany({
          where: { businessId, id: { in: idsDeProductos } },
          select: { id: true, commissionPercent: true },
          take: idsDeProductos.length,
        }),
  ])

  const porExcepcion = new Map<string, Map<string, number>>()
  for (const tasa of excepciones) {
    const delMiembro = porExcepcion.get(tasa.memberId) ?? new Map<string, number>()
    delMiembro.set(tasa.serviceId, tasa.percent)
    porExcepcion.set(tasa.memberId, delMiembro)
  }
  const vigentes: PorcentajesVigentes = {
    porMiembro: new Map(miembros.map((miembro) => [miembro.id, miembro.commissionPercent])),
    excepciones: porExcepcion,
    porProducto: new Map(productos.map((producto) => [producto.id, producto.commissionPercent])),
  }
  return { lineas: paraCascada, vigentes }
}

/**
 * Las líneas de la atención que, si se cobrara ahora, quedarían sin % de
 * comisión (pendientes), por id y en el orden de la atención. Sólo avisa:
 * el cobro no se frena por eso (#118). No escribe.
 */
export async function lineasQueQuedaranSinPorcentaje(
  db: Prisma.TransactionClient,
  businessId: string,
  visitId: string
): Promise<string[]> {
  const leidas = await lineasSinCongelarConSusPorcentajes(db, businessId, visitId)
  if (!leidas) return []
  return leidas.lineas.filter((linea) => porcentajeDeLinea(linea, leidas.vigentes).tipo === "pendiente").map((linea) => linea.id)
}

/**
 * Congela la comisión de cada línea de la atención con los % vigentes, dentro
 * de la transacción del cobro y después de tomar la fila (`tomarAtencion`):
 * un segundo cobro no llega acá, así que nada se congela dos veces. Lo
 * congelado no se recalcula nunca: cambiar un % después no toca lo cobrado
 * (en la base lo impide además el trigger `atencion_servicios_comision_inmutable`).
 *
 * La cascada es la de `lib/comisiones.ts`. Lo que devuelve "pendiente" (falta
 * el %) queda con las tres columnas en null, nunca en 0, y el cobro sigue: se
 * cuenta para avisar. Lo de la dueña o de un ex-miembro no lleva comisión.
 *
 * Devuelve cuántas líneas quedaron pendientes de %.
 */
export async function congelarComisiones(
  tx: Prisma.TransactionClient,
  businessId: string,
  visitId: string,
  ahora: Date
): Promise<{ pendientes: number }> {
  const leidas = await lineasSinCongelarConSusPorcentajes(tx, businessId, visitId)
  if (!leidas) return { pendientes: 0 }
  const { lineas, vigentes } = leidas
  const deLaAtencion = { visitId, visit: { is: { businessId } } }

  let pendientes = 0
  for (const linea of lineas) {
    if (porcentajeDeLinea(linea, vigentes).tipo === "pendiente") pendientes += 1
    const comision = comisionParaCongelar(linea, vigentes, ahora)
    if (!comision.commissionAt) continue
    // Sólo si sigue sin congelar y es de este negocio: nunca se pisa una
    // comisión ya congelada.
    await tx.visitService.updateMany({
      where: { AND: [{ id: linea.id, commissionAt: null }, deLaAtencion] },
      data: comision,
    })
  }
  return { pendientes }
}
