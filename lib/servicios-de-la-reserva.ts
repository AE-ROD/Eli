import type { Prisma } from "@prisma/client"

/**
 * Varios servicios por reserva (#89a, etapa 5). Reglas del dueño:
 *
 * - Hasta `MAX_SERVICIOS_POR_RESERVA` servicios, sin repetir.
 * - Los hace un solo profesional, seguidos, en un bloque continuo: la cita
 *   dura la suma de las duraciones y cuesta la suma de los precios.
 * - El profesional tiene que hacer TODOS los servicios elegidos
 *   (`candidatosDeLaReserva` en `lib/agenda-publica.ts`).
 *
 * Cómo queda guardada: una cita (`Appointment`) con `serviceId` = el primero
 * (por compatibilidad), `title` = los nombres unidos por " + ", `price` = la
 * suma y `endTime` = inicio + la suma; y una fila de `AppointmentService` por
 * servicio, con nombre, duración y precio copiados. Las citas de antes no
 * tienen filas: ahí manda `serviceId`, como siempre (`serviciosDeLaCita`).
 *
 * Nunca se confía en lo que manda el cliente: los precios y las duraciones se
 * leen del catálogo, en el servidor, con el `businessId` de la reserva.
 */

export const MAX_SERVICIOS_POR_RESERVA = 4

/** Cómo se unen los nombres en `Appointment.title`. */
export const SEPARADOR_DE_SERVICIOS = " + "

export interface ServicioDeLaReserva {
  id: string
  name: string
  duration: number
  price: number | null
  /** Fuera de la rebaja de hora valle (#89c). */
  excluidoDeHoraValle?: boolean
}

/**
 * Los servicios pedidos, en el orden pedido, leídos del catálogo del negocio.
 * `null` (el 404) si alguno no existe, es de otro negocio o está inactivo: sin
 * decir cuál ni por qué.
 */
export async function leerServiciosDeLaReserva(
  db: Pick<Prisma.TransactionClient, "service">,
  businessId: string,
  ids: string[]
): Promise<ServicioDeLaReserva[] | null> {
  if (ids.length === 0 || ids.length > MAX_SERVICIOS_POR_RESERVA || new Set(ids).size !== ids.length) return null
  const encontrados = await db.service.findMany({
    where: { id: { in: ids }, businessId, active: true },
    select: { id: true, name: true, duration: true, price: true, excluidoDeHoraValle: true },
  })
  const enOrden = ids.map((id) => encontrados.find((servicio) => servicio.id === id))
  if (enOrden.some((servicio) => !servicio)) return null
  return enOrden as ServicioDeLaReserva[]
}

/** Lo que es la reserva entera: nombre, duración total y precio total. */
export interface ResumenDeLaReserva {
  titulo: string
  /** Minutos: la suma. */
  duracion: number
  /**
   * La suma de los precios conocidos. `null` sólo si ninguno tiene precio
   * (como una cita de un servicio sin precio). Si alguno no tiene precio y
   * otro sí, se suma lo que hay y `precioIncompleto` lo dice.
   */
  precio: number | null
  precioIncompleto: boolean
}

export function resumenDeLaReserva(servicios: Pick<ServicioDeLaReserva, "name" | "duration" | "price">[]): ResumenDeLaReserva {
  const conPrecio = servicios.filter((servicio) => servicio.price !== null)
  return {
    titulo: servicios.map((servicio) => servicio.name).join(SEPARADOR_DE_SERVICIOS),
    duracion: servicios.reduce((total, servicio) => total + servicio.duration, 0),
    precio: conPrecio.length === 0 ? null : conPrecio.reduce((total, servicio) => total + (servicio.price ?? 0), 0),
    precioIncompleto: conPrecio.length > 0 && conPrecio.length < servicios.length,
  }
}

/**
 * Las filas de `AppointmentService` de una cita nueva, sin `appointmentId`
 * (lo pone quien crea la cita). `orden` empieza en 1, como el CHECK.
 */
export function filasDeServicios(
  businessId: string,
  servicios: ServicioDeLaReserva[]
): Omit<Prisma.AppointmentServiceUncheckedCreateInput, "appointmentId">[] {
  return servicios.map((servicio, indice) => ({
    businessId,
    serviceId: servicio.id,
    serviceName: servicio.name,
    duration: servicio.duration,
    price: servicio.price,
    orden: indice + 1,
  }))
}

/** El `select` de las filas de una cita guardada, en orden. */
export const SELECCION_DE_SERVICIOS_DE_LA_CITA = {
  orderBy: { orden: "asc" },
  select: {
    serviceId: true,
    serviceName: true,
    duration: true,
    price: true,
    orden: true,
    service: { select: { active: true } },
  },
} satisfies Prisma.Appointment$serviciosArgs

export interface CitaConSusServicios {
  title: string
  service: { id: string; name: string; duration: number; active: boolean } | null
  servicios?: {
    serviceId: string | null
    serviceName: string
    duration: number
    price: number | null
    service: { active: boolean } | null
  }[]
}

export interface ServiciosDeLaCita {
  /** Los ids, en orden. Vacío si alguno se borró del catálogo (no hay con qué buscar horas). */
  ids: string[]
  /** El nombre para mostrar: los nombres unidos por " + ". */
  nombre: string
  /** Minutos que dura la cita entera. `null` si no se sabe (cita sin servicio del catálogo). */
  duracion: number | null
  /** Si todos siguen en el catálogo y activos: si se puede reagendar por el enlace. */
  activos: boolean
}

/**
 * Los servicios de una cita ya guardada. Con filas de `AppointmentService`,
 * mandan ellas (duración copiada al reservar, no la del catálogo de hoy). Sin
 * filas (las citas de antes de #89a, o las del panel), el servicio de
 * `serviceId`, como hasta ahora.
 */
export function serviciosDeLaCita(cita: CitaConSusServicios): ServiciosDeLaCita {
  const filas = cita.servicios ?? []
  if (filas.length > 0) {
    const ids = filas.map((fila) => fila.serviceId)
    const todosEnCatalogo = ids.every((id): id is string => id !== null)
    return {
      ids: todosEnCatalogo ? (ids as string[]) : [],
      nombre: filas.map((fila) => fila.serviceName).join(SEPARADOR_DE_SERVICIOS),
      duracion: filas.reduce((total, fila) => total + fila.duration, 0),
      activos: todosEnCatalogo && filas.every((fila) => fila.service?.active === true),
    }
  }
  return {
    ids: cita.service ? [cita.service.id] : [],
    nombre: cita.service?.name ?? cita.title,
    duracion: cita.service?.duration ?? null,
    activos: !!cita.service?.active,
  }
}

/**
 * Minutos que ocupa el bloque al reagendar por el enlace. Con filas, la mayor
 * entre su suma y lo que la cita dura hoy (`endTime - startTime`): si en el
 * panel se alargó la cita, moverla no la acorta en silencio ni la deja pisar
 * la cita siguiente. Sin filas (las de antes), la duración de su servicio,
 * como siempre.
 */
export function duracionAlReagendar(
  cita: { startTime: Date; endTime: Date; servicios?: unknown[] },
  servicios: Pick<ServiciosDeLaCita, "duracion">
): number | null {
  if (servicios.duracion === null) return null
  if (!cita.servicios || cita.servicios.length === 0) return servicios.duracion
  const guardada = Math.ceil((cita.endTime.getTime() - cita.startTime.getTime()) / 60_000)
  return Math.max(servicios.duracion, guardada)
}

/** Cuánto pueden diferir dos precios y contar como el mismo: 1 peso, por redondeos. */
export const TOLERANCIA_DE_PRECIO = 1

/** Si dos precios son el mismo, con `TOLERANCIA_DE_PRECIO`. Dos `null` también lo son. */
export function mismoPrecio(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return Math.abs(a - b) <= TOLERANCIA_DE_PRECIO
}

/** La suma de los precios conocidos de las filas, como `resumenDeLaReserva`; `null` si ninguna tiene. */
export function sumaDeLasFilas(filas: { price: number | null }[]): number | null {
  const conPrecio = filas.filter((fila): fila is { price: number } => fila.price !== null)
  return conPrecio.length === 0 ? null : conPrecio.reduce((total, fila) => total + fila.price, 0)
}

/**
 * Si el precio de una cita con filas se editó a mano en el panel: al
 * reservar, `price` es la suma de las filas (`resumenDeLaReserva`), y el
 * panel cambia `price` sin tocar las filas. Si ya no coinciden (con
 * `TOLERANCIA_DE_PRECIO`), manda lo que decidió el negocio y las filas
 * quedaron viejas. Sin filas no hay con qué comparar: `false`.
 */
export function precioEditadoAMano(cita: { price: number | null; servicios?: { price: number | null }[] }): boolean {
  const filas = cita.servicios ?? []
  if (filas.length === 0) return false
  return !mismoPrecio(cita.price, sumaDeLasFilas(filas))
}
