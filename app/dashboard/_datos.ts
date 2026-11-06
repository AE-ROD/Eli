/**
 * Lo que el inicio del panel le pide al servidor: las cifras del día y del mes.
 * La pantalla no conoce la URL; si cambia el endpoint, se cambia acá.
 *
 * Devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar: la pantalla
 * está obligada a decidir qué mostrar si las cifras no llegan, en vez de
 * quedarse en "Cargando..." para siempre.
 */

import { zonaDelDispositivo } from "@/lib/fechas"
import { conJson, pedir, type Resultado } from "@/lib/peticiones"
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

/**
 * Con la zona del dispositivo, el mes de los ingresos es el del calendario de
 * quien mira, el mismo que cuentan los reportes: con la del servidor (UTC), un
 * cobro del 30 a la noche ya caía en el mes siguiente. Si el navegador no la
 * informa, no se manda y el servidor usa la suya, como antes.
 */
export async function leerEstadisticas(): Promise<Resultado<EstadisticasDelPanel>> {
  const zona = zonaDelDispositivo()
  const url = zona ? `/api/dashboard/stats?${new URLSearchParams({ zona })}` : "/api/dashboard/stats"
  return pedir<EstadisticasDelPanel>(url, "No se pudieron cargar las estadísticas")
}

/**
 * Si el endpoint mandó la facturación. No la manda a quien no puede verla, y
 * en ese caso los bloques de ingresos se omiten en vez de mostrar un vacío
 * raro. Mientras las cifras no llegaron, tampoco hay ingresos que mostrar.
 */
export function puedeVerIngresos(estadisticas: EstadisticasDelPanel | null): boolean {
  return estadisticas?.ingresosMes !== undefined
}

// ─── Clínica dental: el inicio de la clínica ─────────────────────────────────

/** Una cita en un sillón, como la manda `GET /api/dashboard/clinica`. Fechas en ISO. */
export interface CitaEnElSillon {
  citaId: string
  titulo: string
  paciente: { id: string; nombre: string } | null
  odontologo: { id: string; nombre: string } | null
  inicio: string
  fin: string
}

export interface SillonAhora {
  id: string
  nombre: string
  orden: number
  estado: "atendiendo" | "libre"
  /** La que se está atendiendo, desde cuándo. Sólo "atendiendo". */
  actual: (CitaEnElSillon & { desde: string }) | null
  /** La próxima del día en ese sillón, que todavía no empieza. */
  siguiente: CitaEnElSillon | null
  /** Libre hasta el inicio de la siguiente; `null`, libre el resto del día. */
  libreHasta: string | null
}

export interface PersonaEnLaSalaDeEspera {
  atencionId: string
  /** La cita de la que nació, si quien mira la ve; `null` sin reserva o si es de un colega. */
  citaId: string | null
  paciente: { id: string | null; nombre: string }
  minutos: number
  titulo: string | null
  sillon: { id: string; nombre: string } | null
}

export interface PresupuestoPorResponder {
  etapaId: string
  planId: string
  etapa: string
  paciente: { id: string; nombre: string }
  presentadaEn: string | null
  /** Sólo para quien ve la plata del negocio (dueña y encargado). */
  montoCents?: number
}

export interface InicioDeLaClinica {
  fecha: string
  zona: string
  ahora: string
  /**
   * "negocio": dueña y encargado ven toda la clínica. "propias": el
   * odontólogo ve sólo sus citas en los sillones, así que un sillón "libre"
   * para él es uno sin citas suyas, no uno vacío.
   */
  alcance: "negocio" | "propias"
  sillones: SillonAhora[]
  salaDeEspera: { cantidad: number; mayorEsperaMinutos: number | null; lista: PersonaEnLaSalaDeEspera[] }
  /** Sin la clave si quien mira no ve los planes. */
  presupuestosPorResponder?: { cantidad: number; totalCents?: number; lista: PresupuestoPorResponder[] }
}

/** "Sillones ahora", la sala de espera y los presupuestos por responder, para hoy en la zona de la clínica. */
export async function leerInicioDeLaClinica(): Promise<Resultado<InicioDeLaClinica>> {
  return pedir<InicioDeLaClinica>("/api/dashboard/clinica", "No se pudo cargar el inicio de la clínica")
}

/**
 * "Pasar al sillón": la atención de la sala de espera pasa a "en atención",
 * como en la sala de espera (el Tablero). Si le falta el motivo o el
 * odontólogo, el servidor responde 400 con lo que falta.
 */
export async function pasarAlSillon(atencionId: string): Promise<Resultado> {
  return pedir(
    `/api/atenciones/${encodeURIComponent(atencionId)}/estado`,
    "No se pudo pasar al sillón",
    conJson("POST", { estado: "en-atencion" })
  )
}
