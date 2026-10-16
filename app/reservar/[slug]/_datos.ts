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

export interface DatosDeReserva {
  servicioId: string
  /** `YYYY-MM-DD`. */
  fecha: string
  /** `HH:MM`. */
  hora: string
  nombre: string
  apellido: string
  cedula: string
  email: string
  telefono: string
  comentarios: string
}

/** Las horas de inicio libres (`HH:MM`) para ese servicio ese día. */
export async function leerDisponibilidad(
  slug: string,
  fecha: string,
  servicioId: string
): Promise<Resultado<string[]>> {
  const resultado = await pedir<{ slots: string[] }>(
    `/api/reservar/${slug}/disponibilidad?fecha=${fecha}&servicioId=${servicioId}`,
    "No se pudieron cargar los horarios disponibles"
  )
  return resultado.ok ? { ok: true, datos: resultado.datos.slots } : resultado
}

/** Los campos opcionales vacíos no se mandan: el servidor los guarda como nulos. */
export async function confirmarReserva(slug: string, datos: DatosDeReserva): Promise<Resultado> {
  return pedir(
    `/api/reservar/${slug}/confirmar`,
    "Error al confirmar la reserva",
    conJson("POST", {
      servicioId: datos.servicioId,
      fecha: datos.fecha,
      hora: datos.hora,
      nombre: datos.nombre,
      apellido: datos.apellido,
      cedula: datos.cedula || undefined,
      email: datos.email || undefined,
      telefono: datos.telefono || undefined,
      comentarios: datos.comentarios || undefined,
    })
  )
}
