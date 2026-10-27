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
import type { Advertencia } from "@/lib/mover-cita"

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

/** A dónde se mueve una cita: fecha y horas locales, y el profesional (vacío: sin asignar). */
export interface DatosDeMoverCita {
  fecha: string
  horaInicio: string
  horaFin: string
  memberId: string
}

/**
 * Mover una cita: guardada, o las advertencias del servidor (choque con otra
 * cita del profesional, fuera de su horario) para que quien mueve decida.
 * `confirmar` es el segundo envío, después de verlas: guarda igual.
 */
export type ResultadoDeMover =
  | { tipo: "guardada" }
  | { tipo: "advertencias"; advertencias: Advertencia[] }
  | { tipo: "error"; error: string }

function sonAdvertencias(valor: unknown): valor is Advertencia[] {
  return (
    Array.isArray(valor) &&
    valor.length > 0 &&
    valor.every((item) => typeof item === "object" && item !== null && typeof item.mensaje === "string")
  )
}

export async function moverCita(
  id: string,
  datos: DatosDeMoverCita,
  opciones: { confirmar: boolean; asignaProfesional: boolean }
): Promise<ResultadoDeMover> {
  const inicio = new Date(`${datos.fecha}T${datos.horaInicio}:00`)
  const fin = new Date(`${datos.fecha}T${datos.horaFin}:00`)
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    return { tipo: "error", error: "La fecha o la hora no son válidas" }
  }

  const resultado = await pedirConCuerpo(
    `/api/citas/${id}`,
    "No se pudo mover la cita",
    conJson("PUT", {
      startTime: inicio.toISOString(),
      endTime: fin.toISOString(),
      // Sólo quien puede asignar manda el profesional; al otro el servidor lo
      // dejaría igual en sí mismo.
      ...(opciones.asignaProfesional && { memberId: datos.memberId || null }),
      ...(opciones.confirmar && { confirmarAdvertencias: true }),
    })
  )
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

export async function crearCita(datos: DatosDeNuevaCita): Promise<Resultado> {
  const precio = precioDeLaCita(datos.precio)
  if (!precio.ok) return precio

  const inicio = new Date(`${datos.fecha}T${datos.horaInicio}:00`)
  const fin = new Date(`${datos.fecha}T${datos.horaFin}:00`)

  return pedir(
    "/api/citas",
    "No se pudo crear la cita",
    conJson("POST", {
      title: datos.servicio,
      startTime: inicio.toISOString(),
      endTime: fin.toISOString(),
      customerId: datos.clienteId,
      price: precio.datos,
      notes: datos.notas || undefined,
      memberId: datos.memberId || null,
    })
  )
}

/** El equipo, para el selector de profesional. Sólo lo pide quien puede asignar. */
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
