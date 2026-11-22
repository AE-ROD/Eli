import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { deCentavos } from "@/lib/atenciones"
import { horaDeLaBase } from "@/lib/bloqueos-de-dinero"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { esMedioDePago } from "@/lib/medios-de-pago"
import { ErrorDePaquete, devolverPaquete } from "@/lib/paquetes-servidor"
import { actorDeSesion, puedeDevolverPaquete, puedeVerPaquetesDeClientes, whereDeClientes } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { nombreEnElNegocio } from "@/lib/tablero"

/**
 * POST /api/clientes/[id]/paquetes/[paqueteId]/devolucion — { medio }
 *
 * Devuelve lo no usado de un paquete de sesiones (`devolverPaquete`): desde
 * ese momento no se puede usar. Responde `{ ok: true, devuelto }` en pesos.
 *
 * El orden importa. Primero, que exista para quien pregunta: la clienta es
 * del negocio de la sesión y el paquete es de ESA clienta y de ESE negocio;
 * si no, 404, también para quien no podría devolver (lo ajeno no existe,
 * nunca "no puedes"). Recién después, el permiso: devolver es de la dueña
 * (`puedeDevolverPaquete`), 403 para el resto del equipo. En una clínica
 * dental los paquetes no existen: 401, como al leerlos.
 *
 * Lo que no se puede devolver (ya devuelto, sin sesiones por usar, venta
 * anulada) es 409 con el motivo. El límite de peticiones es el genérico del
 * panel (`proxy.ts`).
 */

type Contexto = { params: Promise<{ id: string; paqueteId: string }> }

const noEncontrado = () => NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 })

export async function POST(request: NextRequest, { params }: Contexto) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeVerPaquetesDeClientes(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id, paqueteId } = await params

  try {
    const clienta = await prisma.customer.findFirst({
      where: whereDeClientes(actor, { AND: [{ id }, clienteNoEliminado] }),
      select: { id: true },
    })
    if (!clienta) return noEncontrado()
    const paquete = await prisma.paqueteDeCliente.findFirst({
      where: { id: paqueteId, businessId: actor.businessId, customerId: clienta.id },
      select: { id: true },
    })
    if (!paquete) return noEncontrado()

    if (!puedeDevolverPaquete(actor)) {
      return NextResponse.json({ error: "Devolver un paquete es de la dueña." }, { status: 403 })
    }

    const cuerpo = await leerJsonConTope(request).catch((error: unknown) => {
      if (error instanceof CuerpoDemasiadoGrande) throw error
      return null
    })
    const medio = typeof cuerpo === "object" && cuerpo !== null && "medio" in cuerpo ? cuerpo.medio : null
    if (typeof medio !== "string" || !esMedioDePago(medio)) {
      return NextResponse.json({ error: "Elige con qué medio se devuelve la plata." }, { status: 400 })
    }

    const usuarioId = session?.user?.id ?? null
    const { devueltoCents } = await prisma.$transaction(async (tx) => {
      const ahora = await horaDeLaBase(tx)
      const nombre = (await nombreEnElNegocio(tx, actor, usuarioId)) ?? "La dueña"
      return devolverPaquete(tx, actor.businessId, paquete.id, medio, ahora, { id: usuarioId, nombre })
    })
    return NextResponse.json({ ok: true, devuelto: deCentavos(devueltoCents) })
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof ErrorDePaquete) return NextResponse.json({ error: error.message }, { status: error.codigo })
    registrarError("devolviendo un paquete de sesiones", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
