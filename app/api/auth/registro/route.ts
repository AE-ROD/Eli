import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

function generarSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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

// T15: Default weekly schedules by business type
function horariosDefault(tipo: string): Array<{ dayOfWeek: number; startTime: string; endTime: string }> {
  const tipo_n = tipo.toLowerCase()
  const esBarberiaOSpa = ["barberia", "barbershop", "spa", "salon", "salón", "peluqueria", "peluquería"].some(
    (t) => tipo_n.includes(t)
  )
  const esClinica = ["clinica", "clínica", "consultorio", "medico", "médico", "dental", "fisio"].some(
    (t) => tipo_n.includes(t)
  )

  if (esBarberiaOSpa) {
    // Mon–Sat 09:00–19:00
    return [1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startTime: "09:00", endTime: "19:00" }))
  }
  if (esClinica) {
    // Mon–Fri 08:00–18:00
    return [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startTime: "08:00", endTime: "18:00" }))
  }
  // Default: Mon–Fri 09:00–18:00
  return [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startTime: "09:00", endTime: "18:00" }))
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
    const horarios = horariosDefault(datos.tipoNegocio)

    const usuario = await prisma.$transaction(async (tx) => {
      const creado = await tx.user.create({
        data: {
          name: datos.nombre,
          email: datos.email,
          password: passwordHash,
          business: {
            create: {
              name: datos.nombreNegocio,
              type: datos.tipoNegocio,
              slug,
              workSchedules: {
                create: horarios,
              },
            },
          },
        },
        include: { business: true },
      })

      await tx.businessMember.create({
        data: {
          businessId: creado.business!.id,
          userId: creado.id,
          role: "admin",
          isOwner: true,
        },
      })

      return creado
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
