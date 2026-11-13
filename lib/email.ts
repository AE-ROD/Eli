import { Resend } from "resend"
import { al, concordar, el, ese, un } from "@/lib/concordancia"
import { formatearMonto } from "@/lib/dinero"
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
import { conMayuscula, vocabularioDe, type Genero, type Sustantivo } from "@/lib/vocabulario"

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
  | "aviso-lista-de-espera"
  | "te-toca"
  | "pedir-resena"
  | "reserva-confirmada-por-el-local"
  | "aviso-fila-virtual"
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
   * Enlace del pie para dejar de recibir estos correos: los del ciclo de
   * prueba (`lib/baja-de-correos.ts`), los promocionales a clientes
   * (`lib/baja-de-clientes.ts`) y salir de la lista de espera. Lo arma el
   * servidor.
   */
  enlaceDeBaja?: string
  /** El texto de ese enlace, fijo. Por defecto "Dejar de recibir estos correos". */
  textoDeBaja?: string
  /**
   * La URL de la baja en un clic (RFC 8058): con ella el correo lleva los
   * encabezados `List-Unsubscribe` y `List-Unsubscribe-Post`, y Gmail y Apple
   * muestran "Cancelar suscripción" junto al remitente. Tiene que aceptar un
   * POST con el cuerpo `List-Unsubscribe=One-Click`. La arma el servidor.
   */
  bajaEnUnClic?: string
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
function armarHtml({ asunto: asuntoSeguro, titulo, intro, pasos, detalle, destacado, boton, cierre, enlaceDeBaja, textoDeBaja }: Correo): string {
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
    ? `<p style="margin: 8px 0 0; font-family: ${FUENTE}; font-size: 12px; line-height: 1.5; color: ${COLOR.texto2};"><a href="${escaparHtml(enlaceDeBaja)}" style="color: ${COLOR.texto2}; text-decoration: underline;">${escaparHtml(textoDeBaja ?? "Dejar de recibir estos correos")}</a></p>`
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

/**
 * Los encabezados de la baja en un clic (RFC 8058). La URL la arma el servidor,
 * pero va a un encabezado: si trae algo que pueda cortarlo o salirse de los
 * `<>` (espacios, saltos de línea, `<`, `>`, comas), no se manda el correo en
 * vez de mandarlo sin una baja que funcione.
 */
function encabezadosDeBaja(url: string): Record<string, string> {
  if (!/^https?:\/\/[^\s<>,]+$/.test(url)) throw new Error("URL de baja en un clic inválida")
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

/** Sin clave configurada no se envía nada, igual que el rate limit sin Upstash. */
async function enviar(correo: Correo): Promise<ResultadoDeEnvio> {
  const headers = correo.bajaEnUnClic ? encabezadosDeBaja(correo.bajaEnUnClic) : undefined
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
    ...(headers ? { headers } : {}),
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

/*
 * Las palabras del rubro en los correos (`lib/vocabulario.ts`). Cada plantilla
 * pide las suyas con `palabrasDelCorreo(rubro)` y arma las frases con los
 * helpers de `lib/concordancia.ts`, así que una clínica dental lee "paciente",
 * "odontólogo" y "a la clínica" y un salón "estilista", "hora" y "al salón",
 * con el artículo y el adjetivo que corresponden. El rubro llega siempre desde
 * `Business.type`, nunca desde datos del navegador.
 *
 * Un rubro desconocido, `null` o ausente (los viejos `salud`, `fitness` y
 * `otro`, o un negocio sin rubro) deja los correos con las palabras de antes
 * del vocabulario, sin un cambio: el vocabulario neutro dice "cita" y los
 * correos de siempre decían "hora" donde se habla de la hora que se reserva o
 * se libera ("Se liberó una hora", "Reservar mi hora") y "el local" donde
 * nombran al negocio, así que el rubro sin palabras propias conserva esas dos
 * (`hora` y `local`). Los rubros con palabras propias siguen el vocabulario.
 */

const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

/** La hora como cosa que se reserva o se libera: la palabra con que hablaban los correos de siempre. */
const HORA: Sustantivo = { singular: "hora", plural: "horas", genero: "f" }

/** El negocio como lugar al que se va: la palabra con que hablaban los correos de siempre. */
const LOCAL: Sustantivo = { singular: "local", plural: "locales", genero: "m" }

/** "lo" / "la": el pronombre de un sustantivo. `lib/concordancia.ts` todavía no tiene pronombres. */
const PRONOMBRE: Record<Genero, string> = { m: "lo", f: "la" }

interface PalabrasDelCorreo {
  /** Quien se atiende (panel): cliente / paciente. */
  cliente: Sustantivo
  /** Quien atiende (panel): estilista / barbero / manicurista / odontólogo / profesional. */
  profesional: Sustantivo
  /** Lo que se atiende, en los correos al negocio (panel): servicio / prestación. */
  servicio: Sustantivo
  /** Lo que eligió quien reserva, en los correos al cliente: servicio / motivo. */
  servicioDeLaReserva: Sustantivo
  /** La reserva, en los correos al negocio (panel): hora / cita. */
  citaDelPanel: Sustantivo
  /** La reserva, en los correos a quien reservó: hora / cita. */
  cita: Sustantivo
  /** La hora que se reserva o se libera: siempre "hora", salvo que el vocabulario diga otra cosa. */
  hora: Sustantivo
  /** El negocio como lugar: "el salón", "la clínica", y "el local" si el rubro no tiene palabras propias. */
  local: Sustantivo
  /** Tu negocio, en el título de bienvenida: salón / barbería / salón de uñas / clínica / negocio. */
  negocio: Sustantivo
  /** El aviso de que le toca volver: "Te toca volver" / "Control". */
  seguimiento: string
}

function palabrasDelCorreo(rubro: string | null | undefined): PalabrasDelCorreo {
  const palabras = vocabularioDe(rubro).palabras
  const sinPalabrasPropias = palabras.negocio.singular === PALABRAS_NEUTRAS.negocio.singular
  return {
    cliente: palabras.cliente,
    profesional: palabras.profesional,
    servicio: palabras.servicio,
    servicioDeLaReserva: palabras.servicioDeLaReserva,
    citaDelPanel: palabras.cita,
    cita: palabras.citaParaElCliente,
    hora: sinPalabrasPropias ? HORA : palabras.citaParaElCliente,
    local: sinPalabrasPropias ? LOCAL : palabras.negocio,
    negocio: palabras.negocio,
    seguimiento: palabras.etiquetas.seguimiento,
  }
}

/**
 * El sustantivo con su adjetivo antepuesto y concordado ("nueva hora", "próxima
 * cita"), con el mismo género, para pasarlo a `un` o `el`: "una nueva hora".
 */
function conAdjetivoAntes(adjetivo: string, sustantivo: Sustantivo): Sustantivo {
  return {
    singular: `${concordar(adjetivo, sustantivo)} ${sustantivo.singular}`,
    plural: `${concordar(adjetivo, sustantivo, "plural")} ${sustantivo.plural}`,
    genero: sustantivo.genero,
  }
}

/** "Cita confirmada" / "Hora confirmada": la reserva con su participio concordado, para un asunto. */
function conParticipio(participio: string, cita: Sustantivo): string {
  return `${conMayuscula(cita.singular)} ${concordar(participio, cita)}`
}

/**
 * Hasta cuándo se puede cambiar una reserva sin plazo: "hasta la hora de la
 * cita", o "hasta que llegue la hora" si la reserva ya se llama hora ("la hora
 * de la hora" no se dice).
 */
function hastaLaHoraDe(cita: Sustantivo): string {
  return cita.singular === HORA.singular ? "hasta que llegue la hora" : `hasta la hora de ${el(cita)}`
}

/** "la cita" en "...y la cita aparece en tu agenda"; si la reserva ya se llama hora, "esa hora" ("y la hora aparece" repite lo recién dicho). */
function laReservaEnLaAgenda(cita: Sustantivo): string {
  return cita.singular === HORA.singular ? ese(cita) : el(cita)
}

/** "la hora de su cita", o "su hora" si la reserva ya se llama hora ("la hora de su hora" no se dice). */
function laHoraDeSuCita(cita: Sustantivo): string {
  return cita.singular === HORA.singular ? "su hora" : `la hora de su ${cita.singular}`
}

/*
 * Las etiquetas de las tablas salen de las palabras del rubro con
 * `conMayuscula` ("Servicio" / "Motivo", "Cliente" / "Paciente", "Profesional"
 * / "Odontólogo"), salvo dos. "Hora" es la hora del reloj ("Hora: 10:00"), no
 * el nombre de la reserva, así que no cambia con el rubro. "Con" ("Con: Carla")
 * es una preposición y no tiene palabra en el vocabulario.
 */

/**
 * Dónde queda una hora concreta (etapa 9, plan Independiente con varias sedes):
 * lo que devuelve `direccionDeLaCita` (`lib/sedes.ts`) de la sede de la cita.
 * Sólo se pasa cuando el negocio tiene varias sedes activas y la hora lleva la
 * suya: es lo que le dice al cliente a cuál ir. Sin `lugar`, el correo sale
 * exactamente como siempre.
 */
export interface LugarEnElCorreo {
  /** El nombre de la sede. */
  nombre?: string | null
  direccion?: string | null
  comuna?: string | null
}

/**
 * La fila "Dónde" del bloque de la hora: `<nombre> · <dirección>, <comuna>`,
 * con lo que haya de cada parte. `null` (sin fila) si no hay `lugar` o no trae
 * nada que decir. Como el resto del detalle, se escapa al armar el HTML.
 */
function filaDeLugar(lugar: LugarEnElCorreo | null | undefined): [string, string] | null {
  if (!lugar) return null
  const direccion = [lugar.direccion, lugar.comuna]
    .map((parte) => parte?.trim())
    .filter((parte): parte is string => !!parte)
    .join(", ")
  const texto = [lugar.nombre?.trim(), direccion].filter(Boolean).join(" · ")
  return texto ? ["Dónde", texto] : null
}

/** Suma la fila "Dónde" al detalle, si hay `lugar` que decir. */
function conLugar(detalle: Array<[string, string]>, lugar: LugarEnElCorreo | null | undefined): void {
  const fila = filaDeLugar(lugar)
  if (fila) detalle.push(fila)
}

export interface DatosConfirmacionCliente {
  /**
   * El rubro del negocio (`Business.type`): pone las palabras del correo
   * ("hora" o "cita", "servicio" o "motivo", "al salón" o "a la clínica").
   * Sin rubro, las de siempre.
   */
  rubro?: string | null
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
  /**
   * `false` si la cita ya quedó dentro del plazo al reservarla
   * (`dentroDelPlazo`): el enlace no la dejaría cancelar ni cambiar, así que
   * el correo no ofrece el botón y dice que se contacte al local (QA#8).
   */
  sePuedeCambiar?: boolean
  /**
   * La reserva entró por confirmar (#84): el correo dice que el local la
   * confirmará, sin decir por qué. La pantalla de la reserva no lo dice.
   */
  porConfirmar?: boolean
  /** El precio de la cita, ya con la rebaja de hora valle si la tuvo. Sin precio, no se muestra. */
  precio?: number | null
  /** Con hora valle (#89c, #138): el total sin la rebaja, para mostrar las dos. Sin rebaja, null. */
  precioNormal?: number | null
  /** Algún servicio no tiene precio: el total suma los que sí y dice "+ a consultar". */
  precioIncompleto?: boolean
  /** Dónde queda la hora: si la hora tiene sede (`LugarEnElCorreo`). Sin él, el correo no lo dice. */
  lugar?: LugarEnElCorreo | null
}

/**
 * La fila "Precio" del correo: el de la cita, y con hora valle también el
 * normal (#138), como lo muestra la reserva. `null` si no hay precio.
 */
function filaDePrecio(datos: Pick<DatosConfirmacionCliente, "precio" | "precioNormal" | "precioIncompleto">): [string, string] | null {
  if (datos.precio === null || datos.precio === undefined) return null
  let texto = formatearMonto(datos.precio)
  if (datos.precioIncompleto) texto += " + a consultar"
  if (datos.precioNormal !== null && datos.precioNormal !== undefined && datos.precioNormal > datos.precio) {
    texto += ` (hora valle; precio normal ${formatearMonto(datos.precioNormal)})`
  }
  return ["Precio", texto]
}

export function enviarConfirmacionCliente(datos: DatosConfirmacionCliente) {
  const palabras = palabrasDelCorreo(datos.rubro)
  const { cita } = palabras
  const alLocal = al(palabras.local)
  const detalle: Array<[string, string]> = [[conMayuscula(palabras.servicioDeLaReserva.singular), datos.servicio]]
  if (datos.profesional) detalle.push(["Con", datos.profesional])
  detalle.push(["Fecha", fechaLegible(datos.fecha)], ["Hora", datos.hora], ["Duración", `${datos.duracion} minutos`])
  conLugar(detalle, datos.lugar)
  const precio = filaDePrecio(datos)
  if (precio) detalle.push(precio)
  return enviar({
    tipo: "confirmacion-cliente",
    para: datos.emailCliente,
    ...(datos.porConfirmar
      ? {
          asunto: asunto`Reserva recibida — ${datos.nombreNegocio}`,
          titulo: "Recibimos tu reserva",
          intro: html`Hola <strong>${datos.nombreCliente}</strong>, <strong>${datos.nombreNegocio}</strong> confirmará tu reserva y te avisaremos por correo cuando lo haga.`,
        }
      : {
          asunto: asunto`${conParticipio("confirmado", cita)} — ${datos.nombreNegocio}`,
          titulo: `¡Tu ${cita.singular} está ${concordar("confirmado", cita)}!`,
          intro: html`Hola <strong>${datos.nombreCliente}</strong>, te esperamos en <strong>${datos.nombreNegocio}</strong>.`,
        }),
    detalle,
    ...(datos.enlaceDeGestion && datos.sePuedeCambiar === false
      ? {
          cierre: html`Tu ${palabras.hora.singular} es en menos de ${datos.plazoHoras ?? 0} ${datos.plazoHoras === 1 ? "hora" : "horas"}, así que no se puede cancelar ni cambiar por el enlace. Si lo necesitas, contacta directamente ${alLocal}.`,
        }
      : datos.enlaceDeGestion
      ? {
          boton: { texto: `Cancelar o cambiar mi ${cita.singular}`, enlace: datos.enlaceDeGestion },
          cierre:
            datos.plazoHoras && datos.plazoHoras > 0
              ? html`Puedes cancelar o cambiar tu ${cita.singular} con el botón hasta ${datos.plazoHoras} ${datos.plazoHoras === 1 ? "hora" : "horas"} antes. Después, contacta directamente ${alLocal}.`
              : html`Puedes cancelar o cambiar tu ${cita.singular} con el botón ${hastaLaHoraDe(cita)}.`,
        }
      : { cierre: html`Si necesitas cancelar o cambiar tu ${cita.singular}, contáctanos con anticipación.` }),
  })
}

export interface DatosAvisoProfesional {
  /** El rubro del negocio (`Business.type`): las palabras del panel ("paciente", "prestación", "cita"). Sin rubro, las de siempre. */
  rubro?: string | null
  emailProfesional: string
  nombreNegocio: string
  nombreCliente: string
  servicio: string
  fecha: string
  hora: string
  comentarios?: string | null
  /** A quién quedó asignada; sin dar, no se muestra. */
  profesional?: string | null
  /** Entró por confirmar (#84): el aviso pide confirmarla o cancelarla en el panel. */
  porConfirmar?: boolean
  /** Dónde queda la hora: si la hora tiene sede (`LugarEnElCorreo`). Sin él, el correo no lo dice. */
  lugar?: LugarEnElCorreo | null
}

export function enviarAvisoProfesional(datos: DatosAvisoProfesional) {
  const palabras = palabrasDelCorreo(datos.rubro)
  const cita = palabras.citaDelPanel
  const detalle: Array<[string, string]> = [
    [conMayuscula(palabras.cliente.singular), datos.nombreCliente],
    [conMayuscula(palabras.servicio.singular), datos.servicio],
    ...(datos.profesional ? [[conMayuscula(palabras.profesional.singular), datos.profesional] as [string, string]] : []),
    ["Fecha", fechaLegible(datos.fecha)],
    ["Hora", datos.hora],
  ]
  conLugar(detalle, datos.lugar)
  if (datos.comentarios) detalle.push(["Comentarios", datos.comentarios])

  return enviar({
    tipo: "aviso-profesional",
    para: datos.emailProfesional,
    asunto: datos.porConfirmar
      ? asunto`Reserva por confirmar — ${datos.nombreCliente}`
      : asunto`Nueva reserva — ${datos.nombreCliente}`,
    titulo: datos.porConfirmar ? "Nueva reserva por confirmar" : "Nueva reserva recibida",
    intro: html`Tienes ${un(conAdjetivoAntes("nuevo", cita))} en <strong>${datos.nombreNegocio}</strong>.`,
    detalle,
    destacado: true,
    cierre: datos.porConfirmar
      ? html`Este contacto faltó a ${cita.plural} ${concordar("anterior", cita, "plural")}. Entra a la agenda de tu panel para confirmar la reserva o cancelarla.`
      : html`Revisa tu calendario en tu panel para ver todos los detalles.`,
  })
}

export interface DatosReservaConfirmadaPorElLocal {
  /** El rubro del negocio (`Business.type`): las palabras del correo a quien reservó. Sin rubro, las de siempre. */
  rubro?: string | null
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  servicio: string
  /** `AAAA-MM-DD` y `HH:MM`, en el reloj del negocio. */
  fecha: string
  hora: string
  profesional?: string | null
  /** El precio guardado en la cita: el rebajado, si se reservó en hora valle (#138). */
  precio?: number | null
  /** Dónde queda la hora: si la hora tiene sede (`LugarEnElCorreo`). Sin él, el correo no lo dice. */
  lugar?: LugarEnElCorreo | null
}

/** Al cliente: el local confirmó la reserva que había entrado por confirmar (#84). */
export function enviarReservaConfirmadaPorElLocal(datos: DatosReservaConfirmadaPorElLocal) {
  const palabras = palabrasDelCorreo(datos.rubro)
  const detalle: Array<[string, string]> = [[conMayuscula(palabras.servicioDeLaReserva.singular), datos.servicio]]
  if (datos.profesional) detalle.push(["Con", datos.profesional])
  detalle.push(["Fecha", fechaLegible(datos.fecha)], ["Hora", datos.hora])
  conLugar(detalle, datos.lugar)
  const precio = filaDePrecio({ precio: datos.precio })
  if (precio) detalle.push(precio)
  return enviar({
    tipo: "reserva-confirmada-por-el-local",
    para: datos.emailCliente,
    asunto: asunto`Reserva confirmada — ${datos.nombreNegocio}`,
    titulo: "¡Tu reserva está confirmada!",
    intro: html`Hola <strong>${datos.nombreCliente}</strong>, <strong>${datos.nombreNegocio}</strong> confirmó tu reserva. Te esperamos.`,
    detalle,
    cierre: html`Si necesitas cancelar o cambiar tu ${palabras.cita.singular}, usa el enlace del correo de tu reserva o contacta ${al(palabras.local)}.`,
  })
}

export interface DatosAvisoDeCambioDelCliente {
  /** El rubro del negocio (`Business.type`): las palabras del panel ("paciente", "prestación", "cita"). Sin rubro, las de siempre. */
  rubro?: string | null
  tipo: "cancelo" | "reagendo"
  emailNegocio: string
  nombreNegocio: string
  nombreCliente: string
  servicio: string
  profesional?: string | null
  /**
   * Si reagendó y cambió de profesional: quien la tenía antes. El correo lo dice
   * en "Antes" y "Ahora" (si sólo cambió la persona, la fecha y la hora son las
   * mismas y sin esto las dos filas serían iguales).
   */
  profesionalAnterior?: string | null
  /** La fecha y hora de la cita (la nueva, si reagendó), en el reloj del negocio. */
  fecha: string
  hora: string
  /** Si reagendó: la que tenía antes. */
  fechaAnterior?: string
  horaAnterior?: string
  /** Dónde queda la hora (la de ahora, si reagendó): si la hora tiene sede (`LugarEnElCorreo`). */
  lugar?: LugarEnElCorreo | null
}

/** Aviso al negocio: el cliente canceló o reagendó con su enlace. */
export function enviarAvisoDeCambioDelCliente(datos: DatosAvisoDeCambioDelCliente) {
  const reagendo = datos.tipo === "reagendo"
  const palabras = palabrasDelCorreo(datos.rubro)
  const cita = palabras.citaDelPanel
  const detalle: Array<[string, string]> = [
    [conMayuscula(palabras.cliente.singular), datos.nombreCliente],
    [conMayuscula(palabras.servicio.singular), datos.servicio],
  ]
  if (datos.profesional) detalle.push([conMayuscula(palabras.profesional.singular), datos.profesional])
  if (reagendo && datos.fechaAnterior && datos.horaAnterior) {
    // Sólo cuando de verdad cambió de persona (y se sabe quién era): si no, las filas son las de siempre.
    const cambioDePersona = Boolean(
      datos.profesionalAnterior && datos.profesional && datos.profesionalAnterior !== datos.profesional
    )
    detalle.push([
      "Antes",
      `${fechaLegible(datos.fechaAnterior)}, ${datos.horaAnterior}${cambioDePersona ? ` · con ${datos.profesionalAnterior}` : ""}`,
    ])
    detalle.push([
      "Ahora",
      `${fechaLegible(datos.fecha)}, ${datos.hora}${cambioDePersona ? ` · con ${datos.profesional}` : ""}`,
    ])
  } else {
    detalle.push(["Fecha", fechaLegible(datos.fecha)], ["Hora", datos.hora])
  }
  conLugar(detalle, datos.lugar)

  return enviar({
    tipo: reagendo ? "aviso-reagendada" : "aviso-cancelada",
    para: datos.emailNegocio,
    asunto: reagendo
      ? asunto`${conParticipio("reagendado", cita)} — ${datos.nombreCliente}`
      : asunto`${conParticipio("cancelado", cita)} — ${datos.nombreCliente}`,
    titulo: `${conMayuscula(un(palabras.cliente))} ${reagendo ? "cambió" : "canceló"} su ${cita.singular}`,
    intro: reagendo
      ? html`<strong>${datos.nombreCliente}</strong> cambió ${laHoraDeSuCita(cita)} en <strong>${datos.nombreNegocio}</strong> desde su enlace.`
      : html`<strong>${datos.nombreCliente}</strong> canceló su ${cita.singular} en <strong>${datos.nombreNegocio}</strong> desde su enlace. El horario quedó libre.`,
    detalle,
    destacado: true,
    cierre: html`Revisa tu agenda en el panel.`,
  })
}

export interface DatosRecordatorio {
  /** El rubro del negocio (`Business.type`): las palabras del correo a quien reservó. Sin rubro, las de siempre. */
  rubro?: string | null
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  servicio: string
  fecha: string
  hora: string
  /**
   * El enlace para cancelar o reagendar sin cuenta, sólo para las reservas
   * públicas de antes de la etapa 1, que no lo tenían (#106): se genera al
   * mandar el recordatorio. Lleva el token en claro.
   */
  enlaceDeGestion?: string | null
  /** Hasta cuántas horas antes se puede cambiar con el enlace. */
  plazoHoras?: number
  /**
   * `false` si la cita ya está dentro del plazo (`dentroDelPlazo`): el
   * enlace no la dejaría cancelar ni cambiar, así que no se ofrece el botón,
   * como en la confirmación (#164).
   */
  sePuedeCambiar?: boolean
  /** Dónde queda la hora: si la hora tiene sede (`LugarEnElCorreo`). Sin él, el correo no lo dice. */
  lugar?: LugarEnElCorreo | null
}

export function enviarRecordatorio(datos: DatosRecordatorio) {
  const palabras = palabrasDelCorreo(datos.rubro)
  const { cita } = palabras
  const alLocal = al(palabras.local)
  const detalle: Array<[string, string]> = [
    [conMayuscula(palabras.servicioDeLaReserva.singular), datos.servicio],
    ["Fecha", fechaLegible(datos.fecha)],
    ["Hora", datos.hora],
  ]
  conLugar(detalle, datos.lugar)
  return enviar({
    tipo: "recordatorio",
    para: datos.emailCliente,
    asunto: asunto`Recordatorio — tu ${cita.singular} es mañana`,
    titulo: `Tu ${cita.singular} es mañana`,
    intro: html`Hola <strong>${datos.nombreCliente}</strong>, te recordamos que tienes ${un(cita)} mañana en <strong>${datos.nombreNegocio}</strong>.`,
    detalle,
    ...(datos.sePuedeCambiar === false
      ? { cierre: html`¡Te esperamos! Si no puedes asistir, contacta directamente ${alLocal}.` }
      : datos.enlaceDeGestion
      ? {
          boton: { texto: `Cancelar o cambiar mi ${cita.singular}`, enlace: datos.enlaceDeGestion },
          cierre:
            datos.plazoHoras && datos.plazoHoras > 0
              ? html`¡Te esperamos! Si no puedes asistir, cancela o cambia tu ${cita.singular} con el botón hasta ${datos.plazoHoras} ${datos.plazoHoras === 1 ? "hora" : "horas"} antes. Después, contacta directamente ${alLocal}.`
              : html`¡Te esperamos! Si no puedes asistir, cancela o cambia tu ${cita.singular} con el botón ${hastaLaHoraDe(cita)}.`,
        }
      : { cierre: html`¡Te esperamos! Si no puedes asistir, por favor avísanos con anticipación.` }),
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
  /** El rubro del negocio: en una clínica dental el rol dice "Odontólogo" y la tabla "Clínica". */
  rubro?: string | null
  enlaceAceptar: string
}

export function enviarInvitacionTrabajador(datos: DatosInvitacionTrabajador) {
  const rol = nombreDelRol(datos.rol, datos.rubro)
  const palabras = palabrasDelCorreo(datos.rubro)

  return enviar({
    tipo: "invitacion-trabajador",
    para: datos.emailTrabajador,
    asunto: asunto`Te invitaron a unirte a ${datos.nombreNegocio} en Eli`,
    titulo: "Tienes una invitación",
    intro: html`Hola <strong>${datos.nombreTrabajador}</strong>, te invitaron a formar parte de <strong>${datos.nombreNegocio}</strong> como <strong>${rol}</strong>.`,
    detalle: [
      [conMayuscula(palabras.negocio.singular), datos.nombreNegocio],
      ["Tu rol", rol],
    ],
    destacado: true,
    boton: { texto: "Aceptar invitación", enlace: datos.enlaceAceptar },
    cierre: html`Este enlace expira en 7 días. Si no esperabas esta invitación, ignora este correo.`,
  })
}

// ─── Ciclo de prueba ─────────────────────────────────────────────────────────

export interface DatosCorreoDePrueba {
  /**
   * El rubro del negocio (`Business.type`): la bienvenida y el consejo hablan
   * con las palabras del panel ("pacientes", "prestaciones"). Sin rubro, las
   * de siempre.
   */
  rubro?: string | null
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
  const palabras = palabrasDelCorreo(datos.rubro)
  const clientes = palabras.cliente.plural

  switch (tipo) {
    case "bienvenida":
      return {
        ...base,
        asunto: asunto`Te damos la bienvenida a Eli`,
        titulo: `Tu ${palabras.negocio.singular} ya está en Eli`,
        intro: html`Hola <strong>${datos.nombreDueno}</strong>, <strong>${datos.nombreNegocio}</strong> ya tiene su espacio en Eli. Tienes ${DIAS_DE_PRUEBA} días de prueba gratis, sin tarjeta. Para empezar a recibir reservas, te faltan tres pasos:`,
        pasos: [
          { titulo: "Define tu horario", texto: `Los días y las horas en que atiendes. Tus ${clientes} solo ven horas libres dentro de ese horario.` },
          { titulo: `Agrega tus ${palabras.servicio.plural}`, texto: "Qué ofreces, cuánto dura y cuánto cuesta." },
          {
            titulo: "Comparte tu enlace de reservas",
            texto: `Tus ${clientes} eligen ${el(palabras.servicioDeLaReserva)} y la hora, y ${laReservaEnLaAgenda(palabras.citaDelPanel)} aparece en tu agenda.`,
          },
        ],
        boton: { texto: "Ir a mi panel", enlace: datos.enlacePanel },
      }

    case "consejo":
      return {
        ...base,
        asunto: asunto`Un consejo para recibir tus primeras reservas`,
        titulo: "Pon tu enlace donde ya te buscan",
        intro: html`Hola <strong>${datos.nombreDueno}</strong>, la forma más rápida de llenar tu agenda es que tus ${clientes} reserven solos. Pega tu enlace de reservas en la biografía de Instagram y compártelo por WhatsApp: en tu estado, o como respuesta cuando alguien te pregunte por ${un(palabras.hora)}.`,
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

// ─── Mensajes a clientes (etapa 3) ───────────────────────────────────────────
//
// Cuándo se manda cada uno, el candado contra duplicados y el registro son de
// `lib/envios-a-clientes.ts` y de cada trabajo (`lib/lista-de-espera.ts`,
// `lib/te-toca.ts`, `lib/resenas.ts`); acá sólo se arma el correo. Los
// promocionales ("te toca" y reseña) exigen los dos enlaces de baja
// (`enlacesDeBajaDeCliente`): sin ellos no compila.

export interface DatosAvisoListaDeEspera {
  /** El rubro del negocio (`Business.type`): las palabras del correo a quien reservó. Sin rubro, las de siempre. */
  rubro?: string | null
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  servicio: string
  /** Con quién, si se inscribió para un profesional; null es "cualquiera". */
  profesional?: string | null
  /** El día de la inscripción, "AAAA-MM-DD" en la zona del negocio. */
  fecha: string
  /** La página de reservas ya llenada con servicio, profesional y fecha. */
  enlaceReservar: string
  /** La página "Salir de la lista" con el token de la inscripción. */
  enlaceSalir: string
  /** El POST de un clic que la saca de la lista (RFC 8058). */
  enlaceSalirEnUnClic: string
}

/**
 * "Se liberó una hora" (#74). Es de servicio: lo pidió la persona al
 * inscribirse. Se avisa a todos los que esperaban ese día y la hora es de
 * quien reserve primero, así que el correo lo dice.
 */
export function enviarAvisoListaDeEspera(datos: DatosAvisoListaDeEspera) {
  const palabras = palabrasDelCorreo(datos.rubro)
  const { hora } = palabras
  const seLibero = `se liberó ${un(hora)}`
  const detalle: Array<[string, string]> = [[conMayuscula(palabras.servicioDeLaReserva.singular), datos.servicio]]
  if (datos.profesional) detalle.push(["Con", datos.profesional])
  detalle.push(["Día", fechaLegible(datos.fecha)])
  return enviar({
    tipo: "aviso-lista-de-espera",
    para: datos.emailCliente,
    asunto: asunto`${conMayuscula(seLibero)} — ${datos.nombreNegocio}`,
    titulo: conMayuscula(seLibero),
    intro: html`Hola <strong>${datos.nombreCliente}</strong>, ${seLibero} en <strong>${datos.nombreNegocio}</strong> el día que estabas esperando.`,
    detalle,
    destacado: true,
    boton: { texto: `Reservar ${el(hora)}`, enlace: datos.enlaceReservar },
    cierre: html`Les avisamos a todas las personas que esperaban este día: ${el(hora)} es de quien reserve primero. Si ya no ${PRONOMBRE[hora.genero]} necesitas, puedes salir de la lista.`,
    enlaceDeBaja: datos.enlaceSalir,
    textoDeBaja: "Salir de la lista de espera",
    bajaEnUnClic: datos.enlaceSalirEnUnClic,
  })
}

export interface DatosTeToca {
  /** El rubro del negocio (`Business.type`): las palabras del correo a quien reservó. Sin rubro, las de siempre. */
  rubro?: string | null
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  /** El último servicio que se hizo, si se sabe. */
  servicio?: string | null
  /** La página de reservas del negocio (con el servicio elegido, si se sabe). */
  enlaceReservar: string
  /** `enlacesDeBajaDeCliente(customerId)` (`lib/baja-de-clientes.ts`). */
  enlaceDeBaja: string
  enlaceDeBajaEnUnClic: string
}

/** "Te toca" (#75). Promocional: sólo con consentimiento vigente. */
export function enviarTeToca(datos: DatosTeToca) {
  const palabras = palabrasDelCorreo(datos.rubro)
  const { hora } = palabras
  const proxima = `${concordar("próximo", hora)} ${hora.singular}`
  // "Te toca volver" es una frase y no cabe tras "Ya": un rubro que la
  // cambia por un sustantivo ("Control") la usa como "Ya te toca tu control".
  const toca =
    palabras.seguimiento === PALABRAS_NEUTRAS.etiquetas.seguimiento
      ? "Ya te toca volver"
      : `Ya te toca tu ${palabras.seguimiento.toLocaleLowerCase("es-CL")}`
  return enviar({
    tipo: "te-toca",
    para: datos.emailCliente,
    asunto: asunto`¿Agendamos tu ${proxima}? — ${datos.nombreNegocio}`,
    titulo: toca,
    intro: datos.servicio
      ? html`Hola <strong>${datos.nombreCliente}</strong>, ya pasó un tiempo desde tu último <strong>${datos.servicio}</strong> en <strong>${datos.nombreNegocio}</strong>. Cuando quieras, reserva tu ${proxima}.`
      : html`Hola <strong>${datos.nombreCliente}</strong>, ya pasó un tiempo desde tu última visita a <strong>${datos.nombreNegocio}</strong>. Cuando quieras, reserva tu ${proxima}.`,
    boton: { texto: `Reservar mi ${hora.singular}`, enlace: datos.enlaceReservar },
    cierre: html`Te escribimos porque aceptaste recibir avisos y novedades de ${datos.nombreNegocio}. Puedes dejar de recibirlos cuando quieras.`,
    enlaceDeBaja: datos.enlaceDeBaja,
    bajaEnUnClic: datos.enlaceDeBajaEnUnClic,
  })
}

export interface DatosPedirResena {
  /** El rubro del negocio (`Business.type`): las palabras del correo a quien reservó. Sin rubro, las de siempre. */
  rubro?: string | null
  emailCliente: string
  nombreCliente: string
  nombreNegocio: string
  /** `Business.enlaceResenas`, ya validado (https y un dominio de Google). */
  enlaceResenas: string
  /** `enlacesDeBajaDeCliente(customerId)` (`lib/baja-de-clientes.ts`). */
  enlaceDeBaja: string
  enlaceDeBajaEnUnClic: string
}

/**
 * Pedir una reseña en Google (#77), el día siguiente a la visita. A todos por
 * igual, sin filtrar por satisfacción. Promocional: sólo con consentimiento
 * vigente (decisión del dueño).
 */
export function enviarPedirResena(datos: DatosPedirResena) {
  const { local } = palabrasDelCorreo(datos.rubro)
  return enviar({
    tipo: "pedir-resena",
    para: datos.emailCliente,
    asunto: asunto`¿Cómo te fue en ${datos.nombreNegocio}?`,
    titulo: "Gracias por tu visita",
    intro: html`Hola <strong>${datos.nombreCliente}</strong>, gracias por venir a <strong>${datos.nombreNegocio}</strong>. Si tienes un minuto, contar cómo te fue en Google ayuda a que más personas ${PRONOMBRE[local.genero]} conozcan.`,
    boton: { texto: "Dejar mi reseña", enlace: datos.enlaceResenas },
    cierre: html`Te escribimos porque aceptaste recibir avisos y novedades de ${datos.nombreNegocio}. Puedes dejar de recibirlos cuando quieras.`,
    enlaceDeBaja: datos.enlaceDeBaja,
    bajaEnUnClic: datos.enlaceDeBajaEnUnClic,
  })
}

export interface DatosAvisoFilaVirtual {
  /** El rubro del negocio (`Business.type`): "Acércate al salón", "a la clínica". Sin rubro, "al local". */
  rubro?: string | null
  emailCliente: string
  /** El nombre con que se anotó en la fila. */
  nombreCliente: string
  nombreNegocio: string
  /** Su número de turno del día. */
  numero: number
}

/**
 * "Ya casi es tu turno" (#85): a quien se anotó en la fila virtual con su
 * correo, cuando queda 1 persona adelante (o ninguna). De servicio: lo pidió
 * al anotarse, y se manda una sola vez por turno. Sin enlace al turno: la
 * base guarda sólo el hash del token del celular, así que el correo no puede
 * reconstruirlo; la persona ya tiene la página abierta en su teléfono.
 */
export function enviarAvisoFilaVirtual(datos: DatosAvisoFilaVirtual) {
  return enviar({
    tipo: "aviso-fila-virtual",
    para: datos.emailCliente,
    asunto: asunto`Ya casi es tu turno — ${datos.nombreNegocio}`,
    titulo: "Ya casi es tu turno",
    intro: html`Hola <strong>${datos.nombreCliente}</strong>, en <strong>${datos.nombreNegocio}</strong> ya casi es tu turno: queda a lo más una persona antes que tú.`,
    detalle: [["Tu número", String(datos.numero)]],
    destacado: true,
    cierre: html`Acércate ${al(palabrasDelCorreo(datos.rubro).local)} para no perderlo. Si ya no puedes ir, sal de la fila desde la página de tu turno.`,
  })
}
