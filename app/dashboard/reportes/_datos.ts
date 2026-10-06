/**
 * Todo lo que los reportes le piden al servidor. La pantalla llama a estas
 * funciones y no conoce ninguna URL. Cada una devuelve un `Resultado`
 * (`lib/peticiones.ts`) en vez de lanzar.
 */

import { rangoDelDia } from "@/lib/fechas"
import { pedir, type Resultado } from "@/lib/peticiones"
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
  lineas: LineaDeReporte[]
  total?: number
  pagos?: PagoDeReporte[]
}

export interface ResumenDeReporte {
  /** Para el profesional, lo que sumaron sus propias líneas. */
  ingresos: number
  cantidad: number
  /** `null` sin atenciones: un promedio de cero se leería como un dato. */
  ticketPromedio: number | null
  /** `clave` es única: es la `key`. `id` en null, un ex-miembro. */
  porProfesional: { clave: string; id: string | null; nombre: string; monto: number; servicios: number }[]
  porServicio: { clave: string; id: string | null; nombre: string; cantidad: number; monto: number }[]
  /** Sólo para dueño y encargado. */
  porMedio?: { medio: string; nombre: string; monto: number }[]
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

/**
 * La zona horaria del dispositivo (`America/Santiago`). El día y el turno de
 * cada cobro se calculan en la hora de quien mira (PRODUCTO.md, sección 8).
 */
function zonaDelDispositivo(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export async function leerReporte(pedido: PedidoDeReporte): Promise<Resultado<Reporte>> {
  const parametros = new URLSearchParams({
    desde: pedido.desde.toISOString(),
    hasta: pedido.hasta.toISOString(),
    zona: zonaDelDispositivo(),
    pagina: String(pedido.pagina),
  })
  // Un filtro vacío es un filtro que no se eligió: no viaja.
  const filtros = { turno: pedido.turno, profesional: pedido.profesional, servicio: pedido.servicio, medio: pedido.medio }
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor) parametros.set(nombre, valor)
  }
  return pedir<Reporte>(`/api/reportes?${parametros}`, "No se pudo cargar el reporte")
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
