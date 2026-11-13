/**
 * Las frases y el armado de cada fila del "Historial de cambios" de Comisiones
 * › Reparto de prótesis. Es lógica sin pantalla: la sección sólo pone en la
 * página lo que sale de acá, y nada del texto se pega a mano (un artículo, un
 * "de" o un plural van por `lib/concordancia.ts` con las palabras del rubro).
 *
 * Un cambio guarda tres partes en puntos base (10.000 = 100 %): la tratante, la
 * clínica y el laboratorio (el técnico). Acá se escriben como porcentaje
 * (`textoDePorcentaje`: "40 %", "33,33 %") con los mismos nombres y colores de
 * las tres partes del reparto de arriba.
 *
 * Lo que se dice de cada cambio sale sólo de lo copiado en el registro: el
 * material, el odontólogo y quien lo hizo quedan con el nombre que tenían, así
 * que una fila de algo que ya no existe se lee igual; si un nombre quedó
 * vacío, dice "Sin nombre" y no deja un hueco.
 */

import type { CambioDeReparto, PartesDelCambio } from "@/lib/cambios-de-reparto-servidor"
import { del } from "@/lib/concordancia"
import { formatearHora } from "@/lib/fechas"
import { fechaDelNegocio, fechaParaLeer } from "@/lib/periodos-de-liquidacion"
import { textoDePorcentaje } from "@/lib/protesis"
import type { PalabrasDelRubro } from "@/lib/vocabulario"

/** Lo que se muestra cuando falta un nombre o una parte. */
export const SIN_NOMBRE = "Sin nombre"
const SIN_PORCENTAJE = "—"

/** Las tres partes, en orden, con el color de cada una: el pastel fuerte de un módulo, con texto navy. Nunca la única pista: cada una va con su nombre. */
export const PARTES_DEL_HISTORIAL = [
  { clave: "pbOdontologo", nombre: "Tratante", color: "bg-lila" },
  { clave: "pbClinica", nombre: "Clínica", color: "bg-azul" },
  { clave: "pbTecnico", nombre: "Laboratorio", color: "bg-naranja" },
] as const

export interface ParteEscrita {
  clave: (typeof PARTES_DEL_HISTORIAL)[number]["clave"]
  nombre: string
  color: string
  /** "40 %", "33,33 %", o "—" si el registro no la trae. */
  texto: string
}

/** El reparto de antes o de después: sus tres partes, o la frase de por qué no hay ("No existía", "Se quitó"). */
export type RepartoEscrito = { partes: ParteEscrita[]; vacio?: undefined } | { partes?: undefined; vacio: string }

export interface FilaDelHistorial {
  id: string
  /** Si es el cambio de la regla de un material o de la excepción de un odontólogo. */
  alcance: CambioDeReparto["alcance"]
  /** Qué clase de cambio: "Material" o "Excepción por odontólogo". */
  etiqueta: string
  /** Qué se cambió: el material, o el odontólogo y el material de su excepción. */
  titulo: string
  /** Quién y qué hizo: "Valentina Soto cambió la regla". */
  resumen: string
  /** "9 nov 2026, 14:05", en la zona del negocio. */
  cuando: string
  antes: RepartoEscrito
  despues: RepartoEscrito
}

const conNombre = (nombre: string | null | undefined): string => nombre?.trim() || SIN_NOMBRE

/** "9 nov 2026, 14:05": el instante en la zona del negocio (no la del servidor ni la del dispositivo), con la hora en 24 h. */
export function cuandoParaLeer(iso: string, zona: string): string {
  return `${fechaParaLeer(fechaDelNegocio(new Date(iso), zona))}, ${formatearHora(iso, zona)}`
}

/** Las frases de la sección con las palabras del rubro (en una clínica dental: "odontólogo"). */
export function frasesDelHistorialDelReparto(palabras: PalabrasDelRubro) {
  const { profesional } = palabras

  return {
    titulo: "Historial de cambios",
    subtitulo: "Quién cambió el reparto de las prótesis, cuándo y de cuánto a cuánto. Lo más reciente, primero.",
    /** Todavía nadie cambió nada. */
    sinCambios: `Todavía no hay cambios. Aparecen aquí cuando se crea o se cambia la regla de un material o la excepción ${del(profesional)}.`,
    /** El nombre accesible de la lista. */
    lista: "Cambios del reparto de prótesis, del más nuevo al más viejo",
    antes: "Antes",
    despues: "Después",
    verMas: "Ver más cambios",
    /** Se llegó al tope de lo que se muestra. */
    tope: (maximo: number): string => `Se muestran los últimos ${maximo} cambios.`,
    /** La etiqueta de un cambio de la regla de un material. */
    etiquetaDelMaterial: "Material",
    /** La etiqueta de un cambio de la excepción de un odontólogo: "Excepción por odontólogo". */
    etiquetaDeLaExcepcion: `Excepción por ${profesional.singular}`,
  }
}

export type FrasesDelHistorial = ReturnType<typeof frasesDelHistorialDelReparto>

/** El reparto de un lado del cambio, o por qué no hay (`vacio`). */
function repartoEscrito(partes: PartesDelCambio | null, vacio: string): RepartoEscrito {
  if (!partes) return { vacio }
  return {
    partes: PARTES_DEL_HISTORIAL.map((parte) => ({
      clave: parte.clave,
      nombre: parte.nombre,
      color: parte.color,
      texto: partes[parte.clave] === null ? SIN_PORCENTAJE : textoDePorcentaje(partes[parte.clave]!),
    })),
  }
}

/**
 * Lo que hizo quien cambió: crear (no había regla antes), quitar (no hay
 * después: sólo una excepción se quita) o cambiar. Qué material o de qué
 * odontólogo lo dice el título de la fila.
 */
function queHizo(cambio: CambioDeReparto): string {
  const esExcepcion = cambio.alcance === "excepcion"
  if (cambio.antes === null) return esExcepcion ? "creó la excepción" : "creó el material"
  if (cambio.despues === null) return esExcepcion ? "quitó la excepción" : "quitó la regla"
  return esExcepcion ? "cambió la excepción" : "cambió la regla"
}

/**
 * Una fila del historial: qué se cambió, quién, cuándo y el antes y el después
 * en porcentaje. `zona` es la del negocio. Un reparto de antes que no existe
 * dice "No existía" (se creó) y uno de después que no existe, "Se quitó".
 */
export function filaDelHistorial(cambio: CambioDeReparto, zona: string, palabras: PalabrasDelRubro): FilaDelHistorial {
  const frases = frasesDelHistorialDelReparto(palabras)
  const esExcepcion = cambio.alcance === "excepcion"
  const material = conNombre(cambio.material)

  return {
    id: cambio.id,
    alcance: cambio.alcance,
    etiqueta: esExcepcion ? frases.etiquetaDeLaExcepcion : frases.etiquetaDelMaterial,
    titulo: esExcepcion ? `${conNombre(cambio.profesional)} · ${material}` : material,
    resumen: `${cambio.quien.trim() || "Alguien del equipo"} ${queHizo(cambio)}`,
    cuando: cuandoParaLeer(cambio.cuando, zona),
    antes: repartoEscrito(cambio.antes, "No existía"),
    despues: repartoEscrito(cambio.despues, "Se quitó"),
  }
}
