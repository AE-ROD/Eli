import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { diaDeLaSemana, esHoraDelDia, fechaYMinutosEn, instanteEn } from "@/lib/zona-horaria"

/**
 * Precios de hora valle (#89c, etapa 5). Es una OPCIÓN del negocio: viene
 * apagada (`Business.horaValleActiva = false`) y, apagada, nada cambia.
 *
 * Reglas del dueño:
 * - Un % de rebaja por día de la semana y franja horaria, para todo el
 *   negocio (`FranjaDeHoraValle`), con la opción de excluir servicios
 *   (`Service.excluidoDeHoraValle`).
 * - La franja aplica si la hora de INICIO de la reserva, en el reloj del
 *   negocio (`Business.timezone`) y con el día de la semana del negocio, cae
 *   en [desde, hasta). Una reserva que empieza a las 11:50 en una franja de
 *   10:00 a 12:00 lleva la rebaja entera aunque termine después.
 * - Si varias franjas aplican, manda la de mayor %.
 * - Sólo la reserva pública (y reagendar por el enlace) usan esto. Las citas
 *   del panel no se rebajan solas.
 *
 * Redondeo: cada servicio rebajado se redondea a peso entero
 * (`Math.round`, la mitad hacia arriba: $8.333,5 → $8.334) y el total es la
 * suma de esos precios ya redondeados, para que la cita y sus filas de
 * `AppointmentService` sumen exactamente lo mismo. Un servicio sin rebaja
 * (excluido, sin precio, o fuera de franja) queda con su precio tal cual.
 */

/** Cuántas franjas puede tener un negocio: tres por día de la semana. */
export const MAX_FRANJAS_DE_HORA_VALLE = 21
export const PORCENTAJE_MINIMO_DE_HORA_VALLE = 5
export const PORCENTAJE_MAXIMO_DE_HORA_VALLE = 90

export interface FranjaDeHoraValle {
  /** 0 domingo … 6 sábado, como `WorkSchedule`. */
  dayOfWeek: number
  /** "HH:MM", incluida. */
  desde: string
  /** "HH:MM", excluida. */
  hasta: string
  /** De 5 a 90. */
  porcentaje: number
}

/** Lo que el negocio configuró: si está encendida y sus franjas. */
export interface ConfiguracionDeHoraValle {
  activa: boolean
  franjas: FranjaDeHoraValle[]
}

export const HORA_VALLE_APAGADA: ConfiguracionDeHoraValle = { activa: false, franjas: [] }

export interface ServicioConPrecio {
  price: number | null
  excluidoDeHoraValle?: boolean
}

export interface PreciosConHoraValle {
  /** El % que aplica a esa hora (0 si ninguno, o si está apagada). */
  porcentaje: number
  /** Precio de cada servicio, en el mismo orden, ya rebajado si corresponde. */
  precios: (number | null)[]
  /** La suma de los precios conocidos, ya rebajada; `null` si ninguno tiene precio. */
  total: number | null
  /** La suma sin rebaja (lo que costaría fuera de hora valle). */
  totalNormal: number | null
  /** Si de verdad baja algo: `total < totalNormal`. */
  hayRebaja: boolean
}

function minutosDe(hora: string): number {
  const [h, m] = hora.split(":").map(Number)
  return h * 60 + m
}

/**
 * El % de hora valle para una reserva que empieza en ese instante, en la zona
 * del negocio: el mayor de las franjas de ese día que contienen la hora de
 * inicio. 0 si está apagada o ninguna aplica.
 */
export function porcentajeDeHoraValle(inicio: Date, zona: string, configuracion: ConfiguracionDeHoraValle): number {
  if (!configuracion.activa || configuracion.franjas.length === 0) return 0
  const { fecha, minutos } = fechaYMinutosEn(inicio, zona)
  const dia = diaDeLaSemana(fecha)
  let mayor = 0
  for (const franja of configuracion.franjas) {
    if (franja.dayOfWeek !== dia) continue
    if (minutos >= minutosDe(franja.desde) && minutos < minutosDe(franja.hasta)) {
      mayor = Math.max(mayor, franja.porcentaje)
    }
  }
  return mayor
}

/** Un precio con el % de rebaja, redondeado a peso entero. */
export function rebajar(precio: number, porcentaje: number): number {
  return Math.round((precio * (100 - porcentaje)) / 100)
}

function suma(precios: (number | null)[]): number | null {
  const conocidos = precios.filter((precio): precio is number => precio !== null)
  return conocidos.length === 0 ? null : conocidos.reduce((total, precio) => total + precio, 0)
}

/**
 * Precio de cada servicio y total de una reserva que empieza en `inicio`.
 * Servicios excluidos o sin precio no se rebajan. Apagada (o fuera de toda
 * franja), los precios salen tal cual.
 */
export function preciosConHoraValle(
  servicios: ServicioConPrecio[],
  inicio: Date,
  zona: string,
  configuracion: ConfiguracionDeHoraValle
): PreciosConHoraValle {
  const porcentaje = porcentajeDeHoraValle(inicio, zona, configuracion)
  const precios = servicios.map((servicio) =>
    servicio.price === null || porcentaje === 0 || servicio.excluidoDeHoraValle
      ? servicio.price
      : rebajar(servicio.price, porcentaje)
  )
  const total = suma(precios)
  const totalNormal = suma(servicios.map((servicio) => servicio.price))
  return {
    porcentaje,
    precios,
    total,
    totalNormal,
    hayRebaja: total !== null && totalNormal !== null && total < totalNormal,
  }
}

/**
 * Al reagendar por el enlace: el precio nuevo, o `null` si no cambia. Sólo se
 * recalcula si el % de la hora nueva es distinto del de la hora de antes (con
 * la configuración de hoy). Así, con la opción apagada o entre dos horas del
 * mismo %, la cita conserva el precio con que se reservó. Si cambia, se
 * calcula sobre los precios del catálogo de hoy (los copiados en la cita ya
 * vienen rebajados y no se puede volver atrás sin error de redondeo).
 */
export function precioAlReagendar(
  serviciosDelCatalogo: ServicioConPrecio[],
  inicioAnterior: Date,
  inicioNuevo: Date,
  zona: string,
  configuracion: ConfiguracionDeHoraValle
): PreciosConHoraValle | null {
  const antes = porcentajeDeHoraValle(inicioAnterior, zona, configuracion)
  const despues = porcentajeDeHoraValle(inicioNuevo, zona, configuracion)
  if (antes === despues) return null
  return preciosConHoraValle(serviciosDelCatalogo, inicioNuevo, zona, configuracion)
}

/**
 * El precio de una hora libre distinto del de siempre, como lo devuelven las
 * disponibilidades públicas junto a `slots` (que no cambia de forma).
 * `precioNormal` es el de comparación: sin rebaja en la reserva, el que tiene
 * hoy la cita al reagendar.
 */
export interface PrecioDeLaHora {
  hora: string
  precio: number | null
  precioNormal: number | null
  porcentaje: number
}

/**
 * Las horas (de ese día, en la zona del negocio) en que la reserva cuesta
 * menos por hora valle, con su precio. Vacío si está apagada o ninguna baja.
 */
export function horasConRebaja(
  servicios: ServicioConPrecio[],
  fecha: string,
  horas: string[],
  zona: string,
  configuracion: ConfiguracionDeHoraValle
): PrecioDeLaHora[] {
  if (!configuracion.activa || configuracion.franjas.length === 0) return []
  return horas.flatMap((hora) => {
    const precios = preciosConHoraValle(servicios, instanteEn(fecha, hora, zona), zona, configuracion)
    return precios.hayRebaja
      ? [{ hora, precio: precios.total, precioNormal: precios.totalNormal, porcentaje: precios.porcentaje }]
      : []
  })
}

/**
 * Al reagendar: las horas en que la cita quedaría con otro precio que el que
 * tiene hoy (`precioActual`), según `precioAlReagendar`. Vacío si no cambia
 * en ninguna (siempre, con la opción apagada).
 */
export function horasConOtroPrecio(
  serviciosDelCatalogo: ServicioConPrecio[],
  inicioAnterior: Date,
  precioActual: number | null,
  fecha: string,
  horas: string[],
  zona: string,
  configuracion: ConfiguracionDeHoraValle
): PrecioDeLaHora[] {
  if (!configuracion.activa) return []
  return horas.flatMap((hora) => {
    const nuevo = precioAlReagendar(serviciosDelCatalogo, inicioAnterior, instanteEn(fecha, hora, zona), zona, configuracion)
    return nuevo && nuevo.total !== precioActual
      ? [{ hora, precio: nuevo.total, precioNormal: precioActual, porcentaje: nuevo.porcentaje }]
      : []
  })
}

/**
 * La configuración de hora valle de un negocio, leída con su `businessId`.
 * Apagada, ni se leen las franjas.
 */
export async function leerHoraValle(
  db: Pick<Prisma.TransactionClient, "business" | "franjaDeHoraValle">,
  businessId: string
): Promise<ConfiguracionDeHoraValle> {
  const negocio = await db.business.findUnique({ where: { id: businessId }, select: { horaValleActiva: true } })
  if (!negocio?.horaValleActiva) return HORA_VALLE_APAGADA
  const franjas = await db.franjaDeHoraValle.findMany({
    where: { businessId },
    select: { dayOfWeek: true, desde: true, hasta: true, porcentaje: true },
    orderBy: [{ dayOfWeek: "asc" }, { desde: "asc" }],
  })
  return { activa: true, franjas }
}

/** Si dos franjas del mismo día se pisan (intervalos [desde, hasta)). */
export function franjasSeSolapan(a: FranjaDeHoraValle, b: FranjaDeHoraValle): boolean {
  return a.dayOfWeek === b.dayOfWeek && minutosDe(a.desde) < minutosDe(b.hasta) && minutosDe(b.desde) < minutosDe(a.hasta)
}

// ─── Validación de la configuración (los mismos CHECKs de la migración) ─────

const MENSAJE_DIA = "El día no es válido"
const MENSAJE_HORA = "Las horas tienen que ser HH:MM, de 00:00 a 23:59"
const MENSAJE_PORCENTAJE = `El descuento tiene que ser un número entero, de ${PORCENTAJE_MINIMO_DE_HORA_VALLE}% a ${PORCENTAJE_MAXIMO_DE_HORA_VALLE}%`

const horaSchema = z.string({ required_error: MENSAJE_HORA, invalid_type_error: MENSAJE_HORA }).refine(esHoraDelDia, MENSAJE_HORA)

export const franjaDeHoraValleSchema = z
  .object({
    dayOfWeek: z
      .number({ required_error: MENSAJE_DIA, invalid_type_error: MENSAJE_DIA })
      .int(MENSAJE_DIA)
      .min(0, MENSAJE_DIA)
      .max(6, MENSAJE_DIA),
    desde: horaSchema,
    hasta: horaSchema,
    porcentaje: z
      .number({ required_error: MENSAJE_PORCENTAJE, invalid_type_error: MENSAJE_PORCENTAJE })
      .int(MENSAJE_PORCENTAJE)
      .min(PORCENTAJE_MINIMO_DE_HORA_VALLE, MENSAJE_PORCENTAJE)
      .max(PORCENTAJE_MAXIMO_DE_HORA_VALLE, MENSAJE_PORCENTAJE),
  })
  .refine((franja) => minutosDe(franja.desde) < minutosDe(franja.hasta), {
    message: "Cada franja tiene que terminar después de empezar",
  })

const MENSAJE_CONFIGURACION = "Faltan datos de la hora valle"

/** `PUT /api/configuracion/hora-valle`: encendida o no y TODAS las franjas (las reemplaza). */
export const configuracionDeHoraValleSchema = z
  .object(
    {
      activa: z.boolean({ required_error: MENSAJE_CONFIGURACION, invalid_type_error: MENSAJE_CONFIGURACION }),
      franjas: z
        .array(franjaDeHoraValleSchema, { required_error: MENSAJE_CONFIGURACION, invalid_type_error: MENSAJE_CONFIGURACION })
        .max(MAX_FRANJAS_DE_HORA_VALLE, `Hasta ${MAX_FRANJAS_DE_HORA_VALLE} franjas`),
    },
    { required_error: MENSAJE_CONFIGURACION, invalid_type_error: MENSAJE_CONFIGURACION }
  )
  .refine(
    ({ franjas }) => !franjas.some((franja, i) => franjas.slice(i + 1).some((otra) => franjasSeSolapan(franja, otra))),
    { message: "Dos franjas del mismo día se pisan", path: ["franjas"] }
  )
