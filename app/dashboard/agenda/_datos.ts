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
import { leerMonto, montoParaEscribir } from "@/lib/dinero"
import { codigoDelServidor, pedir, pedirConCuerpo, conJson, type Resultado } from "@/lib/peticiones"
import { CODIGO_CORREGIR_CON_AJUSTE } from "@/lib/bloqueos-de-dinero"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import { sePuedeMover, type Advertencia } from "@/lib/mover-cita"
import { sigueSinConfirmar } from "@/lib/por-confirmar"
import { nombreCompletoDeCliente } from "@/lib/nombre-de-cliente"
import { CODIGO_SILLON_OCUPADO } from "@/lib/sillones"
import { isoEn } from "./_hora-del-negocio"

export interface Cita {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string
  notes: string | null
  /** Lo que el cliente escribió al reservar por la página pública (#122). Sólo se lee. */
  clientComments?: string | null
  price: number | null
  customerId: string | null
  /**
   * Nulo de verdad: `customerId` es opcional en el esquema, así que una cita
   * puede no tener cliente (una reserva bloqueada, por ejemplo). Tipearlo como
   * obligatorio es lo que hace que la pantalla explote la primera vez que
   * aparece una.
   */
  customer: { id: string; name: string; lastName?: string | null; email: string | null; phone: string | null } | null
  /** A qué profesional está asignada. Nulo: sin asignar (o el dueño, que no es miembro). */
  memberId?: string | null
  /** El profesional asignado, con su nombre para el detalle. */
  member?: { id: string; user: { name: string | null } | null } | null
  /** Entró por confirmar tras faltas (#84). Con status "pendiente", está por confirmar (`estaPorConfirmar`). */
  confirmacionPorFaltas?: boolean
  /** El cliente ya llegó: tiene una atención no anulada en el Tablero. */
  conAtencion?: boolean
  /** Quién la canceló: "cliente" (su enlace) o "negocio" (el panel). Null si no está cancelada o es de antes de guardarlo. */
  canceladaPor?: string | null
  /** Cuándo se canceló, ISO. */
  canceladaEn?: string | null
  /** Clínica dental: el sillón de la cita (`null`, sin sillón). En otro rubro la clave no viene. */
  sillonId?: string | null
  /** Clínica dental: el sillón, con su nombre. */
  sillon?: SillonDeLaCita | null
  /** Clínica dental: el paciente viene por primera vez. */
  primeraVez?: boolean
}

/** El sillón de una cita, como viene en la lista y en el detalle. */
export interface SillonDeLaCita {
  id: string
  nombre: string
}

/**
 * Quién canceló la cita, para el detalle (#134), o `null` si no está
 * cancelada o no se sabe (las canceladas antes de guardarse el dato).
 */
export function quienCancelo(cita: Pick<Cita, "status" | "canceladaPor">): string | null {
  if (cita.status !== "cancelada") return null
  if (cita.canceladaPor === "cliente") return "El cliente"
  if (cita.canceladaPor === "negocio") return "El negocio"
  return null
}

/**
 * Si la cita espera que el local la confirme o la cancele (#84). Si el cliente
 * ya llegó al Tablero, ya no: está resuelta, y confirmarla no le manda correo.
 */
export function citaPorConfirmar(cita: Pick<Cita, "status" | "confirmacionPorFaltas" | "conAtencion">): boolean {
  return sigueSinConfirmar(cita)
}

/**
 * Cómo se llama la cita en pantalla cuando no tiene cliente. Está acá, en un
 * solo lugar, para que las tres vistas no inventen cada una su propia palabra
 * — y para que ninguna vuelva a asumir que `customer` siempre viene.
 * `palabraCliente` es la del rubro (`lib/vocabulario.ts`): "Sin paciente" en
 * una clínica dental.
 */
export function nombreDeCliente(cita: Cita, palabraCliente = "cliente"): string {
  return cita.customer ? nombreCompletoDeCliente(cita.customer) : `Sin ${palabraCliente}`
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
  /** El servicio escrito a mano, para una cita sin servicio del catálogo. */
  servicio: string
  /**
   * Los servicios del catálogo elegidos (#159), en el orden en que se hacen,
   * separados por coma (los ids no llevan comas): el borrador es de textos,
   * como lo cambia la página. Vacío: texto libre (`servicio`).
   */
  servicioIds: string
  fecha: string
  horaInicio: string
  horaFin: string
  precio: string
  notas: string
  memberId: string
  /**
   * Clínica dental: el sillón elegido ("" es sin sillón). Fuera de una
   * clínica no está, y la cita se crea como siempre, sin la clave.
   */
  sillonId?: string
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
    servicioIds: "",
    fecha: comoTexto(dia),
    horaInicio: "09:00",
    horaFin: "10:00",
    precio: "",
    notas: "",
    memberId: "",
  }
}

/** Los ids de `DatosDeNuevaCita.servicioIds`, en orden. */
export function idsDeServiciosElegidos(texto: string): string[] {
  return texto ? texto.split(",") : []
}

/** Un servicio del catálogo, como lo ofrece la reserva pública. */
export interface ServicioDelCatalogo {
  id: string
  name: string
  description: string | null
  duration: number
  price: number | null
}

/**
 * El catálogo para la cita nueva (#159): los servicios activos y, de quien
 * tiene acotado lo que hace, qué hace (memberId → ids). Quien no aparece hace
 * todos.
 */
export interface CatalogoDeLaCita {
  servicios: ServicioDelCatalogo[]
  serviciosPorProfesional: Record<string, string[]>
}

export async function leerCatalogoDeLaCita(): Promise<Resultado<CatalogoDeLaCita>> {
  return pedir<CatalogoDeLaCita>("/api/citas/servicios", "No se pudo cargar el catálogo de servicios")
}

/**
 * Los servicios que se le ofrecen a la cita nueva: los que hace el
 * profesional, si los tiene acotados. `memberId` vacío (sin asignar): todos.
 */
export function serviciosParaElProfesional(catalogo: CatalogoDeLaCita, memberId: string): ServicioDelCatalogo[] {
  const queHace = memberId ? catalogo.serviciosPorProfesional[memberId] : undefined
  return queHace ? catalogo.servicios.filter((servicio) => queHace.includes(servicio.id)) : catalogo.servicios
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

/**
 * Cambia el estado y devuelve la cita como quedó en el servidor: al
 * cancelarla trae quién y cuándo (`canceladaPor`, `canceladaEn`), y el
 * detalle lo muestra sin recargar la agenda.
 */
export async function cambiarEstadoDeCita(id: string, estado: string): Promise<Resultado<Cita>> {
  return pedir<Cita>(`/api/citas/${id}`, "No se pudo cambiar el estado", conJson("PUT", { status: estado }))
}

/**
 * La cita de la agenda con lo que cambió al cambiarle el estado: el estado y
 * quién y cuándo la canceló. Lo demás (el cliente, si ya llegó, el sillón) se
 * queda como estaba: la respuesta del servidor no trae todo lo de la lista.
 */
export function conEstadoNuevo(cita: Cita, guardada: Pick<Cita, "status" | "canceladaPor" | "canceladaEn">): Cita {
  return {
    ...cita,
    status: guardada.status,
    canceladaPor: guardada.canceladaPor ?? null,
    canceladaEn: guardada.canceladaEn ?? null,
  }
}

/**
 * El precio que se precarga al elegir servicios del catálogo: la suma de los
 * que tienen precio, hecha en centavos (con `+`, 0,1 + 0,2 daba
 * 0,30000000000000004 y el campo mostraba eso), y escrita como la lee
 * `leerMonto` (`montoParaEscribir`): "8000", "8000,5". Vacío si ninguno tiene.
 */
export function precioDeLosServicios(servicios: Pick<ServicioDelCatalogo, "price">[]): string {
  const conPrecio = servicios.filter((servicio): servicio is { price: number } => servicio.price !== null)
  if (conPrecio.length === 0) return ""
  const centavos = conPrecio.reduce((total, servicio) => total + Math.round(servicio.price * 100), 0)
  return montoParaEscribir(centavos / 100)
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
  /**
   * Clínica dental: el sillón nuevo ("" es sin sillón). Sin la clave la cita
   * conserva el que tiene, también al moverla: se manda sólo si cambió.
   */
  sillonId?: string
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
  /**
   * `sillonOcupado`: el 409 de la clínica dental cuando el sillón ya tiene
   * otra cita a esa hora (`codigo: "sillon-ocupado"`). No es una advertencia:
   * no se ofrece "guardar igual", se elige otro sillón u otra hora.
   */
  | { tipo: "error"; error: string; sillonOcupado?: boolean }

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
      // Clínica dental: sólo si cambió de sillón (sin la clave, conserva el suyo).
      ...(datos.sillonId !== undefined && { sillonId: datos.sillonId || null }),
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
  if (codigoDelServidor(resultado.cuerpo) === CODIGO_SILLON_OCUPADO) {
    return { tipo: "error", error: resultado.error, sillonOcupado: true }
  }
  return { tipo: "error", error: resultado.error }
}

/** A qué estado vuelve una cita al reactivarla: una cancelada, o una completada o de alguien que no vino. */
export const ESTADO_AL_REACTIVAR = "confirmada"

/**
 * Reactivar una cita: lista, las advertencias si al volver choca (como al
 * mover; `confirmar` es el segundo envío, que guarda igual), o error. Si su
 * atención ya entró en un cierre de caja o en una liquidación, el 409 trae el
 * código "corregir-con-ajuste" (#134): no hay nada que reintentar, se corrige
 * con un ajuste. Se decide con el código, no con el texto.
 */
export type ResultadoDeReactivar =
  | { tipo: "lista" }
  | { tipo: "advertencias"; advertencias: Advertencia[] }
  | { tipo: "corregir-con-ajuste"; error: string }
  | { tipo: "error"; error: string }

export async function reactivarCita(id: string, opciones: { confirmar: boolean }): Promise<ResultadoDeReactivar> {
  const resultado = await pedirConCuerpo(
    `/api/citas/${encodeURIComponent(id)}`,
    "No se pudo reactivar la cita",
    conJson("PUT", { status: ESTADO_AL_REACTIVAR, ...(opciones.confirmar && { confirmarAdvertencias: true }) })
  )
  if (resultado.ok) return { tipo: "lista" }
  if (codigoDelServidor(resultado.cuerpo) === CODIGO_CORREGIR_CON_AJUSTE) {
    return { tipo: "corregir-con-ajuste", error: resultado.error }
  }
  const leido = conAdvertencias(resultado)
  return leido.tipo === "guardada" ? { tipo: "lista" } : leido
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

  // Con servicios del catálogo el servidor arma el título con sus nombres
  // (#159); sin ellos, el texto escrito.
  const servicioIds = idsDeServiciosElegidos(datos.servicioIds)
  const resultado = await pedirConCuerpo(
    "/api/citas",
    "No se pudo crear la cita",
    conJson("POST", {
      ...(servicioIds.length > 0 ? { servicioIds } : { title: datos.servicio }),
      startTime: inicio,
      endTime: fin,
      customerId: datos.clienteId,
      price: precio.datos,
      notes: datos.notas || undefined,
      memberId: datos.memberId || null,
      // Clínica dental: el sillón, si se eligió uno. Fuera de una clínica la clave no va.
      ...(datos.sillonId !== undefined && { sillonId: datos.sillonId || null }),
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
  const resultado = await pedir<{ clientes: { id: string; name: string; lastName: string | null; email: string | null }[] }>(
    `/api/clientes?q=${encodeURIComponent(texto)}&limite=8`,
    "No se pudieron buscar los clientes"
  )
  if (!resultado.ok) return resultado

  return {
    ok: true,
    datos: resultado.datos.clientes.map((cliente) => ({
      id: cliente.id,
      nombre: nombreCompletoDeCliente(cliente),
      email: cliente.email ?? "",
    })),
  }
}

// ─── Clínica dental: sillones, alergias y "Asignar sillón" ───────────────────

/** Un sillón de la clínica, como lo devuelve Configuración. */
export interface SillonDeLaAgenda {
  id: string
  nombre: string
  orden: number
  activo: boolean
}

/**
 * Los sillones de la clínica, activos e inactivos, por orden. Todo rol de la
 * clínica los lee; fuera de una clínica el servidor responde 404 y la agenda
 * no los pide.
 */
export async function leerSillones(): Promise<Resultado<SillonDeLaAgenda[]>> {
  return pedir<SillonDeLaAgenda[]>("/api/configuracion/sillones", "No se pudieron cargar los sillones")
}

/**
 * Las opciones del selector de sillón: los activos, en su orden. Si la cita
 * ya está en uno desactivado, también ese, dicho así, para que el selector
 * diga dónde está y no "Sin sillón". Un sillón desactivado no se ofrece para
 * una cita nueva ni para cambiar: el servidor lo rechazaría.
 */
export function opcionesDeSillon(
  sillones: readonly SillonDeLaAgenda[],
  cita?: Pick<Cita, "sillonId" | "sillon"> | null
): { valor: string; texto: string }[] {
  const opciones = sillones.filter((sillon) => sillon.activo).map((sillon) => ({ valor: sillon.id, texto: sillon.nombre }))
  const actual = cita?.sillonId
  if (actual && !opciones.some((opcion) => opcion.valor === actual)) {
    const nombre = sillones.find((sillon) => sillon.id === actual)?.nombre ?? cita?.sillon?.nombre ?? "Sillón"
    opciones.push({ valor: actual, texto: `${nombre} (desactivado)` })
  }
  return opciones
}

/** Lo que el detalle de una cita suma en una clínica: la alerta de alergias y el sillón. */
export interface DetalleDeLaClinica {
  /** Lo anotado en "Alergias" de la ficha del paciente; `null` si no hay nada anotado. */
  alergias: string | null
  sillonId: string | null
  sillon: SillonDeLaCita | null
}

/**
 * El detalle de una cita en la clínica. La lista de la agenda no trae las
 * alergias: el panel de la cita lo pide al abrirse. Si el servidor no manda
 * la clave `alergias` (otro rubro), es un error: en una clínica no se dice
 * "sin alergias" sin haberlo leído.
 */
export async function leerDetalleDeLaClinica(citaId: string): Promise<Resultado<DetalleDeLaClinica>> {
  const resultado = await pedir<{ alergias?: unknown; sillonId?: unknown; sillon?: unknown }>(
    `/api/citas/${encodeURIComponent(citaId)}`,
    "No se pudo revisar la ficha del paciente"
  )
  if (!resultado.ok) return resultado
  const { alergias, sillonId, sillon } = resultado.datos
  if (alergias !== null && typeof alergias !== "string") {
    return { ok: false, error: "No se pudo revisar la ficha del paciente" }
  }
  return {
    ok: true,
    datos: {
      alergias: alergias?.trim() || null,
      sillonId: typeof sillonId === "string" ? sillonId : null,
      sillon: esSillonDeLaCita(sillon) ? sillon : null,
    },
  }
}

function esSillonDeLaCita(valor: unknown): valor is SillonDeLaCita {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as SillonDeLaCita).id === "string" &&
    typeof (valor as SillonDeLaCita).nombre === "string"
  )
}

/**
 * "Asignar sillón": guardado (con el sillón como quedó), el sillón ocupado a
 * esa hora (409 `sillon-ocupado`: se elige otro, no hay "guardar igual") u
 * otro error.
 */
export type ResultadoDeAsignarSillon =
  | { tipo: "asignado"; sillonId: string | null; sillon: SillonDeLaCita | null }
  | { tipo: "ocupado"; error: string }
  | { tipo: "error"; error: string }

/** Asigna, cambia o quita (`null`) el sillón de una cita, sin tocar su hora ni su odontólogo. */
export async function asignarSillon(citaId: string, sillonId: string | null): Promise<ResultadoDeAsignarSillon> {
  const resultado = await pedirConCuerpo<{ sillonId: string | null; sillon: SillonDeLaCita | null }>(
    `/api/citas/${encodeURIComponent(citaId)}/sillon`,
    "No se pudo asignar el sillón",
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sillonId }) }
  )
  if (resultado.ok) {
    return {
      tipo: "asignado",
      sillonId: resultado.datos.sillonId ?? null,
      sillon: esSillonDeLaCita(resultado.datos.sillon) ? resultado.datos.sillon : null,
    }
  }
  if (codigoDelServidor(resultado.cuerpo) === CODIGO_SILLON_OCUPADO) return { tipo: "ocupado", error: resultado.error }
  return { tipo: "error", error: resultado.error }
}
