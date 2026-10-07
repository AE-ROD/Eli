import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { actorDeSesion, whereDeAgenda, whereDeClientes } from "@/lib/permisos"

const clienteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().or(z.literal("")),
})

/**
 * La paginación del listado. Lo que no sea un entero en rango cae al valor por
 * defecto en vez de llegar a Prisma. Con `parseInt`, un texto daba `NaN` y un
 * 500, y `limite=-100000` pasaba el tope de 50: `Math.min` no lo tocaba y
 * Prisma acepta `take` negativo, que lee desde el final. `safe()` porque
 * `skip` sale de multiplicar la página: pasado `Number.MAX_SAFE_INTEGER`
 * (`pagina=1e300`) deja de ser un entero exacto.
 */
const paginacionSchema = z.object({
  pagina: z.coerce.number().int().min(1).safe().catch(1),
  limite: z.coerce.number().int().min(1).max(50).catch(20),
})

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const busqueda = searchParams.get("q") ?? ""
  const etiqueta = searchParams.get("tag") ?? ""
  const { pagina, limite } = paginacionSchema.parse({
    pagina: searchParams.get("pagina") ?? undefined,
    limite: searchParams.get("limite") ?? undefined,
  })
  const skip = (pagina - 1) * limite

  const where = whereDeClientes(actor, {
    ...(busqueda && {
      OR: [
        { name: { contains: busqueda, mode: "insensitive" as const } },
        { email: { contains: busqueda, mode: "insensitive" as const } },
        { phone: { contains: busqueda, mode: "insensitive" as const } },
      ],
    }),
    ...(etiqueta && { tags: { has: etiqueta } }),
  })

  const [clientes, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        tags: true,
        notes: true,
        createdAt: true,
        // El cliente es del negocio, pero sus citas son agenda: el profesional
        // ve en el historial sólo las suyas, no las de sus colegas ni lo que
        // cobraron. Sin este `where`, el anidado traía las de todo el negocio.
        appointments: {
          where: whereDeAgenda(actor),
          orderBy: { startTime: "desc" },
          take: 5,
          // Lo que dibuja la vista (`CitaDeCliente`): ni notas internas ni
          // comentarios del cliente.
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            status: true,
            price: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
      skip,
    }),
    prisma.customer.count({ where }),
  ])

  return NextResponse.json({
    clientes,
    total,
    pagina,
    paginas: Math.ceil(total / limite),
  })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const datos = clienteSchema.parse(body)

    const cliente = await prisma.customer.create({
      data: {
        name: datos.name,
        email: datos.email || null,
        phone: datos.phone || null,
        tags: datos.tags ?? [],
        notes: datos.notes || null,
        businessId: actor.businessId,
      },
    })

    return NextResponse.json(cliente, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", detalles: error.errors },
        { status: 400 }
      )
    }
    console.error("Error creando cliente:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
