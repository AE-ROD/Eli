import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeQuitarDeListaDeEspera, puedeVerListaDeEspera, whereDeListaDeEspera } from "@/lib/permisos"
import { esFechaCalendario } from "@/lib/zona-horaria"

/**
 * La lista de espera de un día en el panel (#74), dentro de la Agenda. Sólo
 * gestión: dueña y encargado (`puedeVerListaDeEspera`); al resto, 401. Todo
 * pasa por `whereDeListaDeEspera`, así que lo de otro negocio no existe (404).
 * El límite es el del panel (`proxy.ts`).
 *
 * - GET `?fecha=AAAA-MM-DD`: las inscripciones activas de ese día.
 * - DELETE `?id=`: quitar a alguien. Se borra la fila: la lista tiene datos
 *   de personas que quizá ni son clientes, y una quitada no vuelve.
 */

const TOPE = 200

const fechaSchema = z.string().refine(esFechaCalendario, "La fecha no es válida: tiene que tener el formato AAAA-MM-DD")
const idSchema = z.string().min(1, "Falta la inscripción").max(64, "La inscripción no es válida")

const noAutorizado = () => NextResponse.json({ error: "No autorizado" }, { status: 401 })

export async function GET(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeVerListaDeEspera(actor)) return noAutorizado()

  const fecha = fechaSchema.safeParse(new URL(request.url).searchParams.get("fecha") ?? "")
  if (!fecha.success) return NextResponse.json({ error: fecha.error.issues[0].message }, { status: 400 })

  const filas = await prisma.inscripcionEnEspera.findMany({
    where: whereDeListaDeEspera(actor, { fecha: fecha.data, estado: "activa" }),
    select: {
      id: true,
      nombre: true,
      apellido: true,
      email: true,
      telefono: true,
      whatsappConsentAt: true,
      avisos: true,
      createdAt: true,
      service: { select: { name: true } },
      member: { select: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
    take: TOPE,
  })

  return NextResponse.json({
    inscripciones: filas.map((fila) => ({
      id: fila.id,
      nombre: `${fila.nombre} ${fila.apellido}`.trim(),
      email: fila.email,
      telefono: fila.telefono,
      whatsapp: fila.whatsappConsentAt !== null,
      servicio: fila.service?.name ?? null,
      profesional: fila.member?.user?.name ?? null,
      avisos: fila.avisos,
      inscritaEl: fila.createdAt,
    })),
  })
}

export async function DELETE(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeQuitarDeListaDeEspera(actor)) return noAutorizado()

  const id = idSchema.safeParse(new URL(request.url).searchParams.get("id") ?? "")
  if (!id.success) return NextResponse.json({ error: id.error.issues[0].message }, { status: 400 })

  const { count } = await prisma.inscripcionEnEspera.deleteMany({ where: whereDeListaDeEspera(actor, { id: id.data }) })
  if (count === 0) return NextResponse.json({ error: "Inscripción no encontrada" }, { status: 404 })
  return NextResponse.json({ mensaje: "Quitada de la lista de espera" })
}
