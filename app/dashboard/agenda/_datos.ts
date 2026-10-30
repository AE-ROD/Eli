/**
 * Todo lo que la agenda le pide al servidor, en un solo lugar. La pantalla
 * llama a estas funciones y no conoce ninguna URL: si mañana cambia un
 * endpoint, se cambia acá y la vista no se entera.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * que el error sea parte del valor de retorno obliga a la pantalla a decidir
 * qué mostrar cuando algo falla.
 */

import { comoTexto, diasDeLaSemanaDe, limitesDelMesDe, type UnidadDeTiempo } from "@/lib/fechas"
import { leerMonto } from "@/lib/dinero"
import { pedir, pedirConCuerpo, conJson, type Resultado } from "@/lib/peticiones"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import { sePuedeMover, type Advertencia } from "@/lib/mover-cita"
import { estaPorConfirmar } from "@/lib/por-confirmar"
import { isoEn } from "./_hora-del-negocio"

export interface Cita {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string
  notes: string | null
  price: number | null
  customerId: string | null
  /**
   * Nulo de verdad: `customerId` es opcional en el esquema, así que una cita
   * puede no tener cliente (una reserva bloqueada, por ejemplo). Tipearlo como
   * obligatorio es lo que hace que la pantalla explote la primera vez que
   * aparece una.
   */
  customer: { id: string; name: string; email: string | null; phone: string | null } | null
  /** A qué profesional está asignada. Nulo: sin asignar (o el dueño, que no es miembro). */
  memberId?: string | null
  /** El profesional asignado, con su nombre para el detalle. */
  member?: { id: string; user: { name: string | null } | null } | null
  /** Entró por confirmar tras faltas (#84). Con status "pendiente", está por confirmar (`estaPorConfirmar`). */
  confirmacionPorFaltas?: boolean
  /** El cliente ya llegó: tiene una atención no anulada en el Tablero. */
  conAtencion?: boolean
}

/**
 * Si la cita espera que el local la confirme o la cancele (#84). Si el cliente
 * ya llegó al Tablero, ya no: está resuelta, y confirmarla no le manda correo.
 */
export function citaPorConfirmar(cita: Pick<Cita, "status" | "confirmacionPorFaltas" | "conAtencion">): boolean {
  return (
    cita.conAtencion !== true &&
    estaPorConfirmar({ status: cita.status, confirmacionPorFaltas: cita.confirmacionPorFaltas === true })
  )
}

/**
 * Cómo se llama la cita en pantalla cuando no tiene cliente. Está acá, en un
 * solo lugar, para que las tres vistas no inventen cada una su propia palabra
 * — y para que ninguna vuelva a asumir que `customer` siempre viene.
 */
export function nombreDeCliente(cita: Cita): string {
  return cita.customer?.name ?? "Sin cliente"
}

/**
 * El borrador de la cita nueva. El cliente elegido viaja con su nombre: lo que
 * dice el buscador y lo que se guarda salen del mismo lugar, así que no pueden
 * dejar de coincidir (A1).
 */
export interface DatosDeNuevaCita {
  clienteId: string
  /** El nombre del cliente elegido de la lista; vacío si no hay ninguno elegido. */
  clienteNombre: string
  servicio: string
  fecha: string
  horaInicio: string
  horaFin: string
  precio: string
  notas: string
  memberId: string
}

/**
 * Un borrador vacío para el día `dia`. Se arma al abrir el modal, no al cargar
 * la página: si no, la fecha por defecto era la del momento en que se abrió la
 * agenda, y no la del día que se está mirando.
 */
export function citaEnBlanco(dia: Date): DatosDeNuevaCita {
  return {
    clienteId: "",
    clienteNombre: "",
    servicio: "",
    fecha: comoTexto(dia),
    horaInicio: "09:00",
    horaFin: "10:00",
    precio: "",
    notas: "",
    memberId: "",
  }
}

/** Un miembro del equipo al que se le puede asignar una cita nueva. */
export interface Profesional {
  id: string
  nombre: string
  rol: string
}

/**
 * Las opciones del selector de profesional al mover o asignar una cita: el
 * equipo que atiende (`leerProfesionales`, #140) y, si la cita ya está con
 * alguien que no está en esa lista (un encargado, de antes), también él, para
 * que el selector diga con quién está y no "Sin asignar".
 */
export function opcionesDeProfesional(
  equipo: Profesional[],
  cita: Pick<Cita, "memberId" | "member">
): { valor: string; texto: string }[] {
  const opciones = equipo.map((miembro) => ({ valor: miembro.id, texto: miembro.nombre }))
  if (cita.memberId && !equipo.some((miembro) => miembro.id === cita.memberId)) {
    opciones.push({ valor: cita.memberId, texto: nombreDelProfesional(cita) ?? "Profesional" })
  }
  return opciones
}

/** Si en el equipo hay alguien que atiende (rol profesional): sólo entonces una cita sin asignar es un pendiente. */
export function hayProfesionales(equipo: Profesional[]): boolean {
  return equipo.some((miembro) => miembro.rol === "worker")
}

/**
 * Si la agenda destaca la cita por no tener profesional (#103). Una sin
 * asignar ocupa la hora de todos en la reserva pública, así que vale la pena
 * asignarla; pero sólo si hay profesionales a quien (en un negocio sin
 * equipo toda cita va sin asignar y no es un problema) y si todavía se puede
 * cambiar: una cancelada, completada o de "No vino" ya no ocupa ni se mueve.
 */
export function destacaSinProfesional(cita: Pick<Cita, "memberId" | "status">, conProfesionales: boolean): boolean {
  return conProfesionales && !cita.memberId && sePuedeMover(cita.status)
}

/** El nombre del profesional de la cita, o `null` si no tiene. */
export function nombreDelProfesional(cita: Pick<Cita, "memberId" | "member">): string | null {
  if (!cita.memberId) return null
  return cita.member?.user?.name?.trim() || "Profesional"
}

/** Un cliente que coincide con lo que se escribe en el buscador de la cita nueva. */
export interface ClienteSugerido {
  id: string
  nombre: string
  email: string
}

/** El rango de fechas que se está mirando, según el modo de la vista. */
function rangoVisible(fecha: Date, modo: UnidadDeTiempo): string {
  if (modo === "dia") return `fecha=${comoTexto(fecha)}`

  const [desde, hasta] =
    modo === "semana"
      ? [diasDeLaSemanaDe(fecha)[0], diasDeLaSemanaDe(fecha)[6]]
      : Object.values(limitesDelMesDe(fecha))

  return `desde=${comoTexto(desde)}&hasta=${comoTexto(hasta)}`
}

export async function leerCitas(fecha: Date, modo: UnidadDeTiempo): Promise<Resultado<Cita[]>> {
  return pedir<Cita[]>(`/api/citas?${rangoVisible(fecha, modo)}`, "No se pudieron cargar las citas")
}

export async function cambiarEstadoDeCita(id: string, estado: string): Promise<Resultado> {
  return pedir(`/api/citas/${id}`, "No se pudo cambiar el estado", conJson("PUT", { status: estado }))
}

/**
 * El precio opcional de la cita, como lo escribieron: vacío es sin precio.
 * Lo lee `leerMonto`, así "8.000", "8000" y "8.000,50" son el monto que se
 * quiso escribir (con `parseFloat`, "8.000" era 8). Lo que no se puede leer
 * sin adivinar es un error, nunca una cita guardada sin precio o con otro.
 */
export function precioDeLaCita(texto: string): Resultado<number | undefined> {
  if (!texto.trim()) return { ok: true, datos: undefined }
  const precio = leerMonto(texto)
  return precio === null
    ? { ok: false, error: "No se entiende el precio. Escríbelo así: 8000 o 8000,50." }
    : { ok: true, datos: precio }
}

/** A dónde se mueve una cita: fecha y horas del negocio, y el profesional (vacío: sin asignar). */
export interface DatosDeMoverCita {
  fecha: string
  horaInicio: string
  horaFin: string
  memberId: string
}

/**
 * Crear o mover una cita: guardada, o las advertencias del servidor (choque
 * con otra cita del profesional, un bloqueo, fuera de su horario) para que
 * quien agenda decida. `confirmar` es el segundo envío, después de verlas:
 * guarda igual.
 */
export type ResultadoConAdvertencias =
  | { tipo: "guardada" }
  | { tipo: "advertencias"; advertencias: Advertencia[] }
  | { tipo: "error"; error: string }

export type ResultadoDeMover = ResultadoConAdvertencias

function sonAdvertencias(valor: unknown): valor is Advertencia[] {
  return (
    Array.isArray(valor) &&
    valor.length > 0 &&
    valor.every((item) => typeof item === "object" && item !== null && typeof item.mensaje === "string")
  )
}

/**
 * `zona`: la del negocio (#99). Las horas que se escriben son las del
 * negocio, no las del navegador de quien agenda.
 */
export async function moverCita(
  id: string,
  datos: DatosDeMoverCita,
  zona: string,
  opciones: { confirmar: boolean; asignaProfesional: boolean }
): Promise<ResultadoDeMover> {
  const inicio = isoEn(datos.fecha, datos.horaInicio, zona)
  const fin = isoEn(datos.fecha, datos.horaFin, zona)
  if (!inicio || !fin) return { tipo: "error", error: "La fecha o la hora no son válidas" }

  const resultado = await pedirConCuerpo(
    `/api/citas/${id}`,
    "No se pudo mover la cita",
    conJson("PUT", {
      startTime: inicio,
      endTime: fin,
      // Sólo quien puede asignar manda el profesional; al otro el servidor lo
      // dejaría igual en sí mismo.
      ...(opciones.asignaProfesional && { memberId: datos.memberId || null }),
      ...(opciones.confirmar && { confirmarAdvertencias: true }),
    })
  )
  return conAdvertencias(resultado)
}

/**
 * Asignarle profesional a una cita sin asignar (#103), sin tocar su horario:
 * se manda sólo `memberId`, así el horario guardado queda exacto (no pasa
 * por la fecha y la hora escritas). El servidor lo trata como mover: si el
 * profesional ya tiene algo a esa hora, devuelve las advertencias, y
 * `confirmar` es el segundo envío. Sólo lo ofrece la pantalla a quien puede
 * asignar; al resto el servidor lo dejaría en sí mismo.
 */
export async function asignarProfesional(
  id: string,
  memberId: string,
  opciones: { confirmar: boolean }
): Promise<ResultadoDeMover> {
  const resultado = await pedirConCuerpo(
    `/api/citas/${encodeURIComponent(id)}`,
    "No se pudo asignar el profesional",
    conJson("PUT", { memberId, ...(opciones.confirmar && { confirmarAdvertencias: true }) })
  )
  return conAdvertencias(resultado)
}

/** Lee la respuesta de crear o mover: guardada, advertencias (409 con su lista) o error. */
function conAdvertencias(resultado: Awaited<ReturnType<typeof pedirConCuerpo>>): ResultadoConAdvertencias {
  if (resultado.ok) return { tipo: "guardada" }

  const advertencias = (resultado.cuerpo as { advertencias?: unknown } | null)?.advertencias
  if (resultado.codigo === 409 && sonAdvertencias(advertencias)) {
    return { tipo: "advertencias", advertencias }
  }
  return { tipo: "error", error: resultado.error }
}

/** El horario de atención del negocio, para que la agenda dibuje esas horas. */
export async function leerHorarioDeAtencion(): Promise<Resultado<FranjaDelDia[]>> {
  return pedir<FranjaDelDia[]>("/api/citas/horario-de-atencion", "No se pudo cargar el horario de atención")
}

/**
 * Crear una cita. Si choca con otra del profesional, cae en un bloqueo o
 * queda fuera del horario, el servidor no la guarda y devuelve las
 * advertencias; `confirmar` es el segundo envío, que guarda igual (como al
 * mover).
 */
export async function crearCita(
  datos: DatosDeNuevaCita,
  zona: string,
  opciones: { confirmar: boolean } = { confirmar: false }
): Promise<ResultadoConAdvertencias> {
  const precio = precioDeLaCita(datos.precio)
  if (!precio.ok) return { tipo: "error", error: precio.error }

  // En la hora del negocio, no en la del navegador (#99).
  const inicio = isoEn(datos.fecha, datos.horaInicio, zona)
  const fin = isoEn(datos.fecha, datos.horaFin, zona)
  if (!inicio || !fin) return { tipo: "error", error: "La fecha o la hora no son válidas" }

  const resultado = await pedirConCuerpo(
    "/api/citas",
    "No se pudo crear la cita",
    conJson("POST", {
      title: datos.servicio,
      startTime: inicio,
      endTime: fin,
      customerId: datos.clienteId,
      price: precio.datos,
      notes: datos.notas || undefined,
      memberId: datos.memberId || null,
      ...(opciones.confirmar && { confirmarAdvertencias: true }),
    })
  )
  return conAdvertencias(resultado)
}

// ─── Bloqueos de horario ─────────────────────────────────────────────────────

/** Un bloqueo de horario como lo devuelve el servidor. `memberId` null: todo el negocio. */
export interface Bloqueo {
  id: string
  memberId: string | null
  startTime: string
  endTime: string
  motivo: string | null
  member: { user: { name: string | null } | null } | null
}

/** De quién es el bloqueo, para leerlo: el profesional o "Todo el negocio". */
export function aQuienBloquea(bloqueo: Bloqueo): string {
  if (!bloqueo.memberId) return "Todo el negocio"
  return bloqueo.member?.user?.name?.trim() || "Profesional"
}

/** Los días que se están mirando, para pedir los bloqueos que los tocan. */
function diasVisibles(fecha: Date, modo: UnidadDeTiempo): string {
  if (modo === "dia") return `desde=${comoTexto(fecha)}&hasta=${comoTexto(fecha)}`
  return rangoVisible(fecha, modo)
}

export async function leerBloqueos(fecha: Date, modo: UnidadDeTiempo): Promise<Resultado<Bloqueo[]>> {
  return pedir<Bloqueo[]>(`/api/bloqueos?${diasVisibles(fecha, modo)}`, "No se pudieron cargar los bloqueos")
}

/** El borrador de un bloqueo: de quién (vacío: todo el negocio), desde y hasta en hora del negocio, y el motivo. */
export interface DatosDeNuevoBloqueo {
  memberId: string
  fechaDesde: string
  horaDesde: string
  fechaHasta: string
  horaHasta: string
  motivo: string
}

/** Un bloqueo vacío para el día `dia`, de 13:00 a 14:00, a nombre de `memberId` ("" es todo el negocio). */
export function bloqueoEnBlanco(dia: Date, memberId: string): DatosDeNuevoBloqueo {
  const fecha = comoTexto(dia)
  return { memberId, fechaDesde: fecha, horaDesde: "13:00", fechaHasta: fecha, horaHasta: "14:00", motivo: "" }
}

/** `zona`: la del negocio (#99); el bloqueo se escribe en su hora, como las citas. */
export async function crearBloqueo(datos: DatosDeNuevoBloqueo, zona: string): Promise<Resultado> {
  const inicio = isoEn(datos.fechaDesde, datos.horaDesde, zona)
  const fin = isoEn(datos.fechaHasta, datos.horaHasta, zona)
  if (!inicio || !fin) return { ok: false, error: "La fecha o la hora no son válidas" }
  if (new Date(fin) <= new Date(inicio)) return { ok: false, error: "El bloqueo tiene que terminar después de empezar" }

  return pedir(
    "/api/bloqueos",
    "No se pudo bloquear el horario",
    conJson("POST", {
      memberId: datos.memberId || null,
      startTime: inicio,
      endTime: fin,
      ...(datos.motivo.trim() && { motivo: datos.motivo.trim() }),
    })
  )
}

export async function quitarBloqueo(id: string): Promise<Resultado> {
  return pedir(`/api/bloqueos/${encodeURIComponent(id)}`, "No se pudo quitar el bloqueo", { method: "DELETE" })
}

/** Quienes atienden (no el encargado), para el selector de profesional. Sólo lo pide quien puede asignar. */
export async function leerProfesionales(): Promise<Resultado<Profesional[]>> {
  const resultado = await pedir<{ miembros: Profesional[] }>(
    "/api/equipo/miembros",
    "No se pudo cargar el equipo"
  )
  return resultado.ok ? { ok: true, datos: resultado.datos.miembros } : resultado
}

/** Hasta ocho clientes cuyo nombre, correo o teléfono contiene `texto`. */
export async function buscarClientes(texto: string): Promise<Resultado<ClienteSugerido[]>> {
  const resultado = await pedir<{ clientes: { id: string; name: string; email: string | null }[] }>(
    `/api/clientes?q=${encodeURIComponent(texto)}&limite=8`,
    "No se pudieron buscar los clientes"
  )
  if (!resultado.ok) return resultado

  return {
    ok: true,
    datos: resultado.datos.clientes.map((cliente) => ({
      id: cliente.id,
      nombre: cliente.name,
      email: cliente.email ?? "",
    })),
  }
}
