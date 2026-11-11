import { aCentavos } from "@/lib/atenciones"
import { esMarcaValida, ordenarCaras, type Cara, type MarcaDelOdontograma } from "@/lib/odontograma"

/**
 * Reglas del plan de tratamiento y su presupuesto (docs/PRODUCTO.md,
 * "Clínica dental"): estados, totales y la propuesta que se arma desde el
 * odontograma. Funciones puras, sin base ni sesión; quién ve y edita el plan
 * vive en `lib/permisos.ts`.
 *
 * El dinero va en centavos enteros (`valorCents`), como en el tablero
 * (`lib/atenciones.ts`): los totales se suman, y en `Float` la suma arrastra
 * error. El plan es un presupuesto: no hay pagos ni abonos acá.
 */

// ─── Estados ─────────────────────────────────────────────────────────────────

/** La base repite las listas en CHECKs (`etapas_del_plan_estado_check`, `prestaciones_del_plan_estado_check`). */
export const ESTADOS_DE_ETAPA = [
  { id: "por-aprobar", nombre: "Por aprobar" },
  { id: "aprobada", nombre: "Aprobada" },
] as const

export type EstadoDeEtapa = (typeof ESTADOS_DE_ETAPA)[number]["id"]

export const ESTADOS_DE_PRESTACION = [
  { id: "por-agendar", nombre: "Por agendar" },
  { id: "agendada", nombre: "Agendada" },
  { id: "realizada", nombre: "Realizada" },
] as const

export type EstadoDePrestacion = (typeof ESTADOS_DE_PRESTACION)[number]["id"]

export function esEstadoDeEtapa(estado: unknown): estado is EstadoDeEtapa {
  return ESTADOS_DE_ETAPA.some((e) => e.id === estado)
}

export function esEstadoDePrestacion(estado: unknown): estado is EstadoDePrestacion {
  return ESTADOS_DE_PRESTACION.some((e) => e.id === estado)
}

/** Busca con `find` y no en un objeto indexado, como `nombreDeRubro`. */
export function nombreDeEstadoDeEtapa(id: string): string {
  return ESTADOS_DE_ETAPA.find((e) => e.id === id)?.nombre ?? "Estado desconocido"
}

export function nombreDeEstadoDePrestacion(id: string): string {
  return ESTADOS_DE_PRESTACION.find((e) => e.id === id)?.nombre ?? "Estado desconocido"
}

// ─── Totales ─────────────────────────────────────────────────────────────────

export interface PrestacionConValor {
  estado: string
  valorCents: number
}

export interface EtapaConPrestaciones {
  estado: string
  prestaciones: readonly PrestacionConValor[]
}

export interface TotalesDelPlan {
  /** Todas las prestaciones de todas las etapas. */
  totalCents: number
  /** Las de las etapas aprobadas. */
  aprobadoCents: number
  /** Las realizadas, estén en la etapa que estén. */
  realizadoCents: number
}

const suma = (prestaciones: readonly PrestacionConValor[]) =>
  prestaciones.reduce((total, prestacion) => total + prestacion.valorCents, 0)

/** Lo que suma una etapa, en centavos. */
export function subtotalDeEtapa(etapa: EtapaConPrestaciones): number {
  return suma(etapa.prestaciones)
}

/**
 * Los tres totales del presupuesto: total del plan, aprobado y realizado, en
 * centavos. Sólo "aprobada" cuenta como aprobado: un estado que no se conoce
 * no suma ahí (falla cerrado), aunque sí en el total.
 */
export function totalesDelPlan(etapas: readonly EtapaConPrestaciones[]): TotalesDelPlan {
  const todas = etapas.flatMap((etapa) => etapa.prestaciones)
  return {
    totalCents: suma(todas),
    aprobadoCents: suma(etapas.filter((etapa) => etapa.estado === "aprobada").flatMap((etapa) => etapa.prestaciones)),
    realizadoCents: suma(todas.filter((prestacion) => prestacion.estado === "realizada")),
  }
}

// ─── Propuesta desde el odontograma ──────────────────────────────────────────

/** Un servicio del catálogo del negocio, como se lee de la base. */
export interface ServicioDelCatalogo {
  id: string
  name: string
  /** En pesos, como `Service.price`. */
  price: number | null
  /** Sin el campo cuenta como activo. */
  active?: boolean
}

/** Por qué se propone: una pieza con caries, o una con extracción indicada. */
export type MotivoDePropuesta = "caries" | "extraccion"

export interface PrestacionPropuesta {
  motivo: MotivoDePropuesta
  pieza: number
  /** Las caras con caries, en el orden de `CARAS`; vacío en una exodoncia. */
  caras: Cara[]
  /** El del servicio sugerido, o uno genérico si no hay. */
  nombre: string
  serviceId: string | null
  /** El precio del servicio sugerido; 0 sin servicio (o sin precio), para que el odontólogo lo elija. */
  valorCents: number
}

/** Los nombres genéricos, cuando el catálogo no tiene un servicio que coincida. */
export const NOMBRE_DE_RESTAURACION = "Restauración"
export const NOMBRE_DE_EXODONCIA = "Exodoncia"

/** Palabras que, en el nombre de un servicio, lo hacen el indicado para cada motivo. */
const PALABRAS: readonly { motivo: MotivoDePropuesta; palabras: readonly string[] }[] = [
  { motivo: "caries", palabras: ["restauracion", "obturacion", "resina"] },
  { motivo: "extraccion", palabras: ["exodoncia", "extraccion"] },
]

/** Minúsculas y sin tildes: "Restauración" y "restauracion" coinciden. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

/**
 * El servicio del catálogo que se sugiere para un motivo: el primero activo
 * (en el orden en que vienen) cuyo nombre trae alguna de las palabras del
 * motivo ("Restauración con resina" para una caries, "Exodoncia simple" para
 * una extracción). `null` si ninguno coincide.
 */
export function servicioSugerido(servicios: readonly ServicioDelCatalogo[], motivo: MotivoDePropuesta): ServicioDelCatalogo | null {
  const palabras = PALABRAS.find((p) => p.motivo === motivo)?.palabras ?? []
  return (
    servicios.find(
      (servicio) => servicio.active !== false && palabras.some((palabra) => normalizar(servicio.name).includes(palabra))
    ) ?? null
  )
}

function valorDe(servicio: ServicioDelCatalogo | null): number {
  const precio = servicio?.price
  return typeof precio === "number" && Number.isFinite(precio) && precio >= 0 ? aCentavos(precio) : 0
}

function propuesta(motivo: MotivoDePropuesta, pieza: number, caras: Cara[], servicios: readonly ServicioDelCatalogo[]): PrestacionPropuesta {
  const servicio = servicioSugerido(servicios, motivo)
  return {
    motivo,
    pieza,
    caras,
    nombre: servicio?.name ?? (motivo === "caries" ? NOMBRE_DE_RESTAURACION : NOMBRE_DE_EXODONCIA),
    serviceId: servicio?.id ?? null,
    valorCents: valorDe(servicio),
  }
}

/**
 * Las prestaciones que el odontograma pide, de menor a mayor pieza:
 *
 * - Una pieza con caries → una restauración con todas esas caras.
 * - Una pieza con extracción indicada → una exodoncia (y no una restauración:
 *   no se restaura lo que se va a extraer).
 * - Una pieza ausente no pide nada. Obturaciones, sellantes, coronas y
 *   endodoncias son lo que ya tiene, no lo que falta.
 *
 * Sugiere el servicio del catálogo por coincidencia de nombre
 * (`servicioSugerido`); sin uno, el nombre genérico y valor 0. Las marcas
 * inválidas se ignoran. Quien la usa le pone etapa, orden y profesional.
 */
export function propuestaDesdeOdontograma(
  marcas: readonly MarcaDelOdontograma[],
  servicios: readonly ServicioDelCatalogo[]
): PrestacionPropuesta[] {
  const validas = marcas.filter(esMarcaValida)
  const piezas = [...new Set(validas.map((marca) => marca.pieza))].sort((a, b) => a - b)
  const propuestas: PrestacionPropuesta[] = []

  for (const pieza of piezas) {
    const deLaPieza = validas.filter((marca) => marca.pieza === pieza)
    const tiene = (tipo: string) => deLaPieza.some((marca) => marca.tipo === tipo)

    if (tiene("extraccion")) {
      propuestas.push(propuesta("extraccion", pieza, [], servicios))
      continue
    }
    if (tiene("ausente")) continue

    const carasConCaries = ordenarCaras(deLaPieza.filter((marca) => marca.tipo === "caries").map((marca) => marca.cara))
    if (carasConCaries.length > 0) propuestas.push(propuesta("caries", pieza, carasConCaries, servicios))
  }

  return propuestas
}
