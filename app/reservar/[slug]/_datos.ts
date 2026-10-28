/**
 * Lo que la página pública de reservas le pide al servidor desde el navegador:
 * las horas libres de un día y la confirmación de la reserva. El negocio, sus
 * servicios y sus días de atención ya vienen resueltos por `page.tsx`, que es
 * de servidor y consulta la base directo.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * la pantalla está obligada a decidir qué mostrar cuando algo falla. Un día sin
 * horas libres y un pedido que no llegó no son lo mismo, y no deben verse igual.
 */

import { pedir, conJson, type Resultado } from "@/lib/peticiones"

/** Quien atiende, tal como lo muestra la página pública. `servicioIds` en null: hace todos. */
export interface ProfesionalPublico {
  id: string
  nombre: string
  especialidad: string | null
  fotoUrl: string | null
  servicioIds: string[] | null
}

export interface DatosDeReserva {
  servicioId: string
  /** `null`: cualquiera disponible (lo asigna el servidor). */
  profesionalId: string | null
  /** `YYYY-MM-DD`. */
  fecha: string
  /** `HH:MM`. */
  hora: string
  nombre: string
  apellido: string
  cedula: string
  email: string
  telefono: string
  /** "Quiero recibir recordatorios por WhatsApp". */
  whatsapp: boolean
  comentarios: string
}

/** Los profesionales que atienden. Si no se pudo leer, la reserva sigue con "cualquiera". */
export async function leerProfesionales(slug: string): Promise<Resultado<ProfesionalPublico[]>> {
  const resultado = await pedir<{ profesionales: ProfesionalPublico[] }>(
    `/api/reservar/${encodeURIComponent(slug)}/profesionales`,
    "No se pudo cargar el equipo"
  )
  return resultado.ok ? { ok: true, datos: resultado.datos.profesionales } : resultado
}

/** Las horas de inicio libres (`HH:MM`) para ese servicio ese día, con ese profesional o con cualquiera (`null`). */
export async function leerDisponibilidad(
  slug: string,
  fecha: string,
  servicioId: string,
  profesionalId: string | null
): Promise<Resultado<string[]>> {
  const consulta = new URLSearchParams({ fecha, servicioId })
  if (profesionalId) consulta.set("profesionalId", profesionalId)
  const resultado = await pedir<{ slots: string[] }>(
    `/api/reservar/${encodeURIComponent(slug)}/disponibilidad?${consulta}`,
    "No se pudieron cargar los horarios disponibles"
  )
  return resultado.ok ? { ok: true, datos: resultado.datos.slots } : resultado
}

export interface ReservaConfirmada {
  citaId: string
  profesional: { id: string; nombre: string } | null
  /** La ruta para cancelar o reagendar sin cuenta (lleva el token). */
  enlaceDeGestion: string
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
    "Error al confirmar la reserva",
    conJson("POST", {
      servicioId: datos.servicioId,
      profesionalId: datos.profesionalId ?? undefined,
      fecha: datos.fecha,
      hora: datos.hora,
      nombre: datos.nombre,
      apellido: datos.apellido,
      cedula: datos.cedula || undefined,
      email: datos.email || undefined,
      telefono: datos.telefono || undefined,
      // Sólo con teléfono: sin número no hay a dónde escribir.
      whatsappConsentimiento: datos.telefono ? datos.whatsapp : undefined,
      comentarios: datos.comentarios || undefined,
    })
  )
}
