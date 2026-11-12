/**
 * La lista de servicios de Configuración, sin pantalla: qué se ve con el
 * buscador y el filtro de activos, cómo se agrupa por categoría y qué pasa
 * con la lista cuando se cambia la categoría de varios, se las renombra o se
 * activan o desactivan a la vez.
 *
 * El orden de las categorías es el de la reserva pública
 * (`agruparPorCategoria`, `lib/servicios-por-categoria.ts`): el del catálogo
 * completo, con los sin categoría al final. Un filtro no lo cambia: si la
 * primera de "Color" queda escondida por el filtro, "Color" no pasa a ir
 * después de "Corte".
 *
 * Nada se muta: todas las funciones devuelven listas nuevas.
 */

import {
  MAXIMO_SIN_BUSCADOR,
  agruparPorCategoria,
  claveDeCategoria,
  normalizarParaBuscar,
  type GrupoDeServicios,
} from "@/lib/servicios-por-categoria"

// ─── Buscar y filtrar ────────────────────────────────────────────────────────

export type EstadoDelFiltro = "todos" | "activos" | "inactivos"

export interface FiltroDeLaLista {
  /** Lo que se busca en el nombre y en la categoría; vacío es sin búsqueda. */
  texto: string
  estado: EstadoDelFiltro
}

/** Sin filtrar. Siempre el mismo objeto, para saber por identidad si hay algo que ajustar. */
export const SIN_FILTRO_DE_LA_LISTA: FiltroDeLaLista = { texto: "", estado: "todos" }

/** Lo que la lista necesita saber de un servicio. */
export interface ServicioDeLaLista {
  id: string
  name: string
  category: string | null
  active: boolean
}

/**
 * Si la lista es lo bastante larga para el buscador y el filtro de activos: los
 * mismos más de 12 servicios que en la reserva pública. Con menos se lee de un
 * vistazo y una caja de búsqueda sólo estorba.
 */
export function llevaFiltros(totalDeServicios: number): boolean {
  return totalDeServicios > MAXIMO_SIN_BUSCADOR
}

/**
 * El filtro que sigue valiendo: si la lista dejó de llevar filtros (se
 * eliminaron servicios) no puede quedar uno escondido que oculte cosas. Si todo
 * sigue valiendo devuelve el mismo objeto que recibió.
 */
export function ajustarFiltroDeLaLista(filtro: FiltroDeLaLista, totalDeServicios: number): FiltroDeLaLista {
  if (llevaFiltros(totalDeServicios)) return filtro
  return filtro.texto === "" && filtro.estado === "todos" ? filtro : SIN_FILTRO_DE_LA_LISTA
}

/**
 * Los servicios cuyo nombre o categoría contienen todas las palabras del texto,
 * sin distinguir mayúsculas ni tildes, y que son del estado pedido. Conserva el
 * orden del catálogo.
 */
export function filtrarLista<T extends ServicioDeLaLista>(servicios: readonly T[], filtro: FiltroDeLaLista): T[] {
  const palabras = normalizarParaBuscar(filtro.texto).split(" ").filter(Boolean)
  return servicios.filter((servicio) => {
    if (filtro.estado === "activos" && !servicio.active) return false
    if (filtro.estado === "inactivos" && servicio.active) return false
    if (palabras.length === 0) return true
    const paja = normalizarParaBuscar(`${servicio.name} ${servicio.category ?? ""}`)
    return palabras.every((palabra) => paja.includes(palabra))
  })
}

// ─── Agrupar ─────────────────────────────────────────────────────────────────

export interface GrupoDeLaLista<T> extends GrupoDeServicios<T> {
  /**
   * Ninguno de los servicios del grupo tiene categoría. El grupo "Otros" de la
   * reserva pública junta a los sin categoría con los que alguien llamó
   * "Otros"; en el panel sólo el primero se dice "Sin categoría" y no tiene
   * nada que renombrar.
   */
  sinCategoria: boolean
}

export interface VistaDeLaLista<T> {
  /** Si se dibujan el buscador y el filtro de activos. */
  conFiltros: boolean
  /** El filtro vigente (`ajustarFiltroDeLaLista`). */
  filtro: FiltroDeLaLista
  /** Si hay una búsqueda con letras. */
  buscando: boolean
  /** Si el filtro deja fuera algo (hay búsqueda o no se piden todos). */
  filtrando: boolean
  /** Los que pasan el filtro, en el orden del catálogo. */
  visibles: T[]
  /** Lo visible por categoría, sin los grupos vacíos, en el orden de la reserva pública. */
  grupos: GrupoDeLaLista<T>[]
  /** Cuántos servicios hay en total, sin filtrar. */
  total: number
}

export function vistaDeLaLista<T extends ServicioDeLaLista>(
  servicios: readonly T[],
  filtroActual: FiltroDeLaLista = SIN_FILTRO_DE_LA_LISTA
): VistaDeLaLista<T> {
  const filtro = ajustarFiltroDeLaLista(filtroActual, servicios.length)
  const visibles = filtrarLista(servicios, filtro)
  const pasan = new Set(visibles.map((servicio) => servicio.id))
  // El orden y el nombre de cada grupo salen del catálogo entero, no de lo que queda visible.
  const grupos = agruparPorCategoria(servicios).flatMap((grupo): GrupoDeLaLista<T>[] => {
    const visiblesDelGrupo = grupo.servicios.filter((servicio) => pasan.has(servicio.id))
    if (visiblesDelGrupo.length === 0) return []
    return [
      {
        ...grupo,
        servicios: visiblesDelGrupo,
        sinCategoria: grupo.servicios.every((servicio) => (servicio.category ?? "").trim() === ""),
      },
    ]
  })
  return {
    conFiltros: llevaFiltros(servicios.length),
    filtro,
    buscando: normalizarParaBuscar(filtro.texto) !== "",
    filtrando: normalizarParaBuscar(filtro.texto) !== "" || filtro.estado !== "todos",
    visibles,
    grupos,
    total: servicios.length,
  }
}

// ─── Categorías ──────────────────────────────────────────────────────────────

/**
 * Las categorías que usa el catálogo, una por cada una (sin distinguir
 * mayúsculas ni espacios de más), escrita como la escribió el primero, en el
 * orden de la reserva pública. Los sin categoría no son una categoría.
 */
export function categoriasDe(servicios: readonly { category?: string | null }[]): string[] {
  return agruparPorCategoria(servicios.filter((servicio) => (servicio.category ?? "").trim() !== "")).map(
    (grupo) => grupo.categoria
  )
}

/**
 * Cómo se guarda una categoría que alguien escribió: si ya existe una igual sin
 * contar mayúsculas ni espacios de más, la existente tal como está escrita (así
 * "color" no se vuelve una segunda categoría junto a "Color"); si no, lo
 * escrito sin los espacios de las puntas. Vacío es "sin categoría" y queda vacío.
 */
export function categoriaCanonica(existentes: readonly string[], texto: string): string {
  const limpio = texto.trim()
  if (limpio === "") return ""
  const clave = claveDeCategoria(limpio)
  return existentes.find((existente) => claveDeCategoria(existente) === clave) ?? limpio
}

/**
 * Cómo está escrita hoy una categoría en la base: cada escritura distinta de
 * los servicios que la tienen ("Color" y "color " son una sola categoría con
 * dos escrituras). Quien renombra manda cada una, para no depender de cómo
 * compara el servidor.
 */
export function escriturasDeLaCategoria(servicios: readonly { category?: string | null }[], clave: string): string[] {
  const escrituras = new Set<string>()
  for (const servicio of servicios) {
    const escritura = (servicio.category ?? "").trim()
    if (escritura !== "" && claveDeCategoria(escritura) === clave) escrituras.add(escritura)
  }
  return [...escrituras]
}

/** Cuántos servicios tienen la categoría `clave` puesta (los sin categoría no cuentan, aunque "Otros" los junte en la reserva pública). */
export function contarDeLaCategoria(servicios: readonly { category?: string | null }[], clave: string): number {
  return servicios.filter((servicio) => (servicio.category ?? "").trim() !== "" && claveDeCategoria(servicio.category) === clave).length
}

/** Qué pasaría al renombrar una categoría con el nombre que se escribió. */
export type PlanDeRenombre =
  /** No se escribió nada. */
  | { tipo: "vacio" }
  /** Ya se llama así, sin escrituras distintas que unificar: no hay nada que hacer. */
  | { tipo: "igual" }
  /** Es la misma categoría con otras mayúsculas, o junta sus escrituras en una. */
  | { tipo: "corregir"; nuevo: string }
  /** Un nombre que ninguna otra categoría usa. */
  | { tipo: "renombrar"; nuevo: string }
  /** Otra categoría ya se llama así: los servicios pasan a ella, con su escritura. */
  | { tipo: "unir"; nuevo: string; conLosDe: number }

export function planDeRenombre(
  servicios: readonly { category?: string | null }[],
  claveActual: string,
  texto: string
): PlanDeRenombre {
  const limpio = texto.trim()
  if (limpio === "") return { tipo: "vacio" }
  const claveNueva = claveDeCategoria(limpio)
  if (claveNueva === claveActual) {
    const todasIguales = escriturasDeLaCategoria(servicios, claveActual).every((escritura) => escritura === limpio)
    return todasIguales ? { tipo: "igual" } : { tipo: "corregir", nuevo: limpio }
  }
  const destino = categoriasDe(servicios).find((categoria) => claveDeCategoria(categoria) === claveNueva)
  if (destino === undefined) return { tipo: "renombrar", nuevo: limpio }
  const conLosDe = servicios.filter((servicio) => claveDeCategoria(servicio.category) === claveNueva).length
  return { tipo: "unir", nuevo: destino, conLosDe }
}

// ─── Cambios en la lista ─────────────────────────────────────────────────────

/** Los servicios con la categoría de estos cambiada. `null` los deja sin categoría. */
export function conCategoria<T extends { id: string; category: string | null }>(
  servicios: readonly T[],
  ids: ReadonlySet<string>,
  categoria: string | null
): T[] {
  return servicios.map((servicio) => (ids.has(servicio.id) ? { ...servicio, category: categoria } : servicio))
}

/** Los servicios con estos activados o desactivados. */
export function conActivo<T extends { id: string; active: boolean }>(
  servicios: readonly T[],
  ids: ReadonlySet<string>,
  activo: boolean
): T[] {
  return servicios.map((servicio) => (ids.has(servicio.id) ? { ...servicio, active: activo } : servicio))
}

/**
 * Los servicios de la categoría `clave` con su nombre cambiado (`null`, sin
 * categoría). Es lo que hace el servidor al renombrarla; la pantalla lo
 * refleja sin volver a pedir la lista.
 */
export function conCategoriaRenombrada<T extends { category: string | null }>(
  servicios: readonly T[],
  clave: string,
  nuevo: string | null
): T[] {
  return servicios.map((servicio) =>
    (servicio.category ?? "").trim() !== "" && claveDeCategoria(servicio.category) === clave
      ? { ...servicio, category: nuevo }
      : servicio
  )
}

/**
 * La lista que se tenía al día con la que trajo el servidor: lo que ya estaba se
 * reemplaza por su versión nueva (en el mismo lugar) y lo que no estaba se
 * agrega al final. No quita nada: si el servidor entregó menos de lo que hay,
 * no se pierde de vista lo que ya se había cargado.
 */
export function fusionarServicios<T extends { id: string }>(actuales: readonly T[], traidos: readonly T[]): T[] {
  const nuevos = new Map(traidos.map((servicio) => [servicio.id, servicio]))
  const conocidos = new Set(actuales.map((servicio) => servicio.id))
  return [
    ...actuales.map((servicio) => nuevos.get(servicio.id) ?? servicio),
    ...traidos.filter((servicio) => !conocidos.has(servicio.id)),
  ]
}
