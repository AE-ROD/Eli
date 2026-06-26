import { Resend } from "resend"
import { t } from "@/lib/i18n/booking"

const FROM = process.env.RESEND_FROM_EMAIL ?? "Eli <no-reply@eli.app>"

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function formatFechaLegible(fechaISO: string, locale = "es"): string {
  return new Date(fechaISO).toLocaleDateString(
    locale === "pt" ? "pt-BR" : locale === "en" ? "en-US" : "es-MX",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  )
}

export interface DatosConfirmacionCliente {
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  servicio: string
  fecha: string
  hora: string
  duracion: number
  locale?: string
}

export interface DatosAvisoProfesional {
  emailProfesional: string
  nombreNegocio: string
  nombreCliente: string
  servicio: string
  fecha: string
  hora: string
  comentarios?: string | null
  locale?: string
}

export interface DatosRecordatorio {
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  servicio: string
  fecha: string
  hora: string
  locale?: string
}

export async function enviarConfirmacionCliente(datos: DatosConfirmacionCliente) {
  const locale = datos.locale ?? "es"
  const fechaLegible = formatFechaLegible(datos.fecha, locale)
  const nombreNegocio = escapeHtml(datos.nombreNegocio)
  const nombreCliente = escapeHtml(datos.nombreCliente)
  const servicio = escapeHtml(datos.servicio)

  return getResend().emails.send({
    from: FROM,
    to: datos.emailCliente,
    subject: `✅ ${t(locale, "emailConfirmSubject")} — ${nombreNegocio}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">${t(locale, "emailConfirmTitle")}</h1>
        <p style="color: #555; margin-bottom: 24px;">${t(locale, "greeting_morning")} <strong>${nombreCliente}</strong>, ${t(locale, "emailConfirmBody")} <strong>${nombreNegocio}</strong>.</p>

        <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #111;"><strong>${t(locale, "emailService")}:</strong> ${servicio}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>${t(locale, "emailDate")}:</strong> ${fechaLegible}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>${t(locale, "emailTime")}:</strong> ${escapeHtml(datos.hora)}</p>
          <p style="margin: 0; color: #111;"><strong>${t(locale, "emailDuration")}:</strong> ${datos.duracion} ${t(locale, "emailMinutes")}</p>
        </div>

        <p style="color: #555; font-size: 14px;">${t(locale, "emailCancelNote")}</p>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">${t(locale, "emailFooter")}</p>
      </div>
    `,
  })
}

export async function enviarAvisoProfesional(datos: DatosAvisoProfesional) {
  const locale = datos.locale ?? "es"
  const fechaLegible = formatFechaLegible(datos.fecha, locale)
  const nombreNegocio = escapeHtml(datos.nombreNegocio)
  const nombreCliente = escapeHtml(datos.nombreCliente)
  const servicio = escapeHtml(datos.servicio)

  return getResend().emails.send({
    from: FROM,
    to: datos.emailProfesional,
    subject: `📅 ${t(locale, "emailNewBookingSubject")} — ${nombreCliente}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">${t(locale, "emailNewBookingTitle")}</h1>
        <p style="color: #555; margin-bottom: 24px;">${t(locale, "emailNewBookingBody")} <strong>${nombreNegocio}</strong>.</p>

        <div style="background: #f0f7ff; border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #3b82f6;">
          <p style="margin: 0 0 8px; color: #111;"><strong>${t(locale, "emailClient")}:</strong> ${nombreCliente}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>${t(locale, "emailService")}:</strong> ${servicio}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>${t(locale, "emailDate")}:</strong> ${fechaLegible}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>${t(locale, "emailTime")}:</strong> ${escapeHtml(datos.hora)}</p>
          ${datos.comentarios ? `<p style="margin: 8px 0 0; color: #555; font-size: 14px;"><strong>${t(locale, "emailComments")}:</strong> ${escapeHtml(datos.comentarios)}</p>` : ""}
        </div>

        <p style="color: #555; font-size: 14px;">${t(locale, "emailCheckCalendar")}</p>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">${t(locale, "emailFooter")}</p>
      </div>
    `,
  })
}

export interface DatosInvitacionTrabajador {
  emailTrabajador: string
  nombreTrabajador: string
  nombreNegocio: string
  rol: string
  enlaceAceptar: string
}

export async function enviarInvitacionTrabajador(datos: DatosInvitacionTrabajador) {
  const rolLabel = datos.rol === "admin" ? "Administrador" : "Trabajador"
  const nombreNegocio = escapeHtml(datos.nombreNegocio)
  const nombreTrabajador = escapeHtml(datos.nombreTrabajador)

  return getResend().emails.send({
    from: FROM,
    to: datos.emailTrabajador,
    subject: `Te invitaron a unirte a ${nombreNegocio} en Eli`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">Tienes una invitación</h1>
        <p style="color: #555; margin-bottom: 24px;">Hola <strong>${nombreTrabajador}</strong>, te invitaron a formar parte de <strong>${nombreNegocio}</strong> como <strong>${rolLabel}</strong>.</p>

        <div style="background: #f0f7ff; border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #3b82f6;">
          <p style="margin: 0 0 8px; color: #111;"><strong>Negocio:</strong> ${nombreNegocio}</p>
          <p style="margin: 0; color: #111;"><strong>Tu rol:</strong> ${rolLabel}</p>
        </div>

        <a href="${datos.enlaceAceptar}" style="display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Aceptar invitación
        </a>

        <p style="color: #999; font-size: 12px; margin-top: 32px;">Este enlace expira en 7 días. Si no esperabas esta invitación, ignora este correo.</p>
        <p style="color: #999; font-size: 12px;">Enviado por Eli · Sistema de agendamiento</p>
      </div>
    `,
  })
}

export interface DatosNotaUrgente {
  emailDestinatario: string
  nombreDestinatario: string
  nombreNegocio: string
  nombreAutor: string
  titulo: string
  contenido: string
}

export async function enviarNotificacionNotaUrgente(datos: DatosNotaUrgente) {
  const nombreNegocio = escapeHtml(datos.nombreNegocio)
  const nombreAutor = escapeHtml(datos.nombreAutor)
  const titulo = escapeHtml(datos.titulo)
  const contenido = escapeHtml(datos.contenido)

  return getResend().emails.send({
    from: FROM,
    to: datos.emailDestinatario,
    subject: `🚨 Nota urgente — ${nombreNegocio}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">Nota de turno urgente</h1>
        <p style="color: #555; margin-bottom: 24px;">Hola <strong>${escapeHtml(datos.nombreDestinatario)}</strong>, <strong>${nombreAutor}</strong> registró una nota urgente en <strong>${nombreNegocio}</strong>.</p>

        <div style="background: #fef2f2; border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #ef4444;">
          <p style="margin: 0 0 8px; color: #111; font-weight: 700;">${titulo}</p>
          <p style="margin: 0; color: #555; font-size: 14px; white-space: pre-wrap;">${contenido}</p>
        </div>

        <p style="color: #555; font-size: 14px;">Revisa el módulo de Notas de Turno en Eli para más detalles.</p>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">Enviado por Eli · Sistema de agendamiento</p>
      </div>
    `,
  })
}

export async function enviarRecordatorio(datos: DatosRecordatorio) {
  const locale = datos.locale ?? "es"
  const fechaLegible = formatFechaLegible(datos.fecha, locale)
  const nombreNegocio = escapeHtml(datos.nombreNegocio)
  const nombreCliente = escapeHtml(datos.nombreCliente)
  const servicio = escapeHtml(datos.servicio)

  return getResend().emails.send({
    from: FROM,
    to: datos.emailCliente,
    subject: `🔔 ${t(locale, "emailReminderSubject")} — ${nombreNegocio}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">${t(locale, "emailReminderTitle")} 👋</h1>
        <p style="color: #555; margin-bottom: 24px;">${t(locale, "greeting_morning")} <strong>${nombreCliente}</strong>, ${t(locale, "emailReminderBody")} <strong>${nombreNegocio}</strong>.</p>

        <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #111;"><strong>${t(locale, "emailService")}:</strong> ${servicio}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>${t(locale, "emailDate")}:</strong> ${fechaLegible}</p>
          <p style="margin: 0; color: #111;"><strong>${t(locale, "emailTime")}:</strong> ${escapeHtml(datos.hora)}</p>
        </div>

        <p style="color: #555; font-size: 14px;">${t(locale, "emailCancelNote")}</p>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">${t(locale, "emailFooter")}</p>
      </div>
    `,
  })
}
