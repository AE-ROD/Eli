/**
 * La lista "Deja tu negocio listo" del inicio del panel: los cuatro pasos que
 * ponen a andar la prueba, cada uno marcado solo con datos reales del negocio.
 * Sólo la ve el dueño (`veLaListaDeInicio`, `lib/permisos.ts`).
 *
 * Este módulo no toca la base: lo usan el endpoint, que junta los datos, y la
 * pantalla, que los dibuja. El pedido desde el navegador también vive acá
 * para que el inicio y el modal de bienvenida marquen el enlace igual.
 */

import { concordar, un } from "@/lib/concordancia"
import { pedir, type Resultado } from "@/lib/peticiones"
import { vocabularioDe } from "@/lib/vocabulario"

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
    texto: "Mándalo por WhatsApp o pégalo en tu Instagram.",
    accion: { texto: "Compartir enlace", href: "#enlace-de-reservas" },
  },
  {
    id: "primeraReserva",
    titulo: "Recibe tu primera reserva",
    texto: "Cuando un cliente reserve desde tu página, se marca sola.",
    accion: { texto: "Ver tu página", href: "#enlace-de-reservas" },
  },
]

/**
 * Los pasos con las palabras del rubro (`lib/vocabulario.ts`): en una clínica
 * dental, "Agrega tus prestaciones" y "Cuando un paciente reserve…"; en los
 * demás, "Agrega tus servicios" y "Cuando un cliente reserve…". Un rubro
 * desconocido o `null`: los textos de `PASOS_DE_INICIO`. El artículo sale de
 * `lib/concordancia.ts`, no se pega a la palabra.
 */
export function pasosDeInicioPara(rubro: string | null | undefined): PasoDeInicio[] {
  const { cliente, servicio } = vocabularioDe(rubro).palabras
  return PASOS_DE_INICIO.map((paso) => {
    switch (paso.id) {
      case "servicios":
        return {
          ...paso,
          titulo: `Agrega tus ${servicio.plural}`,
          accion: { ...paso.accion, texto: `Agregar ${servicio.plural}` },
        }
      case "primeraReserva":
        return { ...paso, texto: `Cuando ${un(cliente)} reserve desde tu página, se marca sola.` }
      default:
        return paso
    }
  })
}

/** El título y el subtítulo de la tarjeta "Deja tu negocio listo", con las palabras del rubro. */
export interface TextosDeLaLista {
  titulo: string
  subtitulo: string
}

/**
 * "Deja tu negocio listo" / "Deja tu salón listo" / "Deja tu barbería lista",
 * y "Cuatro pasos para que tus clientes empiecen a reservar solos" (los
 * "solos" y el "listo" concuerdan con la palabra). Un rubro desconocido o
 * `null`: los textos de siempre.
 */
export function textosDeLaLista(rubro: string | null | undefined): TextosDeLaLista {
  const { cliente, negocio } = vocabularioDe(rubro).palabras
  return {
    titulo: `Deja tu ${negocio.singular} ${concordar("listo", negocio)}`,
    subtitulo: `Cuatro pasos para que tus ${cliente.plural} empiecen a reservar ${concordar("solo", cliente, "plural")}.`,
  }
}

/**
 * El mensaje que acompaña al enlace al mandarlo por WhatsApp o con "Compartir":
 * corto, amable y con la palabra que lee quien reserva (`citaParaElCliente`:
 * "hora" en un salón y en la clínica, "cita" sin rubro). "tu" no cambia con el
 * género, así que no hace falta concordancia.
 */
export function mensajeParaCompartir(rubro: string | null | undefined, enlace: string): string {
  const { citaParaElCliente } = vocabularioDe(rubro).palabras
  return `¡Hola! Ya puedes reservar tu ${citaParaElCliente.singular} en línea, cuando quieras: ${enlace}`
}

/**
 * El enlace que abre WhatsApp con el mensaje ya escrito, para que la persona
 * elija a quién mandarlo (`wa.me/?text=`, sin número). Va codificado entero.
 */
export function enlaceDeWhatsApp(mensaje: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensaje)}`
}

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
 * llama después de copiarlo, mandarlo por WhatsApp o compartirlo, y sin
 * esperarla: si falla, el enlace ya salió y no hay nada que avisar.
 */
export async function marcarEnlaceCompartido(): Promise<Resultado<{ marcado: boolean }>> {
  return pedir<{ marcado: boolean }>(`${URL_DE_LA_LISTA}/enlace-compartido`, "No se pudo marcar el enlace", {
    method: "POST",
  })
}
