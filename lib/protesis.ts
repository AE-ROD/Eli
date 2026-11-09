import { comisionEnCentavos } from "@/lib/comisiones"
import { esRubroDental } from "@/lib/rubros"
import { cuadranteDe, esPiezaValida, piezasDelCuadrante } from "@/lib/odontograma"

/**
 * Reglas de las prótesis de la clínica dental (docs/PRODUCTO.md, "Clínica
 * dental"): tipos y materiales, el diseño sobre la arcada, el precio, el
 * reparto en tres partes y el seguimiento. Funciones puras, sin base ni
 * sesión: las usan los endpoints (`lib/protesis-servidor.ts`) y la pantalla.
 * Quién ve y escribe vive en `lib/permisos.ts`.
 *
 * La migración `20261108120000_etapa_7_protesis` repite estas reglas en
 * CHECKs y triggers: si cambia una, cambia la otra.
 *
 * - Dinero en centavos enteros, con el tope de siempre (2.000.000.000).
 * - Porcentajes en puntos base: 10.000 = 100 %. Las tres partes de un reparto
 *   suman exactamente 10.000.
 * - Piezas en FDI permanente (11 a 48): la prótesis no se hace sobre
 *   temporales. La arcada superior son los cuadrantes 1 y 2; la inferior, 3 y 4.
 * - Sin cordales: las piezas que terminan en 8 (18, 28, 38, 48) no son
 *   piezas protésicas ni pilares, y la total no las cuenta.
 *
 * La migración `20261109120000_etapa_7c_protesis_por_tipo` cambió las
 * etapas (por tipo), sacó los cordales y agregó el tono.
 */

/** El tope del dinero en centavos, el de `lib/atenciones.ts` y los CHECK de la base. */
export const TOPE_DE_CENTAVOS = 2_000_000_000

/** Puntos base en un 100 %. */
export const PUNTOS_BASE_DEL_TOTAL = 10_000

// ─── Catálogos ───────────────────────────────────────────────────────────────

export const TIPOS_DE_PROTESIS = [
  { id: "removible", nombre: "Removible parcial", detalle: "Con ganchos" },
  { id: "total", nombre: "Total", detalle: "Arcada completa" },
  { id: "fija", nombre: "Fija o puente", detalle: "Pónticos y pilares" },
  { id: "implante", nombre: "Sobre implantes", detalle: "Atornillada o cementada" },
  { id: "corona", nombre: "Corona unitaria", detalle: "Una pieza" },
] as const
export type TipoDeProtesis = (typeof TIPOS_DE_PROTESIS)[number]["id"]
export const IDS_DE_TIPOS = TIPOS_DE_PROTESIS.map((tipo) => tipo.id) as [TipoDeProtesis, ...TipoDeProtesis[]]

export const ARCADAS = [
  { id: "superior", nombre: "Superior" },
  { id: "inferior", nombre: "Inferior" },
  { id: "ambas", nombre: "Ambas" },
] as const
export type Arcada = (typeof ARCADAS)[number]["id"]
export const IDS_DE_ARCADAS = ARCADAS.map((arcada) => arcada.id) as [Arcada, ...Arcada[]]

/** Las zonas de la base, en el orden en que se nombran. Sólo en removible y total. */
export const ZONAS_DE_LA_BASE = [
  { id: "paladar", nombre: "Paladar" },
  { id: "lingual", nombre: "Barra lingual" },
  { id: "flanco", nombre: "Flanco vestibular" },
  { id: "rebasado", nombre: "Rebasado" },
  { id: "reparacion", nombre: "Reparación de base" },
] as const
export type ZonaDeLaBase = (typeof ZONAS_DE_LA_BASE)[number]["id"]
export const IDS_DE_ZONAS = ZONAS_DE_LA_BASE.map((zona) => zona.id) as [ZonaDeLaBase, ...ZonaDeLaBase[]]

/** Cómo se cobra un material: por arcada (removible y total) o por pieza (fija, implante y corona). */
export const UNIDADES = [
  { id: "arcada", nombre: "arcada", plural: "arcadas", tipos: ["removible", "total"] },
  { id: "pieza", nombre: "pieza", plural: "piezas", tipos: ["fija", "implante", "corona"] },
] as const
export type Unidad = (typeof UNIDADES)[number]["id"]
export const IDS_DE_UNIDADES = UNIDADES.map((unidad) => unidad.id) as [Unidad, ...Unidad[]]

/**
 * Los estados de una prótesis: los pasos del seguimiento (cada tipo usa los
 * suyos, `pasosDelTipo`) y "Anulada", que va aparte: se llega desde
 * cualquier paso antes de entregar.
 */
export const ESTADOS_DE_PROTESIS = [
  { id: "impresion", nombre: "Toma de impresión" },
  { id: "rodete", nombre: "Prueba de rodete" },
  { id: "enfilado", nombre: "Prueba de enfilado" },
  { id: "prueba", nombre: "Prueba" },
  { id: "entregada", nombre: "Entregada" },
  { id: "anulada", nombre: "Anulada" },
] as const
export type EstadoDeProtesis = (typeof ESTADOS_DE_PROTESIS)[number]["id"]
export type PasoDelSeguimiento = Exclude<EstadoDeProtesis, "anulada">
export const IDS_DE_ESTADOS = ESTADOS_DE_PROTESIS.map((estado) => estado.id) as [EstadoDeProtesis, ...EstadoDeProtesis[]]

/**
 * Las etapas de cada tipo, en orden (decisión del dueño, 2026-11-09). La
 * removible y la total pasan por rodete y enfilado; la fija, la corona y la
 * de implantes, por una sola prueba. Todas empiezan en la toma de impresión y
 * terminan en "Entregada", que libera la liquidación. El laboratorio es un
 * dato de la prótesis, no un paso.
 */
export const PASOS_POR_TIPO: Readonly<Record<TipoDeProtesis, readonly PasoDelSeguimiento[]>> = {
  removible: ["impresion", "rodete", "enfilado", "entregada"],
  total: ["impresion", "rodete", "enfilado", "entregada"],
  fija: ["impresion", "prueba", "entregada"],
  implante: ["impresion", "prueba", "entregada"],
  corona: ["impresion", "prueba", "entregada"],
}

/** Los pasos de un tipo, en orden (copia). */
export function pasosDelTipo(tipo: TipoDeProtesis): PasoDelSeguimiento[] {
  return [...PASOS_POR_TIPO[tipo]]
}

/** Si el estado es un paso del seguimiento de ese tipo ("anulada" no es un paso). */
export function esPasoDelTipo(tipo: TipoDeProtesis, estado: string): estado is PasoDelSeguimiento {
  return PASOS_POR_TIPO[tipo].includes(estado as PasoDelSeguimiento)
}

/** De dónde salió el reparto congelado: la regla del material o la excepción de la tratante. */
export type OrigenDelReparto = "material" | "excepcion"

const nombreEn = (lista: readonly { id: string; nombre: string }[], id: string, siNo: string) =>
  lista.find((item) => item.id === id)?.nombre ?? siNo

export const nombreDeTipo = (id: string) => nombreEn(TIPOS_DE_PROTESIS, id, "Prótesis")
export const nombreDeArcada = (id: string) => nombreEn(ARCADAS, id, "Arcada desconocida")
export const nombreDeZona = (id: string) => nombreEn(ZONAS_DE_LA_BASE, id, "Zona desconocida")
export const nombreDeEstado = (id: string) => nombreEn(ESTADOS_DE_PROTESIS, id, "Estado desconocido")

export const esTipoDeProtesis = (valor: unknown): valor is TipoDeProtesis => IDS_DE_TIPOS.includes(valor as TipoDeProtesis)
export const esArcada = (valor: unknown): valor is Arcada => IDS_DE_ARCADAS.includes(valor as Arcada)
export const esZona = (valor: unknown): valor is ZonaDeLaBase => IDS_DE_ZONAS.includes(valor as ZonaDeLaBase)
export const esUnidad = (valor: unknown): valor is Unidad => IDS_DE_UNIDADES.includes(valor as Unidad)
export const esEstadoDeProtesis = (valor: unknown): valor is EstadoDeProtesis =>
  IDS_DE_ESTADOS.includes(valor as EstadoDeProtesis)

// ─── Tipos y materiales ──────────────────────────────────────────────────────

/** La unidad con que se cobra un tipo: removible y total, por arcada; el resto, por pieza. */
export function unidadDelTipo(tipo: TipoDeProtesis): Unidad {
  return tipo === "removible" || tipo === "total" ? "arcada" : "pieza"
}

/** Los tipos que admite un material de esa unidad. */
export function tiposDeLaUnidad(unidad: Unidad): TipoDeProtesis[] {
  return [...(UNIDADES.find((u) => u.id === unidad)?.tipos ?? [])]
}

/** Si el tipo lleva base (y por lo tanto zonas de la base): removible y total. */
export const llevaBase = (tipo: TipoDeProtesis): boolean => unidadDelTipo(tipo) === "arcada"

/**
 * Si los tipos de un material son válidos para su unidad: al menos uno, sin
 * repetir, y todos de esa unidad (CHECK `materiales_de_protesis_tipos_check`).
 * Devuelve el error o `null`.
 */
export function errorDeTiposDelMaterial(unidad: Unidad, tipos: readonly string[]): string | null {
  if (tipos.length === 0) return "Elige al menos un tipo de prótesis para el material"
  if (new Set(tipos).size !== tipos.length) return "Un tipo de prótesis está repetido"
  const admitidos = tiposDeLaUnidad(unidad)
  const ajeno = tipos.find((tipo) => !admitidos.includes(tipo as TipoDeProtesis))
  if (ajeno !== undefined) {
    return unidad === "arcada"
      ? "Un material por arcada sirve para removible o total"
      : "Un material por pieza sirve para fija, sobre implantes o corona"
  }
  return null
}

/** Los tipos en el orden del catálogo, sin repetir. */
export function ordenarTipos(tipos: readonly string[]): TipoDeProtesis[] {
  return IDS_DE_TIPOS.filter((tipo) => tipos.includes(tipo))
}

/** Lo que hace falta saber de un material para ofrecerlo a un tipo. */
export interface MaterialParaElegir {
  tipos: readonly string[]
  unidad: string
  activo: boolean
}

/** Si el material sirve para ese tipo: activo, de la unidad del tipo y con el tipo en su lista. */
export function esMaterialCompatible(material: MaterialParaElegir, tipo: TipoDeProtesis): boolean {
  return material.activo && material.unidad === unidadDelTipo(tipo) && material.tipos.includes(tipo)
}

// ─── El diseño sobre la arcada ───────────────────────────────────────────────

const SUPERIOR = [1, 2]
const INFERIOR = [3, 4]

/** Los cuadrantes (permanentes) de una arcada. */
export function cuadrantesDeLaArcada(arcada: Arcada): number[] {
  if (arcada === "superior") return SUPERIOR
  if (arcada === "inferior") return INFERIOR
  return [...SUPERIOR, ...INFERIOR]
}

/**
 * Las piezas permanentes de la arcada, cuadrante por cuadrante: 16, o 32 con
 * "Ambas" (cordales incluidos: es lo que se dibuja). Las que se pueden marcar
 * en una prótesis, `piezasProtesicasDeLaArcada`.
 */
export function piezasDeLaArcada(arcada: Arcada): number[] {
  return cuadrantesDeLaArcada(arcada).flatMap(piezasDelCuadrante)
}

/** Las piezas que terminan en 8 (18, 28, 38, 48): los cordales, que no entran en una prótesis. */
export const CORDALES = [18, 28, 38, 48] as const

/** Si la pieza es un cordal (permanente terminada en 8). */
export const esCordal = (pieza: number): boolean => (CORDALES as readonly number[]).includes(pieza)

/**
 * Las piezas de la arcada que pueden ser protésicas o pilares: todas menos
 * los cordales (14, o 28 con "Ambas"). La total marca exactamente estas.
 */
export function piezasProtesicasDeLaArcada(arcada: Arcada): number[] {
  return piezasDeLaArcada(arcada).filter((pieza) => !esCordal(pieza))
}

/** Si una pieza es permanente y está en la arcada. */
export function esPiezaDeLaArcada(pieza: unknown, arcada: Arcada): pieza is number {
  return esPiezaValida(pieza) && cuadrantesDeLaArcada(arcada).includes(cuadranteDe(pieza))
}

/** Las zonas de la base que admiten un tipo y una arcada: ninguna sin base; el paladar sólo arriba y la barra lingual sólo abajo. */
export function zonasPermitidas(tipo: TipoDeProtesis, arcada: Arcada): ZonaDeLaBase[] {
  if (!llevaBase(tipo)) return []
  return IDS_DE_ZONAS.filter(
    (zona) => !(zona === "paladar" && arcada === "inferior") && !(zona === "lingual" && arcada === "superior")
  )
}

/** Lo que se dibuja: el tipo, la arcada, las piezas protésicas, los pilares (o ganchos) y las zonas. */
export interface DisenoDeProtesis {
  tipo: TipoDeProtesis
  arcada: Arcada
  piezas: readonly number[]
  pilares: readonly number[]
  zonas: readonly string[]
}

/** El diseño como se guarda: piezas y pilares en orden numérico, zonas en el orden del catálogo. */
export interface DisenoNormalizado {
  tipo: TipoDeProtesis
  arcada: Arcada
  piezas: number[]
  pilares: number[]
  zonas: ZonaDeLaBase[]
}

const enOrden = (piezas: readonly number[]) => [...piezas].sort((a, b) => a - b)

/**
 * El primer problema del diseño, o `null`. Las mismas reglas que los CHECKs
 * de `protesis`:
 * - piezas y pilares FDI permanente de la arcada, sin cordales, sin repetir,
 *   y una pieza no es a la vez protésica y pilar; al menos una pieza protésica;
 * - con "Ambas", piezas protésicas arriba y abajo;
 * - la total, todas las piezas de la arcada menos los cordales, y sin
 *   pilares (la arma `normalizarDiseno`: quien llama no tiene que mandarlas);
 * - la corona, una sola pieza, sin pilares y en una arcada;
 * - zonas sólo en removible y total, y las que admite la arcada.
 */
export function errorDelDiseno(diseno: DisenoDeProtesis): string | null {
  const { tipo, arcada, piezas, pilares, zonas } = diseno
  const todas = [...piezas, ...pilares]
  const fuera = todas.find((pieza) => !esPiezaDeLaArcada(pieza, arcada))
  if (fuera !== undefined) {
    return esPiezaValida(fuera) && fuera < 50
      ? `La pieza ${fuera} no es de la arcada ${nombreDeArcada(arcada).toLowerCase()}.`
      : `La pieza ${String(fuera)} no existe en la dentición permanente.`
  }
  const cordal = todas.find(esCordal)
  if (cordal !== undefined) return `La pieza ${cordal} es un cordal: no entra en una prótesis.`
  if (new Set(piezas).size !== piezas.length || new Set(pilares).size !== pilares.length) {
    return "Una pieza está marcada dos veces."
  }
  const repetida = pilares.find((pieza) => piezas.includes(pieza))
  if (repetida !== undefined) return `La pieza ${repetida} no puede ser a la vez protésica y pilar.`
  if (piezas.length === 0) return "Marca al menos una pieza protésica."

  if (arcada === "ambas") {
    const arriba = piezas.some((pieza) => SUPERIOR.includes(cuadranteDe(pieza)))
    const abajo = piezas.some((pieza) => INFERIOR.includes(cuadranteDe(pieza)))
    if (!arriba || !abajo) return "Con «Ambas», marca piezas protésicas arriba y abajo, o elige una sola arcada."
  }

  if (tipo === "total") {
    if (pilares.length > 0) return "Una prótesis total no lleva pilares ni ganchos."
    const deLaArcada = piezasProtesicasDeLaArcada(arcada)
    if (deLaArcada.some((pieza) => !piezas.includes(pieza))) return "Una prótesis total reemplaza todas las piezas de la arcada (menos los cordales)."
  }
  if (tipo === "corona") {
    if (arcada === "ambas") return "Una corona unitaria va en una sola arcada."
    if (piezas.length !== 1 || pilares.length > 0) return "Una corona unitaria es una sola pieza, sin pilares."
  }

  if (new Set(zonas).size !== zonas.length) return "Una zona de la base está repetida."
  if (zonas.length > 0 && !llevaBase(tipo)) return "Las fijas, coronas e implantes no llevan base: quita las zonas."
  const permitidas = zonasPermitidas(tipo, arcada)
  const zonaMala = zonas.find((zona) => !permitidas.includes(zona as ZonaDeLaBase))
  if (zonaMala !== undefined) {
    if (zonaMala === "paladar") return "El paladar es de la arcada superior."
    if (zonaMala === "lingual") return "La barra lingual es de la arcada inferior."
    return "Esa zona de la base no existe."
  }
  return null
}

/**
 * El diseño listo para validar y guardar. La total marca todas las piezas de
 * la arcada menos los cordales (lo que haya mandado quien llama se
 * reemplaza) y no lleva pilares; el resto queda como vino, en orden. Las zonas, en el orden del
 * catálogo. No valida: para eso, `errorDelDiseno` sobre lo que devuelve.
 */
export function normalizarDiseno(diseno: DisenoDeProtesis): DisenoNormalizado {
  const total = diseno.tipo === "total"
  return {
    tipo: diseno.tipo,
    arcada: diseno.arcada,
    piezas: total ? piezasProtesicasDeLaArcada(diseno.arcada) : enOrden(diseno.piezas),
    pilares: total ? [] : enOrden(diseno.pilares),
    zonas: IDS_DE_ZONAS.filter((zona) => diseno.zonas.includes(zona)).concat(
      // Una zona desconocida se conserva al final, para que `errorDelDiseno` la rechace.
      diseno.zonas.filter((zona) => !esZona(zona)) as ZonaDeLaBase[]
    ),
  }
}

// ─── Unidades y precio ───────────────────────────────────────────────────────

/** Cuántas unidades se cobran: arcadas (1, o 2 con "Ambas") o piezas protésicas más pilares. */
export function unidadesDe(unidad: Unidad, diseno: Pick<DisenoDeProtesis, "arcada" | "piezas" | "pilares">): number {
  if (unidad === "arcada") return diseno.arcada === "ambas" ? 2 : 1
  return diseno.piezas.length + diseno.pilares.length
}

/** "1 arcada", "2 arcadas", "3 piezas". */
export function textoDeUnidades(unidad: Unidad, unidades: number): string {
  const datos = UNIDADES.find((u) => u.id === unidad)
  return `${unidades} ${unidades === 1 ? datos?.nombre : datos?.plural}`
}

export type ResultadoDelValor = { ok: true; unidades: number; valorCents: number } | { ok: false; error: string }

/**
 * El valor al paciente: precio del material por unidades. Lo calcula siempre
 * el servidor con el precio del catálogo (lo que mande el navegador no
 * cuenta). Sobre el tope, error: no se trunca en silencio.
 */
export function valorDeLaProtesis(
  material: { unidad: Unidad; precioCents: number },
  diseno: Pick<DisenoDeProtesis, "arcada" | "piezas" | "pilares">
): ResultadoDelValor {
  const unidades = unidadesDe(material.unidad, diseno)
  const valorCents = material.precioCents * unidades
  if (!Number.isSafeInteger(valorCents) || valorCents < 0 || valorCents > TOPE_DE_CENTAVOS) {
    return { ok: false, error: "El valor de la prótesis pasa del máximo que se puede cobrar." }
  }
  return { ok: true, unidades, valorCents }
}

// ─── El reparto ──────────────────────────────────────────────────────────────

/** Una regla de reparto en puntos base: odontóloga tratante, clínica y técnico (laboratorio). */
export interface RepartoEnPuntosBase {
  pbOdontologo: number
  pbClinica: number
  pbTecnico: number
}

/** Si una parte es un entero de 0 a 10.000. */
export const esParteValida = (valor: unknown): valor is number =>
  typeof valor === "number" && Number.isInteger(valor) && valor >= 0 && valor <= PUNTOS_BASE_DEL_TOTAL

/** Si es un reparto válido: tres partes enteras de 0 a 10.000 que suman exactamente 10.000. */
export function esRepartoValido(reparto: Partial<Record<keyof RepartoEnPuntosBase, unknown>>): reparto is RepartoEnPuntosBase {
  const { pbOdontologo, pbClinica, pbTecnico } = reparto
  return (
    esParteValida(pbOdontologo) &&
    esParteValida(pbClinica) &&
    esParteValida(pbTecnico) &&
    pbOdontologo + pbClinica + pbTecnico === PUNTOS_BASE_DEL_TOTAL
  )
}

/** "40 %" o "33,33 %" a partir de puntos base. */
export function textoDePorcentaje(pb: number): string {
  const entero = Math.trunc(pb / 100)
  const resto = pb % 100
  return resto === 0 ? `${entero} %` : `${entero},${String(resto).padStart(2, "0").replace(/0$/, "")} %`
}

/** Las tres partes, sólo los números. */
const soloPartes = ({ pbOdontologo, pbClinica, pbTecnico }: RepartoEnPuntosBase): RepartoEnPuntosBase => ({
  pbOdontologo,
  pbClinica,
  pbTecnico,
})

/**
 * La regla que se congela al crear una prótesis: la excepción de la tratante
 * en ese material, si hay, manda sobre la del material (como `CommissionRate`
 * sobre el % por defecto). La dueña no es miembro: no tiene excepciones.
 */
export function repartoQueAplica(
  delMaterial: RepartoEnPuntosBase,
  excepcion: RepartoEnPuntosBase | null | undefined
): RepartoEnPuntosBase & { origen: OrigenDelReparto } {
  if (excepcion) return { ...soloPartes(excepcion), origen: "excepcion" }
  return { ...soloPartes(delMaterial), origen: "material" }
}

/**
 * El reparto que de verdad se paga: si la tratante es la dueña, su parte va a
 * la clínica (no se paga a sí misma), así que la odontóloga queda en 0. Lo
 * congelado en la prótesis no cambia: esto se calcula al leer y al repartir.
 */
export function repartoEfectivo(reparto: RepartoEnPuntosBase, tratanteEsLaDuena: boolean): RepartoEnPuntosBase {
  if (!tratanteEsLaDuena) return soloPartes(reparto)
  return { pbOdontologo: 0, pbClinica: reparto.pbClinica + reparto.pbOdontologo, pbTecnico: reparto.pbTecnico }
}

export interface MontoRepartido {
  odontologoCents: number
  clinicaCents: number
  tecnicoCents: number
}

/**
 * Un monto (el valor, o cada abono cuando se cobre) repartido en las tres
 * partes, exacto al centavo: la odontóloga y el técnico con
 * `comisionEnCentavos` (medio centavo hacia arriba, como las comisiones) y la
 * clínica con lo que queda, así las tres suman el monto. Si la tratante es la
 * dueña, su parte va a la clínica. Si el redondeo de las dos primeras pasara
 * el monto (sólo con la parte de la clínica casi en cero), el técnico cede
 * ese centavo: la clínica nunca queda negativa.
 */
export function repartirMonto(montoCents: number, reparto: RepartoEnPuntosBase, tratanteEsLaDuena: boolean): MontoRepartido {
  if (!esRepartoValido(reparto)) throw new RangeError("Reparto inválido: las tres partes tienen que sumar 10.000")
  const efectivo = repartoEfectivo(reparto, tratanteEsLaDuena)
  const odontologoCents = comisionEnCentavos(montoCents, efectivo.pbOdontologo / 100)
  const tecnicoCents = Math.min(comisionEnCentavos(montoCents, efectivo.pbTecnico / 100), montoCents - odontologoCents)
  return { odontologoCents, clinicaCents: montoCents - odontologoCents - tecnicoCents, tecnicoCents }
}

// ─── El seguimiento ──────────────────────────────────────────────────────────

/** Entregada y anulada no cambian más. */
export const estaCerrada = (estado: string): boolean => estado === "entregada" || estado === "anulada"

/** El paso que sigue en el seguimiento de ese tipo (el que ofrece la pantalla), o `null` si ya está entregada o anulada. */
export function pasoSiguiente(tipo: TipoDeProtesis, estado: string): PasoDelSeguimiento | null {
  const pasos = PASOS_POR_TIPO[tipo]
  const posicion = pasos.indexOf(estado as PasoDelSeguimiento)
  if (posicion < 0 || posicion >= pasos.length - 1) return null
  return pasos[posicion + 1]
}

export const MENSAJE_PROTESIS_CERRADA = "La prótesis ya está entregada o anulada: no cambia más."
export const MENSAJE_SOLO_AVANZA = "El seguimiento sólo avanza: no se vuelve a un paso anterior."
export const MENSAJE_PASO_DE_OTRO_TIPO = "Ese paso no es del seguimiento de este tipo de prótesis."

/**
 * Si se puede pasar de `actual` a `nuevo` en una prótesis de ese tipo. El
 * seguimiento sólo avanza por los pasos del tipo (`PASOS_POR_TIPO`), y se
 * puede saltar un paso. Anular se puede en cualquier paso antes de entregar;
 * entregada y anulada no cambian más. Devuelve el error o `null`.
 */
export function errorDeCambioDeEstado(tipo: TipoDeProtesis, actual: string, nuevo: EstadoDeProtesis): string | null {
  if (estaCerrada(actual)) return MENSAJE_PROTESIS_CERRADA
  if (nuevo === "anulada") return null
  if (!esPasoDelTipo(tipo, nuevo)) return MENSAJE_PASO_DE_OTRO_TIPO
  const pasos = PASOS_POR_TIPO[tipo]
  if (pasos.indexOf(nuevo) <= pasos.indexOf(actual as PasoDelSeguimiento)) return MENSAJE_SOLO_AVANZA
  return null
}

/**
 * Cómo está cada etapa: `hecha` (se pasó por ella), `actual` (la prótesis
 * está ahí), `saltada` (quedó atrás sin pasar por ella) o `pendiente`.
 */
export type SituacionDeEtapa = "hecha" | "actual" | "saltada" | "pendiente"

export interface EtapaDelSeguimiento<F> {
  id: PasoDelSeguimiento
  nombre: string
  situacion: SituacionDeEtapa
  /** Cuándo y quién la registró (el primer evento de ese paso), o `null` si no se pasó por ella. */
  fecha: F | null
  autorNombre: string | null
}

/**
 * Las etapas que le tocan a la prótesis según su tipo, con su situación y
 * el evento que las registró, para que la pantalla no las recalcule.
 *
 * - En curso: las de antes, `hecha` (o `saltada` si no tienen evento); la del
 *   estado, `actual`; las de después, `pendiente`.
 * - Entregada: todas `hecha` o `saltada`, también "Entregada".
 * - Anulada: lo mismo hasta el último paso con evento (donde estaba cuando se
 *   anuló), y el resto `pendiente`; ninguna es `actual`.
 *
 * `eventos` del más viejo al más nuevo; si un paso se registró dos veces
 * (prótesis de antes de la etapa 7c, cuando "En laboratorio" pasó a ser
 * "Toma de impresión"), cuenta el primero.
 */
export function etapasDeLaProtesis<F>(
  tipo: TipoDeProtesis,
  estado: string,
  eventos: readonly { estado: string; autorNombre: string; createdAt: F }[]
): EtapaDelSeguimiento<F>[] {
  const pasos = PASOS_POR_TIPO[tipo]
  const primero = new Map<string, { autorNombre: string; createdAt: F }>()
  for (const evento of eventos) if (!primero.has(evento.estado)) primero.set(evento.estado, evento)

  let posicion = pasos.indexOf(estado as PasoDelSeguimiento)
  if (posicion < 0) posicion = pasos.reduce((ultimo, paso, indice) => (primero.has(paso) ? indice : ultimo), -1)
  const cerrada = estaCerrada(estado)

  return pasos.map((paso, indice) => {
    const evento = primero.get(paso)
    let situacion: SituacionDeEtapa
    if (indice > posicion) situacion = "pendiente"
    else if (indice === posicion && !cerrada) situacion = "actual"
    else situacion = evento || indice === posicion ? "hecha" : "saltada"
    return {
      id: paso,
      nombre: nombreDeEstado(paso),
      situacion,
      fecha: evento?.createdAt ?? null,
      autorNombre: evento?.autorNombre ?? null,
    }
  })
}

// ─── El tono (guía VITA classical) ───────────────────────────────────────────

/** Los grupos de la guía VITA classical, en su orden. */
export const GRUPOS_DE_TONOS = [
  { id: "0M", nombre: "Blanqueamiento" },
  { id: "A", nombre: "Rojizo-marrón" },
  { id: "B", nombre: "Rojizo-amarillo" },
  { id: "C", nombre: "Gris" },
  { id: "D", nombre: "Rojizo-gris" },
] as const
export type GrupoDeTono = (typeof GRUPOS_DE_TONOS)[number]["id"]

/**
 * Los tonos de la guía VITA classical (con los de blanqueamiento 0M), en el
 * orden de la guía. `id` es lo que se guarda (sin coma: "A3.5"); `etiqueta`,
 * lo que se muestra ("A3,5"). `color` es un hex APROXIMADO, sólo para
 * mostrar una muestra de referencia en pantalla: el color de verdad lo da la
 * guía física, y la pantalla tiene que decirlo. La migración
 * `20261109120000_etapa_7c_protesis_por_tipo` repite los ids en
 * `protesis_tono_check`: si cambia uno, cambia el otro.
 */
export const TONOS_VITA = [
  { id: "0M1", etiqueta: "0M1", grupo: "0M", color: "#F6F3EA" },
  { id: "0M2", etiqueta: "0M2", grupo: "0M", color: "#F2EDE0" },
  { id: "0M3", etiqueta: "0M3", grupo: "0M", color: "#EEE7D6" },
  { id: "A1", etiqueta: "A1", grupo: "A", color: "#EDE1C6" },
  { id: "A2", etiqueta: "A2", grupo: "A", color: "#E6D3AF" },
  { id: "A3", etiqueta: "A3", grupo: "A", color: "#DEC69B" },
  { id: "A3.5", etiqueta: "A3,5", grupo: "A", color: "#D4B886" },
  { id: "A4", etiqueta: "A4", grupo: "A", color: "#C7A574" },
  { id: "B1", etiqueta: "B1", grupo: "B", color: "#F0E6CC" },
  { id: "B2", etiqueta: "B2", grupo: "B", color: "#E8D8B0" },
  { id: "B3", etiqueta: "B3", grupo: "B", color: "#DDC593" },
  { id: "B4", etiqueta: "B4", grupo: "B", color: "#D4B982" },
  { id: "C1", etiqueta: "C1", grupo: "C", color: "#E2D7BE" },
  { id: "C2", etiqueta: "C2", grupo: "C", color: "#D7C8A7" },
  { id: "C3", etiqueta: "C3", grupo: "C", color: "#CBBA96" },
  { id: "C4", etiqueta: "C4", grupo: "C", color: "#BAA582" },
  { id: "D2", etiqueta: "D2", grupo: "D", color: "#E2D2B9" },
  { id: "D3", etiqueta: "D3", grupo: "D", color: "#D8C5A5" },
  { id: "D4", etiqueta: "D4", grupo: "D", color: "#D1BC9A" },
] as const satisfies readonly { id: string; etiqueta: string; grupo: GrupoDeTono; color: string }[]
export type TonoVita = (typeof TONOS_VITA)[number]["id"]
export type TonoDeLaGuia = (typeof TONOS_VITA)[number]
export const IDS_DE_TONOS = TONOS_VITA.map((tono) => tono.id) as [TonoVita, ...TonoVita[]]

export const esTonoVita = (valor: unknown): valor is TonoVita => IDS_DE_TONOS.includes(valor as TonoVita)

/** El tono de la guía con ese id, o `null` (sin tono, o un valor que no es de la guía). */
export function tonoDeLaGuia(id: string | null | undefined): TonoDeLaGuia | null {
  return TONOS_VITA.find((tono) => tono.id === id) ?? null
}

/** "A3,5" para "A3.5"; un id que no es de la guía, tal cual. */
export const etiquetaDeTono = (id: string): string => tonoDeLaGuia(id)?.etiqueta ?? id

// ─── El nombre para el plan ──────────────────────────────────────────────────

/** El largo máximo del nombre de una prestación del plan (`nombreDePrestacion`, lib/edicion-del-plan.ts). */
const LARGO_MAXIMO_DEL_NOMBRE = 120

/**
 * El nombre de la prestación que crea "Agregar al plan y presupuesto":
 * "Removible parcial · Acrílico termocurado (45, 46, 47)" (piezas protésicas
 * y pilares juntos, en orden). La total dice la arcada en vez de las 16 o 32
 * piezas. Si no cabe en el largo de una prestación, cuenta las piezas.
 */
export function nombreParaElPlan(protesis: {
  tipo: string
  materialNombre: string
  arcada: string
  piezas: readonly number[]
  pilares: readonly number[]
}): string {
  const base = `${nombreDeTipo(protesis.tipo)} · ${protesis.materialNombre.trim()}`
  if (protesis.tipo === "total") {
    const arcada = protesis.arcada === "ambas" ? "ambas arcadas" : `arcada ${nombreDeArcada(protesis.arcada).toLowerCase()}`
    return `${base} (${arcada})`.slice(0, LARGO_MAXIMO_DEL_NOMBRE)
  }
  const piezas = enOrden([...protesis.piezas, ...protesis.pilares])
  const conPiezas = `${base} (${piezas.join(", ")})`
  if (conPiezas.length <= LARGO_MAXIMO_DEL_NOMBRE) return conPiezas
  return `${base} (${piezas.length} piezas)`.slice(0, LARGO_MAXIMO_DEL_NOMBRE)
}

// ─── Materiales iniciales ────────────────────────────────────────────────────

export interface MaterialInicial extends RepartoEnPuntosBase {
  nombre: string
  unidad: Unidad
  tipos: TipoDeProtesis[]
  precioCents: number
  orden: number
}

/**
 * Los cinco materiales con que nace toda clínica dental (decisión del dueño,
 * con los precios y el reparto del diseño). Las clínicas que ya existían los
 * recibieron en la migración `20261108120000_etapa_7_protesis`, con estos
 * mismos valores: si cambia uno, cambia el otro. La dueña los edita o los
 * desactiva en Comisiones › Reparto de prótesis.
 */
export const MATERIALES_INICIALES: readonly MaterialInicial[] = [
  { nombre: "Acrílico termocurado", unidad: "arcada", tipos: ["removible", "total"], precioCents: 18_000_000, pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000, orden: 1 },
  { nombre: "Flexible (nylon)", unidad: "arcada", tipos: ["removible"], precioCents: 32_000_000, pbOdontologo: 3500, pbClinica: 2500, pbTecnico: 4000, orden: 2 },
  { nombre: "Cromo-cobalto", unidad: "arcada", tipos: ["removible"], precioCents: 45_000_000, pbOdontologo: 3500, pbClinica: 2500, pbTecnico: 4000, orden: 3 },
  { nombre: "Metal-porcelana", unidad: "pieza", tipos: ["fija", "implante", "corona"], precioCents: 22_000_000, pbOdontologo: 4000, pbClinica: 2000, pbTecnico: 4000, orden: 4 },
  { nombre: "Zirconio", unidad: "pieza", tipos: ["fija", "implante", "corona"], precioCents: 29_000_000, pbOdontologo: 3500, pbClinica: 2000, pbTecnico: 4500, orden: 5 },
]

/**
 * Los materiales de ejemplo del rubro, listos para crear al registrar el
 * negocio (como `serviciosDeEjemplo`): los cinco en una clínica dental,
 * ninguno en otro rubro. Copias nuevas en cada llamada.
 */
export function materialesDeProtesisDeEjemplo(rubro: string): MaterialInicial[] {
  if (!esRubroDental(rubro)) return []
  return MATERIALES_INICIALES.map((material) => ({ ...material, tipos: [...material.tipos] }))
}
