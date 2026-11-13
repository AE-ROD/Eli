import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { quitarFoto, subirFoto, type DestinoDeFotoDeLaCuenta } from "@/lib/cambiar-foto"
import { cuentaDeSesion } from "@/lib/permisos"

/**
 * PUT / DELETE /api/cuenta/foto — la foto de la CUENTA: la de la persona, no la
 * de un negocio ni la del integrante que ve el cliente en la reserva. Sale en
 * el avatar del panel, sigue a la persona en todos sus negocios y no reemplaza
 * ni hace de respaldo de la del integrante.
 *
 * Cualquier persona con sesión cambia la SUYA, y sólo la suya: la cuenta sale
 * de la sesión (`cuentaDeSesion`), jamás de la ruta, de la URL, de una cabecera
 * ni del cuerpo. No hay un id que mandar, así que no hay cómo apuntar a la
 * cuenta de otra persona. Sin sesión vigente: 401.
 *
 * PUT: bytes crudos de la imagen (no multipart) con su `Content-Type`, hasta
 * 5 MB; responde `{ url }`. DELETE responde `{ url: null }`. El resto (almacén,
 * límite de 20 por hora por sesión, validación y reducción de la imagen,
 * borrar la foto anterior) está en `lib/cambiar-foto.ts`. Además del límite de
 * las fotos, `proxy.ts` limita por sesión toda la API del panel.
 */

function destinoDeLaCuenta(usuarioId: string): DestinoDeFotoDeLaCuenta {
  return {
    tipo: "cuenta",
    usuarioId,
    async leerUrl() {
      const usuario = await prisma.user.findUnique({ where: { id: usuarioId }, select: { fotoUrl: true } })
      return usuario ? { url: usuario.fotoUrl } : null
    },
    async guardarUrl(url) {
      // La cuenta en el `where`, y no un `update` por id suelto: si la fila
      // desapareció entre la lectura y la escritura, no pasa nada y responde 404.
      const { count } = await prisma.user.updateMany({ where: { id: usuarioId }, data: { fotoUrl: url } })
      return count > 0
    },
  }
}

/** La cuenta de la sesión, o la respuesta que corta. */
async function resolver() {
  const cuenta = cuentaDeSesion(await getServerSession(authOptions))
  if (!cuenta) return { respuesta: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  return { quien: { usuarioId: cuenta.id }, destino: destinoDeLaCuenta(cuenta.id) }
}

export async function PUT(request: NextRequest) {
  const resuelto = await resolver()
  if (resuelto.respuesta) return resuelto.respuesta
  return subirFoto(request, resuelto.quien, resuelto.destino)
}

export async function DELETE() {
  const resuelto = await resolver()
  if (resuelto.respuesta) return resuelto.respuesta
  return quitarFoto(resuelto.quien, resuelto.destino)
}
