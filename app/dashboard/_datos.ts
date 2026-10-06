/**
 * Lo que el inicio del panel le pide al servidor: las cifras del día y del mes.
 * La pantalla no conoce la URL; si cambia el endpoint, se cambia acá.
 *
 * Devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar: la pantalla
 * está obligada a decidir qué mostrar si las cifras no llegan, en vez de
 * quedarse en "Cargando..." para siempre.
 */

import { pedir, type Resultado } from "@/lib/peticiones"
import type { CitaDelDia, FranjaHorario } from "@/lib/horario-dia"

export interface EstadisticasDelPanel {
  citasHoy: number
  /** `customer` puede venir nulo: en el esquema una cita puede no tener cliente. */
  citasHoyLista: CitaDelDia[]
  /** Sólo cuando no hay citas hoy: el dato honesto es cuándo es la próxima. */
  proximaCita?: { id: string; title: string; startTime: string }
  totalClientes: number
  clientesNuevosMes: number
  /**
   * Lo cobrado en el tablero este mes: la suma de los pagos de las atenciones
   * finalizadas (docs/PRODUCTO.md, sección 7). Una cita completada en la
   * agenda sin pasar por el cobro no suma. `atencionesCobradasMes` dice sobre
   * cuántas atenciones está hecha la cifra.
   *
   * Ausentes para quien no puede ver la facturación del negocio (profesional).
   */
  ingresosMes?: number
  atencionesCobradasMes?: number
  /**
   * Sólo para `worker`, y sólo si tiene horario activo cargado para hoy
   * (F-014). Ausente para dueño/encargado y para un profesional sin horario:
   * la ausencia es el estado, nunca un rango inventado.
   */
  horarioHoy?: FranjaHorario[]
  /** Sólo viajan las que se pudieron calcular: sin mes anterior, no hay clave. */
  tendencias: {
    clientes?: number
    ingresos?: number
  }
}

export async function leerEstadisticas(): Promise<Resultado<EstadisticasDelPanel>> {
  return pedir<EstadisticasDelPanel>("/api/dashboard/stats", "No se pudieron cargar las estadísticas")
}

/**
 * Si el endpoint mandó la facturación. No la manda a quien no puede verla, y
 * en ese caso los bloques de ingresos se omiten en vez de mostrar un vacío
 * raro. Mientras las cifras no llegaron, tampoco hay ingresos que mostrar.
 */
export function puedeVerIngresos(estadisticas: EstadisticasDelPanel | null): boolean {
  return estadisticas?.ingresosMes !== undefined
}
