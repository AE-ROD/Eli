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
import { pedir, conJson, type Resultado } from "@/lib/peticiones"

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
}

/**
 * Cómo se llama la cita en pantalla cuando no tiene cliente. Está acá, en un
 * solo lugar, para que las tres vistas no inventen cada una su propia palabra
 * — y para que ninguna vuelva a asumir que `customer` siempre viene.
 */
export function nombreDeCliente(cita: Cita): string {
  return cita.customer?.name ?? "Sin cliente"
}

export interface DatosDeNuevaCita {
  clienteId: string
  servicio: string
  fecha: string
  horaInicio: string
  horaFin: string
  precio: string
  notas: string
  memberId: string
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

export async function crearCita(datos: DatosDeNuevaCita): Promise<Resultado> {
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
      price: datos.precio ? parseFloat(datos.precio) : undefined,
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
