/**
 * Lo que la ficha clínica le pide al servidor: antecedentes, odontograma,
 * evoluciones y plan de tratamiento (`app/api/clientes/[id]/…`), y lo que
 * necesita de otras partes del panel (las citas del paciente, los servicios y
 * el equipo). La pantalla llama a estas funciones y no conoce ninguna URL.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`): el error viene
 * del servidor ya listo para mostrar (`{ error }`).
 */

import { conJson, pedir, type Resultado } from "@/lib/peticiones"
import type { EvolucionRespuesta, EvolucionesRespuesta, FichaClinicaRespuesta, OdontogramaRespuesta } from "@/lib/ficha-clinica"
import type { AccionDeEtapa, OrigenDeVersion, PlanRespuesta } from "@/lib/edicion-del-plan"
import type { EstadoDePrestacion } from "@/lib/plan-de-tratamiento"
import type { MarcaDelOdontograma } from "@/lib/odontograma"
import type {
  AlPlanRespuesta,
  OpcionesDeProtesisRespuesta,
  ProtesisDelPacienteRespuesta,
  ProtesisRespuesta,
} from "@/lib/edicion-de-protesis"
import type { EstadoDeProtesis, TonoVita } from "@/lib/protesis"

const deLaFicha = (id: string) => `/api/clientes/${encodeURIComponent(id)}`

/** PATCH con JSON: `conJson` sólo arma POST y PUT. */
function conJsonPatch(cuerpo: unknown): RequestInit {
  return { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }
}

// ─── Antecedentes ────────────────────────────────────────────────────────────

/** Lo que manda el formulario: todo como texto, vacío es "sin anotar" (el servidor lo guarda como null). */
export interface AntecedentesEscritos {
  fechaNacimiento: string
  prevision: string
  alergias: string
  antecedentes: string
}

export async function guardarAntecedentes(id: string, datos: AntecedentesEscritos): Promise<Resultado<FichaClinicaRespuesta>> {
  return pedir<FichaClinicaRespuesta>(`${deLaFicha(id)}/ficha`, "No se pudieron guardar los antecedentes", conJson("PUT", datos))
}

// ─── Odontograma ─────────────────────────────────────────────────────────────

/** Manda el odontograma entero: reemplaza al guardado. */
export async function guardarOdontograma(id: string, marcas: readonly MarcaDelOdontograma[]): Promise<Resultado<OdontogramaRespuesta>> {
  return pedir<OdontogramaRespuesta>(
    `${deLaFicha(id)}/odontograma`,
    "No se pudo guardar el odontograma",
    conJson("PUT", { marcas: marcas.map(({ pieza, cara, tipo }) => ({ pieza, cara, tipo })) })
  )
}

// ─── Evoluciones ─────────────────────────────────────────────────────────────

/** Una página, de la más nueva a la más vieja. `antes`: el `siguiente` de la página anterior. */
export async function leerEvoluciones(id: string, antes: string | null): Promise<Resultado<EvolucionesRespuesta>> {
  const parametros = antes ? `?${new URLSearchParams({ antes })}` : ""
  return pedir<EvolucionesRespuesta>(`${deLaFicha(id)}/evoluciones${parametros}`, "No se pudieron cargar las evoluciones")
}

export async function anotarEvolucion(
  id: string,
  datos: { texto: string; appointmentId: string | null }
): Promise<Resultado<EvolucionRespuesta>> {
  return pedir<EvolucionRespuesta>(`${deLaFicha(id)}/evoluciones`, "No se pudo anotar la evolución", conJson("POST", datos))
}

// ─── Plan de tratamiento ─────────────────────────────────────────────────────

export async function crearVersionDelPlan(id: string, desde: OrigenDeVersion): Promise<Resultado<PlanRespuesta>> {
  return pedir<PlanRespuesta>(`${deLaFicha(id)}/plan`, "No se pudo armar el plan", conJson("POST", { desde }))
}

export async function agregarEtapa(id: string, nombre: string): Promise<Resultado<PlanRespuesta>> {
  return pedir<PlanRespuesta>(`${deLaFicha(id)}/plan/etapas`, "No se pudo agregar la etapa", conJson("POST", { nombre }))
}

const MENSAJE_DE_ACCION: Record<AccionDeEtapa, string> = {
  presentar: "No se pudo registrar que se presentó",
  aprobar: "No se pudo aprobar la etapa",
  "volver-a-por-aprobar": "No se pudo volver la etapa a por aprobar",
}

export async function accionDeEtapa(id: string, etapaId: string, accion: AccionDeEtapa): Promise<Resultado<PlanRespuesta>> {
  return pedir<PlanRespuesta>(
    `${deLaFicha(id)}/plan/etapas/${encodeURIComponent(etapaId)}`,
    MENSAJE_DE_ACCION[accion],
    conJsonPatch({ accion })
  )
}

export async function borrarEtapa(id: string, etapaId: string): Promise<Resultado<PlanRespuesta>> {
  return pedir<PlanRespuesta>(`${deLaFicha(id)}/plan/etapas/${encodeURIComponent(etapaId)}`, "No se pudo borrar la etapa", {
    method: "DELETE",
  })
}

/** Una prestación nueva: `serviceId` o `nombre` (o los dos), y quién la hace. */
export interface PrestacionNueva {
  pieza: number | null
  caras: string[]
  serviceId?: string
  nombre?: string
  valorCents?: number
  memberId?: string
  delDueño?: boolean
}

export async function agregarPrestacion(id: string, etapaId: string, datos: PrestacionNueva): Promise<Resultado<PlanRespuesta>> {
  return pedir<PlanRespuesta>(
    `${deLaFicha(id)}/plan/etapas/${encodeURIComponent(etapaId)}/prestaciones`,
    "No se pudo agregar la prestación",
    conJson("POST", datos)
  )
}

/** El estado de una prestación; "agendada" lleva la cita. */
export async function cambiarEstadoDePrestacion(
  id: string,
  prestacionId: string,
  estado: EstadoDePrestacion,
  appointmentId?: string
): Promise<Resultado<PlanRespuesta>> {
  return pedir<PlanRespuesta>(
    `${deLaFicha(id)}/plan/prestaciones/${encodeURIComponent(prestacionId)}`,
    "No se pudo cambiar el estado de la prestación",
    conJsonPatch(estado === "agendada" ? { estado, appointmentId } : { estado })
  )
}

/** El valor de una prestación, en centavos. Sólo en una etapa por aprobar: en una aprobada, el servidor responde 409. */
export async function cambiarValorDePrestacion(id: string, prestacionId: string, valorCents: number): Promise<Resultado<PlanRespuesta>> {
  return pedir<PlanRespuesta>(
    `${deLaFicha(id)}/plan/prestaciones/${encodeURIComponent(prestacionId)}`,
    "No se pudo guardar el valor de la prestación",
    conJsonPatch({ valorCents })
  )
}

/** Lo que se cambia de una prestación desde la tabla: quién la hace o, en una etapa por aprobar, la pieza, las caras y el nombre. */
export interface CambiosDePrestacion {
  pieza?: number | null
  caras?: string[]
  nombre?: string
  /** Un odontólogo del equipo, o `null` para dejarla sin asignar. */
  memberId?: string | null
  /** El dueño, que no es miembro del equipo. */
  delDueño?: true
}

/**
 * Cambia quién hace la prestación (en cualquier etapa) o su pieza, caras y
 * nombre (sólo en una por aprobar: en una aprobada el servidor responde 409).
 */
export async function cambiarPrestacion(id: string, prestacionId: string, cambios: CambiosDePrestacion): Promise<Resultado<PlanRespuesta>> {
  const esDelProfesional = cambios.memberId !== undefined || cambios.delDueño !== undefined
  return pedir<PlanRespuesta>(
    `${deLaFicha(id)}/plan/prestaciones/${encodeURIComponent(prestacionId)}`,
    esDelProfesional ? "No se pudo cambiar quién hace la prestación" : "No se pudo guardar la prestación",
    conJsonPatch(cambios)
  )
}

export async function borrarPrestacion(id: string, prestacionId: string): Promise<Resultado<PlanRespuesta>> {
  return pedir<PlanRespuesta>(
    `${deLaFicha(id)}/plan/prestaciones/${encodeURIComponent(prestacionId)}`,
    "No se pudo borrar la prestación",
    { method: "DELETE" }
  )
}

/** El plan como está guardado: después de agregarle una prótesis, para mostrarlo al día. */
export async function leerPlanDelPaciente(id: string): Promise<Resultado<PlanRespuesta>> {
  return pedir<PlanRespuesta>(`${deLaFicha(id)}/plan`, "No se pudo cargar el plan")
}

// ─── Prótesis ────────────────────────────────────────────────────────────────

export async function leerProtesis(id: string): Promise<Resultado<ProtesisDelPacienteRespuesta>> {
  return pedir<ProtesisDelPacienteRespuesta>(`${deLaFicha(id)}/protesis`, "No se pudieron cargar las prótesis")
}

export async function leerOpcionesDeProtesis(id: string): Promise<Resultado<OpcionesDeProtesisRespuesta>> {
  return pedir<OpcionesDeProtesisRespuesta>(`${deLaFicha(id)}/protesis/opciones`, "No se pudieron cargar los materiales")
}

/** Una prótesis nueva: el diseño, el material, el laboratorio, la entrega, el tono y (sólo la dueña) la tratante. Sin precios: los pone el servidor. */
export interface ProtesisPedida {
  tipo: string
  arcada: string
  piezas: number[]
  pilares: number[]
  zonas: string[]
  materialId: string
  laboratorioId: string | null
  entregaEstimada: string | null
  tono: TonoVita | null
  tratante?: string
}

export async function crearProtesis(id: string, datos: ProtesisPedida): Promise<Resultado<ProtesisRespuesta>> {
  return pedir<ProtesisRespuesta>(`${deLaFicha(id)}/protesis`, "No se pudo crear la prótesis", conJson("POST", datos))
}

/** Avanzar el seguimiento, anularla, o cambiar el laboratorio, la entrega estimada o el tono (hasta entregarla). */
export async function cambiarProtesis(
  id: string,
  protesisId: string,
  datos: { estado?: EstadoDeProtesis; laboratorioId?: string | null; entregaEstimada?: string | null; tono?: TonoVita | null }
): Promise<Resultado<ProtesisRespuesta>> {
  return pedir<ProtesisRespuesta>(
    `${deLaFicha(id)}/protesis/${encodeURIComponent(protesisId)}`,
    datos.estado === "anulada"
      ? "No se pudo anular la prótesis"
      : datos.estado
        ? "No se pudo avanzar el seguimiento"
        : "No se pudieron guardar los cambios",
    conJsonPatch(datos)
  )
}

export async function agregarProtesisAlPlan(id: string, protesisId: string): Promise<Resultado<AlPlanRespuesta>> {
  return pedir<AlPlanRespuesta>(
    `${deLaFicha(id)}/protesis/${encodeURIComponent(protesisId)}/al-plan`,
    "No se pudo agregar al plan",
    conJson("POST", {})
  )
}

// ─── De otras partes del panel ───────────────────────────────────────────────

/** Una cita del paciente, como la trae la agenda (`GET /api/citas`): las que quien mira ve. */
export interface CitaDelPaciente {
  id: string
  title: string
  startTime: string
  status: string
}

/** "AAAA-MM-DD" corrido `dias` días (negativo, hacia atrás). Sin zona: es una fecha calendario. */
export function correrDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

/**
 * Las citas del paciente entre dos días del negocio (incluidos), de la agenda
 * (`GET /api/citas?customerId=…&desde=…&hasta=…`). Antes salían del detalle
 * del cliente, que trae sólo las 20 más nuevas: con varias citas por delante,
 * las ya pasadas (las de una evolución) no llegaban. El servidor filtra por
 * el negocio de la sesión y, al odontólogo, por las suyas, como en la agenda.
 */
export async function leerCitasDelPaciente(id: string, desde: string, hasta: string): Promise<Resultado<CitaDelPaciente[]>> {
  const parametros = new URLSearchParams({ customerId: id, desde, hasta })
  return pedir<CitaDelPaciente[]>(`/api/citas?${parametros}`, "No se pudieron cargar las citas del paciente")
}

/** Un servicio activo del negocio, del catálogo de la agenda. */
export interface ServicioDeLaClinica {
  id: string
  name: string
  /** En pesos. */
  price: number | null
}

export async function leerServicios(): Promise<Resultado<ServicioDeLaClinica[]>> {
  const resultado = await pedir<{ servicios: ServicioDeLaClinica[] }>("/api/citas/servicios", "No se pudieron cargar los servicios")
  return resultado.ok ? { ok: true, datos: resultado.datos.servicios } : resultado
}

/** Quienes atienden. El servidor se los da a quien gestiona el equipo (la dueña); a los demás, 401. */
export async function leerOdontologos(): Promise<Resultado<{ id: string; nombre: string }[]>> {
  return pedir<{ miembros: { id: string; nombre: string }[] }>("/api/equipo/miembros", "No se pudo cargar el equipo").then(
    (resultado) => (resultado.ok ? { ok: true, datos: resultado.datos.miembros } : resultado)
  )
}
