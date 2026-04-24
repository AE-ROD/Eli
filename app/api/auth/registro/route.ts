import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

function generarSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .substring(0, 50)
}

async function slugUnico(base: string): Promise<string> {
  let slug = generarSlug(base)
  let intento = slug
  let contador = 1
  while (await prisma.business.findUnique({ where: { slug: intento } })) {
    intento = `${slug}-${contador++}`
  }
  return intento
}

const registroSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  contrasena: z.string().min(8),
  nombreNegocio: z.string().min(2),
  tipoNegocio: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const datos = registroSchema.parse(body)

    const usuarioExistente = await prisma.user.findUnique({
      where: { email: datos.email },
    })

    if (usuarioExistente) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con ese correo" },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(datos.contrasena, 12)
    const slug = await slugUnico(datos.nombreNegocio)

    const usuario = await prisma.user.create({
      data: {
        name: datos.nombre,
        email: datos.email,
        password: passwordHash,
        business: {
          create: {
            name: datos.nombreNegocio,
            type: datos.tipoNegocio,
            slug,
          },
        },
      },
      include: { business: true },
    })

    return NextResponse.json({
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      businessId: usuario.business?.id,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", detalles: error.errors },
        { status: 400 }
      )
    }
    console.error("Error en registro:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
