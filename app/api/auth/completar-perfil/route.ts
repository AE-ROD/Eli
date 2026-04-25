import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  nombreNegocio: z.string().min(2),
  tipoNegocio: z.string().min(1),
  teamSize: z.number().int().min(1).default(1),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const userId = (session!.user as any).id

  try {
    const body = await request.json()
    const { nombreNegocio, tipoNegocio, teamSize } = schema.parse(body)

    const existente = await prisma.business.findFirst({ where: { userId } })
    if (existente) {
      return NextResponse.json({ error: "Ya tienes un negocio configurado" }, { status: 400 })
    }

    const slugBase = nombreNegocio
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .substring(0, 50)

    let slug = slugBase
    let contador = 1
    while (await prisma.business.findUnique({ where: { slug } })) {
      slug = `${slugBase}-${contador++}`
    }

    const negocio = await prisma.business.create({
      data: {
        name: nombreNegocio,
        type: tipoNegocio,
        slug,
        teamSize,
        userId,
      },
    })

    return NextResponse.json(negocio)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    console.error("Error completando perfil:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
