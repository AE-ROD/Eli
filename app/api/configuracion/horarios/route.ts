import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// Resuelve el memberId efectivo para la sesión actual y el param recibido
function resolverMemberId(sessionUser: any, paramMemberId: string | null): string | null | false {
  const role = sessionUser.role as string

  if (role === "owner") {
    // Owner puede consultar/modificar cualquier member o su propio schedule (null)
    return paramMemberId ?? null
  }

  // Worker/admin solo puede operar con su propio memberId
  const propio = sessionUser.memberId as string | null
  if (!propio) return false // sin memberId en sesión, error de config
  return propio
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const paramMemberId = request.nextUrl.searchParams.get("memberId")
  const memberId = resolverMemberId(user, paramMemberId)

  if (memberId === false) {
    return NextResponse.json({ error: "Configuración de sesión inválida" }, { status: 400 })
  }

  const horarios = await prisma.workSchedule.findMany({
    where: { businessId: user.businessId, memberId: memberId ?? null },
    orderBy: { dayOfWeek: "asc" },
  })

  return NextResponse.json(horarios)
}

const horarioSchema = z.array(
  z.object({
    dayOfWeek: z.number().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    active: z.boolean(),
  })
)

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const paramMemberId = request.nextUrl.searchParams.get("memberId")
  const memberId = resolverMemberId(user, paramMemberId)

  if (memberId === false) {
    return NextResponse.json({ error: "Configuración de sesión inválida" }, { status: 400 })
  }

  // Verificar que el memberId pertenece al negocio del usuario (si es que viene uno)
  if (memberId) {
    const miembro = await prisma.businessMember.findUnique({
      where: { id: memberId },
      select: { businessId: true },
    })
    if (!miembro || miembro.businessId !== user.businessId) {
      return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })
    }
  }

  try {
    const body = await request.json()
    const horarios = horarioSchema.parse(body)
    const businessId = user.businessId

    await prisma.$transaction([
      prisma.workSchedule.deleteMany({ where: { businessId, memberId: memberId ?? null } }),
      prisma.workSchedule.createMany({
        data: horarios.map((h) => ({ ...h, businessId, memberId: memberId ?? null })),
      }),
    ])

    const resultado = await prisma.workSchedule.findMany({
      where: { businessId, memberId: memberId ?? null },
      orderBy: { dayOfWeek: "asc" },
    })

    return NextResponse.json(resultado)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
