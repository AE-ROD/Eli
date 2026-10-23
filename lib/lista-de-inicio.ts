/**
 * La lista "Deja tu negocio listo" del inicio del panel: los cuatro pasos que
 * ponen a andar la prueba, cada uno marcado solo con datos reales del negocio.
 * Sólo la ve el dueño (`veLaListaDeInicio`, `lib/permisos.ts`).
 *
 * Este módulo no toca la base: lo usan el endpoint, que junta los datos, y la
 * pantalla, que los dibuja. El pedido desde el navegador también vive acá
 * para que el inicio y el modal de bienvenida marquen el enlace igual.
 */

import { pedir, type Resultado } from "@/lib/peticiones"

export type IdDePasoDeInicio = "horario" | "servicios" | "enlace" | "primeraReserva"

/** Lo que el servidor sabe de cada paso: hecho o no. */
export type PasosHechos = Record<IdDePasoDeInicio, boolean>

export interface PasoDeInicio {
  id: IdDePasoDeInicio
  titulo: string
  texto: string
  /** A dónde se va a hacerlo. */
  accion: { texto: string; href: string }
}

/** En el orden en que conviene hacerlos. Sin horario ni servicios no hay qué reservar. */
export const PASOS_DE_INICIO: readonly PasoDeInicio[] = [
  {
    id: "horario",
    titulo: "Define tu horario",
    texto: "Los días y las horas en que atiendes.",
    accion: { texto: "Definir horario", href: "/dashboard/configuracion#horario" },
  },
  {
    id: "servicios",
    titulo: "Agrega tus servicios",
    texto: "Qué ofreces, cuánto dura y cuánto cuesta.",
    accion: { texto: "Agregar servicios", href: "/dashboard/configuracion#servicios" },
  },
  {
    id: "enlace",
    titulo: "Comparte tu enlace de reservas",
    texto: "Cópialo y pégalo en tu Instagram o en WhatsApp.",
    accion: { texto: "Ir al enlace", href: "#enlace-de-reservas" },
  },
  {
    id: "primeraReserva",
    titulo: "Recibe tu primera reserva",
    texto: "Cuando un cliente reserve desde tu página, se marca sola.",
    accion: { texto: "Ver tu página", href: "#enlace-de-reservas" },
  },
]

/** Lo que devuelve `GET /api/dashboard/lista-de-inicio`. */
export interface DatosDeListaDeInicio {
  pasos: PasosHechos
  /** Si ya terminó la prueba gratis: entonces la lista no se muestra. */
  pruebaTerminada: boolean
}

export function cuantosHechos(pasos: PasosHechos): number {
  return PASOS_DE_INICIO.filter((paso) => pasos[paso.id]).length
}

/** Se muestra mientras falte algún paso y la prueba siga corriendo. */
export function mostrarListaDeInicio(datos: DatosDeListaDeInicio): boolean {
  return !datos.pruebaTerminada && cuantosHechos(datos.pasos) < PASOS_DE_INICIO.length
}

/** La prueba terminó cuando su fin ya pasó (`Business.pruebaTerminaEl`). */
export function pruebaTerminada(pruebaTerminaEl: Date, ahora: Date): boolean {
  return pruebaTerminaEl.getTime() <= ahora.getTime()
}

const URL_DE_LA_LISTA = "/api/dashboard/lista-de-inicio"

export async function leerListaDeInicio(): Promise<Resultado<DatosDeListaDeInicio>> {
  return pedir<DatosDeListaDeInicio>(URL_DE_LA_LISTA, "No se pudo cargar la lista de inicio")
}

/**
 * Anota que el dueño compartió su enlace (sólo la primera vez cuenta). Se
 * llama después de copiar y sin esperarla: si falla, el enlace ya está
 * copiado y no hay nada que avisar.
 */
export async function marcarEnlaceCompartido(): Promise<Resultado<{ marcado: boolean }>> {
  return pedir<{ marcado: boolean }>(`${URL_DE_LA_LISTA}/enlace-compartido`, "No se pudo marcar el enlace", {
    method: "POST",
  })
}
