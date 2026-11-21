import makeWASocket, {
  Browsers,
  DisconnectReason,
  isLidUser,
  makeCacheableSignalKeyStore,
  type AuthenticationCreds,
  type ConnectionState,
  type MessageUpsertType,
  type SocketConfig,
  type WAMessage,
} from "baileys"
import { prisma } from "@/lib/prisma"
import { registrarError } from "@/lib/registro-de-errores"
import { enviarWhatsappDesconectado } from "@/lib/email"
import { urlBase } from "@/lib/url-base"
import { guardarMensajeEntrante, responder } from "@/lib/secretaria/agente"
import { conexiones, type Conexion } from "@/lib/secretaria/whatsapp/registro"
import { borrarSesion, guardarCredenciales, leerCredenciales, llavesEnLaBase } from "@/lib/secretaria/whatsapp/sesion"
import { contenidoDelMensaje, esChatUnoAUno, esReciente, telefonoDelJid } from "@/lib/secretaria/whatsapp/entrantes"

/**
 * Las conexiones de WhatsApp de la Secretaria: cada negocio vincula su número
 * como un dispositivo más (QR, como WhatsApp Web) con Baileys, una librería no
 * oficial. Riesgo aceptado por el dueño (docs/PRODUCTO.md, sección 11): para
 * bajarlo, la Secretaria sólo responde (nunca escribe primero), a ritmo de
 * persona (`envio.ts`) y sólo en chats uno a uno.
 *
 * El negocio de cada mensaje sale de la conexión que lo recibió, nunca del
 * mensaje.
 */

/** Baileys habla mucho; no se registra nada de lo suyo (podría traer datos de los chats). */
const SIN_REGISTRO: SocketConfig["logger"] = {
  level: "silent",
  child: () => SIN_REGISTRO,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

/** Tras tantas reconexiones fallidas seguidas, se le avisa a la dueña (y se sigue intentando). */
const INTENTOS_ANTES_DE_AVISAR = 6
const ESPERA_MAXIMA_MS = 5 * 60_000

const err = (contexto: string) => (error: unknown) => registrarError(contexto, error)

/** El estado de la conexión de un negocio, para el panel. */
export function qrPendiente(negocioId: string): string | null {
  return conexiones.get(negocioId)?.qr ?? null
}

/**
 * Abre (o retoma) la conexión del negocio. Sin sesión guardada, WhatsApp manda
 * un QR (`qrPendiente`) que la dueña escanea desde su celular.
 */
export async function conectarWhatsapp(negocioId: string, intentos = 0): Promise<void> {
  const existente = conexiones.get(negocioId)
  if (existente && !existente.cerrando) return
  const canal = await prisma.canalDeWhatsapp.findUnique({
    where: { businessId: negocioId },
    select: { id: true, credencialesCifradas: true },
  })
  if (!canal) return

  const credenciales = leerCredenciales(canal.credencialesCifradas)
  const socket = makeWASocket({
    auth: { creds: credenciales, keys: makeCacheableSignalKeyStore(llavesEnLaBase(negocioId, canal.id), SIN_REGISTRO) },
    logger: SIN_REGISTRO,
    browser: Browsers.ubuntu("Eli"),
    // Que el celular siga recibiendo las notificaciones como siempre.
    markOnlineOnConnect: false,
    // No se descarga el historial del celular: sólo se atienden mensajes nuevos.
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    // Los mensajes que manda la Secretaria no vuelven como eventos: los "míos" que llegan son de la dueña.
    emitOwnEvents: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined,
  })
  const conexion: Conexion = {
    negocioId,
    canalId: canal.id,
    socket,
    qr: null,
    abierta: false,
    cerrando: false,
    intentos,
    enviados: new Set(),
    envios: [],
  }
  conexiones.set(negocioId, conexion)

  socket.ev.on("creds.update", () => {
    guardarCredenciales(negocioId, canal.id, credenciales).catch(err("guardando la sesión de WhatsApp"))
  })
  socket.ev.on("connection.update", (cambio) => {
    alCambiarLaConexion(conexion, credenciales, cambio).catch(err("actualizando la conexión de WhatsApp"))
  })
  socket.ev.on("messages.upsert", ({ messages, type }) => {
    if (!conexion.abierta) return
    recibirMensajes(conexion, messages, type, (lid) => socket.signalRepository.lidMapping.getPNForLID(lid)).catch(
      err("recibiendo mensajes de WhatsApp")
    )
  })
}

async function alCambiarLaConexion(conexion: Conexion, credenciales: AuthenticationCreds, cambio: Partial<ConnectionState>) {
  const { negocioId, canalId } = conexion
  if (cambio.qr) {
    conexion.qr = cambio.qr
    await prisma.canalDeWhatsapp.updateMany({
      where: { id: canalId, businessId: negocioId, estado: { not: "esperando_qr" } },
      data: { estado: "esperando_qr" },
    })
  }

  if (cambio.connection === "open") {
    conexion.qr = null
    conexion.abierta = true
    conexion.intentos = 0
    await prisma.canalDeWhatsapp.updateMany({
      where: { id: canalId, businessId: negocioId },
      data: {
        estado: "conectado",
        numero: telefonoDelJid(conexion.socket.user?.id?.replace(/:\d+@/, "@")),
        conectadoAt: new Date(),
        desconectadoAt: null,
        motivoDesconexion: null,
      },
    })
    return
  }

  if (cambio.connection !== "close") return
  conexion.abierta = false
  conexion.qr = null
  if (conexiones.get(negocioId) === conexion) conexiones.delete(negocioId)
  if (conexion.cerrando) return

  const codigo = (cambio.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode

  // WhatsApp pide reiniciar la conexión justo después de escanear el QR: es normal.
  if (codigo === DisconnectReason.restartRequired) {
    await conectarWhatsapp(negocioId, conexion.intentos)
    return
  }
  // La dueña cerró la sesión desde su celular (o WhatsApp la invalidó).
  if (codigo === DisconnectReason.loggedOut) {
    await borrarSesion(negocioId, canalId)
    await marcarDesconectado(negocioId, canalId, "Se cerró la sesión desde el celular.")
    return
  }
  // Nunca se llegó a escanear el QR: venció.
  if (!credenciales.me) {
    await borrarSesion(negocioId, canalId)
    await marcarDesconectado(negocioId, canalId, "El código QR venció sin escanearse.")
    return
  }
  // Otra conexión tomó la misma sesión: no se pelea por ella.
  if (codigo === DisconnectReason.connectionReplaced) {
    await marcarDesconectado(negocioId, canalId, "La sesión se abrió en otro lugar.")
    return
  }

  // Un corte de red o de WhatsApp: se reintenta cada vez más espaciado, sin rendirse.
  const intentos = conexion.intentos + 1
  if (intentos === INTENTOS_ANTES_DE_AVISAR) {
    await marcarDesconectado(negocioId, canalId, "Se perdió la conexión con WhatsApp. Seguimos intentando reconectar.")
  }
  const espera = Math.min(ESPERA_MAXIMA_MS, 1000 * 2 ** intentos)
  setTimeout(() => {
    conectarWhatsapp(negocioId, intentos).catch(err("reconectando WhatsApp"))
  }, espera).unref?.()
}

/**
 * Deja el canal desconectado. Si estaba conectado, le avisa a la dueña (correo
 * y aviso en el panel): la Secretaria dejó de responder.
 */
async function marcarDesconectado(negocioId: string, canalId: string, motivo: string) {
  const estaba = await prisma.canalDeWhatsapp.updateMany({
    where: { id: canalId, businessId: negocioId, estado: "conectado" },
    data: { estado: "desconectado", desconectadoAt: new Date(), motivoDesconexion: motivo },
  })
  await prisma.canalDeWhatsapp.updateMany({
    where: { id: canalId, businessId: negocioId, estado: { not: "conectado" } },
    data: { estado: "desconectado", motivoDesconexion: motivo },
  })
  if (estaba.count === 0) return

  const negocio = await prisma.business.findUnique({
    where: { id: negocioId },
    select: { name: true, user: { select: { email: true } } },
  })
  if (!negocio) return
  await prisma.avisoDelPanel.create({
    data: {
      businessId: negocioId,
      memberId: null,
      tipo: "whatsapp-desconectado",
      titulo: "La Secretaria se desconectó de tu WhatsApp",
      cuerpo: `${motivo} Vuelve a escanear el código QR para que siga respondiendo.`,
      enlace: "/dashboard/secretaria",
    },
  })
  let enlace: string | null = null
  try {
    enlace = `${urlBase()}/dashboard/secretaria`
  } catch {
    enlace = null
  }
  await enviarWhatsappDesconectado({ para: negocio.user.email, nombreNegocio: negocio.name, enlace }).catch(
    err("avisando que se desconectó WhatsApp")
  )
}

/**
 * Desconecta el WhatsApp del negocio a pedido de la dueña: cierra la sesión
 * (el dispositivo desaparece de "Dispositivos vinculados") y la borra.
 */
export async function desconectarWhatsapp(negocioId: string): Promise<void> {
  const conexion = conexiones.get(negocioId)
  if (conexion) {
    conexion.cerrando = true
    conexion.abierta = false
    conexiones.delete(negocioId)
    try {
      await conexion.socket.logout()
    } catch {
      conexion.socket.end(undefined)
    }
  }
  const canal = await prisma.canalDeWhatsapp.findUnique({ where: { businessId: negocioId }, select: { id: true } })
  if (!canal) return
  await borrarSesion(negocioId, canal.id)
  await prisma.canalDeWhatsapp.updateMany({
    where: { id: canal.id, businessId: negocioId },
    data: { estado: "desconectado", desconectadoAt: new Date(), motivoDesconexion: null },
  })
}

/**
 * Al arrancar el servidor: retoma las conexiones de los negocios que ya
 * habían vinculado su número. Un QR a medio escanear no se retoma (nadie lo está mirando).
 */
export async function iniciarConexiones(): Promise<void> {
  await prisma.canalDeWhatsapp.updateMany({ where: { estado: "esperando_qr" }, data: { estado: "desconectado" } })
  const canales = await prisma.canalDeWhatsapp.findMany({
    where: { credencialesCifradas: { not: null }, numero: { not: null } },
    select: { businessId: true },
  })
  for (const [i, canal] of canales.entries()) {
    // Escalonadas, para no abrir todas a la vez.
    setTimeout(() => {
      conectarWhatsapp(canal.businessId).catch(err("retomando una conexión de WhatsApp"))
    }, i * 2_000).unref?.()
  }
}

/**
 * Lo que llega por WhatsApp. Mensajes de la clienta: se guardan y responde la
 * Secretaria. Mensajes "míos" que no mandó la Secretaria: los escribió la dueña
 * desde su celular, así que la Secretaria se retira de ese chat.
 */
export async function recibirMensajes(
  conexion: Pick<Conexion, "negocioId" | "canalId" | "enviados">,
  mensajes: WAMessage[],
  tipo: MessageUpsertType,
  telefonoDeLid: (lid: string) => Promise<string | null>,
  ahora = new Date()
): Promise<void> {
  const { negocioId, canalId } = conexion
  const respuestas: Promise<unknown>[] = []

  for (const mensaje of mensajes) {
    const jid = mensaje.key.remoteJid
    if (!esChatUnoAUno(jid) || !esReciente(mensaje.messageTimestamp, ahora)) continue
    const contenido = contenidoDelMensaje(mensaje.message)
    if (contenido.tipo === "ignorar") continue

    const telefono =
      telefonoDelJid(jid) ??
      telefonoDelJid(mensaje.key.remoteJidAlt) ??
      (isLidUser(jid) ? telefonoDelJid(await telefonoDeLid(jid).catch(() => null)) : null)

    if (mensaje.key.fromMe) {
      const id = mensaje.key.id
      if (id && (conexion.enviados.has(id) || (await esDeLaSecretaria(negocioId, id)))) continue
      await laDuenaTomoElChat(negocioId, jid, telefono, ahora)
      continue
    }

    // "append" es historial que WhatsApp sincroniza, no un mensaje nuevo.
    if (tipo !== "notify") continue
    if (!telefono) {
      registrarError("recibiendo un mensaje de WhatsApp sin número", new Error("sin número"))
      continue
    }
    const guardado = await guardarMensajeEntrante({
      negocioId,
      canalId,
      telefono,
      waJid: jid,
      simulacion: false,
      texto: contenido.tipo === "texto" ? contenido.texto : null,
      waMessageId: mensaje.key.id ?? undefined,
      ahora,
    })
    if (guardado.duplicado) continue
    respuestas.push(responder(negocioId, guardado.conversacionId, ahora).catch(err("respondiendo por WhatsApp")))
  }
  await Promise.all(respuestas)
}

async function esDeLaSecretaria(negocioId: string, waMessageId: string): Promise<boolean> {
  const mensaje = await prisma.mensajeDeSecretaria.findFirst({
    where: { businessId: negocioId, waMessageId, rol: "assistant" },
    select: { id: true },
  })
  return mensaje !== null
}

/** La dueña escribió en el chat desde su celular: la conversación queda en sus manos. */
async function laDuenaTomoElChat(negocioId: string, jid: string, telefono: string | null, ahora: Date) {
  await prisma.conversacionDeSecretaria.updateMany({
    where: {
      businessId: negocioId,
      simulacion: false,
      estado: "bot",
      OR: [{ waJid: jid }, ...(telefono ? [{ telefono }] : [])],
    },
    data: {
      estado: "human",
      motivoDerivacion: "La dueña respondió desde su celular.",
      derivadaAMemberId: null,
      derivadaAt: ahora,
    },
  })
}
