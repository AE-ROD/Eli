import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { contarEnviosDelMes } from "@/lib/envios-a-clientes"
import { esEnlaceDeResenasValido } from "@/lib/pagina-del-negocio"
import { actorDeSesion, puedeActivarMensajesAClientes, puedeVerMensajesAClientes } from "@/lib/permisos"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"

/**
 * /api/configuracion/mensajes — los mensajes automáticos a clientes
 * (#74, #75, #77) y el contador del mes (#78).
 *
 * GET: los tres interruptores, si hay un enlace de reseñas válido y lo
 * enviado este mes (en la zona del negocio) por tipo, categoría y canal.
 * Dueña y encargado (`puedeVerMensajesAClientes`); el profesional, 401.
 *
 * PUT: cambia uno o más interruptores. Sólo la dueña
 * (`puedeActivarMensajesAClientes`, decisión d del dueño: con WhatsApp
 * cuestan); el encargado y el profesional, 401. Para encender "pedir reseña"
 * hace falta un enlace de reseñas válido guardado: si no, 400 con el motivo.
 *
 * Siempre sobre el negocio de la sesión, nunca uno del cuerpo. El límite de
 * peticiones es el del panel (`proxy.ts`).
 */

const INTERRUPTORES = { listaDeEsperaActiva: true, avisoDeVueltaActivo: true, pideResenas: true } as const

const MENSAJE_SIN_ENLACE =
  "Para pedir reseñas, primero agrega el enlace de reseñas de Google en Configuración › Tu página pública"

const interruptor = (nombre: string) =>
  z.boolean({ invalid_type_error: `${nombre} tiene que ser sí o no` }).optional()

const cambiosSchema = z
  .object(
    {
      listaDeEsperaActiva: interruptor("La lista de espera"),
      avisoDeVueltaActivo: interruptor("El aviso de vuelta"),
      pideResenas: interruptor("Pedir reseña"),
    },
    { invalid_type_error: "Datos inválidos", required_error: "Datos inválidos" }
  )
  .refine(
    (cambios) => cambios.listaDeEsperaActiva !== undefined || cambios.avisoDeVueltaActivo !== undefined || cambios.pideResenas !== undefined,
    "No hay nada que cambiar"
  )

export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeVerMensajesAClientes(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const negocio = await prisma.business.findUnique({
    where: { id: actor.businessId },
    select: { ...INTERRUPTORES, enlaceResenas: true, timezone: true },
  })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  const { enlaceResenas, timezone, ...interruptores } = negocio
  return NextResponse.json({
    interruptores,
    tieneEnlaceDeResenas: esEnlaceDeResenasValido(enlaceResenas),
    puedeCambiar: puedeActivarMensajesAClientes(actor),
    mes: await contarEnviosDelMes(actor.businessId, timezone),
  })
}

export async function PUT(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeActivarMensajesAClientes(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const leido = cambiosSchema.safeParse(await cuerpoDelPedido(request))
  if (!leido.success) return respuestaDeDatosInvalidos(leido.error)
  const { listaDeEsperaActiva, avisoDeVueltaActivo, pideResenas } = leido.data

  if (pideResenas === true) {
    const negocio = await prisma.business.findUnique({ where: { id: actor.businessId }, select: { enlaceResenas: true } })
    if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })
    if (!esEnlaceDeResenasValido(negocio.enlaceResenas)) {
      return NextResponse.json({ error: MENSAJE_SIN_ENLACE }, { status: 400 })
    }
  }

  const interruptores = await prisma.business.update({
    where: { id: actor.businessId },
    data: { listaDeEsperaActiva, avisoDeVueltaActivo, pideResenas },
    select: INTERRUPTORES,
  })
  return NextResponse.json({ interruptores })
}
