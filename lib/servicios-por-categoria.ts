/**
 * Los servicios ordenados por categoría: lo que usan la mini página (el bloque
 * "Servicios") y el primer paso de la reserva (`SelectorServicio`) para que
 * quien reserva no tenga que recorrer una lista larga. Sólo lógica, sin base ni
 * pantalla.
 *
 * Una sola regla para los dos:
 *
 * - `Service.category` es texto libre y opcional. Se agrupa sin mayúsculas ni
 *   espacios de más ("Color" y "color " son la misma) y se muestra como la
 *   escribió el primero.
 * - Las categorías van en el orden en que aparecen en el catálogo (el de
 *   creación). Los sin categoría van al final, en "Otros"; una categoría que
 *   alguien escribió "Otros" es esa misma, no una segunda.
 * - Nada se muta: todas devuelven listas nuevas y conservan el orden del
 *   catálogo dentro de cada grupo.
 *
 * El selector no agrupa siempre. Una lista corta se lee de corrido, y con una
 * sola categoría (o ninguna) los títulos no ayudan: `formaDelCatalogo` decide.
 */

// ─── Categorías ──────────────────────────────────────────────────────────────

/** Lo que se muestra de los servicios sin categoría. */
export const CATEGORIA_SIN_NOMBRE = "Otros"

/** La clave de "Otros": la de los sin categoría, y la de quien escribió "Otros". */
const CLAVE_DE_OTROS = CATEGORIA_SIN_NOMBRE.toLocaleLowerCase("es-CL")

/**
 * La clave de una categoría: el texto sin espacios en las puntas y en
 * minúscula. Sin categoría (o sólo espacios) es la de "Otros". Es lo que
 * identifica a un grupo, y lo que guarda el filtro del selector.
 */
export function claveDeCategoria(categoria: string | null | undefined): string {
  const clave = (categoria ?? "").trim().toLocaleLowerCase("es-CL")
  return clave === "" ? CLAVE_DE_OTROS : clave
}

export interface GrupoDeServicios<T> {
  /** `claveDeCategoria`: única entre los grupos de una misma lista. */
  clave: string
  /** Como se muestra: la escribió el primero, o "Otros". */
  categoria: string
  servicios: T[]
}

/**
 * Los servicios agrupados por categoría, en el orden en que aparece cada una
 * y con "Otros" siempre al final. Sin servicios, sin grupos.
 */
export function agruparPorCategoria<T extends { category?: string | null }>(servicios: readonly T[]): GrupoDeServicios<T>[] {
  const grupos = new Map<string, GrupoDeServicios<T>>()
  for (const servicio of servicios) {
    const clave = claveDeCategoria(servicio.category)
    let grupo = grupos.get(clave)
    if (!grupo) {
      grupo = { clave, categoria: clave === CLAVE_DE_OTROS ? CATEGORIA_SIN_NOMBRE : (servicio.category ?? "").trim(), servicios: [] }
      grupos.set(clave, grupo)
    }
    grupo.servicios.push(servicio)
  }
  const otros = grupos.get(CLAVE_DE_OTROS)
  grupos.delete(CLAVE_DE_OTROS)
  return otros ? [...grupos.values(), otros] : [...grupos.values()]
}

/** Cuántos servicios hay en cada categoría (por `claveDeCategoria`). Una categoría sin servicios no aparece. */
export function contarPorCategoria(servicios: readonly { category?: string | null }[]): Map<string, number> {
  const cuenta = new Map<string, number>()
  for (const servicio of servicios) {
    const clave = claveDeCategoria(servicio.category)
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
  }
  return cuenta
}

// ─── Búsqueda ────────────────────────────────────────────────────────────────

/**
 * El texto listo para comparar: en minúscula, sin tildes ni diéresis ("Depilación"
 * y "depilacion" son lo mismo; la ñ también pierde su tilde) y con los espacios
 * en uno solo. Quien busca no escribe las tildes de la misma forma que quien
 * cargó el catálogo.
 */
export function normalizarParaBuscar(texto: string): string {
  return texto
    .toLocaleLowerCase("es-CL")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Lo que se busca en un servicio: su nombre y su descripción. */
export interface ServicioBuscable {
  name: string
  description: string | null
  category?: string | null
}

/** El filtro del selector: una categoría (su `clave`; `null`, todas) y un texto (vacío: sin búsqueda). */
export interface FiltroDeServicios {
  categoria: string | null
  texto: string
}

/** Sin filtrar. Siempre el mismo objeto, para saber por identidad si hay algo que ajustar. */
export const SIN_FILTRO: FiltroDeServicios = { categoria: null, texto: "" }

/**
 * Los servicios de la categoría (por `clave`) cuyo nombre o descripción
 * contienen todas las palabras del texto, sin distinguir mayúsculas ni tildes.
 * Sin categoría o sin texto no filtra por eso. Conserva el orden del catálogo
 * y devuelve una lista nueva.
 */
export function filtrarServicios<T extends ServicioBuscable>(
  servicios: readonly T[],
  filtro: { categoria?: string | null; texto?: string }
): T[] {
  const palabras = normalizarParaBuscar(filtro.texto ?? "").split(" ").filter(Boolean)
  const categoria = filtro.categoria ?? null
  return servicios.filter((servicio) => {
    if (categoria !== null && claveDeCategoria(servicio.category) !== categoria) return false
    if (palabras.length === 0) return true
    const paja = normalizarParaBuscar(`${servicio.name} ${servicio.description ?? ""}`)
    return palabras.every((palabra) => paja.includes(palabra))
  })
}

// ─── La forma del catálogo en el selector ────────────────────────────────────

/** Hasta cuántos servicios se ven de corrido, sin títulos ni filtros. */
export const MAXIMO_SIN_AGRUPAR = 8
/** Hasta cuántos se ven sin la caja de búsqueda. */
export const MAXIMO_SIN_BUSCADOR = 12

/**
 * Cómo se muestra una lista de servicios:
 *
 * - `agrupado`: más de `MAXIMO_SIN_AGRUPAR` servicios y al menos 2 categorías
 *   ("Otros" cuenta como una). Títulos por categoría y barra de filtros. Con 8
 *   o menos, o con una sola categoría (o todos sin categoría), se ve la lista
 *   de siempre.
 * - `conBuscador`: además, más de `MAXIMO_SIN_BUSCADOR` servicios.
 *
 * Se calcula sobre los servicios que quien reserva ve: con un profesional
 * elegido, sólo los que hace.
 */
export function formaDelCatalogo(servicios: readonly { category?: string | null }[]): { agrupado: boolean; conBuscador: boolean } {
  const agrupado = servicios.length > MAXIMO_SIN_AGRUPAR && contarPorCategoria(servicios).size >= 2
  return { agrupado, conBuscador: agrupado && servicios.length > MAXIMO_SIN_BUSCADOR }
}

/**
 * El filtro que sigue valiendo para esos servicios. Si la lista dejó de
 * agruparse no hay filtro de categoría; si dejó de tener buscador no hay
 * texto; y una categoría que ya no existe (se eligió a otro profesional) vuelve
 * a "todos". Si todo sigue valiendo devuelve el mismo objeto que recibió.
 */
export function ajustarFiltro(filtro: FiltroDeServicios, servicios: readonly { category?: string | null }[]): FiltroDeServicios {
  const { agrupado, conBuscador } = formaDelCatalogo(servicios)
  if (!agrupado) return filtro.categoria === null && filtro.texto === "" ? filtro : SIN_FILTRO
  const categoria = filtro.categoria !== null && contarPorCategoria(servicios).has(filtro.categoria) ? filtro.categoria : null
  const texto = conBuscador ? filtro.texto : ""
  return categoria === filtro.categoria && texto === filtro.texto ? filtro : { categoria, texto }
}

/** Lo que el selector pinta: los botones de la barra, y los servicios que pasan el filtro. */
export interface VistaDelCatalogo<T> {
  agrupado: boolean
  conBuscador: boolean
  /** El filtro vigente (`ajustarFiltro`): si no es el que se tenía, hay que guardarlo. */
  filtro: FiltroDeServicios
  /** Si se está buscando algo (el texto tiene letras). */
  conBusqueda: boolean
  /**
   * Un botón por categoría, en el orden del catálogo, con cuántos servicios
   * pasan la búsqueda (no cuenta cuál categoría está elegida): la barra no
   * cambia mientras se escribe, sólo sus números. Sólo categorías que tienen
   * servicios en la lista, aunque la búsqueda deje a alguna en 0.
   */
  categorias: { clave: string; categoria: string; cantidad: number }[]
  /** Lo que dice "Todos": cuántos servicios pasan la búsqueda, de cualquier categoría. */
  cantidadTotal: number
  /** Los que pasan el filtro, en el orden del catálogo. Sin agrupar, todos. */
  resultados: T[]
  /** Los resultados por categoría, sin los grupos vacíos. Sin agrupar, ninguno. */
  grupos: GrupoDeServicios<T>[]
}

export function vistaDelCatalogo<T extends ServicioBuscable>(
  servicios: readonly T[],
  filtroActual: FiltroDeServicios = SIN_FILTRO
): VistaDelCatalogo<T> {
  const forma = formaDelCatalogo(servicios)
  const filtro = ajustarFiltro(filtroActual, servicios)
  if (!forma.agrupado) {
    return { ...forma, filtro, conBusqueda: false, categorias: [], cantidadTotal: servicios.length, resultados: [...servicios], grupos: [] }
  }
  const segunLaBusqueda = filtrarServicios(servicios, { texto: filtro.texto })
  const cuenta = contarPorCategoria(segunLaBusqueda)
  const resultados = filtrarServicios(segunLaBusqueda, { categoria: filtro.categoria })
  return {
    ...forma,
    filtro,
    conBusqueda: normalizarParaBuscar(filtro.texto) !== "",
    categorias: agruparPorCategoria(servicios).map(({ clave, categoria }) => ({ clave, categoria, cantidad: cuenta.get(clave) ?? 0 })),
    cantidadTotal: segunLaBusqueda.length,
    resultados,
    grupos: agruparPorCategoria(resultados),
  }
}
