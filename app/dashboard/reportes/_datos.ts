/**
 * Todo lo que los reportes le piden al servidor. La pantalla llama a estas
 * funciones y no conoce ninguna URL. Cada una devuelve un `Resultado`
 * (`lib/peticiones.ts`) en vez de lanzar.
 */

import { rangoDelDia, zonaDelDispositivo } from "@/lib/fechas"
import { conJson, pedir, pedirConCodigo, type Resultado, type ResultadoConCodigo } from "@/lib/peticiones"
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
  /** `null` si quien anuló ya no está en el negocio. */
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
 * anulado. Sólo el dueño (`puedeAnular`); el servidor lo vuelve a mirar. Con
 * el código del fallo: un 404 o un 409 es que la atención cambió entretanto
 * (otro ya la anuló), y la pantalla recarga en vez de sólo avisar.
 */
export async function anularCobro(id: string, motivo: string): Promise<ResultadoConCodigo<unknown>> {
  return pedirConCodigo<unknown>(
    `/api/atenciones/${encodeURIComponent(id)}/anulacion`,
    "No se pudo anular el cobro",
    conJson("POST", motivo.trim() ? { motivo: motivo.trim() } : {})
  )
}
