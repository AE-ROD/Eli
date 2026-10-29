import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { emailOVacio, etiquetas, nombre, notas, telefonoChileno } from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { registrarError } from "@/lib/registro-de-errores"
import { datosDeBajaPromocional, datosDeConsentimientoPromocional } from "@/lib/envios-a-clientes"
import {
  clienteNoEliminado,
  datosDeClienteEliminado,
  inscripcionesDeClienteEliminado,
  textosDeAtencionDeClienteEliminado,
  textosDeCitaDeClienteEliminado,
} from "@/lib/clientes-eliminados"
import {
  actorDeSesion,
  puedeBorrarCliente,
  puedeEditarConsentimientoPromocional,
  puedeEditarDatosDeCliente,
  whereDeAgenda,
  whereDeClientes,
  type Actor,
} from "@/lib/permisos"

const edicionDeClienteSchema = z.object({
  name: nombre().optional(),
  email: emailOVacio().optional(),
  phone: telefonoChileno().optional(),
  tags: etiquetas().optional(),
  notes: notas().optional(),
  /**
   * "Acepta recibir mensajes por WhatsApp". Marcarlo registra cuándo y por
   * dónde (el panel); desmarcarlo lo borra. Mandarlo marcado cuando ya estaba
   * marcado no cambia la fecha ni el origen: el consentimiento es el primero.
   */
  whatsappConsent: z.boolean().optional(),
  /**
   * "Quiere recibir avisos y novedades por correo" (consentimiento
   * promocional, "te toca" y reseñas). Marcarlo registra cuándo y que fue en
   * el panel; desmarcarlo es la baja pedida en el local y deja la fecha de
   * baja. Mandarlo igual a como estaba no cambia nada.
   */
  correoPromoConsent: z.boolean().optional(),
})

/**
 * El cliente del negocio con ese id, si no se eliminó. Uno eliminado responde
 * como uno que no existe: no se lee, no se edita (editarlo le devolvería un
 * nombre) y no se vuelve a eliminar.
 */
const delNegocioYVigente = (actor: Actor, id: string) => whereDeClientes(actor, { AND: [{ id }, clienteNoEliminado] })

/**
 * Pide un `Actor`, no `Actor | null`, como `verificarCita` en
 * `app/api/citas/[id]/route.ts`: sin sesión no hay cliente, y el handler ya
 * cortó con 401. Así el compilador obliga a poner la guarda primero.
 */
async function verificarCliente(actor: Actor, id: string) {
  return prisma.customer.findFirst({
    where: delNegocioYVigente(actor, id),
    select: { id: true, email: true, whatsappConsentAt: true, correoPromoConsentAt: true },
  })
}

/** Lo que cambia en el consentimiento de WhatsApp según lo que se marcó y lo que ya había. */
function cambioDeConsentimiento(marcado: boolean | undefined, yaTenia: boolean) {
  if (marcado === undefined) return {}
  if (!marcado) return { whatsappConsentAt: null, whatsappConsentSource: null }
  return yaTenia ? {} : { whatsappConsentAt: new Date(), whatsappConsentSource: "panel" }
}

/**
 * Lo mismo para el consentimiento promocional por correo. Desmarcar uno que
 * había es una baja (`datosDeBajaPromocional`, con fecha); desmarcar uno que
 * no había no inventa una baja.
 */
function cambioDeConsentimientoPromocional(marcado: boolean | undefined, yaTenia: boolean) {
  if (marcado === undefined || marcado === yaTenia) return {}
  return marcado ? datosDeConsentimientoPromocional("panel") : datosDeBajaPromocional()
}

/** Dos correos son la misma casilla si sólo cambian mayúsculas o espacios a los lados. */
function mismoCorreo(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase()
}

/**
 * El consentimiento promocional es de una casilla, no de la ficha: si el
 * correo cambia, el que había no pasa al nuevo. Se mantiene sólo si en el
 * mismo pedido se marca `correoPromoConsent: true` explícito (que ya exige
 * `puedeEditarConsentimientoPromocional`), y entonces se registra de nuevo.
 */
function consentimientoAlCambiarElCorreo(
  correoNuevo: string | undefined,
  existente: { email: string | null; correoPromoConsentAt: Date | null },
  marcado: boolean | undefined
) {
  if (correoNuevo === undefined || mismoCorreo(correoNuevo || null, existente.email)) {
    return cambioDeConsentimientoPromocional(marcado, existente.correoPromoConsentAt !== null)
  }
  if (marcado === true) return datosDeConsentimientoPromocional("panel")
  return existente.correoPromoConsentAt !== null ? datosDeBajaPromocional() : {}
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  // `select` y no `include`: con `include` las citas venían enteras, con las
  // notas internas y los comentarios del cliente. Del cliente se devuelve lo
  // mismo que antes.
  const cliente = await prisma.customer.findFirst({
    where: delNegocioYVigente(actor, id),
    select: {
      id: true,
      name: true,
      lastName: true,
      cedula: true,
      email: true,
      phone: true,
      tags: true,
      notes: true,
      whatsappConsentAt: true,
      whatsappConsentSource: true,
      correoPromoConsentAt: true,
      correoPromoConsentSource: true,
      correoPromoBajaAt: true,
      businessId: true,
      createdAt: true,
      updatedAt: true,
      // El cliente es del negocio, pero sus citas son agenda: el profesional
      // ve sólo las suyas, igual que en el listado.
      appointments: {
        where: whereDeAgenda(actor),
        orderBy: { startTime: "desc" },
        take: 20,
        // Lo que dibuja la vista (`CitaDeCliente`).
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
  })

  if (!cliente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }

  return NextResponse.json(cliente)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await verificarCliente(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }

  try {
    const cuerpo = await request.json()
    const datos = edicionDeClienteSchema.parse(cuerpo)

    // Las notas las escribe cualquiera; el resto de los datos, sólo dueño y
    // encargado. Se mira lo que quedó del esquema: una clave que no conoce
    // (`businessId`) ya se descartó y no llega a la base.
    const tocaDatos = Object.keys(datos).some((campo) => campo !== "notes")
    if (tocaDatos && !puedeEditarDatosDeCliente(actor)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }
    if (datos.correoPromoConsent !== undefined && !puedeEditarConsentimientoPromocional(actor)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    // Por `existente.id`, no por `id`: si alguien borra la verificación de
    // arriba, `existente` queda sin declarar y el build falla. La garantía deja
    // de depender de que el próximo lea las dos líneas en orden.
    //
    // `updateMany` con el mismo filtro de la verificación (del negocio y no
    // eliminado), no `update` por id: si una eliminación se confirma entre la
    // verificación y esta escritura, un `update` le devolvería el correo o el
    // teléfono al cliente anonimizado, o le pisaría la marca. Postgres vuelve
    // a evaluar el `where` sobre la fila ya eliminada, no la toca y es 404.
    const { count } = await prisma.customer.updateMany({
      where: delNegocioYVigente(actor, existente.id),
      data: {
        ...(datos.name && { name: datos.name }),
        ...(datos.email !== undefined && { email: datos.email || null }),
        ...(datos.phone !== undefined && { phone: datos.phone }),
        ...(datos.tags !== undefined && { tags: datos.tags }),
        ...(datos.notes !== undefined && { notes: datos.notes || null }),
        ...cambioDeConsentimiento(datos.whatsappConsent, existente.whatsappConsentAt !== null),
        ...consentimientoAlCambiarElCorreo(datos.email, existente, datos.correoPromoConsent),
      },
    })
    if (count === 0) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    // Se relee con el mismo filtro: la respuesta es el cliente tal como quedó.
    const cliente = await prisma.customer.findFirst({ where: delNegocioYVigente(actor, existente.id) })
    if (!cliente) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    return NextResponse.json(cliente)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return respuestaDeDatosInvalidos(error)
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await verificarCliente(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }

  // Después de verificar que es del negocio: para un cliente ajeno, 404.
  if (!puedeBorrarCliente(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // Eliminar es anonimizar (decisión del dueño, PRODUCTO.md, sección 6): es
  // el derecho a supresión, así que no queda ningún dato personal del cliente
  // en ninguna tabla. Se borran sus datos, la copia de su nombre en cada
  // atención y los textos libres de sus citas y atenciones. Montos, fechas,
  // servicios y profesionales no se tocan: la agenda y los totales de los
  // reportes no cambian. Todo o nada, en una transacción: no queda un cliente
  // a medio borrar. Por `existente.id`, por lo mismo que en el PUT, y cada
  // escritura acotada al negocio de la sesión.
  try {
    await prisma.$transaction(async (tx) => {
      // Antes de anonimizar: la lista de espera es por email.
      await tx.inscripcionEnEspera.deleteMany({
        where: inscripcionesDeClienteEliminado(actor.businessId, existente.email),
      })
      await tx.customer.update({ where: { id: existente.id }, data: datosDeClienteEliminado(), select: { id: true } })
      await tx.appointment.updateMany({
        where: { customerId: existente.id, businessId: actor.businessId },
        data: textosDeCitaDeClienteEliminado(),
      })
      // El título de la cita es texto libre. Si la cita tiene servicio, vuelve
      // a ser su nombre, por si alguien escribió ahí algo del cliente. Sin
      // servicio no hay con qué reemplazarlo y queda (PRODUCTO.md, sección 6).
      const conServicio = await tx.appointment.findMany({
        where: { customerId: existente.id, businessId: actor.businessId, serviceId: { not: null } },
        select: { id: true, title: true, service: { select: { name: true } } },
      })
      for (const cita of conServicio) {
        if (cita.service && cita.title !== cita.service.name) {
          await tx.appointment.update({ where: { id: cita.id }, data: { title: cita.service.name }, select: { id: true } })
        }
      }
      await tx.visit.updateMany({
        where: { customerId: existente.id, businessId: actor.businessId },
        data: textosDeAtencionDeClienteEliminado(),
      })
    })
  } catch (error) {
    registrarError("eliminando un cliente", error)
    return NextResponse.json({ error: "No se pudo eliminar el cliente" }, { status: 500 })
  }

  return NextResponse.json({ mensaje: "Cliente eliminado" })
}
