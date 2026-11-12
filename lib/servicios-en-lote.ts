import { z } from "zod"
import { el } from "./concordancia"
import { categoriaDeServicio, descripcion, duracion, nombre, precioDeServicio } from "./campos-del-panel"
import { detectarSeparador, leerCsv, type Separador } from "./csv"
import { normalizarNombre } from "./reserva-publica"
import type { Sustantivo } from "./vocabulario"

/**
 * Cargar muchos servicios de una vez: leer una planilla pegada o un CSV, y
 * revisar lo que se va a crear. Puro, sin base ni servidor: la pantalla de
 * Configuración lo usa en el navegador para la vista previa, y el servidor
 * (`POST /api/configuracion/servicios/lote`) vuelve a validar todo con las
 * mismas reglas, porque lo que revisó el navegador no se da por bueno.
 *
 * Las reglas de cada campo son las de `lib/campos-del-panel.ts` (`nombre`,
 * `duracion`, `precioDeServicio`, `categoriaDeServicio`, `descripcion`): acá
 * sólo se lee el texto de cada celda; qué vale y qué no lo dicen ellas.
 */

/** Cuántos servicios caben en una sola carga. */
export const MAX_SERVICIOS_POR_LOTE = 100

/** Cuántos servicios puede tener un negocio en total, activos o no. */
export const MAX_SERVICIOS_POR_NEGOCIO = 300

/** Un servicio listo para crear. `esUrgencia` no viaja: una carga nunca marca urgencias. */
export interface ServicioParaCargar {
  name: string
  /** En minutos, entero (`duracion()`). */
  duration: number
  /** En pesos; `null` es "sin precio" (se publica "a consultar"). */
  price: number | null
  category: string | null
  description: string | null
}

/**
 * Una fila leída del texto. Exactamente una de las dos: o el `servicio`
 * listo, o el `error` (ya con "Fila N: ", en español) de por qué no. `fila` es
 * el número que ve la persona en su planilla: la cabecera, si hay, es la 1.
 */
export interface FilaLeida {
  fila: number
  servicio?: ServicioParaCargar
  error?: string
}

export { normalizarNombre }

// ─── Las reglas de un servicio ───────────────────────────────────────────────

/**
 * Cada campo de un servicio a cargar, con la regla de `lib/campos-del-panel.ts`.
 * Aparte del objeto para que el lector valide celda por celda y diga el primer
 * problema de la fila, y el servidor valide el servicio entero con el mismo.
 */
export const camposDeServicioParaCargar = {
  name: nombre(),
  duration: duracion(),
  price: precioDeServicio().nullable(),
  category: categoriaDeServicio().nullable(),
  // Vacío es "sin descripción": se guarda null, no "".
  description: descripcion()
    .transform((valor) => (valor === "" ? null : valor))
    .nullable(),
}

/**
 * Un servicio a cargar tal como lo valida el servidor. Una clave de más (como
 * `esUrgencia`) no falla: se descarta, y nunca llega a la base.
 */
export const servicioParaCargarSchema = z.object(camposDeServicioParaCargar)

// ─── Duración y precio, escritos como los escribe la gente ──────────────────

const UNIDAD_DE_MINUTOS = "(?: ?(?:m|min|mins|minuto|minutos))"
const UNIDAD_DE_HORAS = "(?:h|hr|hrs|hora|horas)"

/** "45,5" y "45.5" son el mismo número. */
const comoNumero = (texto: string) => Number(texto.replace(",", "."))

/**
 * Los minutos que dice un texto: "45", "45 min", "1h", "1 h", "2 horas",
 * "1,5 h", "1h30", "1 h 30", "1 hora 30 minutos" y "1:30". `null` si no se
 * entiende. No decide si la duración vale (15 a 480, entera): eso lo dice
 * `duracion()`. Un número solo son minutos.
 */
export function leerDuracion(texto: string): number | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, " ")

  const minutos = new RegExp(`^([+-]?\\d+(?:[.,]\\d+)?)${UNIDAD_DE_MINUTOS}?$`).exec(t)
  if (minutos) return comoNumero(minutos[1])

  const horas = new RegExp(`^(\\d+(?:[.,]\\d+)?) ?${UNIDAD_DE_HORAS}$`).exec(t)
  // El redondeo sólo limpia el ruido de la coma flotante (1,1 h son 66 minutos, no 66,00000000000001).
  if (horas) return Number((comoNumero(horas[1]) * 60).toFixed(6))

  const horasYMinutos = new RegExp(`^(\\d+) ?${UNIDAD_DE_HORAS} ?(\\d{1,2})${UNIDAD_DE_MINUTOS}?$`).exec(t) ?? /^(\d{1,2}):(\d{2})$/.exec(t)
  if (horasYMinutos) {
    const resto = Number(horasYMinutos[2])
    // "1h75" no es una hora y cuarto: es un error de tipeo.
    return resto < 60 ? Number(horasYMinutos[1]) * 60 + resto : null
  }

  return null
}

/**
 * El monto que dice un texto, en pesos: "15000", "$15.000", "$ 15.000", "15.000 CLP",
 * "15,000", "15000,50" y "1.234,50". `null` si no se entiende. El punto y la
 * coma seguidos de exactamente tres cifras son miles (en Chile "15.000" es quince
 * mil); con una o dos cifras, decimales. No decide si el monto vale (de 0 a
 * 10.000.000): eso lo dice `precioDeServicio()`. El texto vacío no pasa por acá:
 * es "sin precio".
 */
export function leerPrecio(texto: string): number | null {
  const t = texto
    .toLowerCase()
    .replace(/\$|clp|pesos?/g, "")
    .replace(/\s/g, "")

  if (/^[+-]?\d+$/.test(t)) return Number(t)
  if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""))
  if (/^[+-]?\d{1,3}(?:,\d{3})+$/.test(t)) return Number(t.replace(/,/g, ""))
  if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."))
  if (/^[+-]?\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(t)) return Number(t.replace(/,/g, ""))
  if (/^[+-]?\d+[.,]\d{1,2}$/.test(t)) return comoNumero(t)
  return null
}

// ─── Leer el texto ───────────────────────────────────────────────────────────

type Campo = keyof ServicioParaCargar

const ORDEN_SIN_TITULOS: readonly Campo[] = ["name", "duration", "price", "category", "description"]

/** Cómo suele titularse cada columna, ya normalizado (`normalizarTitulo`). */
const TITULOS: Record<Campo, readonly string[]> = {
  name: ["nombre", "servicio", "prestacion", "motivo", "nombre del servicio", "nombre de la prestacion", "nombre del motivo"],
  duration: ["duracion", "duracion min", "duracion minutos", "duracion en minutos", "minutos", "min", "tiempo"],
  price: ["precio", "valor", "precio clp", "precio pesos", "tarifa"],
  category: ["categoria", "tipo", "grupo"],
  description: ["descripcion", "detalle", "descripcion del servicio"],
}

/** "Duración (min)", "DURACIÓN" y "duracion min" son el mismo título. */
const normalizarTitulo = (titulo: string) => normalizarNombre(titulo.replace(/[^\p{L}\p{N}]+/gu, " "))

/**
 * Qué columna es cada campo, si la fila son títulos; `null` si es un servicio.
 * Un título no lleva cifras ("Duración (min)"), así que una fila con alguna
 * ("Servicio ; 45 ; 15000") es un servicio aunque se llame "Servicio".
 */
function columnasDeLosTitulos(celdas: readonly string[]): Partial<Record<Campo, number>> | null {
  if (celdas.some((celda) => /\d/.test(celda))) return null
  const columnas: Partial<Record<Campo, number>> = {}
  celdas.forEach((celda, indice) => {
    const titulo = normalizarTitulo(celda)
    const campo = ORDEN_SIN_TITULOS.find((c) => TITULOS[c].includes(titulo) && columnas[c] === undefined)
    if (campo) columnas[campo] = indice
  })
  return Object.keys(columnas).length > 0 ? columnas : null
}

/**
 * El separador de lo pegado. Una tabulación en la primera línea manda: así
 * separa Excel y Google Sheets al copiar, y un nombre con coma ("Corte, lavado
 * y secado") no la confunde. Si no, `detectarSeparador` de `lib/csv.ts` sobre
 * la primera línea con algo escrito.
 */
function separadorDe(texto: string): Separador {
  const desdeLaPrimera = texto.replace(/^﻿/, "").replace(/^(?:[ \t]*(?:\r\n|\r|\n))+/, "")
  let entreComillas = false
  for (const caracter of desdeLaPrimera) {
    if (caracter === '"') entreComillas = !entreComillas
    else if (!entreComillas && (caracter === "\n" || caracter === "\r")) break
    else if (!entreComillas && caracter === "\t") return "\t"
  }
  return detectarSeparador(desdeLaPrimera)
}

const enMinuscula = (mensaje: string) => mensaje.charAt(0).toLowerCase() + mensaje.slice(1)

/**
 * Lee servicios de un texto pegado desde una planilla o de un CSV (UTF-8, con
 * o sin BOM). El separador es tabulación, punto y coma o coma, el que traiga.
 * Con fila de títulos (Nombre / Servicio / Prestación / Motivo, Duración,
 * Precio / Valor, Categoría / Tipo, Descripción) las columnas pueden ir en
 * cualquier orden y sobrar; sin ella, el orden es nombre, duración, precio,
 * categoría y descripción.
 *
 * Las filas en blanco se saltan, pero cuentan para el número de fila, que es
 * el de la planilla. Cada fila inválida lleva su error ("Fila 7: la duración
 * tiene que ser de al menos 15 minutos"), el primero que tenga; las demás se
 * leen igual. Una celda que empieza con `=`, `+`, `-` o `@` es texto como
 * cualquier otra: nunca se evalúa. En un campo de texto se guarda tal cual (el
 * CSV de salida la protege, `celdaSegura`), y en uno numérico sólo vale si es
 * un número.
 */
export function leerServiciosDeTexto(texto: string): { filas: FilaLeida[]; titulosReconocidos: boolean } {
  const registros = leerCsv(texto, separadorDe(texto))
  const filas: FilaLeida[] = []
  let columnas: Partial<Record<Campo, number>> = Object.fromEntries(ORDEN_SIN_TITULOS.map((campo, indice) => [campo, indice]))
  let titulosReconocidos = false
  let primeraConDatos = true

  registros.forEach((celdas, indice) => {
    if (celdas.every((celda) => celda.trim() === "")) return
    const fila = indice + 1

    if (primeraConDatos) {
      primeraConDatos = false
      const delTitulo = columnasDeLosTitulos(celdas)
      if (delTitulo) {
        columnas = delTitulo
        titulosReconocidos = true
        return
      }
    }

    const celda = (campo: Campo) => {
      const columna = columnas[campo]
      return columna === undefined ? "" : (celdas[columna] ?? "").trim()
    }
    const resultado = leerFila(celda)
    filas.push("error" in resultado ? { fila, error: `Fila ${fila}: ${enMinuscula(resultado.error)}` } : { fila, servicio: resultado.servicio })
  })

  return { filas, titulosReconocidos }
}

/** Un servicio de las celdas de una fila, o el primer problema que tenga (campo por campo, en el orden de la planilla). */
function leerFila(celda: (campo: Campo) => string): { servicio: ServicioParaCargar } | { error: string } {
  const nombreLeido = camposDeServicioParaCargar.name.safeParse(celda("name"))
  if (!nombreLeido.success) return { error: nombreLeido.error.issues[0].message }

  const textoDeLaDuracion = celda("duration")
  if (textoDeLaDuracion === "") return { error: "Falta la duración: escribe los minutos (45) o las horas (1h30)" }
  const minutos = leerDuracion(textoDeLaDuracion)
  if (minutos === null) {
    return { error: `La duración "${textoDeLaDuracion}" no se entiende: escribe los minutos (45) o las horas (1h30 o 1:30)` }
  }
  const duracionLeida = camposDeServicioParaCargar.duration.safeParse(minutos)
  if (!duracionLeida.success) return { error: duracionLeida.error.issues[0].message }

  const textoDelPrecio = celda("price")
  let monto: number | null = null
  if (textoDelPrecio !== "") {
    monto = leerPrecio(textoDelPrecio)
    if (monto === null) return { error: `El precio "${textoDelPrecio}" no se entiende: escribe sólo el monto (15000 o $15.000) o déjalo vacío` }
  }
  const precioLeido = camposDeServicioParaCargar.price.safeParse(monto)
  if (!precioLeido.success) return { error: precioLeido.error.issues[0].message }

  const categoriaLeida = camposDeServicioParaCargar.category.safeParse(celda("category"))
  if (!categoriaLeida.success) return { error: categoriaLeida.error.issues[0].message }

  const descripcionLeida = camposDeServicioParaCargar.description.safeParse(celda("description"))
  if (!descripcionLeida.success) return { error: descripcionLeida.error.issues[0].message }

  return {
    servicio: {
      name: nombreLeido.data,
      duration: duracionLeida.data,
      price: precioLeido.data,
      category: categoriaLeida.data,
      description: descripcionLeida.data,
    },
  }
}

// ─── Repetidos ───────────────────────────────────────────────────────────────

export const MOTIVO_YA_EXISTE = "Ya existe un servicio con ese nombre"
export const MOTIVO_REPETIDO_EN_EL_ARCHIVO = "Repetido en el archivo"
export const MOTIVO_REPETIDO_EN_EL_LOTE = "Repetido en el lote"

/**
 * Por cada nombre, `null` si se puede crear, `"existente"` si ya hay un
 * servicio con ese nombre en el negocio y `"repetido"` si ya vino antes en la
 * misma lista (queda la primera vez). Se compara sin mayúsculas, sin tildes y
 * con los espacios colapsados (`normalizarNombre`): "CORTE  de Pelo" y "corte de
 * pelo" son el mismo servicio. Lo usan la vista previa y el servidor, para que
 * den siempre lo mismo.
 */
export function repetidosDe(
  nombres: readonly string[],
  nombresExistentes: readonly string[]
): ("existente" | "repetido" | null)[] {
  const existentes = new Set(nombresExistentes.map(normalizarNombre))
  const vistos = new Set<string>()
  return nombres.map((nombreDelServicio) => {
    const clave = normalizarNombre(nombreDelServicio)
    if (existentes.has(clave)) return "existente"
    if (vistos.has(clave)) return "repetido"
    vistos.add(clave)
    return null
  })
}

/**
 * Las mismas filas, con error las que repiten un servicio del negocio ("Ya
 * existe un servicio con ese nombre") o a una anterior de la lista ("Repetido
 * en el archivo"; la primera se queda). Una fila que ya tenía error no se toca
 * ni cuenta como "anterior". La fila que se marca pierde su `servicio`: queda
 * `fila` y `error`, como toda fila con error. No muta lo que recibe.
 */
export function marcarRepetidos(filas: readonly FilaLeida[], nombresExistentes: readonly string[]): FilaLeida[] {
  const buenas = filas.flatMap((fila, indice) => (fila.servicio ? [indice] : []))
  const veredictos = repetidosDe(
    buenas.map((indice) => filas[indice].servicio!.name),
    nombresExistentes
  )
  const veredictoDe = new Map(buenas.map((indice, orden) => [indice, veredictos[orden]]))

  return filas.map((fila, indice) => {
    if (fila.servicio === undefined) return { ...fila }
    const veredicto = veredictoDe.get(indice)
    if (veredicto === "existente") return { fila: fila.fila, error: MOTIVO_YA_EXISTE }
    if (veredicto === "repetido") return { fila: fila.fila, error: MOTIVO_REPETIDO_EN_EL_ARCHIVO }
    return { fila: fila.fila, servicio: { ...fila.servicio } }
  })
}

// ─── El tope por negocio ─────────────────────────────────────────────────────

/** Lo que lanza quien intenta pasar de `MAX_SERVICIOS_POR_NEGOCIO`; el endpoint lo vuelve un 409. */
export class TopeDeServicios extends Error {
  constructor(
    readonly existentes: number,
    readonly nuevos: number
  ) {
    super("Se pasa del tope de servicios")
    this.name = "TopeDeServicios"
  }
}

/**
 * Lo que se le dice a la persona cuando lo que quiere crear no cabe. Con las
 * palabras de su rubro (`vocabularioDe(rubro).palabras.servicio`): una clínica
 * lee "prestaciones", no "servicios".
 */
export function mensajeDeTopeDeServicios(existentes: number, nuevos: number, servicio: Sustantivo): string {
  const caben = Math.max(0, MAX_SERVICIOS_POR_NEGOCIO - existentes)
  if (caben === 0) {
    return `Ya tienes el máximo de ${MAX_SERVICIOS_POR_NEGOCIO} ${servicio.plural}. Borra ${el(servicio, "plural")} que ya no uses para agregar más.`
  }
  return (
    `Se pueden tener hasta ${MAX_SERVICIOS_POR_NEGOCIO} ${servicio.plural} y ya tienes ${existentes}: caben ${caben} más y esta carga trae ${nuevos}. ` +
    `Quita ${nuevos - caben} de la lista o borra ${el(servicio, "plural")} que ya no uses.`
  )
}
