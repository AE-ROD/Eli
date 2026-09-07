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

/**
 * HTML que ya pasó por `html` y es seguro para insertar en el correo tal
 * cual. Es un tipo opaco (no un `string`) a propósito: no hay forma de
 * producir uno excepto llamando a `html`, así que un `intro`/`cierre` armado
 * a mano con un template literal común ni siquiera compila. La protección
 * no depende de que quien agregue un correo se acuerde de escapar.
 */
type HtmlSeguro = { readonly __marca: "HtmlSeguro"; readonly valor: string }

/** Escapa lo mínimo necesario para texto o atributos HTML. */
function escaparHtml(valor: unknown): string {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Tagged template para armar HTML de correo. El texto literal de la
 * plantilla (donde puede ir `<strong>`, escrito por nosotros) se preserva
 * tal cual; cada valor interpolado —el dato que escribió una persona— se
 * escapa siempre. Es la única forma marcada de producir un `HtmlSeguro`.
 */
function html(partes: TemplateStringsArray, ...valores: unknown[]): HtmlSeguro {
  const texto = partes.reduce(
    (acc, parte, i) => acc + parte + (i < valores.length ? escaparHtml(valores[i]) : ""),
    "",
  )
  return { __marca: "HtmlSeguro", valor: texto }
}

/**
 * Asunto de correo ya libre de saltos de línea y caracteres de control. Es un
 * tipo opaco (no un `string`) a propósito, mismo patrón que `HtmlSeguro`: no
 * hay forma de producir uno excepto llamando a `asunto`, así que un asunto
 * nuevo armado a mano con un template literal común ni siquiera compila. La
 * protección no depende de que quien lo escriba se acuerde de limpiarlo.
 */
type AsuntoSeguro = { readonly __marca: "AsuntoSeguro"; readonly valor: string }

/**
 * Quita del asunto todo lo que un encabezado de correo no debería llevar:
 * `\r`, `\n`, los separadores de línea/párrafo de Unicode (`U+2028` y
 * `U+2029`, que algunos consumidores tratan como salto de línea aunque no
 * sean `\r`/`\n`) y el resto de los caracteres de control (incluido `DEL`).
 * Sin esto, un nombre con un `\r\n` podría agregar un encabezado falso —un
 * `Bcc:`, por ejemplo— al correo.
 */
function limpiarAsunto(valor: unknown): string {
  return String(valor).replace(/[\r\n\u2028\u2029\x00-\x1f\x7f]/g, "")
}

/**
 * Tagged template para armar el asunto de un correo. El texto literal de la
 * plantilla (fijo, escrito por nosotros) se preserva tal cual; cada valor
 * interpolado —el dato que escribió una persona— se limpia siempre. Es la
 * única forma marcada de producir un `AsuntoSeguro`.
 */
function asunto(partes: TemplateStringsArray, ...valores: unknown[]): AsuntoSeguro {
  const texto = partes.reduce(
    (acc, parte, i) => acc + parte + (i < valores.length ? limpiarAsunto(valores[i]) : ""),
    "",
  )
  return { __marca: "AsuntoSeguro", valor: texto }
}

interface Correo {
  para: string
  asunto: AsuntoSeguro
  /** Siempre un texto fijo que escribimos nosotros, nunca un dato de persona. */
  titulo: string
  intro: HtmlSeguro
  /** Pares etiqueta/valor de la tarjeta destacada. Se escapan acá adentro, no en el llamador. */
  detalle?: Array<[string, string]>
  destacado?: boolean
  /** `texto` es siempre fijo; `enlace` lo arma el servidor. */
  boton?: { texto: string; enlace: string }
  cierre?: HtmlSeguro
}

/** Sin clave configurada no se envía nada, igual que el rate limit sin Upstash. */
async function enviar({ para, asunto: asuntoSeguro, titulo, intro, detalle, destacado, boton, cierre }: Correo) {
  const api = resend()
  if (!api) {
    console.warn(`[email] RESEND_API_KEY no configurada: no se envió "${asuntoSeguro.valor}".`)
    return null
  }

  const tarjeta = destacado
    ? "background: #f0f7ff; border-left: 4px solid #3b82f6;"
    : "background: #f5f5f5;"

  return api.emails.send({
    from: FROM,
    to: para,
    subject: asuntoSeguro.valor,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <h1 style="font-size: 24px; font-weight: 700; color: #111; margin-bottom: 8px;">${titulo}</h1>
        <p style="color: #555; margin-bottom: 24px;">${intro.valor}</p>
        ${
          detalle?.length
            ? `<div style="${tarjeta} border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                 ${detalle
                   .map(
                     ([etiqueta, valor]) =>
                       `<p style="margin: 0 0 8px; color: #111;"><strong>${escaparHtml(etiqueta)}:</strong> ${escaparHtml(valor)}</p>`,
                   )
                   .join("")}
               </div>`
            : ""
        }
        ${
          boton
            ? `<a href="${boton.enlace}" style="display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">${escaparHtml(boton.texto)}</a>`
            : ""
        }
        ${cierre ? `<p style="color: #555; font-size: 14px; margin-top: 24px;">${cierre.valor}</p>` : ""}
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
    asunto: asunto`✅ Cita confirmada — ${datos.nombreNegocio}`,
    titulo: "¡Tu cita está confirmada!",
    intro: html`Hola <strong>${datos.nombreCliente}</strong>, te esperamos en <strong>${datos.nombreNegocio}</strong>.`,
    detalle: [
      ["Servicio", datos.servicio],
      ["Fecha", fechaLegible(datos.fecha)],
      ["Hora", datos.hora],
      ["Duración", `${datos.duracion} minutos`],
    ],
    cierre: html`Si necesitas cancelar o cambiar tu cita, contáctanos con anticipación.`,
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
    asunto: asunto`📅 Nueva reserva — ${datos.nombreCliente}`,
    titulo: "Nueva reserva recibida",
    intro: html`Tienes una nueva cita en <strong>${datos.nombreNegocio}</strong>.`,
    detalle,
    destacado: true,
    cierre: html`Revisa tu calendario en el dashboard para ver todos los detalles.`,
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
    asunto: asunto`🔔 Recordatorio — Tu cita es mañana`,
    titulo: "Tu cita es mañana 👋",
    intro: html`Hola <strong>${datos.nombreCliente}</strong>, te recordamos que tienes una cita mañana en <strong>${datos.nombreNegocio}</strong>.`,
    detalle: [
      ["Servicio", datos.servicio],
      ["Fecha", fechaLegible(datos.fecha)],
      ["Hora", datos.hora],
    ],
    cierre: html`¡Te esperamos! Si no puedes asistir, por favor avísanos con anticipación.`,
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
    asunto: asunto`🔑 Restablece tu contraseña — Eli`,
    titulo: "Restablece tu contraseña",
    intro: html`Hola <strong>${datos.nombreUsuario}</strong>, recibimos una solicitud para restablecer tu contraseña.`,
    boton: { texto: "Crear nueva contraseña", enlace: datos.enlaceRestablecer },
    cierre: html`Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue siendo válida.`,
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
    asunto: asunto`Te invitaron a unirte a ${datos.nombreNegocio} en Eli`,
    titulo: "Tienes una invitación",
    intro: html`Hola <strong>${datos.nombreTrabajador}</strong>, te invitaron a formar parte de <strong>${datos.nombreNegocio}</strong> como <strong>${rol}</strong>.`,
    detalle: [
      ["Negocio", datos.nombreNegocio],
      ["Tu rol", rol],
    ],
    destacado: true,
    boton: { texto: "Aceptar invitación", enlace: datos.enlaceAceptar },
    cierre: html`Este enlace expira en 7 días. Si no esperabas esta invitación, ignora este correo.`,
  })
}
