import { Resend } from "resend"

const FROM = process.env.RESEND_FROM_EMAIL ?? "Eli <no-reply@eli.app>"

let cliente: Resend | null = null

/**
 * Se crea al primer envío, no al importar el módulo: con la clave ausente,
 * construirlo arriba rompía el build en cualquier entorno sin `RESEND_API_KEY`.
 */
function resend(): Resend | null {
  const clave = process.env.RESEND_API_KEY
  if (!clave) return null
  return (cliente ??= new Resend(clave))
}

interface Correo {
  para: string
  asunto: string
  titulo: string
  intro: string
  /** Pares etiqueta/valor de la tarjeta destacada. */
  detalle?: Array<[string, string]>
  destacado?: boolean
  boton?: { texto: string; enlace: string }
  cierre?: string
}

/** Sin clave configurada no se envía nada, igual que el rate limit sin Upstash. */
async function enviar({ para, asunto, titulo, intro, detalle, destacado, boton, cierre }: Correo) {
  const api = resend()
  if (!api) {
    console.warn(`[email] RESEND_API_KEY no configurada: no se envió "${asunto}".`)
    return null
  }

  const tarjeta = destacado
    ? "background: #f0f7ff; border-left: 4px solid #3b82f6;"
    : "background: #f5f5f5;"

  return api.emails.send({
    from: FROM,
    to: para,
    subject: asunto,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">${titulo}</h1>
        <p style="color: #555; margin-bottom: 24px;">${intro}</p>
        ${
          detalle?.length
            ? `<div style="${tarjeta} border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                 ${detalle
                   .map(
                     ([etiqueta, valor]) =>
                       `<p style="margin: 0 0 8px; color: #111;"><strong>${etiqueta}:</strong> ${valor}</p>`,
                   )
                   .join("")}
               </div>`
            : ""
        }
        ${
          boton
            ? `<a href="${boton.enlace}" style="display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">${boton.texto}</a>`
            : ""
        }
        ${cierre ? `<p style="color: #555; font-size: 14px; margin-top: 24px;">${cierre}</p>` : ""}
        <p style="color: #999; font-size: 12px; margin-top: 32px;">Enviado por Eli · Sistema de agendamiento</p>
      </div>
    `,
  })
}

function fechaLegible(fechaISO: string): string {
  return new Date(fechaISO).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export interface DatosConfirmacionCliente {
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  servicio: string
  fecha: string
  hora: string
  duracion: number
}

export function enviarConfirmacionCliente(datos: DatosConfirmacionCliente) {
  return enviar({
    para: datos.emailCliente,
    asunto: `✅ Cita confirmada — ${datos.nombreNegocio}`,
    titulo: "¡Tu cita está confirmada!",
    intro: `Hola <strong>${datos.nombreCliente}</strong>, te esperamos en <strong>${datos.nombreNegocio}</strong>.`,
    detalle: [
      ["Servicio", datos.servicio],
      ["Fecha", fechaLegible(datos.fecha)],
      ["Hora", datos.hora],
      ["Duración", `${datos.duracion} minutos`],
    ],
    cierre: "Si necesitas cancelar o cambiar tu cita, contáctanos con anticipación.",
  })
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

export function enviarAvisoProfesional(datos: DatosAvisoProfesional) {
  const detalle: Array<[string, string]> = [
    ["Cliente", datos.nombreCliente],
    ["Servicio", datos.servicio],
    ["Fecha", fechaLegible(datos.fecha)],
    ["Hora", datos.hora],
  ]
  if (datos.comentarios) detalle.push(["Comentarios", datos.comentarios])

  return enviar({
    para: datos.emailProfesional,
    asunto: `📅 Nueva reserva — ${datos.nombreCliente}`,
    titulo: "Nueva reserva recibida",
    intro: `Tienes una nueva cita en <strong>${datos.nombreNegocio}</strong>.`,
    detalle,
    destacado: true,
    cierre: "Revisa tu calendario en el dashboard para ver todos los detalles.",
  })
}

export interface DatosRecordatorio {
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  servicio: string
  fecha: string
  hora: string
}

export function enviarRecordatorio(datos: DatosRecordatorio) {
  return enviar({
    para: datos.emailCliente,
    asunto: "🔔 Recordatorio — Tu cita es mañana",
    titulo: "Tu cita es mañana 👋",
    intro: `Hola <strong>${datos.nombreCliente}</strong>, te recordamos que tienes una cita mañana en <strong>${datos.nombreNegocio}</strong>.`,
    detalle: [
      ["Servicio", datos.servicio],
      ["Fecha", fechaLegible(datos.fecha)],
      ["Hora", datos.hora],
    ],
    cierre: "¡Te esperamos! Si no puedes asistir, por favor avísanos con anticipación.",
  })
}

export interface DatosRecuperacionPassword {
  emailUsuario: string
  nombreUsuario: string
  enlaceRestablecer: string
}

export function enviarRecuperacionPassword(datos: DatosRecuperacionPassword) {
  return enviar({
    para: datos.emailUsuario,
    asunto: "🔑 Restablece tu contraseña — Eli",
    titulo: "Restablece tu contraseña",
    intro: `Hola <strong>${datos.nombreUsuario}</strong>, recibimos una solicitud para restablecer tu contraseña.`,
    boton: { texto: "Crear nueva contraseña", enlace: datos.enlaceRestablecer },
    cierre:
      "Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue siendo válida.",
  })
}

export interface DatosInvitacionTrabajador {
  emailTrabajador: string
  nombreTrabajador: string
  nombreNegocio: string
  rol: string
  enlaceAceptar: string
}

export function enviarInvitacionTrabajador(datos: DatosInvitacionTrabajador) {
  const rol = datos.rol === "admin" ? "Encargado" : "Profesional"

  return enviar({
    para: datos.emailTrabajador,
    asunto: `Te invitaron a unirte a ${datos.nombreNegocio} en Eli`,
    titulo: "Tienes una invitación",
    intro: `Hola <strong>${datos.nombreTrabajador}</strong>, te invitaron a formar parte de <strong>${datos.nombreNegocio}</strong> como <strong>${rol}</strong>.`,
    detalle: [
      ["Negocio", datos.nombreNegocio],
      ["Tu rol", rol],
    ],
    destacado: true,
    boton: { texto: "Aceptar invitación", enlace: datos.enlaceAceptar },
    cierre: "Este enlace expira en 7 días. Si no esperabas esta invitación, ignora este correo.",
  })
}
