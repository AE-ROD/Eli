import { randomInt } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion } from "@/lib/permisos"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { cuerpoConTope } from "@/lib/cuerpo-del-pedido"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { registrarError } from "@/lib/registro-de-errores"
import { enviarAcuseDeSoporte, enviarSolicitudASoporte, type ResultadoDeEnvio } from "@/lib/email"
import {
  CAMPO_TRAMPA,
  correosDeSolicitud,
  esquemaDeContacto,
  esquemaDeSolicitud,
  formatearNumeroDeCaso,
  type NegocioDeLaSolicitud,
} from "@/lib/soporte"

const DEMASIADAS = { error: "Enviaste varias solicitudes seguidas. Espera un rato e intenta de nuevo." }

/**
 * Tope del cuerpo. Lo más largo que acepta el esquema (descripción de 4000,
 * asunto, dónde ocurrió, nombre y correo) no llega a 10 KB ni con todo en
 * caracteres de 3 bytes; 32 KB deja margen sin cargar en memoria un cuerpo
 * de megas.
 */
const TOPE_DEL_CUERPO = 32 * 1024

/**
 * POST /api/soporte — una solicitud de soporte (falla, reclamo o consulta).
 *
 * La usan /dashboard/ayuda (con sesión) y /soporte (pública, sin sesión).
 * Con sesión, quién escribe y de qué negocio sale de la SESIÓN: lo que mande
 * el cliente en `nombre`, `email` o cualquier `businessId` se ignora. Sin
 * sesión, `nombre` y `email` son obligatorios y no se vincula ningún negocio.
 *
 * Primero se guarda y después se mandan los correos: un correo que falla se
 * registra, pero la solicitud ya quedó y la respuesta es 201 igual.
 *
 * Como se puede llamar sin sesión y manda correos, tiene los mismos resguardos
 * que `/api/referidos/invitacion` (JSON obligatorio y `Origin` propio), su
 * tope de tamaño del cuerpo (413), su propio límite y un campo trampa para
 * bots.
 *
 * Límites: con sesión se cuenta sólo por usuario (`soporte`, 5 por hora), así
 * las personas de un mismo local, detrás del mismo wifi, no se bloquean entre
 * ellas; sin sesión, por IP. Además, el acuse tiene su tope por correo de
 * destino (`acuseDeSoporte`, 2 por hora): al pasarlo, la solicitud se guarda
 * y llega a soporte igual, sólo no se manda el acuse. Así una persona real no
 * pierde su reporte, y quien rota IPs no puede llenarle la casilla a otro.
 */
export async function POST(request: NextRequest) {
  const tipoDeContenido = request.headers.get("content-type") ?? ""
  if (tipoDeContenido.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Se espera JSON" }, { status: 415 })
  }
  if (!origenPropio(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 })
  }

  const leido = await cuerpoConTope(request, TOPE_DEL_CUERPO)
  if (leido.excedido) {
    return NextResponse.json({ error: "La solicitud es demasiado larga." }, { status: 413 })
  }

  const session = await getServerSession(authOptions)
  const userIdDeSesion = typeof session?.user?.id === "string" && session.user.id ? session.user.id : null

  const limite = await verificarLimite(
    "soporte",
    userIdDeSesion ? `usuario:${userIdDeSesion}` : `ip:${obtenerIp(request)}`,
  )
  if (!limite.permitido) return NextResponse.json(DEMASIADAS, { status: 429 })

  const cuerpo = leido.cuerpo
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  // Campo trampa lleno: es un bot. Se le responde exactamente como a una
  // persona (201 y un número de caso con la forma de uno real, al azar y no
  // correlativo), sin guardar ni mandar nada, para que no aprenda a esquivarlo.
  const trampa = (cuerpo as Record<string, unknown>)[CAMPO_TRAMPA]
  if (typeof trampa === "string" ? trampa.trim() !== "" : trampa !== undefined && trampa !== null) {
    return NextResponse.json({ numero: formatearNumeroDeCaso(randomInt(1_000, 100_000)) }, { status: 201 })
  }

  const solicitud = esquemaDeSolicitud.safeParse(cuerpo)
  if (!solicitud.success) return respuestaDeDatosInvalidos(solicitud.error)

  try {
    // Quién escribe: con sesión, de la base (no del token ni del cuerpo).
    const usuario = userIdDeSesion
      ? await prisma.user.findUnique({ where: { id: userIdDeSesion }, select: { id: true, name: true, email: true } })
      : null

    // La sesión es de un usuario que ya no existe (se borró después de
    // entrar): no se toma como anónima, porque el formulario con sesión no
    // pide nombre ni correo y la persona vería un error que no entiende.
    if (userIdDeSesion && !usuario) {
      return NextResponse.json(
        { error: "Tu sesión ya no es válida. Vuelve a iniciar sesión para escribirnos." },
        { status: 401 },
      )
    }

    let contacto: { nombre: string; email: string }
    if (usuario) {
      contacto = { nombre: usuario.name, email: usuario.email }
    } else {
      const deCuerpo = esquemaDeContacto.safeParse(cuerpo)
      if (!deCuerpo.success) return respuestaDeDatosInvalidos(deCuerpo.error)
      contacto = deCuerpo.data
    }

    // El negocio: sólo el de la sesión, validado por `lib/permisos.ts`.
    const actor = usuario ? actorDeSesion(session) : null
    const negocioEncontrado = actor
      ? await prisma.business.findUnique({ where: { id: actor.businessId }, select: { id: true, name: true } })
      : null
    const negocio: NegocioDeLaSolicitud | null = negocioEncontrado
      ? { id: negocioEncontrado.id, nombre: negocioEncontrado.name }
      : null

    // El tope del acuse se consulta antes de guardar, pero no corta nada: si
    // ese correo ya recibió sus acuses de la hora, la solicitud se guarda y se
    // avisa a soporte igual; sólo no sale el acuse.
    const acuse = await verificarLimite("acuseDeSoporte", `email:${contacto.email.trim().toLowerCase()}`)

    const guardada = await prisma.solicitudDeSoporte.create({
      data: {
        ...solicitud.data,
        ...contacto,
        businessId: negocio?.id ?? null,
        userId: usuario?.id ?? null,
        userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
      },
      select: {
        numero: true,
        tipo: true,
        area: true,
        asunto: true,
        descripcion: true,
        dondeOcurrio: true,
        nombre: true,
        email: true,
        userId: true,
        createdAt: true,
      },
    })

    const casilla = process.env.SOPORTE_EMAIL?.trim() || null
    if (!casilla) {
      console.warn(
        "[soporte] SOPORTE_EMAIL no configurada: la solicitud se guardó, pero no se avisó a ninguna casilla de soporte.",
      )
    }

    if (!acuse.permitido) {
      console.warn(`[soporte] Caso ${guardada.numero}: ese correo ya recibió sus acuses de la hora; no se manda otro.`)
    }

    const correos = correosDeSolicitud(guardada, negocio, casilla)
    const { aSoporte } = correos
    await Promise.all([
      aSoporte ? enviarSinPerder("enviando el aviso a soporte", () => enviarSolicitudASoporte(aSoporte)) : null,
      acuse.permitido
        ? enviarSinPerder("enviando el acuse de soporte", () => enviarAcuseDeSoporte(correos.acuse))
        : null,
    ])

    return NextResponse.json({ numero: formatearNumeroDeCaso(guardada.numero) }, { status: 201 })
  } catch (error) {
    registrarError("guardando una solicitud de soporte", error)
    return NextResponse.json({ error: "No pudimos registrar tu solicitud. Intenta de nuevo." }, { status: 500 })
  }
}

/**
 * Manda un correo sin dejar que su fallo tumbe la respuesta: la solicitud ya
 * está guardada. Resend avisa algunos errores lanzando y otros devolviendo
 * `{ error }`; los dos se registran.
 */
async function enviarSinPerder(contexto: string, envio: () => Promise<ResultadoDeEnvio>): Promise<void> {
  try {
    const resultado = await envio()
    if (resultado?.error) registrarError(contexto, Object.assign(new Error(resultado.error.message), { name: resultado.error.name }))
  } catch (error) {
    registrarError(contexto, error)
  }
}

/**
 * Si el pedido viene de Eli. Mismo criterio que `/api/referidos/invitacion`:
 * sin `Origin` se acepta; con `Origin`, su host tiene que ser el de
 * `NEXTAUTH_URL` o el `Host` del propio pedido.
 */
function origenPropio(request: NextRequest): boolean {
  const origen = request.headers.get("origin")
  if (origen === null) return true

  let hostDelOrigen: string
  try {
    hostDelOrigen = new URL(origen).host
  } catch {
    return false
  }

  const propios = new Set<string>()
  const host = request.headers.get("host")
  if (host) propios.add(host)
  try {
    if (process.env.NEXTAUTH_URL) propios.add(new URL(process.env.NEXTAUTH_URL).host)
  } catch {
    // Un NEXTAUTH_URL mal formado no agrega nada: queda sólo el `Host`.
  }
  return propios.has(hostDelOrigen)
}
