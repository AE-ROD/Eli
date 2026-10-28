/**
 * Comisiones: la cascada que decide el % de una línea y el cálculo de su monto
 * (docs/PRODUCTO.md §3). Puro: no lee la base. Quien cobra o liquida carga los
 * porcentajes vigentes del negocio, se los pasa, y congela lo que sale acá en
 * la línea (`VisitService.commissionPercent/commissionCents/commissionAt`).
 *
 * Reglas que no se negocian:
 * - Sin % configurado la comisión es **pendiente** (null), nunca 0.
 * - La línea de la dueña (`byOwner`) no lleva comisión: no se la paga a sí misma.
 * - El dinero va en centavos enteros y se calcula en puntos base, sin punto
 *   flotante en el monto: 40 % de $14.990 son exactamente 599.600 centavos.
 */

/** El tope del dinero en centavos, el mismo de `lib/atenciones.ts` y de los CHECK de la base. */
const TOPE_DE_CENTAVOS = 2_000_000_000

/** Puntos base en un 100 %: 1 punto base = 0,01 %. */
const PUNTOS_BASE_DEL_TOTAL = 10_000

/**
 * Si `valor` es un % de comisión válido: un número finito entre 0 y 100, con a
 * lo sumo dos decimales (lo que cabe en puntos base). 0 es válido: es "no se
 * le paga comisión", decidido; lo que no es válido es usar 0 para decir "sin
 * configurar" (eso es null, y no pasa por acá).
 */
export function esPorcentajeDeComision(valor: unknown): valor is number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return false
  if (valor < 0 || valor > 100) return false
  return Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6
}

/** Un % en puntos base enteros: 33,33 % → 3333. Lanza si el % no es válido. */
export function puntosBase(porcentaje: number): number {
  if (!esPorcentajeDeComision(porcentaje)) throw new RangeError(`Porcentaje de comisión inválido: ${porcentaje}`)
  return Math.round(porcentaje * 100)
}

/**
 * La comisión en centavos de una línea de `precioCents` al `porcentaje`,
 * redondeada al centavo (medio centavo hacia arriba):
 * `floor((precio × pb + 5000) / 10000)`.
 *
 * Sin error de punto flotante: con precio ≤ 2e9 y pb ≤ 10.000 el producto
 * es ≤ 2e13, muy por debajo de 2^53, así que todo es aritmética entera exacta.
 * Nunca supera el precio (lo exige también un CHECK de la base).
 */
export function comisionEnCentavos(precioCents: number, porcentaje: number): number {
  if (!Number.isSafeInteger(precioCents) || precioCents < 0 || precioCents > TOPE_DE_CENTAVOS) {
    throw new RangeError(`Precio en centavos inválido: ${precioCents}`)
  }
  const pb = puntosBase(porcentaje)
  return Math.floor((precioCents * pb + PUNTOS_BASE_DEL_TOTAL / 2) / PUNTOS_BASE_DEL_TOTAL)
}

// ─── La cascada ──────────────────────────────────────────────────────────────

/** Lo que la cascada necesita saber de una línea. */
export interface LineaParaComision {
  tipo: "servicio" | "producto"
  byOwner: boolean
  memberId: string | null
  serviceId: string | null
  productId: string | null
}

/**
 * Los porcentajes vigentes del negocio, cargados por quien llama (y siempre
 * filtrados por su `businessId`). Un `null` en un mapa es "sin configurar";
 * que falte la clave, también.
 */
export interface PorcentajesVigentes {
  /** `BusinessMember.commissionPercent` por memberId. */
  porMiembro: ReadonlyMap<string, number | null>
  /** `CommissionRate.percent`: memberId → serviceId → %. */
  excepciones: ReadonlyMap<string, ReadonlyMap<string, number>>
  /** `Producto.commissionPercent` por productId. */
  porProducto: ReadonlyMap<string, number | null>
}

export type OrigenDelPorcentaje = "excepcion" | "miembro" | "producto"

export type ResultadoDeCascada =
  /** No lleva comisión: línea de la dueña, o de alguien que ya no está en el equipo. */
  | { tipo: "no-aplica" }
  /** Debería llevar, pero falta configurar el %. Se congela en null, nunca en 0. */
  | { tipo: "pendiente" }
  | { tipo: "porcentaje"; porcentaje: number; origen: OrigenDelPorcentaje }

/**
 * El % que corresponde a una línea:
 * 1. Línea de la dueña, o sin `memberId` (alguien que dejó el equipo; no hay a
 *    quién liquidarle) → no aplica.
 * 2. Producto → el % del producto. Sin % (o el producto ya no existe) → pendiente.
 * 3. Servicio → la excepción del miembro para ese servicio, si hay; si no,
 *    el % por defecto del miembro; si no, pendiente.
 */
export function porcentajeDeLinea(linea: LineaParaComision, vigentes: PorcentajesVigentes): ResultadoDeCascada {
  if (linea.byOwner || !linea.memberId) return { tipo: "no-aplica" }

  if (linea.tipo === "producto") {
    const delProducto = linea.productId ? vigentes.porProducto.get(linea.productId) : null
    return esPorcentajeDeComision(delProducto)
      ? { tipo: "porcentaje", porcentaje: delProducto, origen: "producto" }
      : { tipo: "pendiente" }
  }

  if (linea.serviceId) {
    const excepcion = vigentes.excepciones.get(linea.memberId)?.get(linea.serviceId)
    if (esPorcentajeDeComision(excepcion)) return { tipo: "porcentaje", porcentaje: excepcion, origen: "excepcion" }
  }
  const delMiembro = vigentes.porMiembro.get(linea.memberId)
  if (esPorcentajeDeComision(delMiembro)) return { tipo: "porcentaje", porcentaje: delMiembro, origen: "miembro" }
  return { tipo: "pendiente" }
}

/** Las tres columnas de comisión de una línea, listas para escribir: todas con valor o todas null. */
export interface ComisionCongelada {
  commissionPercent: number | null
  commissionCents: number | null
  commissionAt: Date | null
}

/**
 * Lo que se congela en una línea al cobrar (o al cerrar la liquidación, si
 * estaba pendiente y ya hay %): el % de la cascada y su monto, con `ahora`.
 * Pendiente y no aplica quedan los tres en null.
 */
export function comisionParaCongelar(
  linea: LineaParaComision & { priceCents: number },
  vigentes: PorcentajesVigentes,
  ahora: Date
): ComisionCongelada {
  const resultado = porcentajeDeLinea(linea, vigentes)
  if (resultado.tipo !== "porcentaje") return { commissionPercent: null, commissionCents: null, commissionAt: null }
  return {
    commissionPercent: resultado.porcentaje,
    commissionCents: comisionEnCentavos(linea.priceCents, resultado.porcentaje),
    commissionAt: ahora,
  }
}

export type EstadoDeComision = "congelada" | "pendiente" | "no-aplica"

/**
 * En qué está la comisión de una línea ya guardada: congelada (tiene
 * `commissionAt`), no aplica (de la dueña o sin miembro) o pendiente de %.
 */
export function estadoDeComision(linea: {
  byOwner: boolean
  memberId: string | null
  commissionAt: Date | null
}): EstadoDeComision {
  if (linea.commissionAt) return "congelada"
  if (linea.byOwner || !linea.memberId) return "no-aplica"
  return "pendiente"
}
