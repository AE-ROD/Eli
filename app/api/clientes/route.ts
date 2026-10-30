import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { emailOVacio, etiquetas, nombre, notas, telefonoChileno } from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { actorDeSesion, puedeEditarConsentimientoPromocional, whereDeAgenda, whereDeAtenciones, whereDeClientes, type Actor } from "@/lib/permisos"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { datosDeConsentimientoPromocional } from "@/lib/envios-a-clientes"

const clienteSchema = z.object({
  name: nombre(),
  email: emailOVacio().optional(),
  phone: telefonoChileno().optional(),
  tags: etiquetas().optional(),
  notes: notas().optional(),
  /** "Acepta recibir mensajes por WhatsApp", marcado en el formulario del panel. */
  whatsappConsent: z.boolean().optional(),
  /** "Quiere recibir avisos y novedades por correo" (promocional), marcado en el panel. */
  correoPromoConsent: z.boolean().optional(),
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

  // Los eliminados (anonimizados) no aparecen ni en la lista ni en los
  // buscadores de "Nueva cita" y "Anotar sin reserva", que usan este mismo
  // listado.
  const where = whereDeClientes(actor, {
    AND: [
      clienteNoEliminado,
      {
        ...(busqueda && {
          OR: [
            { name: { contains: busqueda, mode: "insensitive" as const } },
            { email: { contains: busqueda, mode: "insensitive" as const } },
            { phone: { contains: busqueda, mode: "insensitive" as const } },
          ],
        }),
        ...(etiqueta && { tags: { has: etiqueta } }),
      },
    ],
  })

  // Una visita es una atención cobrada (PRODUCTO.md, sección 7: la atención
  // es la visita del cliente al local, con o sin reserva). Una cita futura,
  // cancelada o marcada completada sin pasar por el cobro no es una visita.
  // Con el filtro del actor: el profesional cuenta sólo las suyas, igual que
  // ve sólo sus citas en el historial.
  const visitasCobradas = whereDeAtenciones(actor, { status: "finalizada" })

  const [encontrados, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        lastName: true,
        email: true,
        phone: true,
        tags: true,
        notes: true,
        whatsappConsentAt: true,
        correoPromoConsentAt: true,
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
            confirmacionPorFaltas: true,
          },
        },
        visits: {
          where: visitasCobradas,
          orderBy: { arrivedAt: "desc" },
          take: 1,
          select: { arrivedAt: true },
        },
        _count: {
          select: {
            visits: { where: visitasCobradas },
            // "No vino": las citas que el negocio marcó como inasistencia. Con
            // el filtro de agenda, como el historial: el profesional cuenta
            // sólo las suyas.
            appointments: { where: whereDeAgenda(actor, { status: "no-asistio" }) },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
      skip,
    }),
    prisma.customer.count({ where }),
  ])

  const proximas = await proximasCitas(
    actor,
    encontrados.map((cliente) => cliente.id)
  )

  // `visitas`, `inasistencias`, `ultimaVisita` y `proximaCita` ya resueltos: la pantalla no
  // vuelve a contar sobre el historial, que trae sólo las últimas cinco citas.
  const clientes = encontrados.map(({ visits, _count, ...cliente }) => ({
    ...cliente,
    visitas: _count.visits,
    inasistencias: _count.appointments,
    ultimaVisita: visits[0]?.arrivedAt ?? null,
    proximaCita: proximas.get(cliente.id) ?? null,
  }))

  return NextResponse.json({
    clientes,
    total,
    pagina,
    paginas: Math.ceil(total / limite),
  })
}

/**
 * La próxima cita de cada cliente: la más cercana que todavía no empezó y
 * sigue en pie (pendiente o confirmada). Con el filtro de agenda del actor,
 * como el historial. Una sola consulta para toda la página; `distinct` deja
 * la primera de cada cliente y el `Map` se queda con ésa aunque la base
 * devolviera más.
 */
async function proximasCitas(actor: Actor, clienteIds: string[]): Promise<Map<string, Date>> {
  const proximas = new Map<string, Date>()
  if (clienteIds.length === 0) return proximas

  const citas = await prisma.appointment.findMany({
    where: whereDeAgenda(actor, {
      customerId: { in: clienteIds },
      startTime: { gt: new Date() },
      status: { in: ["pendiente", "confirmada"] },
    }),
    orderBy: { startTime: "asc" },
    distinct: ["customerId"],
    select: { customerId: true, startTime: true },
  })

  for (const cita of citas) {
    if (cita.customerId && !proximas.has(cita.customerId)) proximas.set(cita.customerId, cita.startTime)
  }
  return proximas
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const cuerpo = await request.json()
    const datos = clienteSchema.parse(cuerpo)

    // Cualquiera del equipo crea un cliente, pero el consentimiento promocional
    // lo registra quien edita los datos del cliente. Falla cerrado.
    if (datos.correoPromoConsent && !puedeEditarConsentimientoPromocional(actor)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const cliente = await prisma.customer.create({
      data: {
        name: datos.name,
        email: datos.email || null,
        phone: datos.phone ?? null,
        tags: datos.tags ?? [],
        notes: datos.notes || null,
        // El consentimiento se registra con cuándo y por dónde se dio. Sin
        // marcar, no hay consentimiento: queda en null.
        ...(datos.whatsappConsent && { whatsappConsentAt: new Date(), whatsappConsentSource: "panel" }),
        ...(datos.correoPromoConsent && datosDeConsentimientoPromocional("panel")),
        businessId: actor.businessId,
      },
    })

    return NextResponse.json(cliente, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    console.error("Error creando cliente:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
