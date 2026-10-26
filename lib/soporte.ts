import { z } from "zod"
import { email as campoEmail, nombre as campoNombre } from "@/lib/campos-del-panel"

/**
 * Soporte: lo que comparten `POST /api/soporte` y las pantallas de ayuda
 * (/dashboard/ayuda con sesión, /soporte sin sesión). Los valores de `tipo` y
 * `area` son los que se guardan en `SolicitudDeSoporte`; las etiquetas son las
 * que ve la persona y las que van en los correos.
 */

export const TIPOS = [
  { valor: "falla", etiqueta: "Falla", descripcion: "Algo no funciona como debería." },
  { valor: "reclamo", etiqueta: "Reclamo", descripcion: "Algo no te pareció bien y quieres contárnoslo." },
  { valor: "consulta", etiqueta: "Consulta", descripcion: "Buscas información o tienes una duda." },
] as const

export const AREAS = [
  { valor: "agenda", etiqueta: "Agenda" },
  { valor: "reservas", etiqueta: "Reservas en línea" },
  { valor: "tablero", etiqueta: "Tablero del día" },
  { valor: "clientes", etiqueta: "Clientes" },
  { valor: "reportes", etiqueta: "Reportes" },
  { valor: "equipo", etiqueta: "Equipo" },
  { valor: "cuenta-y-plan", etiqueta: "Cuenta y plan" },
  { valor: "otro", etiqueta: "Otro" },
] as const

export type TipoDeSolicitud = (typeof TIPOS)[number]["valor"]
export type AreaDeSoporte = (typeof AREAS)[number]["valor"]

const VALORES_DE_TIPO = TIPOS.map((t) => t.valor) as [TipoDeSolicitud, ...TipoDeSolicitud[]]
const VALORES_DE_AREA = AREAS.map((a) => a.valor) as [AreaDeSoporte, ...AreaDeSoporte[]]

export function etiquetaDeTipo(tipo: string): string {
  return TIPOS.find((t) => t.valor === tipo)?.etiqueta ?? tipo
}

export function etiquetaDeArea(area: string): string {
  return AREAS.find((a) => a.valor === area)?.etiqueta ?? area
}

/** Topes de largo: los mismos los usa el formulario para sus `maxLength`. */
export const LIMITES = {
  asunto: { min: 3, max: 120 },
  descripcion: { min: 10, max: 4000 },
  dondeOcurrio: { max: 300 },
  nombre: { min: 2, max: 100 },
  email: { max: 254 },
} as const

/**
 * Nombre del campo trampa. Va oculto en el formulario: una persona no lo ve ni
 * lo llena; un bot que completa todos los campos, sí.
 */
export const CAMPO_TRAMPA = "sitio_web"

/** Lo que se pide siempre, haya sesión o no. */
export const esquemaDeSolicitud = z.object({
  tipo: z.enum(VALORES_DE_TIPO, {
    errorMap: () => ({ message: "Elige si es una falla, un reclamo o una consulta" }),
  }),
  area: z.enum(VALORES_DE_AREA, { errorMap: () => ({ message: "Elige un área" }) }),
  asunto: z
    .string({ required_error: "Escribe un asunto", invalid_type_error: "Escribe un asunto" })
    .trim()
    .min(LIMITES.asunto.min, `El asunto tiene que tener al menos ${LIMITES.asunto.min} caracteres`)
    .max(LIMITES.asunto.max, `El asunto no puede tener más de ${LIMITES.asunto.max} caracteres`),
  descripcion: z
    .string({ required_error: "Cuéntanos qué pasó", invalid_type_error: "Cuéntanos qué pasó" })
    .trim()
    .min(LIMITES.descripcion.min, `La descripción tiene que tener al menos ${LIMITES.descripcion.min} caracteres`)
    .max(LIMITES.descripcion.max, `La descripción no puede tener más de ${LIMITES.descripcion.max} caracteres`),
  dondeOcurrio: z
    .string({ invalid_type_error: "Dónde ocurrió tiene que ser un texto" })
    .trim()
    .max(LIMITES.dondeOcurrio.max, `Dónde ocurrió no puede tener más de ${LIMITES.dondeOcurrio.max} caracteres`)
    .optional()
    .nullable()
    .transform((valor) => (valor ? valor : null)),
})

/** Sin sesión, además, quién escribe: nombre y email obligatorios. */
export const esquemaDeContacto = z.object({
  nombre: z.string({ required_error: "Escribe tu nombre", invalid_type_error: "Escribe tu nombre" }).pipe(campoNombre()),
  email: z.string({ required_error: "Escribe tu email", invalid_type_error: "Escribe tu email" }).pipe(campoEmail()),
})

export type DatosDeSolicitud = z.infer<typeof esquemaDeSolicitud>
export type DatosDeContacto = z.infer<typeof esquemaDeContacto>

/**
 * El cuerpo que acepta `POST /api/soporte`. `nombre` y `email` sólo se leen
 * sin sesión; con sesión salen de la cuenta y lo que venga se ignora.
 * `sitio_web` es el campo trampa: siempre vacío o ausente.
 */
export interface CuerpoDeSolicitudDeSoporte {
  tipo: TipoDeSolicitud
  area: AreaDeSoporte
  asunto: string
  descripcion: string
  dondeOcurrio?: string
  nombre?: string
  email?: string
  sitio_web?: string
}

/** 201 de `POST /api/soporte`. */
export interface RespuestaDeSolicitudDeSoporte {
  numero: string
}

/** El número de caso como lo ve la persona: 123 → "#000123". */
export function formatearNumeroDeCaso(numero: number): string {
  return `#${String(numero).padStart(6, "0")}`
}

// ─── Correos ─────────────────────────────────────────────────────────────────

export interface SolicitudGuardada {
  numero: number
  tipo: string
  area: string
  asunto: string
  descripcion: string
  dondeOcurrio: string | null
  nombre: string
  email: string
  userId: string | null
  createdAt: Date
}

export interface NegocioDeLaSolicitud {
  id: string
  nombre: string
}

/** Lo que necesita `enviarSolicitudASoporte` (`lib/email.ts`). */
export interface DatosAvisoASoporte {
  para: string
  responderA: string
  numero: string
  tipo: string
  area: string
  asunto: string
  detalle: Array<[string, string]>
}

/** Lo que necesita `enviarAcuseDeSoporte` (`lib/email.ts`). */
export interface DatosAcuseDeSoporte {
  para: string
  /** La casilla de soporte, si está configurada: así responder el acuse le llega a alguien. */
  responderA: string | null
  numero: string
  detalle: Array<[string, string]>
}

/**
 * Arma los dos correos de una solicitud: el aviso a la casilla de soporte, con
 * todo, y el acuse a quien la mandó.
 *
 * El acuse lleva sólo el número, el tipo y el área, nunca el texto que la
 * persona escribió: sin sesión cualquiera elige a qué dirección va, y repetir
 * ahí un asunto o una descripción libres volvería a Eli un relevo de spam
 * firmado con nuestra marca.
 */
export function correosDeSolicitud(
  solicitud: SolicitudGuardada,
  negocio: NegocioDeLaSolicitud | null,
  casillaDeSoporte: string | null,
): { aSoporte: DatosAvisoASoporte | null; acuse: DatosAcuseDeSoporte } {
  const numero = formatearNumeroDeCaso(solicitud.numero)
  const tipo = etiquetaDeTipo(solicitud.tipo)
  const area = etiquetaDeArea(solicitud.area)

  const detalle: Array<[string, string]> = [
    ["Caso", numero],
    ["Tipo", tipo],
    ["Área", area],
    ["Asunto", solicitud.asunto],
    ["Descripción", solicitud.descripcion],
    ["Dónde ocurrió", solicitud.dondeOcurrio ?? "No lo indicó"],
    ["Nombre", solicitud.nombre],
    ["Email", solicitud.email],
    ["Negocio", negocio ? `${negocio.nombre} (${negocio.id})` : "Sin negocio"],
    ["Origen", solicitud.userId ? `Panel, con sesión (usuario ${solicitud.userId})` : "Página pública, sin sesión"],
    ["Recibida", solicitud.createdAt.toISOString()],
  ]

  return {
    aSoporte: casillaDeSoporte
      ? { para: casillaDeSoporte, responderA: solicitud.email, numero, tipo, area, asunto: solicitud.asunto, detalle }
      : null,
    acuse: {
      para: solicitud.email,
      responderA: casillaDeSoporte,
      numero,
      detalle: [
        ["Caso", numero],
        ["Tipo", tipo],
        ["Área", area],
      ],
    },
  }
}
