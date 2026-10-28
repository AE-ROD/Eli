import { Resend } from "resend"
import { nombreDelRol } from "@/lib/nombres-de-roles"
import {
  DIAS_DE_PRUEBA,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
  formatearPesos,
} from "@/lib/precios"
import type { DatosAcuseDeSoporte, DatosAvisoASoporte } from "@/lib/soporte"

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

/** Nombre fijo de cada correo, para los logs: nunca lleva datos de personas. */
type TipoCorreo =
  | "confirmacion-cliente"
  | "aviso-profesional"
  | "aviso-cancelada"
  | "aviso-reagendada"
  | "recordatorio"
  | "recuperacion-contrasena"
  | "invitacion-trabajador"
  | "aviso-a-soporte"
  | "acuse-de-soporte"
  | TipoCorreoDePrueba

/**
 * Los correos del ciclo de prueba al dueño de un negocio. Cada uno se manda
 * una sola vez por negocio: el nombre es el `tipo` de `CorreoDeCuenta`.
 */
export type TipoCorreoDePrueba = "bienvenida" | "consejo" | "quedan-3-dias" | "termina-hoy"

interface Correo {
  tipo: TipoCorreo
  para: string
  asunto: AsuntoSeguro
  /** Siempre un texto fijo que escribimos nosotros, nunca un dato de persona. */
  titulo: string
  intro: HtmlSeguro
  /** Pasos numerados, de texto fijo: lo que hay que hacer, en orden. */
  pasos?: Array<{ titulo: string; texto: string }>
  /** Pares etiqueta/valor de la tarjeta destacada. Se escapan acá adentro, no en el llamador. */
  detalle?: Array<[string, string]>
  destacado?: boolean
  /** `texto` es siempre fijo; `enlace` lo arma el servidor. */
  boton?: { texto: string; enlace: string }
  cierre?: HtmlSeguro
  /**
   * Enlace "Dejar de recibir estos correos", sólo en los del ciclo de prueba.
   * Lo arma el servidor (`lib/baja-de-correos.ts`).
   */
  enlaceDeBaja?: string
  /** Reply-To: a quién le llega si se responde el correo. */
  responderA?: string
}

/*
 * La marca de Eli en un correo (`docs/diseno/README.md`): fondo crema, tarjeta
 * blanca con borde, texto navy y secundario, botón navy y radios generosos.
 * Los clientes de correo no cargan Geist ni Fraunces: el texto va en la pila
 * sans del sistema y los titulares en Georgia, que es el eco más cercano de
 * Fraunces que tienen todos. Todo con estilos en línea y tablas, que es lo
 * único que Outlook y Gmail respetan igual.
 */
const COLOR = {
  crema: "#FCFBF8",
  superficie: "#F5F3EE",
  tarjeta: "#FFFFFF",
  navy: "#071A31",
  texto2: "#5F6D77",
  borde: "#E7E3DA",
  azulSuave: "#D5E8FE",
} as const

const FUENTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const FUENTE_TITULAR = "Georgia, 'Times New Roman', Times, serif"

/** El HTML completo del correo. Todo lo que no es fijo llega escapado o como `HtmlSeguro`. */
function armarHtml({ asunto: asuntoSeguro, titulo, intro, pasos, detalle, destacado, boton, cierre, enlaceDeBaja }: Correo): string {
  const parrafo = `margin: 0; font-family: ${FUENTE}; font-size: 16px; line-height: 1.55; color: ${COLOR.texto2};`

  const bloquePasos = pasos?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 28px;">
        ${pasos
          .map(
            (paso, i) => `<tr>
              <td valign="top" width="40" style="padding: 0 0 16px;">
                <div style="width: 28px; height: 28px; line-height: 28px; border-radius: 14px; background: ${COLOR.superficie}; color: ${COLOR.navy}; font-family: ${FUENTE}; font-size: 14px; font-weight: 600; text-align: center;">${i + 1}</div>
              </td>
              <td valign="top" style="padding: 2px 0 16px;">
                <p style="margin: 0 0 2px; font-family: ${FUENTE}; font-size: 16px; line-height: 1.4; font-weight: 600; color: ${COLOR.navy};">${escaparHtml(paso.titulo)}</p>
                <p style="${parrafo} font-size: 15px;">${escaparHtml(paso.texto)}</p>
              </td>
            </tr>`,
          )
          .join("")}
      </table>`
    : ""

  const bloqueDetalle = detalle?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 28px;">
        <tr><td style="background: ${destacado ? COLOR.azulSuave : COLOR.superficie}; border-radius: 20px; padding: 20px 24px;">
          ${detalle
            .map(
              ([etiqueta, valor]) =>
                `<p style="margin: 0 0 6px; font-family: ${FUENTE}; font-size: 15px; line-height: 1.5; color: ${COLOR.navy}; white-space: pre-wrap;"><strong>${escaparHtml(etiqueta)}:</strong> ${escaparHtml(valor)}</p>`,
            )
            .join("")}
        </td></tr>
      </table>`
    : ""

  const bloqueBoton = boton
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 8px;">
        <tr><td style="background: ${COLOR.navy}; border-radius: 16px;">
          <a href="${escaparHtml(boton.enlace)}" style="display: inline-block; padding: 14px 26px; border-radius: 16px; font-family: ${FUENTE}; font-size: 16px; font-weight: 600; line-height: 1.2; color: #FFFFFF; text-decoration: none;">${escaparHtml(boton.texto)}</a>
        </td></tr>
      </table>`
    : ""

  const bloqueCierre = cierre ? `<p style="${parrafo} font-size: 15px; margin-top: 24px;">${cierre.valor}</p>` : ""

  const bloqueBaja = enlaceDeBaja
    ? `<p style="margin: 8px 0 0; font-family: ${FUENTE}; font-size: 12px; line-height: 1.5; color: ${COLOR.texto2};"><a href="${escaparHtml(enlaceDeBaja)}" style="color: ${COLOR.texto2}; text-decoration: underline;">Dejar de recibir estos correos</a></p>`
    : ""

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escaparHtml(asuntoSeguro.valor)}</title>
</head>
<body style="margin: 0; padding: 0; background: ${COLOR.crema};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${COLOR.crema};">
  <tr><td align="center" style="padding: 32px 12px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px;">
      <tr><td style="padding: 0 12px 20px; font-family: ${FUENTE_TITULAR}; font-size: 30px; line-height: 1; font-weight: 500; letter-spacing: -0.5px; color: ${COLOR.navy};">Eli</td></tr>
      <tr><td style="background: ${COLOR.tarjeta}; border: 1px solid ${COLOR.borde}; border-radius: 32px; padding: 40px 32px;">
        <h1 style="margin: 0 0 12px; font-family: ${FUENTE_TITULAR}; font-size: 28px; line-height: 1.2; font-weight: 500; letter-spacing: -0.5px; color: ${COLOR.navy};">${escaparHtml(titulo)}</h1>
        <p style="${parrafo} margin-bottom: 28px;">${intro.valor}</p>
        ${bloquePasos}
        ${bloqueDetalle}
        ${bloqueBoton}
        ${bloqueCierre}
      </td></tr>
      <tr><td style="padding: 24px 12px 0;">
        <p style="margin: 0; font-family: ${FUENTE}; font-size: 12px; line-height: 1.5; color: ${COLOR.texto2};">Enviado por Eli · Agenda y cobros para tu negocio</p>
        ${bloqueBaja}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

/** Lo que devuelve un envío: la respuesta de Resend, o `null` si no hay clave configurada. */
export type ResultadoDeEnvio = Awaited<ReturnType<Resend["emails"]["send"]>> | null

/** Sin clave configurada no se envía nada, igual que el rate limit sin Upstash. */
async function enviar(correo: Correo): Promise<ResultadoDeEnvio> {
  const api = resend()
  if (!api) {
    // Sólo el tipo: el asunto lleva nombres de clientes o negocios y `para`
    // es un correo personal, y los logs no son lugar para datos personales.
    console.warn(`[email] RESEND_API_KEY no configurada: no se envió un correo de tipo "${correo.tipo}".`)
    return null
  }

  return api.emails.send({
    from: FROM,
    to: correo.para,
    subject: correo.asunto.valor,
    html: armarHtml(correo),
    ...(correo.responderA ? { replyTo: correo.responderA } : {}),
  })
}

/**
 * "AAAA-MM-DD" es una fecha calendario: `new Date` la lee como la medianoche
 * UTC, así que se escribe en UTC. Con la zona del servidor, al oeste de UTC
 * salía el día anterior.
 */
function fechaLegible(fechaISO: string): string {
  return new Date(fechaISO).toLocaleDateString("es-CL", {
    timeZone: "UTC",
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
  /** Quién atiende, si la reserva quedó asignada. */
  profesional?: string | null
  /**
   * El enlace para cancelar o reagendar sin cuenta (lleva el token en claro:
   * sólo viaja en este correo). Sin él, el correo dice que se contacte al local.
   */
  enlaceDeGestion?: string | null
  /** Hasta cuántas horas antes se puede cambiar con el enlace. */
  plazoHoras?: number
}

export function enviarConfirmacionCliente(datos: DatosConfirmacionCliente) {
  const detalle: Array<[string, string]> = [["Servicio", datos.servicio]]
  if (datos.profesional) detalle.push(["Con", datos.profesional])
  detalle.push(["Fecha", fechaLegible(datos.fecha)], ["Hora", datos.hora], ["Duración", `${datos.duracion} minutos`])
  return enviar({
    tipo: "confirmacion-cliente",
    para: datos.emailCliente,
    asunto: asunto`Cita confirmada — ${datos.nombreNegocio}`,
    titulo: "¡Tu cita está confirmada!",
    intro: html`Hola <strong>${datos.nombreCliente}</strong>, te esperamos en <strong>${datos.nombreNegocio}</strong>.`,
    detalle,
    ...(datos.enlaceDeGestion
      ? {
          boton: { texto: "Cancelar o cambiar mi cita", enlace: datos.enlaceDeGestion },
          cierre:
            datos.plazoHoras && datos.plazoHoras > 0
              ? html`Puedes cancelar o cambiar tu cita con el botón hasta ${datos.plazoHoras} ${datos.plazoHoras === 1 ? "hora" : "horas"} antes. Después, contacta directamente al local.`
              : html`Puedes cancelar o cambiar tu cita con el botón hasta la hora de la cita.`,
        }
      : { cierre: html`Si necesitas cancelar o cambiar tu cita, contáctanos con anticipación.` }),
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
  /** A quién quedó asignada; sin dar, no se muestra. */
  profesional?: string | null
}

export function enviarAvisoProfesional(datos: DatosAvisoProfesional) {
  const detalle: Array<[string, string]> = [
    ["Cliente", datos.nombreCliente],
    ["Servicio", datos.servicio],
    ...(datos.profesional ? [["Profesional", datos.profesional] as [string, string]] : []),
    ["Fecha", fechaLegible(datos.fecha)],
    ["Hora", datos.hora],
  ]
  if (datos.comentarios) detalle.push(["Comentarios", datos.comentarios])

  return enviar({
    tipo: "aviso-profesional",
    para: datos.emailProfesional,
    asunto: asunto`Nueva reserva — ${datos.nombreCliente}`,
    titulo: "Nueva reserva recibida",
    intro: html`Tienes una nueva cita en <strong>${datos.nombreNegocio}</strong>.`,
    detalle,
    destacado: true,
    cierre: html`Revisa tu calendario en tu panel para ver todos los detalles.`,
  })
}

export interface DatosAvisoDeCambioDelCliente {
  tipo: "cancelo" | "reagendo"
  emailNegocio: string
  /**
   * El correo del profesional de la cita, si tiene uno asignado: le llega el
   * mismo aviso, aparte. Si es el del dueño (el dueño que atiende), no se
   * manda dos veces.
   */
  emailProfesional?: string | null
  nombreNegocio: string
  nombreCliente: string
  servicio: string
  profesional?: string | null
  /** La fecha y hora de la cita (la nueva, si reagendó), en el reloj del negocio. */
  fecha: string
  hora: string
  /** Si reagendó: la que tenía antes. */
  fechaAnterior?: string
  horaAnterior?: string
}

/**
 * A quién va el aviso de cambio: el dueño y, si la cita tiene profesional con
 * otro correo, también él. Sin repetir una casilla escrita con otras mayúsculas.
 */
export function destinatariosDelAvisoDeCambio(emailNegocio: string, emailProfesional?: string | null): string[] {
  const profesional = emailProfesional?.trim()
  if (!profesional || profesional.toLowerCase() === emailNegocio.trim().toLowerCase()) return [emailNegocio]
  return [emailNegocio, profesional]
}

/**
 * Aviso al negocio y al profesional de la cita: el cliente canceló o reagendó
 * con su enlace. Un correo por destinatario, para que ninguno vea la casilla
 * del otro.
 */
export function enviarAvisoDeCambioDelCliente(datos: DatosAvisoDeCambioDelCliente) {
  const reagendo = datos.tipo === "reagendo"
  const detalle: Array<[string, string]> = [["Cliente", datos.nombreCliente], ["Servicio", datos.servicio]]
  if (datos.profesional) detalle.push(["Profesional", datos.profesional])
  if (reagendo && datos.fechaAnterior && datos.horaAnterior) {
    detalle.push(["Antes", `${fechaLegible(datos.fechaAnterior)}, ${datos.horaAnterior}`])
    detalle.push(["Ahora", `${fechaLegible(datos.fecha)}, ${datos.hora}`])
  } else {
    detalle.push(["Fecha", fechaLegible(datos.fecha)], ["Hora", datos.hora])
  }

  const correo = {
    tipo: reagendo ? "aviso-reagendada" : "aviso-cancelada",
    asunto: reagendo ? asunto`Cita reagendada — ${datos.nombreCliente}` : asunto`Cita cancelada — ${datos.nombreCliente}`,
    titulo: reagendo ? "Un cliente cambió su cita" : "Un cliente canceló su cita",
    intro: reagendo
      ? html`<strong>${datos.nombreCliente}</strong> cambió la hora de su cita en <strong>${datos.nombreNegocio}</strong> desde su enlace.`
      : html`<strong>${datos.nombreCliente}</strong> canceló su cita en <strong>${datos.nombreNegocio}</strong> desde su enlace. El horario quedó libre.`,
    detalle,
    destacado: true,
    cierre: html`Revisa tu agenda en el panel.`,
  } satisfies Omit<Correo, "para">

  const destinatarios = destinatariosDelAvisoDeCambio(datos.emailNegocio, datos.emailProfesional)
  return Promise.all(destinatarios.map((para) => enviar({ ...correo, para })))
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
    tipo: "recordatorio",
    para: datos.emailCliente,
    asunto: asunto`Recordatorio — tu cita es mañana`,
    titulo: "Tu cita es mañana",
    intro: html`Hola <strong>${datos.nombreCliente}</strong>, te recordamos que tienes una cita mañana en <strong>${datos.nombreNegocio}</strong>.`,
    detalle: [
      ["Servicio", datos.servicio],
      ["Fecha", fechaLegible(datos.fecha)],
      ["Hora", datos.hora],
    ],
    cierre: html`¡Te esperamos! Si no puedes asistir, por favor avísanos con anticipación.`,
  })
}

export interface DatosRecuperacionContrasena {
  emailUsuario: string
  nombreUsuario: string
  enlaceRestablecer: string
}

export function enviarRecuperacionContrasena(datos: DatosRecuperacionContrasena) {
  return enviar({
    tipo: "recuperacion-contrasena",
    para: datos.emailUsuario,
    asunto: asunto`Restablece tu contraseña — Eli`,
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
  const rol = nombreDelRol(datos.rol)

  return enviar({
    tipo: "invitacion-trabajador",
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

// ─── Ciclo de prueba ─────────────────────────────────────────────────────────

export interface DatosCorreoDePrueba {
  emailDueno: string
  nombreDueno: string
  nombreNegocio: string
  /** `${NEXTAUTH_URL}/dashboard`. */
  enlacePanel: string
  /** `${NEXTAUTH_URL}/reservar/${slug}`: la página pública de reservas. */
  enlaceReservas: string
  /** La página de baja con el token del dueño (`lib/baja-de-correos.ts`). */
  enlaceDeBaja: string
  /** Último día de la prueba, "AAAA-MM-DD" en la zona del negocio. */
  ultimoDia: string
  /** Días calendario que faltan para `ultimoDia` (0 = hoy). */
  diasRestantes: number
}

/**
 * "sábado 24 de octubre" de una fecha calendario. Se lee en UTC a propósito:
 * la fecha ya viene calculada en la zona del negocio, y leerla en la zona
 * del servidor podría correrla un día.
 */
function diaLegible(fecha: string): string {
  const [año, mes, dia] = fecha.split("-").map(Number)
  return new Date(Date.UTC(año, mes - 1, dia)).toLocaleDateString("es-CL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

/** Los dos planes, de `lib/precios.ts`. Sólo dice cuánto costaría: todavía no se cobra. */
function detalleDePlanes(): Array<[string, string]> {
  return [
    ["Independiente", `${formatearPesos(PRECIO_INDEPENDIENTE)} al mes, si atiendes solo`],
    [
      "Equipo",
      `${formatearPesos(PRECIO_EQUIPO)} al mes con ${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden, y ${formatearPesos(PRECIO_PERSONA_ADICIONAL)} por cada persona adicional`,
    ],
  ]
}

/** Lo honesto mientras no exista el cobro: no hay nada que pagar todavía. */
const SIN_COBRO_TODAVIA = html`Todavía no se cobra nada y no tienes que hacer nada por ahora. Muy pronto vas a poder activar tu plan desde el panel. Los precios incluyen IVA.`

function correoDePrueba(tipo: TipoCorreoDePrueba, datos: DatosCorreoDePrueba): Correo {
  const base = { tipo, para: datos.emailDueno, enlaceDeBaja: datos.enlaceDeBaja }

  switch (tipo) {
    case "bienvenida":
      return {
        ...base,
        asunto: asunto`Te damos la bienvenida a Eli`,
        titulo: "Tu negocio ya está en Eli",
        intro: html`Hola <strong>${datos.nombreDueno}</strong>, <strong>${datos.nombreNegocio}</strong> ya tiene su espacio en Eli. Tienes ${DIAS_DE_PRUEBA} días de prueba gratis, sin tarjeta. Para empezar a recibir reservas, te faltan tres pasos:`,
        pasos: [
          { titulo: "Define tu horario", texto: "Los días y las horas en que atiendes. Tus clientes solo ven horas libres dentro de ese horario." },
          { titulo: "Agrega tus servicios", texto: "Qué ofreces, cuánto dura y cuánto cuesta." },
          { titulo: "Comparte tu enlace de reservas", texto: "Tus clientes eligen el servicio y la hora, y la cita aparece en tu agenda." },
        ],
        boton: { texto: "Ir a mi panel", enlace: datos.enlacePanel },
      }

    case "consejo":
      return {
        ...base,
        asunto: asunto`Un consejo para recibir tus primeras reservas`,
        titulo: "Pon tu enlace donde ya te buscan",
        intro: html`Hola <strong>${datos.nombreDueno}</strong>, la forma más rápida de llenar tu agenda es que tus clientes reserven solos. Pega tu enlace de reservas en la biografía de Instagram y compártelo por WhatsApp: en tu estado, o como respuesta cuando alguien te pregunte por una hora.`,
        detalle: [["Tu enlace", datos.enlaceReservas]],
        boton: { texto: "Ver mi página de reservas", enlace: datos.enlaceReservas },
        cierre: html`Cada reserva que llegue por ahí aparece en tu agenda, sin que tengas que anotarla.`,
      }

    case "quedan-3-dias":
      return {
        ...base,
        asunto:
          datos.diasRestantes === 1
            ? asunto`Mañana termina tu prueba de Eli`
            : asunto`Te quedan ${datos.diasRestantes} días de prueba en Eli`,
        titulo: "Tu prueba gratis termina pronto",
        intro: html`Hola <strong>${datos.nombreDueno}</strong>, la prueba gratis de <strong>${datos.nombreNegocio}</strong> termina el ${diaLegible(datos.ultimoDia)}. Hasta ese día puedes seguir usando todas las funciones. Estos son los planes:`,
        detalle: detalleDePlanes(),
        boton: { texto: "Ir a mi panel", enlace: datos.enlacePanel },
        cierre: SIN_COBRO_TODAVIA,
      }

    case "termina-hoy":
      return {
        ...base,
        asunto: asunto`Hoy termina tu prueba de Eli`,
        titulo: "Hoy termina tu prueba gratis",
        intro: html`Hola <strong>${datos.nombreDueno}</strong>, hoy es el último día de la prueba gratis de <strong>${datos.nombreNegocio}</strong>. Gracias por probar Eli. Estos son los planes:`,
        detalle: detalleDePlanes(),
        boton: { texto: "Ir a mi panel", enlace: datos.enlacePanel },
        cierre: SIN_COBRO_TODAVIA,
      }
  }
}

/**
 * Manda uno de los correos del ciclo de prueba al dueño. No decide si toca ni
 * lleva la cuenta de lo enviado: eso es de `lib/enviar-correo-de-prueba.ts`.
 */
export function enviarCorreoDePrueba(tipo: TipoCorreoDePrueba, datos: DatosCorreoDePrueba) {
  return enviar(correoDePrueba(tipo, datos))
}

// ─── Soporte ─────────────────────────────────────────────────────────────────

/**
 * El aviso a la casilla de soporte (`SOPORTE_EMAIL`) con todos los datos de la
 * solicitud. Responderlo le contesta directo a quien la mandó.
 */
export function enviarSolicitudASoporte(datos: DatosAvisoASoporte) {
  return enviar({
    tipo: "aviso-a-soporte",
    para: datos.para,
    responderA: datos.responderA,
    asunto: asunto`[Soporte ${datos.numero}] ${datos.tipo} · ${datos.area} — ${datos.asunto}`,
    titulo: "Nueva solicitud de soporte",
    intro: html`Llegó la solicitud <strong>${datos.numero}</strong>. Responde este correo para contestarle directo a quien la envió.`,
    detalle: datos.detalle,
    destacado: true,
  })
}

/**
 * El acuse a quien mandó la solicitud. Sin plazos de respuesta, y sin el texto
 * que escribió la persona (ver `correosDeSolicitud` en `lib/soporte.ts`).
 */
export function enviarAcuseDeSoporte(datos: DatosAcuseDeSoporte) {
  return enviar({
    tipo: "acuse-de-soporte",
    para: datos.para,
    ...(datos.responderA ? { responderA: datos.responderA } : {}),
    asunto: asunto`Recibimos tu solicitud ${datos.numero}`,
    titulo: "Recibimos tu solicitud",
    intro: html`Hola, tu solicitud quedó registrada con el número <strong>${datos.numero}</strong>. Guárdalo por si necesitas mencionarla.`,
    detalle: datos.detalle,
    cierre: html`Te vamos a responder por correo a esta misma dirección. Si no enviaste esta solicitud, puedes ignorar este correo.`,
  })
}
