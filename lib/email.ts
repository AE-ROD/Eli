import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? "Eli <no-reply@eli.app>"

export interface DatosConfirmacionCliente {
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  servicio: string
  fecha: string
  hora: string
  duracion: number
}

export interface DatosAvisoProfesional {
  emailProfesional: string
  nombreNegocio: string
  nombreCliente: string
  servicio: string
  fecha: string
  hora: string
  comentarios?: string | null
}

export interface DatosRecordatorio {
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  servicio: string
  fecha: string
  hora: string
}

function formatFechaLegible(fechaISO: string): string {
  return new Date(fechaISO).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export async function enviarConfirmacionCliente(datos: DatosConfirmacionCliente) {
  const fechaLegible = formatFechaLegible(datos.fecha)

  return resend.emails.send({
    from: FROM,
    to: datos.emailCliente,
    subject: `✅ Cita confirmada — ${datos.nombreNegocio}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">¡Tu cita está confirmada!</h1>
        <p style="color: #555; margin-bottom: 24px;">Hola <strong>${datos.nombreCliente}</strong>, te esperamos en <strong>${datos.nombreNegocio}</strong>.</p>

        <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #111;"><strong>Servicio:</strong> ${datos.servicio}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>Fecha:</strong> ${fechaLegible}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>Hora:</strong> ${datos.hora}</p>
          <p style="margin: 0; color: #111;"><strong>Duración:</strong> ${datos.duracion} minutos</p>
        </div>

        <p style="color: #555; font-size: 14px;">Si necesitas cancelar o cambiar tu cita, contáctanos con anticipación.</p>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">Enviado por Eli · Sistema de agendamiento</p>
      </div>
    `,
  })
}

export async function enviarAvisoProfesional(datos: DatosAvisoProfesional) {
  const fechaLegible = formatFechaLegible(datos.fecha)

  return resend.emails.send({
    from: FROM,
    to: datos.emailProfesional,
    subject: `📅 Nueva reserva — ${datos.nombreCliente}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">Nueva reserva recibida</h1>
        <p style="color: #555; margin-bottom: 24px;">Tienes una nueva cita en <strong>${datos.nombreNegocio}</strong>.</p>

        <div style="background: #f0f7ff; border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #3b82f6;">
          <p style="margin: 0 0 8px; color: #111;"><strong>Cliente:</strong> ${datos.nombreCliente}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>Servicio:</strong> ${datos.servicio}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>Fecha:</strong> ${fechaLegible}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>Hora:</strong> ${datos.hora}</p>
          ${datos.comentarios ? `<p style="margin: 8px 0 0; color: #555; font-size: 14px;"><strong>Comentarios:</strong> ${datos.comentarios}</p>` : ""}
        </div>

        <p style="color: #555; font-size: 14px;">Revisa tu calendario en el dashboard para ver todos los detalles.</p>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">Enviado por Eli · Sistema de agendamiento</p>
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

  return resend.emails.send({
    from: FROM,
    to: datos.emailTrabajador,
    subject: `Te invitaron a unirte a ${datos.nombreNegocio} en Eli`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">Tienes una invitación</h1>
        <p style="color: #555; margin-bottom: 24px;">Hola <strong>${datos.nombreTrabajador}</strong>, te invitaron a formar parte de <strong>${datos.nombreNegocio}</strong> como <strong>${rolLabel}</strong>.</p>

        <div style="background: #f0f7ff; border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #3b82f6;">
          <p style="margin: 0 0 8px; color: #111;"><strong>Negocio:</strong> ${datos.nombreNegocio}</p>
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

export async function enviarRecordatorio(datos: DatosRecordatorio) {
  const fechaLegible = formatFechaLegible(datos.fecha)

  return resend.emails.send({
    from: FROM,
    to: datos.emailCliente,
    subject: `🔔 Recordatorio — Tu cita es mañana`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">Tu cita es mañana 👋</h1>
        <p style="color: #555; margin-bottom: 24px;">Hola <strong>${datos.nombreCliente}</strong>, te recordamos que tienes una cita mañana en <strong>${datos.nombreNegocio}</strong>.</p>

        <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #111;"><strong>Servicio:</strong> ${datos.servicio}</p>
          <p style="margin: 0 0 8px; color: #111;"><strong>Fecha:</strong> ${fechaLegible}</p>
          <p style="margin: 0; color: #111;"><strong>Hora:</strong> ${datos.hora}</p>
        </div>

        <p style="color: #555; font-size: 14px;">¡Te esperamos! Si no puedes asistir, por favor avísanos con anticipación.</p>
        <p style="color: #999; font-size: 12px; margin-top: 32px;">Enviado por Eli · Sistema de agendamiento</p>
      </div>
    `,
  })
}
