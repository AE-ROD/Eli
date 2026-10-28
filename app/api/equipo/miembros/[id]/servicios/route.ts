import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, gestionaElNegocio, puedeDefinirServiciosDe } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

/**
 * Los servicios que hace un profesional (`MemberService`). Sin filas, hace
 * todos los del negocio: es lo que tiene todo miembro hasta que alguien lo
 * acota, así que ningún negocio cambia por existir esto. La reserva pública
 * sólo ofrece a un profesional para los servicios que hace.
 *
 * Dueño y encargado (`puedeDefinirServiciosDe`). El miembro y cada servicio
 * tienen que ser del negocio de la sesión: si no, 404, como si no existieran.
 * El límite de peticiones es el genérico del panel (`proxy.ts`).
 */

/** Tope de servicios por pedido: un negocio no tiene más de 200 (es el tope de la lista del panel). */
const MAXIMO_DE_SERVICIOS = 200

const noEncontrado = () => NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })

const servicioId = z.string({ invalid_type_error: "El servicio no es válido" }).min(1).max(64, "El servicio no es válido")

const definirSchema = z.discriminatedUnion("todos", [
  z.object({ todos: z.literal(true) }),
  z.object({
    todos: z.literal(false),
    serviceIds: z
      .array(servicioId, { required_error: "Faltan los servicios", invalid_type_error: "Los servicios no son válidos" })
      .min(1, "Elige al menos un servicio, o marca \"Todos\"")
      .max(MAXIMO_DE_SERVICIOS, `Puedes elegir hasta ${MAXIMO_DE_SERVICIOS} servicios`),
  }),
], { errorMap: () => ({ message: "Indica si hace todos los servicios o cuáles" }) })

type Contexto = { params: Promise<{ id: string }> }

/** El miembro, sólo si es del negocio del actor. */
async function miembroDelNegocio(id: string, businessId: string) {
  return prisma.businessMember.findFirst({ where: { id, businessId }, select: { id: true, businessId: true } })
}

async function serviciosDelMiembro(memberId: string, businessId: string) {
  const filas = await prisma.memberService.findMany({
    where: { memberId, businessId },
    select: { serviceId: true },
    take: MAXIMO_DE_SERVICIOS,
  })
  const serviceIds = filas.map((fila) => fila.serviceId)
  return { todos: serviceIds.length === 0, serviceIds }
}

// GET /api/equipo/miembros/[id]/servicios — { todos, serviceIds }
export async function GET(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !gestionaElNegocio(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const miembro = await miembroDelNegocio(id, actor.businessId)
  if (!miembro || !puedeDefinirServiciosDe(actor, miembro)) return noEncontrado()

  return NextResponse.json(await serviciosDelMiembro(miembro.id, actor.businessId))
}

// PUT /api/equipo/miembros/[id]/servicios — { todos: true } o { todos: false, serviceIds }
export async function PUT(request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !gestionaElNegocio(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const miembro = await miembroDelNegocio(id, actor.businessId)
  if (!miembro || !puedeDefinirServiciosDe(actor, miembro)) return noEncontrado()

  const datos = definirSchema.safeParse(await cuerpoDelPedido(request))
  if (!datos.success) return respuestaDeDatosInvalidos(datos.error)

  const serviceIds = datos.data.todos ? [] : [...new Set(datos.data.serviceIds)]

  // Cada servicio tiene que ser de este negocio. Uno ajeno o inexistente es
  // 404 y no se guarda nada: ni siquiera los que sí eran del negocio.
  if (serviceIds.length > 0) {
    const delNegocio = await prisma.service.count({ where: { id: { in: serviceIds }, businessId: actor.businessId } })
    if (delNegocio !== serviceIds.length) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }
  }

  // Reemplazo entero: borrar y crear en una transacción, para que nadie lea
  // el instante intermedio sin filas (que sería "hace todos").
  await prisma.$transaction(async (tx) => {
    await tx.memberService.deleteMany({ where: { memberId: miembro.id, businessId: actor.businessId } })
    if (serviceIds.length > 0) {
      await tx.memberService.createMany({
        data: serviceIds.map((serviceId) => ({ memberId: miembro.id, serviceId, businessId: actor.businessId })),
      })
    }
  })

  return NextResponse.json(await serviciosDelMiembro(miembro.id, actor.businessId))
}
