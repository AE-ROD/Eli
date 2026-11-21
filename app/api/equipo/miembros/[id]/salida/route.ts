import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeGestionarEquipo, puedeSacarDelEquipo } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { archivarMiembro, miembroParaSacar, motivoParaNoSacar, resumenDeSalida } from "@/lib/sacar-del-equipo"

/**
 * Sacar a alguien del equipo (`lib/sacar-del-equipo.ts`).
 *
 * GET  — lo que hay que saber antes de confirmar: horas por delante, atenciones
 *        abiertas y si le queda plata por liquidar.
 * POST — la saca (la archiva). 409 si todavía tiene horas por delante o una
 *        atención abierta, con el motivo en palabras de la dueña.
 *
 * Gestionan el equipo dueña y encargado; a quién puede sacar cada uno lo dice
 * `puedeSacarDelEquipo`. Un integrante de otro negocio, o que ya no está, es
 * 404; uno del negocio al que este actor no puede sacar, 403. El límite de
 * peticiones es el genérico del panel (`proxy.ts`).
 */

type Contexto = { params: Promise<{ id: string }> }

const noEncontrado = () => NextResponse.json({ error: "Integrante no encontrado" }, { status: 404 })
const noPuede = () =>
  NextResponse.json({ error: "No puedes sacar a esta persona del equipo. El encargado saca sólo a profesionales." }, { status: 403 })

export async function GET(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeGestionarEquipo(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params

  try {
    const miembro = await miembroParaSacar(prisma, actor.businessId, id)
    if (!miembro) return noEncontrado()
    if (!puedeSacarDelEquipo(actor, miembro)) return noPuede()

    const resumen = await resumenDeSalida(prisma, actor.businessId, miembro.id, new Date())
    return NextResponse.json({ ...resumen, motivoParaNoSacar: motivoParaNoSacar(resumen, miembro.user.name) })
  } catch (error) {
    registrarError("revisando si se puede sacar a alguien del equipo", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

class NoSePuedeSacar extends Error {}

export async function POST(_request: NextRequest, { params }: Contexto) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeGestionarEquipo(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // El candado de la fila: dos "sacar" a la vez, o un cambio de rol en
      // medio, esperan a que éste termine y leen lo que dejó.
      await tx.$queryRaw`SELECT id FROM miembros_negocio WHERE id = ${id} AND "businessId" = ${actor.businessId} FOR UPDATE`
      const miembro = await miembroParaSacar(tx, actor.businessId, id)
      if (!miembro) return { estado: "no-encontrado" as const }
      if (!puedeSacarDelEquipo(actor, miembro)) return { estado: "no-puede" as const }

      const ahora = new Date()
      const resumen = await resumenDeSalida(tx, actor.businessId, miembro.id, ahora)
      const motivo = motivoParaNoSacar(resumen, miembro.user.name)
      if (motivo) throw new NoSePuedeSacar(motivo)

      await archivarMiembro(tx, actor.businessId, miembro.id, ahora)
      return { estado: "listo" as const, tienePlataPendiente: resumen.tienePlataPendiente }
    })

    if (resultado.estado === "no-encontrado") return noEncontrado()
    if (resultado.estado === "no-puede") return noPuede()
    return NextResponse.json({ ok: true, tienePlataPendiente: resultado.tienePlataPendiente })
  } catch (error) {
    if (error instanceof NoSePuedeSacar) return NextResponse.json({ error: error.message }, { status: 409 })
    registrarError("sacando a alguien del equipo", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
