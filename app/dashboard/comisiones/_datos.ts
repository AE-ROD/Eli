/**
 * Todo lo que la pantalla de Comisiones le pide al servidor, y cómo se lee y
 * se escribe un %. La pantalla llama a estas funciones y no conoce ninguna
 * URL. Cada una devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar.
 */

import { conJson, pedir, type Resultado } from "@/lib/peticiones"
import type { ExcepcionRespuesta, MaterialRespuesta } from "@/lib/edicion-de-protesis"
import type { LineaPorPagar, PagoAlLaboratorioRespuesta, PorPagarDeUnLaboratorio, PorPagarRespuesta } from "@/lib/pagos-al-laboratorio"
import { esRepartoValido, textoDePorcentaje, type RepartoEnPuntosBase, type TipoDeProtesis, type Unidad } from "@/lib/protesis"

export interface ExcepcionDeComision {
  servicioId: string
  servicio: string
  porcentaje: number
}

export interface MiembroConComision {
  id: string
  nombre: string
  rol: string
  /** `null`: sin configurar (no es 0). */
  porcentaje: number | null
  excepciones: ExcepcionDeComision[]
  /** Servicios ya cobrados de este profesional que esperan un %. */
  pendientes: number
}

export interface DatosDeComisiones {
  miembros: MiembroConComision[]
  servicios: { id: string; nombre: string; activo: boolean }[]
  productos: { id: string; nombre: string; porcentaje: number | null; activo: boolean }[]
  /** Hay más pendientes de los que el servidor cuenta de una vez. */
  pendientesTruncado: boolean
}

export interface CambioDeComision {
  id: string
  cuando: string
  /** `id` en null: ya no está en el equipo (el nombre quedó copiado). */
  miembro: { id: string | null; nombre: string }
  alcance: "default" | "service" | "product"
  /** El servicio o producto del cambio; null en el % por defecto. */
  sobre: string | null
  quien: string
  antes: number | null
  despues: number | null
}

export interface HistorialDeComisiones {
  cambios: CambioDeComision[]
  total: number
  pagina: number
  paginas: number
  /** Los nombres de quienes ya no están en el equipo y tienen cambios: se pueden elegir en el filtro. */
  exMiembros: string[]
}

/**
 * El filtro del historial: todo el equipo (vacío), un profesional del equipo
 * (por id) o alguien que ya se fue (por el nombre que quedó copiado, #119).
 */
export interface FiltroDeHistorial {
  miembro?: string
  exMiembro?: string
}

export async function leerComisiones(): Promise<Resultado<DatosDeComisiones>> {
  return pedir<DatosDeComisiones>("/api/comisiones", "No se pudieron cargar las comisiones")
}

export async function leerHistorial(
  filtro: FiltroDeHistorial,
  pagina: number
): Promise<Resultado<HistorialDeComisiones>> {
  const parametros = new URLSearchParams({ pagina: String(pagina) })
  if (filtro.miembro) parametros.set("miembro", filtro.miembro)
  else if (filtro.exMiembro) parametros.set("exMiembro", filtro.exMiembro)
  return pedir<HistorialDeComisiones>(`/api/comisiones/historial?${parametros}`, "No se pudo cargar el historial")
}

type Guardado = Resultado<{ porcentaje: number | null; cambio: boolean }>

/** El % por defecto de un profesional; `null` lo deja sin configurar. */
export async function guardarPorcentajeDeMiembro(miembroId: string, porcentaje: number | null): Promise<Guardado> {
  return pedir(
    `/api/comisiones/miembros/${encodeURIComponent(miembroId)}`,
    "No se pudo guardar el porcentaje",
    conJson("PUT", { porcentaje })
  )
}

/** La excepción de un profesional en un servicio; `null` la quita. */
export async function guardarExcepcion(
  miembroId: string,
  servicioId: string,
  porcentaje: number | null
): Promise<Guardado> {
  return pedir(
    `/api/comisiones/miembros/${encodeURIComponent(miembroId)}/servicios/${encodeURIComponent(servicioId)}`,
    porcentaje === null ? "No se pudo quitar la excepción" : "No se pudo guardar la excepción",
    conJson("PUT", { porcentaje })
  )
}

// ─── Leer y mostrar un % ─────────────────────────────────────────────────────

/**
 * Lo que se escribió en un campo de %: vacío es `null` (sin configurar); un
 * número de 0 a 100 con hasta dos decimales, con coma o punto ("33,33"), es
 * ese número; cualquier otra cosa no se adivina y es un error.
 */
export function leerPorcentaje(texto: string): { ok: true; valor: number | null } | { ok: false; error: string } {
  const limpio = texto.trim().replace(/\s*%$/, "")
  if (limpio === "") return { ok: true, valor: null }
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(limpio)) {
    return { ok: false, error: "Escribe un número de 0 a 100, con hasta dos decimales (por ejemplo 40 o 33,33)." }
  }
  const valor = Number(limpio.replace(",", "."))
  if (valor > 100) return { ok: false, error: "El porcentaje no puede pasar de 100." }
  return { ok: true, valor }
}

/** `33,33 %`, o "Sin configurar" si es null. */
export function formatearPorcentaje(porcentaje: number | null): string {
  if (porcentaje === null) return "Sin configurar"
  return `${porcentaje.toLocaleString("es-CL", { maximumFractionDigits: 2 })} %`
}

/** Cómo se escribe un % guardado en el campo para editarlo: `33,33`, o vacío. */
export function porcentajeParaEscribir(porcentaje: number | null): string {
  return porcentaje === null ? "" : porcentaje.toLocaleString("es-CL", { maximumFractionDigits: 2, useGrouping: false })
}

// ─── Reparto de prótesis (clínica dental, sólo la dueña) ─────────────────────

/** El material como lo devuelve la API (`MaterialRespuesta`, lib/edicion-de-protesis.ts). */
export type MaterialDeProtesis = MaterialRespuesta
export type ExcepcionDeProtesis = ExcepcionRespuesta

/** Lo que manda el formulario de un material. Dinero en centavos y partes en puntos base, como la API. */
export interface MaterialEscrito {
  nombre: string
  unidad: Unidad
  tipos: TipoDeProtesis[]
  precioCents: number
  pbOdontologo: number
  pbClinica: number
  pbTecnico: number
  laboratorioPorDefectoId: string | null
  activo: boolean
}

export async function leerMaterialesDeProtesis(): Promise<Resultado<MaterialDeProtesis[]>> {
  return pedir<MaterialDeProtesis[]>("/api/comisiones/protesis/materiales", "No se pudieron cargar los materiales")
}

export async function crearMaterialDeProtesis(datos: MaterialEscrito): Promise<Resultado<MaterialDeProtesis>> {
  return pedir<MaterialDeProtesis>("/api/comisiones/protesis/materiales", "No se pudo agregar el material", conJson("POST", datos))
}

export async function editarMaterialDeProtesis(id: string, datos: Partial<MaterialEscrito>): Promise<Resultado<MaterialDeProtesis>> {
  return pedir<MaterialDeProtesis>(`/api/comisiones/protesis/materiales/${encodeURIComponent(id)}`, "No se pudo guardar el material", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  })
}

export async function leerExcepcionesDeProtesis(): Promise<Resultado<ExcepcionDeProtesis[]>> {
  return pedir<ExcepcionDeProtesis[]>("/api/comisiones/protesis/excepciones", "No se pudieron cargar las excepciones")
}

export async function crearExcepcionDeProtesis(
  datos: { memberId: string; materialId: string } & RepartoEnPuntosBase
): Promise<Resultado<ExcepcionDeProtesis>> {
  return pedir<ExcepcionDeProtesis>("/api/comisiones/protesis/excepciones", "No se pudo agregar la excepción", conJson("POST", datos))
}

export async function editarExcepcionDeProtesis(id: string, reparto: RepartoEnPuntosBase): Promise<Resultado<ExcepcionDeProtesis>> {
  return pedir<ExcepcionDeProtesis>(`/api/comisiones/protesis/excepciones/${encodeURIComponent(id)}`, "No se pudo guardar la excepción", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reparto),
  })
}

export async function borrarExcepcionDeProtesis(id: string): Promise<Resultado<unknown>> {
  return pedir<unknown>(`/api/comisiones/protesis/excepciones/${encodeURIComponent(id)}`, "No se pudo quitar la excepción", {
    method: "DELETE",
  })
}

/** Los laboratorios de la clínica (activos y no), para el laboratorio por defecto de cada material. */
export async function leerLaboratoriosDeLaClinica(): Promise<Resultado<{ id: string; nombre: string; activo: boolean }[]>> {
  return pedir<{ id: string; nombre: string; activo: boolean }[]>("/api/configuracion/laboratorios", "No se pudieron cargar los laboratorios")
}

/** Las tres partes como se escriben en el formulario: en %, con coma o punto. */
export interface RepartoEscrito {
  odontologo: string
  clinica: string
  tecnico: string
}

/** Un reparto guardado (puntos base) como se escribe en el formulario: "40", "33,33". */
export function repartoParaEscribir(reparto: RepartoEnPuntosBase): RepartoEscrito {
  return {
    odontologo: porcentajeParaEscribir(reparto.pbOdontologo / 100),
    clinica: porcentajeParaEscribir(reparto.pbClinica / 100),
    tecnico: porcentajeParaEscribir(reparto.pbTecnico / 100),
  }
}

export type RepartoLeido =
  | { ok: true; reparto: RepartoEnPuntosBase; sumaPb: number }
  | { ok: false; error: string; sumaPb: number | null }

/**
 * Las tres partes escritas, en puntos base, y cuánto suman. Cada una es un %
 * de 0 a 100 con hasta dos decimales (`leerPorcentaje`), y ninguna va vacía.
 * Para guardar tienen que sumar exactamente 100 %: si no, el error dice
 * cuánto suma hoy.
 */
export function leerReparto(escrito: RepartoEscrito): RepartoLeido {
  const partes = [escrito.odontologo, escrito.clinica, escrito.tecnico].map(leerPorcentaje)
  const pb = partes.map((parte) => (parte.ok && parte.valor !== null ? Math.round(parte.valor * 100) : null))
  const sumaPb = pb.every((valor) => valor !== null) ? (pb as number[]).reduce((a, b) => a + b, 0) : null
  const mala = partes.find((parte) => !parte.ok)
  if (mala && !mala.ok) return { ok: false, error: mala.error, sumaPb }
  if (sumaPb === null) return { ok: false, error: "Escribe las tres partes: la de la tratante, la de la clínica y la del laboratorio.", sumaPb }
  const reparto = { pbOdontologo: pb[0] as number, pbClinica: pb[1] as number, pbTecnico: pb[2] as number }
  if (!esRepartoValido(reparto)) {
    return { ok: false, error: `Hoy suma ${textoDePorcentaje(sumaPb)}. Ajusta las partes hasta llegar a 100 % para guardar.`, sumaPb }
  }
  return { ok: true, reparto, sumaPb }
}

// ─── Por pagar al laboratorio (clínica dental, sólo la dueña) ────────────────

export type PorPagarAlLaboratorio = PorPagarRespuesta
export type LaboratorioPorPagar = PorPagarDeUnLaboratorio
export type LineaPorPagarAlLaboratorio = LineaPorPagar
export type PagoAlLaboratorio = PagoAlLaboratorioRespuesta

/** Lo que se le debe a cada laboratorio: la parte del técnico de los abonos de prótesis ya entregadas. */
export async function leerPorPagarAlLaboratorio(): Promise<Resultado<PorPagarAlLaboratorio>> {
  return pedir<PorPagarAlLaboratorio>("/api/comisiones/protesis/por-pagar", "No se pudo cargar lo por pagar al laboratorio")
}

/** El historial de pagos a laboratorios, anulados incluidos, del más nuevo al más viejo. */
export async function leerPagosAlLaboratorio(): Promise<Resultado<PagoAlLaboratorio[]>> {
  return pedir<PagoAlLaboratorio[]>("/api/comisiones/protesis/pagos-al-laboratorio", "No se pudieron cargar los pagos al laboratorio")
}

/** "Marcar pagado": todo lo pendiente del laboratorio, o sólo las líneas elegidas. El monto lo suma el servidor. */
export async function pagarAlLaboratorio(pedido: {
  laboratorioId: string
  medio: string
  lineas: readonly string[] | "todo"
}): Promise<Resultado<PagoAlLaboratorio>> {
  const { laboratorioId, medio, lineas } = pedido
  return pedir<PagoAlLaboratorio>(
    "/api/comisiones/protesis/pagos-al-laboratorio",
    "No se pudo marcar como pagado",
    conJson("POST", lineas === "todo" ? { laboratorioId, medio, todo: true } : { laboratorioId, medio, lineas })
  )
}

/** Anula un pago: sus líneas vuelven a quedar por pagar. */
export async function anularPagoAlLaboratorio(id: string): Promise<Resultado<PagoAlLaboratorio>> {
  return pedir<PagoAlLaboratorio>(
    `/api/comisiones/protesis/pagos-al-laboratorio/${encodeURIComponent(id)}/anulacion`,
    "No se pudo anular el pago",
    { method: "POST" }
  )
}
