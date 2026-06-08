import twilio from "twilio"

let _client: ReturnType<typeof twilio> | null = null

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null        // graceful no-op when not configured
  if (!_client) _client = twilio(sid, token)
  return _client
}

function toWhatsApp(phone: string): string {
  // Strip everything except digits, then prefix with whatsapp:+
  const digits = phone.replace(/\D/g, "")
  return `whatsapp:+${digits}`
}

const FROM = () => `whatsapp:${process.env.TWILIO_WHATSAPP_FROM ?? "+14155238886"}`

const MSGS = {
  confirmacion: {
    es: (negocio: string, servicio: string, fecha: string, hora: string) =>
      `✅ *¡Reserva confirmada!*\n\nTu cita en *${negocio}* está agendada:\n📌 ${servicio}\n📅 ${fecha} a las ${hora}\n\n¡Te esperamos!`,
    en: (negocio: string, servicio: string, fecha: string, hora: string) =>
      `✅ *Booking confirmed!*\n\nYour appointment at *${negocio}*:\n📌 ${servicio}\n📅 ${fecha} at ${hora}\n\nSee you then!`,
    pt: (negocio: string, servicio: string, fecha: string, hora: string) =>
      `✅ *Reserva confirmada!*\n\nSeu agendamento em *${negocio}*:\n📌 ${servicio}\n📅 ${fecha} às ${hora}\n\nAté breve!`,
  },
  recordatorio: {
    es: (negocio: string, servicio: string, hora: string) =>
      `⏰ *Recordatorio de cita*\n\nMañana tienes cita en *${negocio}*:\n📌 ${servicio} a las ${hora}\n\n¡No lo olvides!`,
    en: (negocio: string, servicio: string, hora: string) =>
      `⏰ *Appointment reminder*\n\nTomorrow you have an appointment at *${negocio}*:\n📌 ${servicio} at ${hora}\n\nSee you then!`,
    pt: (negocio: string, servicio: string, hora: string) =>
      `⏰ *Lembrete de consulta*\n\nAmanhã você tem uma consulta em *${negocio}*:\n📌 ${servicio} às ${hora}\n\nAté lá!`,
  },
} as const

type Locale = "es" | "en" | "pt"

function resolveLocale(raw?: string | null): Locale {
  if (raw === "en" || raw === "pt") return raw
  return "es"
}

export interface ConfirmacionWAParams {
  telefono: string
  nombreNegocio: string
  servicio: string
  fecha: string
  hora: string
  locale?: string | null
}

export interface RecordatorioWAParams {
  telefono: string
  nombreNegocio: string
  servicio: string
  hora: string
  locale?: string | null
}

export async function enviarConfirmacionWhatsApp(params: ConfirmacionWAParams): Promise<void> {
  const client = getClient()
  if (!client) return   // not configured — skip silently

  const loc = resolveLocale(params.locale)
  const body = MSGS.confirmacion[loc](
    params.nombreNegocio,
    params.servicio,
    params.fecha,
    params.hora
  )

  await client.messages.create({
    from: FROM(),
    to: toWhatsApp(params.telefono),
    body,
  })
}

export async function enviarRecordatorioWhatsApp(params: RecordatorioWAParams): Promise<void> {
  const client = getClient()
  if (!client) return

  const loc = resolveLocale(params.locale)
  const body = MSGS.recordatorio[loc](params.nombreNegocio, params.servicio, params.hora)

  await client.messages.create({
    from: FROM(),
    to: toWhatsApp(params.telefono),
    body,
  })
}
