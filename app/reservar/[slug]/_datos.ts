/**
 * Lo que la página pública de reservas le pide al servidor desde el navegador:
 * las horas libres de un día, la confirmación de la reserva y la lista de
 * espera. El negocio, sus
 * servicios y sus días de atención ya vienen resueltos por `page.tsx`, que es
 * de servidor y consulta la base directo.
 *
 * Plan Independiente con varias sedes: la sede que se eligió viaja como `sedeId`
 * (a la disponibilidad, a la reserva y a la lista de espera). El servidor la
 * revalida contra las sedes activas del negocio del `slug`: lo que viaja es lo
 * que se eligió, no lo que vale.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * la pantalla está obligada a decidir qué mostrar cuando algo falla. Un día sin
 * horas libres y un pedido que no llegó no son lo mismo, y no deben verse igual.
 */

import type { PrecioDeLaHora } from "@/lib/hora-valle"
import { pedir, conJson, SIN_CONEXION, type Resultado } from "@/lib/peticiones"
import type { HorasDelDia } from "./_componentes/selector-fecha-hora"

/** Lo que se dice cuando el servidor frena por muchos pedidos seguidos (429). */
export const MUCHOS_INTENTOS = "Muchos intentos seguidos: espera un minuto y vuelve a intentar."

/** Lo que se dice cuando el pedido ni llegó: sin internet o con el servidor caído. */
export const SIN_INTERNET = "No pudimos conectarnos. Revisa tu internet y vuelve a intentar."

/**
 * Mensajes del servidor que no le sirven a quien reserva: no dicen qué hacer
 * ("Error interno del servidor", "El pedido no es un JSON válido", "Datos
 * inválidos", "No encontrado", o el texto por defecto "Error al …").
 */
const MENSAJES_TECNICOS = [/error interno/i, /json/i, /datos inv[aá]lidos/i, /^error al /i, /^(negocio )?no encontrado$/i]

/** El freno por muchos pedidos: "Demasiadas solicitudes…" / "Demasiados intentos…". */
const MUCHOS_PEDIDOS = /demasiad[ao]s (solicitudes|intentos)/i

/**
 * El error tal como se muestra en la pantalla pública: los mensajes técnicos
 * se cambian por `queHacer` (una frase que dice qué hacer), el freno por
 * muchos pedidos por `MUCHOS_INTENTOS` y la falta de conexión por
 * `SIN_INTERNET`. Los demás (los de validación de cada campo, "Algo cambió
 * mientras reservabas…") ya son claros y se quedan.
 */
export function mensajeParaQuienReserva(error: string, queHacer: string): string {
  const texto = error.trim()
  if (texto === "") return queHacer
  if (texto === SIN_CONEXION) return SIN_INTERNET
  if (MUCHOS_PEDIDOS.test(texto)) return MUCHOS_INTENTOS
  if (MENSAJES_TECNICOS.some((patron) => patron.test(texto))) return queHacer
  return texto
}

/** El `Resultado` con su error ya traducido (`mensajeParaQuienReserva`). */
export function conMensajeClaro<T>(resultado: Resultado<T>, queHacer: string): Resultado<T> {
  return resultado.ok ? resultado : { ok: false, error: mensajeParaQuienReserva(resultado.error, queHacer) }
}

/**
 * "No pudimos guardar tu reserva. Tus datos siguen acá: …": lo que se dice si
 * confirmar falla sin un motivo que sirva.
 */
export function noSePudoGuardarLaReserva(nombreDelNegocio: string): string {
  return `No pudimos guardar tu reserva. Tus datos siguen acá: vuelve a apretar Confirmar en un minuto. Si sigue, escríbele a ${nombreDelNegocio}.`
}

/**
 * Quien atiende, con lo que alcanza para elegirlo y saber qué servicios hace.
 * `servicioIds` en null: hace todos. Es lo que la página ya trae del servidor
 * (`page.tsx`), antes de pedir `/profesionales`: así el primer paso filtra los
 * servicios desde la primera pintura.
 */
export interface ProfesionalDelEquipo {
  id: string
  nombre: string
  especialidad: string | null
  fotoUrl: string | null
  servicioIds: string[] | null
}

/** Quien atiende, tal como lo responde `/profesionales`: suma los días en que atiende. */
export interface ProfesionalPublico extends ProfesionalDelEquipo {
  /** Los días de la semana (0 domingo a 6 sábado) en que atiende. */
  diasConAtencion: number[]
}

/** Lo que se dice si las horas de un día no se pudieron leer. */
export const HORAS_SIN_CARGAR = "No pudimos cargar los horarios. Vuelve a intentar en un momento."

export interface DatosDeReserva {
  /** Los servicios, en el orden en que se hacen (#89a): de 1 a 4. */
  servicioIds: string[]
  /** `null`: cualquiera disponible (lo asigna el servidor). */
  profesionalId: string | null
  /** La sede elegida (plan Independiente con varias sedes). `null` o sin dar: no se manda. */
  sedeId?: string | null
  /** `YYYY-MM-DD`. */
  fecha: string
  /** `HH:MM`. */
  hora: string
  nombre: string
  apellido: string
  cedula: string
  email: string
  telefono: string
  /** La casilla de WhatsApp (`CASILLA_DE_WHATSAPP`): el permiso, para cuando se pueda escribir por ahí. */
  whatsapp: boolean
  /** "Quiero recibir avisos y novedades por correo". */
  correoPromo: boolean
  comentarios: string
  /**
   * Clínica dental: "¿Es tu primera vez en la clínica?". `null` en otro
   * rubro (o sin él): no se manda. La duración que suma la calcula el servidor.
   */
  primeraVez?: boolean | null
}

/** Los profesionales que atienden. Si no se pudo leer, la reserva sigue con "cualquiera". */
export async function leerProfesionales(slug: string): Promise<Resultado<ProfesionalPublico[]>> {
  const resultado = await pedir<{ profesionales: ProfesionalPublico[] }>(
    `/api/reservar/${encodeURIComponent(slug)}/profesionales`,
    "No se pudo cargar el equipo"
  )
  return resultado.ok ? { ok: true, datos: resultado.datos.profesionales } : resultado
}

/**
 * Las horas de inicio libres (`HH:MM`) para esos servicios seguidos ese día,
 * con ese profesional o con cualquiera (`null`). El servidor calcula la
 * duración: acá sólo van los ids. Con hora valle (#89c), las horas rebajadas
 * traen su precio (`valle`); el que vale es el que calcula `confirmar`.
 * Clínica dental: `primeraVez` (los 15 minutos los suma el servidor); `null`
 * en otro rubro, y no se manda. Con varias sedes, `sedeId`: las horas son las
 * de esa sede; `null` (un negocio sin sedes, o con una sola), no se manda.
 */
export async function leerDisponibilidad(
  slug: string,
  fecha: string,
  servicioIds: string[],
  profesionalId: string | null,
  primeraVez: boolean | null = null,
  sedeId: string | null = null
): Promise<Resultado<HorasDelDia>> {
  const consulta = new URLSearchParams({ fecha, servicioIds: servicioIds.join(",") })
  if (profesionalId) consulta.set("profesionalId", profesionalId)
  if (primeraVez !== null) consulta.set("primeraVez", primeraVez ? "1" : "0")
  if (sedeId) consulta.set("sedeId", sedeId)
  const resultado = await pedir<{ slots: string[]; valle?: PrecioDeLaHora[]; sinListaDeEspera?: boolean }>(
    `/api/reservar/${encodeURIComponent(slug)}/disponibilidad?${consulta}`,
    "No se pudieron cargar los horarios disponibles"
  )
  return resultado.ok
    ? {
        ok: true,
        datos: {
          horas: resultado.datos.slots,
          precios: resultado.datos.valle ?? [],
          sinListaDeEspera: resultado.datos.sinListaDeEspera === true,
        },
      }
    : conMensajeClaro(resultado, HORAS_SIN_CARGAR)
}

export interface ReservaConfirmada {
  citaId: string
  profesional: { id: string; nombre: string } | null
  /** La ruta para cancelar o reagendar sin cuenta (lleva el token). */
  enlaceDeGestion: string
  /** `false` si ya quedó dentro del plazo: el enlace no la deja cancelar ni cambiar (QA#8). */
  sePuedeCambiar?: boolean
  /** Si va a llegar el recordatorio (N4): se dejó correo y el cron alcanza a mandarlo, con la hora del servidor. */
  recibiraRecordatorio?: boolean
  /** La sede donde quedó la cita, tal como la guardó el servidor. Sólo viene si la cita tiene sede. */
  sede?: { nombre: string; direccion: string; comuna: string }
  /**
   * La reserva entró por confirmar (#84): el negocio la confirma después. Con
   * `true` la pantalla no dice "confirmada". Ausente: confirmada, como siempre.
   */
  porConfirmar?: boolean
}

/**
 * Los campos opcionales vacíos no se mandan: el servidor los guarda como nulos.
 * Devuelve el id de la cita creada, que ya venía en la respuesta: es el UID
 * estable del evento de calendario (`lib/calendario.ts`).
 */
export async function confirmarReserva(
  slug: string,
  datos: DatosDeReserva
): Promise<Resultado<ReservaConfirmada>> {
  return pedir<ReservaConfirmada>(
    `/api/reservar/${encodeURIComponent(slug)}/confirmar`,
    "No pudimos guardar tu reserva",
    conJson("POST", {
      servicioIds: datos.servicioIds,
      profesionalId: datos.profesionalId ?? undefined,
      // Sólo con varias sedes: lo que se eligió; el servidor lo revalida.
      sedeId: datos.sedeId ?? undefined,
      fecha: datos.fecha,
      hora: datos.hora,
      nombre: datos.nombre,
      apellido: datos.apellido,
      cedula: datos.cedula || undefined,
      email: datos.email || undefined,
      telefono: datos.telefono || undefined,
      // Sólo con teléfono: sin número no hay a dónde escribir.
      whatsappConsentimiento: datos.telefono ? datos.whatsapp : undefined,
      // Sólo con email: es para esa casilla.
      correoPromoConsentimiento: datos.email ? datos.correoPromo : undefined,
      comentarios: datos.comentarios || undefined,
      // Sólo en una clínica dental.
      primeraVez: datos.primeraVez ?? undefined,
    })
  )
}

export interface DatosDeListaDeEspera {
  servicioIds: string[]
  /** `null`: con cualquiera. */
  profesionalId: string | null
  /** La sede elegida (plan Independiente con varias sedes). `null` o sin dar: no se manda. */
  sedeId?: string | null
  /** `YYYY-MM-DD`. */
  fecha: string
  nombre: string
  /** Opcional: vacío no se manda. */
  apellido: string
  email: string
  telefono: string
  whatsapp: boolean
  /** Clínica dental: la primera vez suma minutos; el servidor revisa el día con esa duración. Fuera de una clínica, `null`. */
  primeraVez?: boolean | null
}

/** "Avísame si se libera una hora" (#74): anota en la lista de espera de ese día. */
export async function inscribirEnListaDeEspera(slug: string, datos: DatosDeListaDeEspera): Promise<Resultado> {
  const resultado = await pedir(
    `/api/reservar/${encodeURIComponent(slug)}/lista-de-espera`,
    "No se pudo anotar en la lista de espera",
    conJson("POST", {
      servicioIds: datos.servicioIds,
      profesionalId: datos.profesionalId ?? undefined,
      sedeId: datos.sedeId ?? undefined,
      fecha: datos.fecha,
      nombre: datos.nombre,
      // El apellido es opcional: vacío no se manda.
      apellido: datos.apellido.trim() || undefined,
      email: datos.email,
      telefono: datos.telefono || undefined,
      whatsappConsentimiento: datos.telefono ? datos.whatsapp : undefined,
      // Sólo en una clínica dental.
      primeraVez: datos.primeraVez ?? undefined,
    })
  )
  return conMensajeClaro(resultado, "No pudimos anotarte. Vuelve a apretar Avísame en un minuto.")
}

/** "Salir de la lista de espera", con el token del correo. */
export async function salirDeLaListaDeEspera(slug: string, token: string): Promise<Resultado> {
  const resultado = await pedir(
    `/api/reservar/${encodeURIComponent(slug)}/lista-de-espera/${encodeURIComponent(token)}`,
    "No se pudo completar, intenta de nuevo",
    { method: "POST" }
  )
  return conMensajeClaro(resultado, "No pudimos sacarte de la lista. Vuelve a intentar en un minuto.")
}
