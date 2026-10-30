/**
 * Todo lo que los reportes le piden al servidor. La pantalla llama a estas
 * funciones y no conoce ninguna URL. Cada una devuelve un `Resultado`
 * (`lib/peticiones.ts`) en vez de lanzar.
 */

import { rangoDelDia, zonaDelDispositivo } from "@/lib/fechas"
import { CODIGO_CORREGIR_CON_AJUSTE } from "@/lib/bloqueos-de-dinero"
import { codigoDelServidor, conJson, pedir, pedirConCuerpo, type Resultado } from "@/lib/peticiones"
import type { TurnoId } from "@/lib/reportes"

// ─── Lo que devuelve el servidor ─────────────────────────────────────────────

export interface LineaDeReporte {
  id: string
  /** `null` si el servicio se borró del catálogo: el nombre quedó copiado. */
  servicioId: string | null
  servicio: string
  /** `id` en null: quien lo hizo ya no está en el equipo. */
  profesional: { id: string | null; nombre: string }
  precio: number
}

export interface PagoDeReporte {
  id: string
  medio: string
  nombreMedio: string
  monto: number
}

/** Una atención cobrada. Al profesional le llegan sólo sus líneas, sin `total` ni `pagos`. */
export interface FilaDeReporte {
  id: string
  cobradaEn: string
  turno: TurnoId
  cliente: { id: string | null; nombre: string }
  /**
   * `coincide`: la línea cumple los filtros de profesional y servicio, y es
   * de las que suman en el resumen. Sin esos filtros, todas coinciden.
   */
  lineas: (LineaDeReporte & { coincide: boolean })[]
  total?: number
  pagos?: PagoDeReporte[]
}

/**
 * Un desglose en `null` no es un desglose vacío (`[]`): es uno que con los
 * filtros elegidos no se puede calcular sin inventar. Con filtro de
 * profesional o servicio, el de medio (un pago no se reparte entre líneas);
 * con filtro de medio, el de profesional y el de servicio.
 */
export interface ResumenDeReporte {
  /** Para el profesional, lo que sumaron sus propias líneas. */
  ingresos: number
  cantidad: number
  /** `null` sin atenciones: un promedio de cero se leería como un dato. */
  ticketPromedio: number | null
  /** `clave` es única: es la `key`. `id` en null, un ex-miembro. */
  porProfesional: { clave: string; id: string | null; nombre: string; monto: number; servicios: number }[] | null
  porServicio: { clave: string; id: string | null; nombre: string; cantidad: number; monto: number }[] | null
  /** Sólo para dueño y encargado: al profesional la clave no le llega. */
  porMedio?: { medio: string; nombre: string; monto: number }[] | null
}

export interface Reporte {
  /** Lo del negocio, o lo que atendió el profesional que mira. */
  alcance: "negocio" | "propio"
  resumen: ResumenDeReporte
  filas: FilaDeReporte[]
  /** Cuántas atenciones entran con estos filtros, entre todas las páginas. */
  total?: number
  pagina: number
  paginas: number
  /** El período tiene más atenciones de las que el servidor suma de una vez: el resultado está incompleto. */
  truncado: boolean
}

/** Una atención anulada en el período: quién, cuándo y por qué, y lo que dejó de sumar. */
export interface FilaAnulada {
  id: string
  anuladaEn: string
  motivoDeAnulacion: string | null
  /**
   * Quién la anuló: el nombre que se copió al anular (`voidedByName`), que
   * queda aunque esa persona deje el negocio. `null` sólo si no se registró.
   */
  anuladaPor: string | null
  estabaCobrada: boolean
  cobradaEn: string | null
  cliente: { id: string | null; nombre: string }
  lineas: LineaDeReporte[]
  total: number
  pagos: PagoDeReporte[]
}

export interface ReporteDeAnuladas {
  /** `montoAnulado`: lo que se había cobrado de lo anulado, que dejó de sumar. */
  resumen: { cantidad: number; montoAnulado: number }
  filas: FilaAnulada[]
  total: number
  pagina: number
  paginas: number
  truncado: boolean
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export interface PedidoDeReporte {
  desde: Date
  /** Exclusivo. */
  hasta: Date
  /** Vacío es "sin filtro", igual en los cuatro. */
  turno: string
  profesional: string
  servicio: string
  medio: string
  pagina: number
}

/** Lo que siempre viaja: el período y la zona del dispositivo, que es donde se cuentan el día y el turno. */
function parametrosDelPeriodo(desde: Date, hasta: Date, pagina: number): URLSearchParams {
  return new URLSearchParams({
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    zona: zonaDelDispositivo(),
    pagina: String(pagina),
  })
}

export async function leerReporte(pedido: PedidoDeReporte): Promise<Resultado<Reporte>> {
  const parametros = parametrosDelPeriodo(pedido.desde, pedido.hasta, pedido.pagina)
  // Un filtro vacío es un filtro que no se eligió: no viaja.
  const filtros = { turno: pedido.turno, profesional: pedido.profesional, servicio: pedido.servicio, medio: pedido.medio }
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor) parametros.set(nombre, valor)
  }
  return pedir<Reporte>(`/api/reportes?${parametros}`, "No se pudo cargar el reporte")
}

/**
 * Lo anulado en el período, de lo más reciente a lo más viejo. Sólo el
 * período: el turno y los demás filtros son del reporte de lo cobrado, y el
 * servidor los ignora. Sólo para dueño y encargado.
 */
export async function leerAnuladas(pedido: { desde: Date; hasta: Date; pagina: number }): Promise<
  Resultado<ReporteDeAnuladas>
> {
  const parametros = parametrosDelPeriodo(pedido.desde, pedido.hasta, pedido.pagina)
  parametros.set("anuladas", "1")
  return pedir<ReporteDeAnuladas>(`/api/reportes?${parametros}`, "No se pudieron cargar las anuladas")
}

export interface OpcionesDeFiltro {
  profesionales: { id: string; nombre: string }[]
  servicios: { id: string; nombre: string }[]
}

/**
 * Los profesionales y servicios que se ofrecen como filtro. Salen del
 * catálogo del tablero de hoy, que ya viene recortado según quién mira: al
 * profesional sólo le llega él mismo.
 */
export async function leerOpcionesDeFiltro(): Promise<Resultado<OpcionesDeFiltro>> {
  const { desde, hasta } = rangoDelDia(new Date())
  const parametros = new URLSearchParams({ desde: desde.toISOString(), hasta: hasta.toISOString() })
  const resultado = await pedir<{ catalogo: OpcionesDeFiltro }>(
    `/api/atenciones?${parametros}`,
    "No se pudieron cargar los profesionales y servicios para filtrar"
  )
  if (!resultado.ok) return resultado

  const { profesionales, servicios } = resultado.datos.catalogo
  return {
    ok: true,
    datos: {
      profesionales: profesionales.map(({ id, nombre }) => ({ id, nombre })),
      servicios: servicios.map(({ id, nombre }) => ({ id, nombre })),
    },
  }
}

// ─── Acciones ────────────────────────────────────────────────────────────────

/**
 * Anula un cobro del historial, de cualquier día: deja de sumar y pasa a lo
 * anulado. Sólo el dueño (`puedeAnular`); el servidor lo vuelve a mirar.
 *
 * - `corregirConAjuste`: el cobro ya entró en una liquidación o en un cierre
 *   de caja (409 con ese código, #117). No cambió nada: la pantalla muestra
 *   el mensaje del servidor, que dice cómo se corrige.
 * - Cualquier otro 404 o 409 es que la atención cambió entretanto (otro ya la
 *   anuló), y la pantalla recarga en vez de sólo avisar.
 */
export type ResultadoDeAnulacion =
  | { ok: true; datos: unknown }
  | { ok: false; error: string; codigo: number | null; corregirConAjuste: boolean }

export async function anularCobro(id: string, motivo: string): Promise<ResultadoDeAnulacion> {
  const resultado = await pedirConCuerpo<unknown>(
    `/api/atenciones/${encodeURIComponent(id)}/anulacion`,
    "No se pudo anular el cobro",
    conJson("POST", motivo.trim() ? { motivo: motivo.trim() } : {})
  )
  if (resultado.ok) return resultado
  const { error, codigo, cuerpo } = resultado
  return { ok: false, error, codigo, corregirConAjuste: codigoDelServidor(cuerpo) === CODIGO_CORREGIR_CON_AJUSTE }
}

// ─── Llenar horas (#72) ──────────────────────────────────────────────────────

export interface ComparacionDeMetrica {
  actual: number | null
  anterior: number | null
  /** Cantidades: cambio relativo (0,25 = 25 % más). Tasas: diferencia en puntos (0,05 = 5 puntos). `null`: sin base. */
  cambio: number | null
}

export interface ReporteLlenarHoras {
  zona: string
  periodo: { desde: string; hasta: string; dias: number }
  periodoAnterior: { desde: string; hasta: string }
  ocupacion: {
    porProfesional: {
      id: string
      nombre: string
      minutosDisponibles: number
      minutosOcupados: number
      /** De 0 a 1; `null` sin horario disponible. */
      ocupacion: number | null
    }[]
    total: { minutosDisponibles: number; minutosOcupados: number; ocupacion: number | null }
  }
  clientes: { nuevos: number; recurrentes: number; sinFicha: number }
  inasistencia: {
    total: { citas: number; noVino: number; tasa: number | null }
    porProfesional: { id: string | null; nombre: string; citas: number; noVino: number; tasa: number | null }[]
  }
  comparacion: {
    ocupacion: ComparacionDeMetrica
    clientesNuevos: ComparacionDeMetrica
    clientesRecurrentes: ComparacionDeMetrica
    inasistencia: ComparacionDeMetrica
  }
  truncado: boolean
}

/**
 * "Llenar horas": ocupación, clientes nuevos y recurrentes, inasistencia y la
 * comparación con el período anterior. `desde` y `hasta` son días
 * (`2026-10-19`), los dos incluidos; el servidor los lee en la zona del
 * negocio. Sólo dueña y encargado.
 */
export async function leerLlenarHoras(desde: string, hasta: string): Promise<Resultado<ReporteLlenarHoras>> {
  const parametros = new URLSearchParams({ desde, hasta })
  return pedir<ReporteLlenarHoras>(`/api/reportes/ocupacion?${parametros}`, "No se pudo cargar el reporte para llenar horas")
}

/** `42 %` (sin decimales), o `—` si no hay con qué calcularlo. */
export function formatearTasa(tasa: number | null): string {
  return tasa === null ? "—" : `${Math.round(tasa * 100)} %`
}

/** `12 h 30 min`, `45 min`, `0 min`. */
export function formatearMinutos(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (horas === 0) return `${resto} min`
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`
}

/**
 * La comparación con el período anterior, para leer: `+25 %` en una
 * cantidad, `+5 pts` en una tasa. `null` si no hay base (el anterior fue 0 o
 * no se pudo calcular).
 */
export function formatearCambio(comparacion: ComparacionDeMetrica, tipo: "cantidad" | "tasa"): string | null {
  if (comparacion.cambio === null) return null
  const valor = Math.round(comparacion.cambio * 100)
  const signo = valor > 0 ? "+" : valor < 0 ? "−" : ""
  return `${signo}${Math.abs(valor)} ${tipo === "cantidad" ? "%" : "pts"}`
}
