import { deCentavos, nombreDeEstado, totalEnCentavos } from "./atenciones"
import { esEtiquetaReservada } from "./clientes-eliminados"
import { DIAS_MAXIMOS } from "./periodos"
import { diasEntre, esFechaCalendario, fechaYMinutosEn, rangoDelDiaEn } from "./zona-horaria"

/**
 * Las planillas que se descargan del panel: los clientes del negocio y sus
 * atenciones en un rango de fechas. Sólo arma las filas; el CSV lo escribe
 * `escribirCsv` (`lib/csv.ts`) y la consulta, el endpoint.
 */

/** Cuántas atenciones entran en una exportación. Más que eso se pide por partes. */
export const ATENCIONES_MAXIMAS_POR_EXPORTACION = 20_000

/** "2026-10-27 14:05", en la hora del negocio. */
export function fechaYHora(instante: Date | null | undefined, zona: string): string {
  if (!instante) return ""
  const { fecha, minutos } = fechaYMinutosEn(instante, zona)
  const hora = String(Math.floor(minutos / 60)).padStart(2, "0")
  const minuto = String(minutos % 60).padStart(2, "0")
  return `${fecha} ${hora}:${minuto}`
}

export interface ClienteParaExportar {
  name: string
  lastName: string | null
  cedula: string | null
  phone: string | null
  email: string | null
  tags: string[]
  notes: string | null
  whatsappConsentAt: Date | null
  createdAt: Date
}

export const CABECERA_DE_CLIENTES = [
  "Nombre",
  "Apellido",
  "Cédula",
  "Teléfono",
  "Correo",
  "Etiquetas",
  "Notas",
  "Acepta WhatsApp",
  "Fecha del consentimiento",
  "Cliente desde",
] as const

/**
 * Las filas de la planilla de clientes, con la cabecera primero. "Acepta
 * WhatsApp" dice "Sí" o "No", que es lo que la importación vuelve a leer.
 * La marca de cliente eliminado no sale nunca, aunque el endpoint ya los
 * excluye.
 */
export function filasDeClientes(clientes: readonly ClienteParaExportar[], zona: string): (string | null)[][] {
  return [
    [...CABECERA_DE_CLIENTES],
    ...clientes.map((cliente) => [
      cliente.name,
      cliente.lastName,
      cliente.cedula,
      cliente.phone,
      cliente.email,
      cliente.tags.filter((etiqueta) => !esEtiquetaReservada(etiqueta)).join(", "),
      cliente.notes,
      cliente.whatsappConsentAt ? "Sí" : "No",
      fechaYHora(cliente.whatsappConsentAt, zona),
      fechaYHora(cliente.createdAt, zona),
    ]),
  ]
}

export interface AtencionParaExportar {
  arrivedAt: Date
  paidAt: Date | null
  customerName: string
  status: string
  totalCents: number | null
  services: { serviceName: string; professionalName: string; priceCents: number }[]
}

export const CABECERA_DE_ATENCIONES = [
  "Llegada",
  "Cliente",
  "Estado",
  "Servicios",
  "Profesionales",
  "Total",
  "Cobrada el",
] as const

/**
 * Las filas de la planilla de atenciones, con la cabecera primero. El total
 * es el congelado al cobrar; mientras la atención está abierta, la suma de
 * sus líneas (como en el tablero). En pesos y escrito como número
 * (`montoParaPlanilla`): la planilla lo suma.
 */
export function filasDeAtenciones(
  atenciones: readonly AtencionParaExportar[],
  zona: string
): (string | null)[][] {
  return [
    [...CABECERA_DE_ATENCIONES],
    ...atenciones.map((atencion) => [
      fechaYHora(atencion.arrivedAt, zona),
      atencion.customerName,
      nombreDeEstado(atencion.status),
      atencion.services.map((linea) => linea.serviceName).join(", "),
      [...new Set(atencion.services.map((linea) => linea.professionalName))].join(", "),
      montoParaPlanilla(atencion.totalCents ?? totalEnCentavos(atencion.services)),
      fechaYHora(atencion.paidAt, zona),
    ]),
  ]
}

/**
 * El monto en pesos, sin separador de miles y con coma decimal si tiene
 * centavos: así Excel en español lo lee como número ("8000,5"), no como texto.
 */
export function montoParaPlanilla(centavos: number): string {
  return String(deCentavos(centavos)).replace(".", ",")
}

export type RangoDeExportacion = { ok: true; desde: Date; hasta: Date } | { ok: false; error: string }

/**
 * Del día `desde` al día `hasta`, los dos incluidos, en la zona del negocio:
 * [desde 00:00, día siguiente a `hasta` 00:00). Hasta `DIAS_MAXIMOS` días,
 * como los reportes.
 */
export function rangoDeExportacion(desde: string | null, hasta: string | null, zona: string): RangoDeExportacion {
  if (!desde || !hasta || !esFechaCalendario(desde) || !esFechaCalendario(hasta)) {
    return { ok: false, error: "Elige la fecha de inicio y la de fin." }
  }
  const dias = diasEntre(desde, hasta) + 1
  if (dias < 1) return { ok: false, error: "La fecha de fin no puede ser anterior a la de inicio." }
  if (dias > DIAS_MAXIMOS) {
    return { ok: false, error: `El período no puede pasar de ${DIAS_MAXIMOS} días: acórtalo o pídelo por partes.` }
  }
  return { ok: true, desde: rangoDelDiaEn(desde, zona).desde, hasta: rangoDelDiaEn(hasta, zona).hasta }
}

/** El nombre del archivo: `clientes-2026-10-27.csv`. Sólo letras, números y guiones. */
export function nombreDeArchivo(base: string, fecha: string): string {
  return `${base}-${fecha}.csv`.replace(/[^\w.-]/g, "-")
}

/**
 * La descarga: el CSV como adjunto, sin caché (son datos personales y de
 * dinero: no quedan en un proxy ni en el historial del navegador).
 */
export function respuestaCsv(contenido: string, nombre: string): Response {
  return new Response(contenido, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  })
}
