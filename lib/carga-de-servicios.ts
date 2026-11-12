/**
 * La "Carga rápida" de servicios de Configuración, sin pantalla: los sugeridos
 * del rubro, la planilla pegada o el CSV, y la tabla de "Agregar varios".
 *
 * Las reglas de cada servicio (qué es un nombre, una duración, un precio) son
 * las de `lib/servicios-en-lote.ts`, que el servidor vuelve a aplicar: lo que
 * se revisa acá es una ayuda para que la persona corrija antes de enviar, no
 * la última palabra. Este archivo sólo arma lo que ese contrato no hace: las
 * tandas de 100, la tabla editable, los sugeridos filtrados, la plantilla y el
 * archivo.
 *
 * Nada se muta: todas las funciones devuelven listas nuevas.
 */

import { decodificarCsv, escribirCsv } from "@/lib/csv"
import { duracion } from "@/lib/campos-del-panel"
import { ejemplosDe } from "@/lib/ejemplos-por-rubro"
import { montoParaEscribir } from "@/lib/dinero"
import { categoriaCanonica } from "@/lib/lista-de-servicios"
import {
  MAX_SERVICIOS_POR_LOTE,
  MAX_SERVICIOS_POR_NEGOCIO,
  MOTIVO_REPETIDO_EN_EL_LOTE,
  MOTIVO_YA_EXISTE,
  camposDeServicioParaCargar,
  leerPrecio,
  leerServiciosDeTexto,
  marcarRepetidos,
  normalizarNombre,
  repetidosDe,
  type FilaLeida,
  type ServicioParaCargar,
} from "@/lib/servicios-en-lote"
import { agruparPorCategoria, normalizarParaBuscar, type GrupoDeServicios } from "@/lib/servicios-por-categoria"
import { serviciosDeEjemplo } from "@/lib/servicios-de-ejemplo"
import type { ServicioSugerido } from "@/lib/servicios-sugeridos"

// ─── Duraciones ──────────────────────────────────────────────────────────────

/** La duración que trae una fila nueva. */
export const DURACION_POR_DEFECTO = 30

/** De cuánto en cuánto se elige la duración en la tabla. */
export const PASO_DE_DURACION = 15

const DURACION_MINIMA = duracion().minValue ?? 15
const DURACION_MAXIMA = duracion().maxValue ?? 480

/**
 * Las duraciones que ofrece la lista: múltiplos de 15 desde el mínimo hasta lo
 * que acepta `duracion()` (`lib/campos-del-panel.ts`), que es la misma regla
 * del servidor.
 */
export const DURACIONES_VALIDAS: readonly number[] = Array.from(
  { length: Math.floor(DURACION_MAXIMA / PASO_DE_DURACION) - Math.ceil(DURACION_MINIMA / PASO_DE_DURACION) + 1 },
  (_, i) => (Math.ceil(DURACION_MINIMA / PASO_DE_DURACION) + i) * PASO_DE_DURACION
)

/**
 * Las duraciones de la lista de una fila. Si la fila trae una que no es múltiplo
 * de 15 (45 minutos escritos como 50 en una planilla pegada) se agrega, en su
 * lugar: elegir otra en silencio cambiaría lo que la persona escribió.
 */
export function opcionesDeDuracion(actual: number): number[] {
  if (DURACIONES_VALIDAS.includes(actual)) return [...DURACIONES_VALIDAS]
  return [...DURACIONES_VALIDAS, actual].sort((a, b) => a - b)
}

// ─── Tandas y respuestas ─────────────────────────────────────────────────────

/** La lista en tandas de a lo más `tamano` (100, lo que el servidor acepta en una carga). */
export function partirEnTandas<T>(lista: readonly T[], tamano = MAX_SERVICIOS_POR_LOTE): T[][] {
  const tandas: T[][] = []
  for (let desde = 0; desde < lista.length; desde += tamano) tandas.push(lista.slice(desde, desde + tamano))
  return tandas
}

/** Un servicio que el servidor no creó, y por qué. */
export interface ServicioOmitido {
  /** Su lugar en lo que se envió (1 es el primero). */
  fila: number
  name: string
  motivo: string
}

/** Lo que pasó con una carga, juntando todas sus tandas. */
export interface ResumenDeCarga {
  creados: number
  omitidos: ServicioOmitido[]
  /** Cuántos no llegaron a enviarse porque una tanda falló (la que falló y las que seguían). */
  sinEnviar: number
  /** Por qué se cortó, si se cortó. */
  error: string | null
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null

/**
 * Lo que dice la respuesta de una tanda: cuántos se crearon y cuáles no. No se
 * confía en la forma: se lee lo que se puede (`creados` es un número o la lista
 * de lo creado), y lo que no se entiende cuenta como nada. `desplazamiento` es
 * cuántos servicios iban en las tandas anteriores, para que `fila` sea el
 * lugar en la carga entera y no en esta tanda.
 */
export function leerRespuestaDeLote(cuerpo: unknown, desplazamiento = 0): { creados: number; omitidos: ServicioOmitido[] } {
  if (!esObjeto(cuerpo)) return { creados: 0, omitidos: [] }
  const creados = Array.isArray(cuerpo.creados)
    ? cuerpo.creados.length
    : typeof cuerpo.creados === "number" && Number.isFinite(cuerpo.creados)
      ? Math.max(0, Math.trunc(cuerpo.creados))
      : 0
  const omitidos = (Array.isArray(cuerpo.omitidos) ? cuerpo.omitidos : []).flatMap((omitido, indice): ServicioOmitido[] => {
    if (!esObjeto(omitido)) return []
    const fila = typeof omitido.fila === "number" ? omitido.fila : indice + 1
    return [
      {
        fila: fila + desplazamiento,
        name: typeof omitido.name === "string" ? omitido.name : "",
        motivo: typeof omitido.motivo === "string" ? omitido.motivo : "",
      },
    ]
  })
  return { creados, omitidos }
}

/** Cuántos actualizó el servidor, según su respuesta (`{ actualizados }`). Lo que no se entiende cuenta como nada. */
export function leerActualizados(cuerpo: unknown): number {
  if (!esObjeto(cuerpo)) return 0
  const n = cuerpo.actualizados
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}

/** Cuántos servicios más caben en el negocio. */
export function cuantosCaben(existentes: number): number {
  return Math.max(0, MAX_SERVICIOS_POR_NEGOCIO - existentes)
}

/** Los nombres que ya tiene el negocio, para detectar repetidos. */
export function nombresEnUso(servicios: readonly { name: string }[]): string[] {
  return servicios.map((servicio) => servicio.name)
}

/**
 * Los servicios con la categoría tal como ya está escrita en el negocio, o como
 * la escribió la primera fila que la usa: "color" en la planilla y "Color" en
 * el negocio son una sola categoría, no dos. Las que no tienen categoría
 * quedan igual.
 */
export function conCategoriasUnificadas<T extends { category: string | null }>(
  servicios: readonly T[],
  categoriasExistentes: readonly string[]
): T[] {
  const conocidas = [...categoriasExistentes]
  return servicios.map((servicio) => {
    if (servicio.category === null || servicio.category.trim() === "") return servicio
    const categoria = categoriaCanonica(conocidas, servicio.category)
    if (!conocidas.includes(categoria)) conocidas.push(categoria)
    return categoria === servicio.category ? servicio : { ...servicio, category: categoria }
  })
}

// ─── Pegar o importar ────────────────────────────────────────────────────────

/** Lo que se lee de un texto, ya revisado contra el negocio. */
export interface LecturaDelTexto {
  /** Todas las filas, en el orden del texto: las listas llevan `servicio`; las otras, `error`. */
  filas: FilaLeida[]
  /** Si la primera fila eran los títulos de las columnas. */
  titulosReconocidos: boolean
  /** Cuántas se pueden agregar. */
  listas: number
  /** Cuántas no: inválidas o repetidas. */
  conProblemas: number
  /** Los servicios listos, en orden y con las categorías unificadas. */
  servicios: ServicioParaCargar[]
}

/**
 * Lee el texto pegado o el CSV (`leerServiciosDeTexto`), marca las filas que
 * repiten un nombre del negocio o a una anterior (`marcarRepetidos`) y deja las
 * categorías escritas como ya las tiene el negocio.
 */
export function leerYRevisarTexto(
  texto: string,
  nombresExistentes: readonly string[],
  categoriasExistentes: readonly string[]
): LecturaDelTexto {
  const leido = leerServiciosDeTexto(texto)
  const marcadas = marcarRepetidos(leido.filas, nombresExistentes)
  const listas = marcadas.filter((fila) => fila.servicio !== undefined && fila.error === undefined)
  const unificados = conCategoriasUnificadas(
    listas.map((fila) => fila.servicio!),
    categoriasExistentes
  )
  const porFila = new Map(listas.map((fila, i) => [fila.fila, unificados[i]]))
  return {
    filas: marcadas.map((fila) => (porFila.has(fila.fila) ? { fila: fila.fila, servicio: porFila.get(fila.fila)! } : fila)),
    titulosReconocidos: leido.titulosReconocidos,
    listas: listas.length,
    conProblemas: marcadas.length - listas.length,
    servicios: unificados,
  }
}

/** Hasta cuántas filas se dibujan en la vista previa: más que eso congela la página. Se revisan y se envían todas. */
export const FILAS_MAXIMAS_EN_LA_VISTA_PREVIA = 1000

/** Lo más que pesa un archivo CSV que se lee en el navegador. */
export const PESO_MAXIMO_DEL_ARCHIVO = 2 * 1024 * 1024

export type ResultadoDelArchivo =
  | { ok: true; texto: string }
  | { ok: false; motivo: "grande" | "vacio" | "excel" | "ilegible" }

/**
 * El texto de un archivo elegido, en el navegador. Hasta 2 MB. Se decodifica
 * con `decodificarCsv`: UTF-8 y, si no lo es, Windows-1252, que es como guarda
 * Excel en español ("Muñoz" no llega como "Mu�oz"). Un libro de Excel (.xlsx o
 * .xls) no se lee: se avisa para que lo guarden como CSV en vez de mostrar
 * basura en la tabla.
 */
export async function leerArchivoDeServicios(archivo: Blob): Promise<ResultadoDelArchivo> {
  if (archivo.size === 0) return { ok: false, motivo: "vacio" }
  if (archivo.size > PESO_MAXIMO_DEL_ARCHIVO) return { ok: false, motivo: "grande" }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await archivo.arrayBuffer())
  } catch {
    return { ok: false, motivo: "ilegible" }
  }
  const esZip = bytes[0] === 0x50 && bytes[1] === 0x4b // .xlsx es un zip
  const esOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 // .xls
  if (esZip || esOle) return { ok: false, motivo: "excel" }
  if (bytes.slice(0, 4096).includes(0)) return { ok: false, motivo: "ilegible" }
  return { ok: true, texto: decodificarCsv(bytes) }
}

/** Los títulos de la plantilla: los que `leerServiciosDeTexto` reconoce. */
export const TITULOS_DE_LA_PLANTILLA = ["Nombre", "Duración (min)", "Precio", "Categoría", "Descripción"] as const

/**
 * El CSV de la plantilla: los títulos y dos filas de ejemplo del rubro (los
 * servicios de ejemplo del rubro y, si no tiene, sus nombres y categorías de
 * ejemplo). Con el formato que abre bien Excel en español (`escribirCsv`).
 */
export function plantillaDeServicios(rubro: string | null): string {
  const propios = serviciosDeEjemplo(rubro ?? "").slice(0, 2)
  const ejemplos = ejemplosDe(rubro)
  const filas: (string | number)[][] =
    propios.length === 2
      ? propios.map((s) => [s.name, s.duration, s.price, s.category, ""])
      : [
          [ejemplos.servicios[0], 30, 10000, ejemplos.categorias[0], ""],
          [ejemplos.servicios[1] ?? ejemplos.servicios[0], 60, 20000, ejemplos.categorias[1] ?? ejemplos.categorias[0], ""],
        ]
  return escribirCsv([[...TITULOS_DE_LA_PLANTILLA], ...filas])
}

// ─── Agregar varios ──────────────────────────────────────────────────────────

/** Una fila de la tabla de "Agregar varios", como se escribe: el precio es texto. */
export interface FilaEditable {
  /** Identifica la fila mientras se edita, aunque se quiten otras. */
  clave: string
  name: string
  duration: number
  price: string
  category: string
  /** No se edita en la tabla: viene de lo que se pegó desde una planilla, y no se pierde. */
  description: string
}

export function filaEnBlanco(clave: string): FilaEditable {
  return { clave, name: "", duration: DURACION_POR_DEFECTO, price: "", category: "", description: "" }
}

/** Una fila sin nada escrito (la duración no cuenta: toda fila trae una). Se ignora al enviar. */
export function estaEnBlanco(fila: FilaEditable): boolean {
  return fila.name.trim() === "" && fila.price.trim() === "" && fila.category.trim() === ""
}

/** Las filas vacías con que empieza la tabla. */
export function filasEnBlanco(cantidad: number, nuevaClave: () => string): FilaEditable[] {
  return Array.from({ length: cantidad }, () => filaEnBlanco(nuevaClave()))
}

/**
 * La tabla después de pegar varios servicios en la fila `desde`: cada uno ocupa
 * una fila, empezando ahí. Si la fila que le toca está vacía se escribe en
 * ella; si no, se inserta una nueva y lo que había queda debajo. Nada de lo
 * escrito se pisa. La tabla no pasa de `maximo` filas: lo que no entra se
 * cuenta en `recortados`.
 */
export function repartirPegado(
  filas: readonly FilaEditable[],
  desde: number,
  pegados: readonly ServicioParaCargar[],
  nuevaClave: () => string,
  maximo = MAX_SERVICIOS_POR_LOTE
): { filas: FilaEditable[]; recortados: number } {
  const resultado = [...filas]
  let recortados = 0
  let posicion = desde
  for (const servicio of pegados) {
    const nueva: FilaEditable = {
      clave: nuevaClave(),
      name: servicio.name,
      duration: servicio.duration,
      price: servicio.price === null ? "" : montoParaEscribir(servicio.price),
      category: servicio.category ?? "",
      description: servicio.description ?? "",
    }
    const actual = resultado[posicion]
    if (actual && estaEnBlanco(actual)) resultado[posicion] = { ...nueva, clave: actual.clave }
    else if (resultado.length < maximo) resultado.splice(posicion, 0, nueva)
    else {
      recortados++
      continue
    }
    posicion++
  }
  return { filas: resultado, recortados }
}

/**
 * Lo que se pegó en la tabla, leído. Lo normal es una planilla (`leerServiciosDeTexto`:
 * nombre, duración, precio...). Pero lo más común al copiar de una planilla es una
 * sola columna de nombres: si ninguna línea se lee como un servicio completo y no
 * hay separadores (tabulación o punto y coma), cada línea es un nombre, con la
 * duración de siempre. `sinLeer` cuenta las líneas que no sirvieron.
 */
export function leerPegadoDeLaTabla(texto: string): { servicios: ServicioParaCargar[]; sinLeer: number } {
  const leido = leerServiciosDeTexto(texto)
  const completos = leido.filas.flatMap((fila) => (fila.servicio ? [fila.servicio] : []))
  if (completos.length > 0 || /[\t;]/.test(texto)) return { servicios: completos, sinLeer: leido.filas.length - completos.length }

  const lineas = texto.split(/\r\n|\r|\n/).filter((linea) => linea.trim() !== "")
  const servicios: ServicioParaCargar[] = []
  for (const linea of lineas) {
    const nombre = camposDeServicioParaCargar.name.safeParse(linea)
    if (nombre.success) {
      servicios.push({ name: nombre.data, duration: DURACION_POR_DEFECTO, price: null, category: null, description: null })
    }
  }
  return { servicios, sinLeer: lineas.length - servicios.length }
}

/** El resultado de revisar la tabla antes de enviarla. */
export interface RevisionDeLasFilas {
  /** Cuántas filas tienen algo escrito. */
  conContenido: number
  /** Los servicios de las filas sin problema, en orden (con las categorías unificadas). */
  servicios: ServicioParaCargar[]
  /** El primer problema de cada fila que lo tiene, por su `clave`. */
  errores: Map<string, string>
}

/**
 * Revisa las filas con algo escrito con las mismas reglas que el servidor
 * (`camposDeServicioParaCargar`: sus mensajes son los de ellas) y marca las que
 * repiten un nombre del negocio o a una fila de más arriba. Las filas vacías se
 * ignoran. El precio se lee como en lo pegado (`leerPrecio`): "15000", "$15.000".
 */
export function revisarFilas(
  filas: readonly FilaEditable[],
  nombresExistentes: readonly string[],
  categoriasExistentes: readonly string[]
): RevisionDeLasFilas {
  const errores = new Map<string, string>()
  const buenas: { clave: string; servicio: ServicioParaCargar }[] = []
  let conContenido = 0

  for (const fila of filas) {
    if (estaEnBlanco(fila)) continue
    conContenido++
    const resultado = leerFilaEditable(fila)
    if ("error" in resultado) errores.set(fila.clave, resultado.error)
    else buenas.push({ clave: fila.clave, servicio: resultado.servicio })
  }

  const veredictos = repetidosDe(
    buenas.map((b) => b.servicio.name),
    nombresExistentes
  )
  const sinRepetidos: ServicioParaCargar[] = []
  buenas.forEach(({ clave, servicio }, i) => {
    if (veredictos[i] === "existente") errores.set(clave, MOTIVO_YA_EXISTE)
    else if (veredictos[i] === "repetido") errores.set(clave, MOTIVO_REPETIDO_EN_EL_LOTE)
    else sinRepetidos.push(servicio)
  })
  return { conContenido, servicios: conCategoriasUnificadas(sinRepetidos, categoriasExistentes), errores }
}

function leerFilaEditable(fila: FilaEditable): { servicio: ServicioParaCargar } | { error: string } {
  const nombre = camposDeServicioParaCargar.name.safeParse(fila.name)
  if (!nombre.success) return { error: nombre.error.issues[0].message }

  const duracionLeida = camposDeServicioParaCargar.duration.safeParse(fila.duration)
  if (!duracionLeida.success) return { error: duracionLeida.error.issues[0].message }

  let monto: number | null = null
  if (fila.price.trim() !== "") {
    monto = leerPrecio(fila.price)
    if (monto === null) return { error: `El precio "${fila.price.trim()}" no se entiende: escribe sólo el monto (15000 o $15.000)` }
  }
  const precio = camposDeServicioParaCargar.price.safeParse(monto)
  if (!precio.success) return { error: precio.error.issues[0].message }

  const categoria = camposDeServicioParaCargar.category.safeParse(fila.category)
  if (!categoria.success) return { error: categoria.error.issues[0].message }

  const descripcion = camposDeServicioParaCargar.description.safeParse(fila.description)
  if (!descripcion.success) return { error: descripcion.error.issues[0].message }

  return {
    servicio: { name: nombre.data, duration: duracionLeida.data, price: precio.data, category: categoria.data, description: descripcion.data },
  }
}

// ─── Sugeridos del rubro ─────────────────────────────────────────────────────

/** Un servicio sugerido, con lo que el servidor sabe: si el negocio ya tiene uno con ese nombre. */
export type SugeridoDelRubro = ServicioSugerido & { yaExiste: boolean }

/** Un sugerido tal como se dibuja: `yaLoTiene` suma lo que se agregó desde que se pidió la lista. */
export type SugeridoParaElegir = SugeridoDelRubro & { yaLoTiene: boolean }

export interface VistaDeSugeridos {
  /** Los que pasan la búsqueda, por categoría, en el orden en que llegaron. */
  grupos: GrupoDeServicios<SugeridoParaElegir>[]
  /** Cuántos pasan la búsqueda. */
  visibles: number
  /** Las claves de los visibles que se pueden marcar (los que el negocio todavía no tiene). */
  marcables: string[]
}

/**
 * Los sugeridos que pasan la búsqueda (nombre o categoría, sin mayúsculas ni
 * tildes), agrupados por categoría. "Ya lo tiene" es lo que dijo el servidor o
 * un nombre que ahora está en el negocio (se pudo agregar después de pedir la
 * lista), comparado sin mayúsculas ni tildes.
 */
export function vistaDeSugeridos(
  sugeridos: readonly SugeridoDelRubro[],
  texto: string,
  nombresExistentes: readonly string[]
): VistaDeSugeridos {
  const existentes = new Set(nombresExistentes.map(normalizarNombre))
  const palabras = normalizarParaBuscar(texto).split(" ").filter(Boolean)
  const visibles = sugeridos
    .filter((sugerido) => {
      if (palabras.length === 0) return true
      const paja = normalizarParaBuscar(`${sugerido.name} ${sugerido.category ?? ""}`)
      return palabras.every((palabra) => paja.includes(palabra))
    })
    .map((sugerido): SugeridoParaElegir => ({ ...sugerido, yaLoTiene: sugerido.yaExiste || existentes.has(normalizarNombre(sugerido.name)) }))
  return {
    grupos: agruparPorCategoria(visibles),
    visibles: visibles.length,
    marcables: visibles.filter((sugerido) => !sugerido.yaLoTiene).map((sugerido) => sugerido.clave),
  }
}

/**
 * Los sugeridos marcados como servicios para cargar, tal cual (nombre,
 * duración, precio y categoría del sugerido; sin descripción), con la categoría
 * escrita como ya la tiene el negocio. Los que el negocio ya tiene no van, aunque
 * sigan marcados. Una carga nunca marca urgencias (`ServicioParaCargar`): quien
 * la quiere la marca después, al editar.
 */
export function sugeridosParaCargar(
  sugeridos: readonly SugeridoDelRubro[],
  seleccion: ReadonlySet<string>,
  nombresExistentes: readonly string[],
  categoriasExistentes: readonly string[]
): ServicioParaCargar[] {
  const existentes = new Set(nombresExistentes.map(normalizarNombre))
  const elegidos = sugeridos
    .filter((sugerido) => seleccion.has(sugerido.clave) && !sugerido.yaExiste && !existentes.has(normalizarNombre(sugerido.name)))
    .map(
      (sugerido): ServicioParaCargar => ({
        name: sugerido.name,
        duration: sugerido.duration,
        price: sugerido.price ?? null,
        category: sugerido.category?.trim() ? sugerido.category.trim() : null,
        description: null,
      })
    )
  return conCategoriasUnificadas(elegidos, categoriasExistentes)
}
