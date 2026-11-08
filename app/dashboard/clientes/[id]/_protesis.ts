import {
  ALTO_DE_LA_ARCADA,
  geometriaDePieza,
  piezaVecina,
  type TeclaDeLaArcada,
} from "@/components/panel/odontograma/geometria"
import { comisionEnCentavos } from "@/lib/comisiones"
import type { OpcionesDeProtesisRespuesta, ParteDelReparto, RepartoRespuesta } from "@/lib/edicion-de-protesis"
import { cuadranteDe, type MarcaDelOdontograma } from "@/lib/odontograma"
import {
  esMaterialCompatible,
  esPiezaDeLaArcada,
  normalizarDiseno,
  piezasDeLaArcada,
  repartirMonto,
  repartoEfectivo,
  repartoQueAplica,
  valorDeLaProtesis,
  zonasPermitidas,
  type Arcada,
  type DisenoNormalizado,
  type ResultadoDelValor,
  type TipoDeProtesis,
  type ZonaDeLaBase,
} from "@/lib/protesis"

/**
 * Lo que hace la pestaña Prótesis mientras se arma una prótesis nueva, como
 * funciones puras sobre un borrador: tocar piezas con una herramienta, cambiar
 * el tipo o la arcada, las zonas, el material y su laboratorio, y la vista
 * previa del valor y del reparto.
 *
 * Las reglas son las de `lib/protesis.ts` (las mismas que aplica el servidor):
 * acá no se repiten, se usan. El valor y el reparto que se muestran son una
 * vista previa calculada igual que el servidor; lo que vale es lo que él
 * guarda al crear.
 */

export type MarcaDeProtesis = "protesica" | "pilar"
export type HerramientaDeProtesis = MarcaDeProtesis | "borrar"

export const HERRAMIENTAS_DE_PROTESIS: readonly { id: HerramientaDeProtesis; nombre: string }[] = [
  { id: "protesica", nombre: "Pieza protésica" },
  { id: "pilar", nombre: "Pilar o gancho" },
  { id: "borrar", nombre: "Borrar" },
]

export type MaterialDeLasOpciones = OpcionesDeProtesisRespuesta["materiales"][number]

export interface BorradorDeProtesis {
  tipo: TipoDeProtesis
  arcada: Arcada
  /** Lo marcado en cada pieza. En la total no se usa: lleva todas las piezas de la arcada. */
  marcas: Readonly<Record<number, MarcaDeProtesis>>
  /** Las zonas elegidas; se mandan sólo las que admiten el tipo y la arcada. */
  zonas: readonly ZonaDeLaBase[]
  materialId: string | null
  /** `null`: sin laboratorio todavía. */
  laboratorioId: string | null
  /** "AAAA-MM-DD", o vacío. */
  entregaEstimada: string
  /** "duenio" o un memberId. Sólo lo elige la dueña. */
  tratante: string
}

const enOrden = (piezas: number[]) => piezas.sort((a, b) => a - b)

/** Las piezas marcadas con esa marca, en orden numérico. */
export function piezasCon(marcas: Readonly<Record<number, MarcaDeProtesis>>, marca: MarcaDeProtesis): number[] {
  return enOrden(
    Object.entries(marcas)
      .filter(([, valor]) => valor === marca)
      .map(([pieza]) => Number(pieza))
  )
}

/** La arcada de una pieza permanente. */
const arcadaDe = (pieza: number): Exclude<Arcada, "ambas"> => (cuadranteDe(pieza) <= 2 ? "superior" : "inferior")

/** Si en este tipo se puede elegir la arcada: la corona va en una sola. */
export const admiteAmbas = (tipo: TipoDeProtesis) => tipo !== "corona"

/** Si en este tipo se marcan pilares o ganchos: ni la total ni la corona los llevan. */
export const admitePilares = (tipo: TipoDeProtesis) => tipo !== "total" && tipo !== "corona"

/** Si las piezas se tocan: en la total van todas, solas. */
export const sePuedenTocarLasPiezas = (tipo: TipoDeProtesis) => tipo !== "total"

/**
 * Tocar una pieza con la herramienta. "Borrar", o la misma marca que ya
 * tiene, la deja sin marca; otra herramienta la cambia. En la corona, marcar
 * una pieza protésica reemplaza a la anterior (es una sola). Lo que el tipo
 * no admite (piezas en la total, pilares en la corona) no cambia nada, y una
 * pieza fuera de la arcada tampoco.
 */
export function tocarPieza(borrador: BorradorDeProtesis, pieza: number, herramienta: HerramientaDeProtesis): BorradorDeProtesis {
  if (!sePuedenTocarLasPiezas(borrador.tipo) || !esPiezaDeLaArcada(pieza, borrador.arcada)) return borrador
  if (herramienta === "pilar" && !admitePilares(borrador.tipo)) return borrador
  const marcas = { ...borrador.marcas }
  if (herramienta === "borrar" || marcas[pieza] === herramienta) delete marcas[pieza]
  else if (borrador.tipo === "corona") return { ...borrador, marcas: { [pieza]: herramienta } }
  else marcas[pieza] = herramienta
  return { ...borrador, marcas }
}

/** Las marcas que siguen valiendo en la arcada y el tipo: fuera de la arcada se van; la corona se queda con una pieza y sin pilares. */
function marcasQueQuedan(marcas: Readonly<Record<number, MarcaDeProtesis>>, tipo: TipoDeProtesis, arcada: Arcada) {
  const enLaArcada = Object.fromEntries(
    Object.entries(marcas).filter(([pieza]) => esPiezaDeLaArcada(Number(pieza), arcada))
  ) as Record<number, MarcaDeProtesis>
  if (tipo === "total") return {}
  if (tipo === "corona") {
    const primera = piezasCon(enLaArcada, "protesica")[0]
    return primera === undefined ? {} : { [primera]: "protesica" as const }
  }
  return enLaArcada
}

/** El primer material del catálogo que sirve para el tipo, o `null`. */
export function primerMaterialPara(tipo: TipoDeProtesis, materiales: readonly MaterialDeLasOpciones[]): MaterialDeLasOpciones | null {
  return materiales.find((material) => esMaterialCompatible({ ...material, activo: true }, tipo)) ?? null
}

/** Los materiales que sirven para el tipo (las opciones traen sólo los activos). */
export function materialesPara(tipo: TipoDeProtesis, materiales: readonly MaterialDeLasOpciones[]): MaterialDeLasOpciones[] {
  return materiales.filter((material) => esMaterialCompatible({ ...material, activo: true }, tipo))
}

/**
 * Elegir un material: su laboratorio por defecto pasa a ser el elegido, si
 * está entre los activos; si no, queda el que estaba.
 */
export function elegirMaterial(
  borrador: BorradorDeProtesis,
  material: MaterialDeLasOpciones | null,
  laboratorios: readonly { id: string }[]
): BorradorDeProtesis {
  const delMaterial = material?.laboratorioPorDefectoId ?? null
  const laboratorioId = delMaterial && laboratorios.some((lab) => lab.id === delMaterial) ? delMaterial : borrador.laboratorioId
  return { ...borrador, materialId: material?.id ?? null, laboratorioId }
}

/**
 * Cambiar el tipo. La corona no va en "Ambas": pasa a la arcada de su pieza
 * (o a la superior). Las marcas que el tipo no admite se van, y si el
 * material no sirve para el tipo nuevo, se elige el primero que sirva.
 */
export function cambiarTipo(
  borrador: BorradorDeProtesis,
  tipo: TipoDeProtesis,
  materiales: readonly MaterialDeLasOpciones[],
  laboratorios: readonly { id: string }[]
): BorradorDeProtesis {
  let arcada = borrador.arcada
  if (!admiteAmbas(tipo) && arcada === "ambas") {
    const primera = piezasCon(borrador.marcas, "protesica")[0]
    arcada = primera === undefined ? "superior" : arcadaDe(primera)
  }
  const siguiente = { ...borrador, tipo, arcada, marcas: marcasQueQuedan(borrador.marcas, tipo, arcada) }
  const actual = materiales.find((material) => material.id === borrador.materialId)
  if (actual && esMaterialCompatible({ ...actual, activo: true }, tipo)) return siguiente
  return elegirMaterial(siguiente, primerMaterialPara(tipo, materiales), laboratorios)
}

/** Cambiar la arcada: lo marcado fuera de ella se va. La corona no admite "Ambas" (no cambia). */
export function cambiarArcada(borrador: BorradorDeProtesis, arcada: Arcada): BorradorDeProtesis {
  if (arcada === "ambas" && !admiteAmbas(borrador.tipo)) return borrador
  return { ...borrador, arcada, marcas: marcasQueQuedan(borrador.marcas, borrador.tipo, arcada) }
}

/** Poner o sacar una zona de la base. */
export function alternarZona(borrador: BorradorDeProtesis, zona: ZonaDeLaBase): BorradorDeProtesis {
  const zonas = borrador.zonas.includes(zona) ? borrador.zonas.filter((otra) => otra !== zona) : [...borrador.zonas, zona]
  return { ...borrador, zonas }
}

/** Las zonas elegidas que admiten el tipo y la arcada, en el orden del catálogo. */
export function zonasQueValen(borrador: Pick<BorradorDeProtesis, "tipo" | "arcada" | "zonas">): ZonaDeLaBase[] {
  return zonasPermitidas(borrador.tipo, borrador.arcada).filter((zona) => borrador.zonas.includes(zona))
}

/** El diseño como lo guardará el servidor (`normalizarDiseno`): la total, con todas las piezas de la arcada. */
export function disenoDelBorrador(borrador: BorradorDeProtesis): DisenoNormalizado {
  return normalizarDiseno({
    tipo: borrador.tipo,
    arcada: borrador.arcada,
    piezas: piezasCon(borrador.marcas, "protesica"),
    pilares: piezasCon(borrador.marcas, "pilar"),
    zonas: zonasQueValen(borrador),
  })
}

/** El borrador con que se abre "Nueva prótesis": removible superior, sin piezas, con el primer material que sirva. */
export function borradorInicial(opciones: OpcionesDeProtesisRespuesta): BorradorDeProtesis {
  const vacio: BorradorDeProtesis = {
    tipo: "removible",
    arcada: "superior",
    marcas: {},
    zonas: [],
    materialId: null,
    laboratorioId: null,
    entregaEstimada: "",
    tratante: opciones.tratantes[0]?.id ?? "duenio",
  }
  return elegirMaterial(vacio, primerMaterialPara("removible", opciones.materiales), opciones.laboratorios)
}

/** Lo que se manda a `POST /api/clientes/[id]/protesis`. Sin precios ni porcentajes: los pone el servidor. */
export function pedidoDelBorrador(borrador: BorradorDeProtesis, conTratante: boolean) {
  const diseno = disenoDelBorrador(borrador)
  return {
    tipo: diseno.tipo,
    arcada: diseno.arcada,
    piezas: diseno.piezas,
    pilares: diseno.pilares,
    zonas: diseno.zonas,
    materialId: borrador.materialId ?? "",
    laboratorioId: borrador.laboratorioId,
    entregaEstimada: borrador.entregaEstimada.trim() || null,
    ...(conTratante && { tratante: borrador.tratante }),
  }
}

/** El valor al paciente, como lo calculará el servidor: precio del material por unidades. Sin material, `null`. */
export function valorDelBorrador(borrador: BorradorDeProtesis, material: MaterialDeLasOpciones | null): ResultadoDelValor | null {
  if (!material) return null
  return valorDeLaProtesis(material, disenoDelBorrador(borrador))
}

/**
 * La vista previa del reparto, con la misma forma que lo que devuelve la API
 * de una prótesis creada (`RepartoRespuesta`), y sólo con lo que la API le da
 * a quien mira:
 *
 * - la dueña recibe la regla del material y las excepciones: ve las tres
 *   partes, con la excepción de la tratante elegida si tiene, y con su propia
 *   parte sumada a la clínica si la tratante es ella (`repartoEfectivo`);
 * - el odontólogo recibe sólo su parte (`miPartePb`): ve sólo esa, calculada
 *   como la calcula `repartirMonto` para la odontóloga. Nunca la de la
 *   clínica ni la del laboratorio: no le llegan.
 *
 * Sin regla ni parte (nada que mostrar), `null`.
 */
export function repartoDelBorrador(
  valorCents: number,
  material: MaterialDeLasOpciones,
  tratante: string,
  excepciones: OpcionesDeProtesisRespuesta["excepciones"]
): RepartoRespuesta | null {
  if (material.reparto) {
    const excepcion = excepciones?.find((otra) => otra.memberId === tratante && otra.materialId === material.id)
    const regla = repartoQueAplica(material.reparto, excepcion)
    const esLaDuena = tratante === "duenio"
    const efectivo = repartoEfectivo(regla, esLaDuena)
    const montos = repartirMonto(valorCents, regla, esLaDuena)
    return {
      visible: "todo",
      origen: regla.origen,
      odontologo: { pb: efectivo.pbOdontologo, cents: montos.odontologoCents },
      clinica: { pb: efectivo.pbClinica, cents: montos.clinicaCents },
      tecnico: { pb: efectivo.pbTecnico, cents: montos.tecnicoCents },
    }
  }
  if (material.miPartePb !== undefined) {
    const odontologo: ParteDelReparto = { pb: material.miPartePb, cents: comisionEnCentavos(valorCents, material.miPartePb / 100) }
    return { visible: "suyo", odontologo }
  }
  return null
}

// ─── La arcada ───────────────────────────────────────────────────────────────

/** Lo que el odontograma guardado dice de una pieza que importa para la prótesis: ausente o con extracción indicada. */
export type FaltaEnElOdontograma = "ausente" | "extraccion"

/** Las piezas ausentes o con extracción indicada en el odontograma (ausente gana si tiene las dos). */
export function faltasDelOdontograma(marcas: readonly MarcaDelOdontograma[]): Map<number, FaltaEnElOdontograma> {
  const faltas = new Map<number, FaltaEnElOdontograma>()
  for (const marca of marcas) {
    if (marca.cara !== null) continue
    if (marca.tipo === "ausente") faltas.set(marca.pieza, "ausente")
    else if (marca.tipo === "extraccion" && !faltas.has(marca.pieza)) faltas.set(marca.pieza, "extraccion")
  }
  return faltas
}

/** "Pieza protésica", "Pilar o gancho" o "sin marca", más lo que dice el odontograma. */
export function estadoDePiezaParaLeer(marca: MarcaDeProtesis | undefined, falta: FaltaEnElOdontograma | undefined): string {
  const texto = marca === "protesica" ? "pieza protésica" : marca === "pilar" ? "pilar o gancho" : "sin marcar"
  if (!falta) return texto
  return `${texto}, ${falta === "ausente" ? "ausente en el odontograma" : "extracción indicada en el odontograma"}`
}

/**
 * A qué pieza se pasa con una tecla, como en el odontograma (`piezaVecina`),
 * pero sin salir de la arcada que se ve: con una sola, arriba y abajo no
 * llevan a ningún lado.
 */
export function vecinaEnLaArcada(arcada: Arcada, pieza: number, tecla: TeclaDeLaArcada): number {
  const destino = piezaVecina("permanente", pieza, tecla)
  return esPiezaDeLaArcada(destino, arcada) ? destino : pieza
}

/** Lo que se deja arriba y abajo de cada pieza para su número, que va afuera de la arcada. */
const MARGEN_DEL_NUMERO = 30

/**
 * La franja del dibujo del odontograma (620 × 700) que se muestra: con
 * "Ambas", entero; con una arcada, sólo la suya, con lugar para los números.
 */
export function franjaDeLaArcada(arcada: Arcada): { arriba: number; alto: number } {
  if (arcada === "ambas") return { arriba: 0, alto: ALTO_DE_LA_ARCADA }
  const piezas = piezasDeLaArcada(arcada).map(geometriaDePieza)
  const arriba = Math.max(0, Math.min(...piezas.map((g) => g.centro.y - g.lado / 2 - MARGEN_DEL_NUMERO)))
  const abajo = Math.min(ALTO_DE_LA_ARCADA, Math.max(...piezas.map((g) => g.centro.y + g.lado / 2 + MARGEN_DEL_NUMERO)))
  return { arriba: Math.floor(arriba), alto: Math.ceil(abajo - arriba) }
}
