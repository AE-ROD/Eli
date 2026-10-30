import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { cuerpoConTope } from "@/lib/cuerpo-del-pedido"
import { inscribirEnListaDeEspera } from "@/lib/lista-de-espera"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { normalizarEmail } from "@/lib/reserva-publica"
import { hashDeToken } from "@/lib/tokens"
import { listaDeEsperaSchema } from "@/lib/validaciones"

/**
 * POST /api/reservar/[slug]/lista-de-espera — "Avísame si se libera una hora"
 * (#74). Público y sin sesión, fuera del límite del panel (`proxy.ts`).
 *
 * - Límites que fallan cerrado: `reserva` por IP y `listaDeEspera` por
 *   negocio + email (cada inscripción puede terminar en correos a una casilla
 *   que escribe un anónimo), los dos con 429. Y `listaDeEsperaPorEmail`, por
 *   email sumando todos los negocios: al pasarse responde como un alta normal
 *   y no crea nada, para no revelar nada de esa casilla.
 * - Negocio inexistente, lista apagada, servicio o profesional ajenos o
 *   inactivos: el mismo 404, sin decir cuál.
 * - La cuarta inscripción activa del mismo email en el negocio: el mismo 201
 *   que un alta, sin crear la fila. Un 429 propio diría a cualquiera que ese
 *   email ya espera en este negocio.
 */

const NO_ENCONTRADO = () => NextResponse.json({ error: "No encontrado" }, { status: 404 })
const DEMASIADAS = () => NextResponse.json({ error: "Demasiadas solicitudes, intenta más tarde" }, { status: 429 })
/** Lo que ve quien se inscribe, se haya creado la fila o no. */
const LISTO = () =>
  NextResponse.json({ mensaje: "Listo. Si se libera una hora ese día, te escribimos por correo." }, { status: 201 })

/** Una inscripción no pasa de esto. */
const MAX_BYTES = 4096

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const porIp = await verificarLimite("reserva", obtenerIp(request))
  if (!porIp.permitido) return DEMASIADAS()

  const { slug } = await params
  const leido = await cuerpoConTope(request, MAX_BYTES)
  if (leido.excedido) return NextResponse.json({ error: "Datos inválidos" }, { status: 413 })
  const datos = listaDeEsperaSchema.safeParse(leido.cuerpo)
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
  }

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, timezone: true, listaDeEsperaActiva: true },
  })
  if (!negocio?.listaDeEsperaActiva) return NO_ENCONTRADO()

  // Por negocio + email, normalizado (`Ana@x.cl` y `ana@x.cl` son la misma
  // casilla) y en hash: el email no queda escrito en el contador.
  const email = normalizarEmail(datos.data.email) ?? ""
  const porEmail = await verificarLimite("listaDeEspera", `${negocio.id}:${hashDeToken(email)}`)
  if (!porEmail.permitido) return DEMASIADAS()
  // Sin negocio en la llave: el tope de una casilla en todas las listas.
  const enTodosLosNegocios = await verificarLimite("listaDeEsperaPorEmail", hashDeToken(email))
  if (!enTodosLosNegocios.permitido) return LISTO()

  try {
    const resultado = await inscribirEnListaDeEspera(negocio, datos.data)
    switch (resultado.tipo) {
      case "inscrita":
      case "tope":
        return LISTO()
      case "no-encontrada":
        return NO_ENCONTRADO()
      case "rechazada":
        return NextResponse.json({ error: resultado.error }, { status: 409 })
    }
  } catch (error) {
    registrarError("inscribiendo en la lista de espera", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
