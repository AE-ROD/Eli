/**
 * Todo lo que la agenda le pide al servidor, en un solo lugar. La pantalla
 * llama a estas funciones y no conoce ninguna URL: si mañana cambia un
 * endpoint, se cambia acá y la vista no se entera.
 *
 * Cada función devuelve `{ ok }` en vez de lanzar. Que el error sea parte del
 * valor de retorno obliga a la pantalla a decidir qué mostrar; con excepciones
 * es demasiado fácil no atraparlas y dejar al usuario mirando una pantalla que
 * no hizo nada y no dice por qué.
 */

import { comoTexto, diasDeLaSemanaDe, limitesDelMesDe, type UnidadDeTiempo } from "@/nucleo/fechas"

export interface Cita {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string
  notes: string | null
  price: number | null
  patientId: string | null
  /**
   * Nulo de verdad: `patientId` es opcional en el esquema, así que una cita
   * puede no tener cliente (una reserva bloqueada, por ejemplo). Tipearlo como
   * obligatorio es lo que hace que la pantalla explote la primera vez que
   * aparece una.
   */
  patient: { id: string; name: string; email: string | null; phone: string | null } | null
}

/**
 * Cómo se llama la cita en pantalla cuando no tiene cliente. Está acá, en un
 * solo lugar, para que las tres vistas no inventen cada una su propia palabra
 * — y para que ninguna vuelva a asumir que `patient` siempre viene.
 */
export function nombreDeCliente(cita: Cita): string {
  return cita.patient?.name ?? "Sin cliente"
}

export interface DatosDeNuevaCita {
  pacienteId: string
  servicio: string
  fecha: string
  horaInicio: string
  horaFin: string
  precio: string
  notas: string
  memberId: string
}

type Resultado<T = void> = { ok: true; datos: T } | { ok: false; error: string }

async function error(respuesta: Response, porDefecto: string): Promise<string> {
  const cuerpo = await respuesta.json().catch(() => ({}))
  return cuerpo?.error ?? porDefecto
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
  try {
    const respuesta = await fetch(`/api/citas?${rangoVisible(fecha, modo)}`)
    if (!respuesta.ok) return { ok: false, error: await error(respuesta, "No se pudieron cargar las citas") }
    return { ok: true, datos: await respuesta.json() }
  } catch {
    return { ok: false, error: "Sin conexión con el servidor" }
  }
}

export async function cambiarEstadoDeCita(id: string, estado: string): Promise<Resultado> {
  try {
    const respuesta = await fetch(`/api/citas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: estado }),
    })
    if (!respuesta.ok) return { ok: false, error: await error(respuesta, "No se pudo cambiar el estado") }
    return { ok: true, datos: undefined }
  } catch {
    return { ok: false, error: "Sin conexión con el servidor" }
  }
}

export async function crearCita(datos: DatosDeNuevaCita): Promise<Resultado> {
  const inicio = new Date(`${datos.fecha}T${datos.horaInicio}:00`)
  const fin = new Date(`${datos.fecha}T${datos.horaFin}:00`)

  try {
    const respuesta = await fetch("/api/citas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: datos.servicio,
        startTime: inicio.toISOString(),
        endTime: fin.toISOString(),
        patientId: datos.pacienteId,
        price: datos.precio ? parseFloat(datos.precio) : undefined,
        notes: datos.notas || undefined,
        memberId: datos.memberId || null,
      }),
    })
    if (!respuesta.ok) return { ok: false, error: await error(respuesta, "No se pudo crear la cita") }
    return { ok: true, datos: undefined }
  } catch {
    return { ok: false, error: "Sin conexión con el servidor" }
  }
}
