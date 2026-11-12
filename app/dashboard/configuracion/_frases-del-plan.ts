/**
 * Las frases de la sección «Plan» con las palabras del rubro
 * (`vocabularioDe(rubro).palabras`) y la concordancia de
 * `lib/concordancia.ts`: «invitar a tus estilistas» / «a tus odontólogos»,
 * «la dirección del salón» / «de la clínica». Ninguna pega un artículo, un
 * pronombre ni un adjetivo a una palabra del vocabulario.
 *
 * Los nombres, las descripciones y los precios de los planes salen de
 * `lib/planes.ts` y `lib/precios.ts`: acá sólo se dice qué incluye cada plan y
 * qué cambia al pasar de uno al otro. Es lógica sin pantalla: `_frases.ts` las
 * suma a `frasesDeConfiguracion(...).plan`.
 *
 * Todavía no hay cobro (docs/PRODUCTO.md, secciones 4 y 10): nada de lo que se
 * dice acá promete un cobro, una fecha ni un descuento.
 */

import { del } from "@/lib/concordancia"
import { MAX_SEDES } from "@/lib/sedes"
import type { PlanId } from "@/lib/planes"
import type { PalabrasDelRubro } from "@/lib/vocabulario"
import { precioDelPlan } from "./_plan"

/** Una línea de «qué incluye»: lo que el plan trae, o lo que no. */
export interface LineaDelPlan {
  texto: string
  incluido: boolean
}

/** «2 integrantes y 1 invitación pendiente». */
function descripcionDelEquipo(integrantes: number, invitaciones: number): string {
  const personas = integrantes === 1 ? "1 integrante" : `${integrantes} integrantes`
  const pendientes = invitaciones === 1 ? "1 invitación pendiente" : `${invitaciones} invitaciones pendientes`
  if (integrantes > 0 && invitaciones > 0) return `${personas} y ${pendientes}`
  return integrantes > 0 ? personas : pendientes
}

export function frasesDelPlan(palabras: PalabrasDelRubro) {
  const { profesional, negocio } = palabras

  /** Lo que trae cada plan y lo que no, en las palabras del rubro. */
  const incluye = (plan: PlanId): LineaDelPlan[] =>
    plan === "independiente"
      ? [
          { texto: "Atiendes sólo tú.", incluido: true },
          { texto: `Hasta ${MAX_SEDES} sedes, cada una con su dirección y su horario por día.`, incluido: true },
          { texto: `Invitar a un encargado o a tus ${profesional.plural} a tu equipo.`, incluido: false },
        ]
      : [
          { texto: `Invitar a tu equipo: un encargado y tus ${profesional.plural}, cada uno con su rol.`, incluido: true },
          { texto: `Una sola sede: la dirección ${del(negocio)}.`, incluido: true },
          { texto: "Varias sedes, cada una con su horario por día.", incluido: false },
        ]

  return {
    titulo: "Plan",
    subtitulo: "El plan de tu cuenta, qué incluye y qué cambia si te pasas al otro.",
    actual: "Tu plan actual",
    incluye,
    incluyeEtiqueta: "Incluye",
    noIncluyeEtiqueta: "No incluye",
    /** Lo que se dice del cobro, en todas partes igual. */
    cobro: "Todavía no se cobra: el cobro llega pronto. Mientras tanto, cambiar de plan no cuesta nada.",
    cambiar: {
      /** «Cambiar a Equipo» / «Cambiar a Independiente». */
      boton: (destino: string): string => `Cambiar a ${destino}`,
      abriendo: "Revisando tus sedes…",
      /** Lo que hace cada plan, en una línea, junto al botón. */
      resumen: (destino: PlanId): string =>
        destino === "equipo"
          ? `Equipo es para quien suma gente: invitas a tu encargado y a tus ${profesional.plural}, y tienes una sola sede.`
          : `Independiente es para quien atiende solo: puedes tener hasta ${MAX_SEDES} sedes, y no invitas a nadie.`,
      anuncio: (plan: string): string => `Ahora estás en el plan ${plan}.`,
    },
    bloqueo: {
      titulo: "Para pasar a Independiente, primero quédate sin equipo",
      /** «Hoy tienes 2 integrantes y 1 invitación pendiente. Independiente atiende sólo tú: quítalos…». */
      detalle: (integrantes: number, invitaciones: number): string =>
        `Hoy tienes ${descripcionDelEquipo(integrantes, invitaciones)}. En Independiente atiendes sólo tú: quita a las personas del equipo y anula las invitaciones pendientes, y vuelve acá.`,
      irAEquipo: "Ir a Equipo",
    },
    modal: {
      titulo: (destino: string): string => `¿Pasar al plan ${destino}?`,
      descripcion: "Esto es lo que cambia en tu cuenta si confirmas.",
      confirmar: (destino: string): string => `Pasar a ${destino}`,
      cancelar: "No cambiar",
      /** Qué cambia, línea por línea. */
      aEquipo: {
        invitar: `Podrás invitar a un encargado y a tus ${profesional.plural}.`,
        unaSede: `Equipo tiene una sola sede: la dirección ${del(negocio)}.`,
        sinSedes: "No tienes sedes, así que tu dirección sigue como está.",
        /** Con sedes activas: pide elegir y avisa que las demás se desactivan. */
        elegirSede: `Elige cuál de tus sedes queda como la dirección ${del(negocio)}. Las demás se desactivan y dejan de verse en tu página de reservas.`,
        unaSedeQueda: (nombre: string): string =>
          `Tu única sede activa, ${nombre}, queda como la dirección ${del(negocio)}.`,
        leyenda: `Sede que queda como la dirección ${del(negocio)}`,
        faltaElegir: "Elige la sede que queda antes de confirmar.",
        /** «Se desactivan 2 sedes.» */
        seDesactivan: (cantidad: number): string =>
          cantidad === 1 ? "Se desactiva 1 sede." : `Se desactivan ${cantidad} sedes.`,
      },
      aIndependiente: {
        atiendesTu: "Pasas a atender sólo tú: ya no podrás invitar a nadie.",
        sedes: `Podrás tener hasta ${MAX_SEDES} sedes, cada una con su horario por día. Tu dirección de hoy sigue siendo la dirección ${del(negocio)}; la conviertes en sede desde “Sedes y horarios”.`,
      },
      /** «El plan Independiente cuesta $9.990/mes (IVA incluido).» */
      precio: (destino: PlanId, nombre: string): string => {
        const { texto, nota } = precioDelPlan(destino)
        return `El plan ${nombre} cuesta ${texto} (${nota}).`
      },
    },
  }
}
