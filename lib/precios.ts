/**
 * Los precios de Eli, en pesos chilenos con IVA incluido y cobro sólo mensual
 * (`docs/PRODUCTO.md`, sección 4). La landing, su calculadora y el modal de
 * precios del panel leen de acá: un precio escrito a mano en una pantalla
 * queda viejo cuando cambia éste.
 *
 * Cuentan como personas que atienden los profesionales, y el dueño si
 * atiende. Todavía no hay cobro: esto sólo dice cuánto se pagaría.
 */

/** Plan para quien atiende solo: el dueño es la única persona que atiende. */
export const PRECIO_INDEPENDIENTE = 9990

/** Plan para el negocio con equipo, con `PERSONAS_INCLUIDAS_EQUIPO` incluidas. */
export const PRECIO_EQUIPO = 34990

/** Cuántas personas que atienden trae el plan Equipo sin costo extra. */
export const PERSONAS_INCLUIDAS_EQUIPO = 5

/** Lo que suma al mes cada persona que atiende desde la sexta, en el plan Equipo. */
export const PRECIO_PERSONA_ADICIONAL = 4990

/** Días de prueba gratis, sin tarjeta, contados desde que se crea el negocio. */
export const DIAS_DE_PRUEBA = 7

export type PlanId = "independiente" | "equipo"

export interface CalculoDePrecio {
  /** El plan que corresponde: Independiente con una persona, Equipo con dos o más. */
  plan: PlanId
  /** Lo que cuesta el plan, sin adicionales. */
  montoBase: number
  /** Personas por encima de las incluidas. Siempre 0 en Independiente. */
  adicionales: number
  /** `adicionales` por `PRECIO_PERSONA_ADICIONAL`. */
  montoAdicional: number
  /** Lo que se pagaría al mes, IVA incluido. */
  total: number
}

/**
 * Cuánto se paga al mes según cuántas personas atienden.
 *
 * - 1 → Independiente, $9.990.
 * - 2 a 5 → Equipo, $34.990.
 * - 6 o más → Equipo más $4.990 por cada una desde la sexta.
 *
 * Una entrada que no es un entero de 1 o más (0, negativos, decimales, NaN,
 * Infinity) lanza un `RangeError` en vez de redondearse o caer a un plan: un
 * negocio sin nadie que atienda o con "2,5 personas" es un error de quien
 * llama, y un precio inventado en silencio es justo lo que no puede mostrarse.
 */
export function calcularPrecio(personas: number): CalculoDePrecio {
  if (!Number.isSafeInteger(personas) || personas < 1) {
    throw new RangeError(`Las personas que atienden tienen que ser un entero de 1 o más; llegó ${personas}.`)
  }

  if (personas === 1) {
    return {
      plan: "independiente",
      montoBase: PRECIO_INDEPENDIENTE,
      adicionales: 0,
      montoAdicional: 0,
      total: PRECIO_INDEPENDIENTE,
    }
  }

  const adicionales = Math.max(0, personas - PERSONAS_INCLUIDAS_EQUIPO)
  const montoAdicional = adicionales * PRECIO_PERSONA_ADICIONAL
  return {
    plan: "equipo",
    montoBase: PRECIO_EQUIPO,
    adicionales,
    montoAdicional,
    total: PRECIO_EQUIPO + montoAdicional,
  }
}

/**
 * Un monto en pesos chilenos: `$9.990`, `$34.990`, `$1.234.567`. Sin
 * decimales (el peso no los usa) y con punto de miles desde las cuatro cifras.
 * Se arma a mano y no con `toLocaleString`: el resultado no depende de los
 * datos de idioma del servidor o del navegador, y el HTML del servidor
 * coincide con el del cliente.
 */
export function formatearPesos(monto: number): string {
  const entero = Math.round(Math.abs(monto))
  const conMiles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return `${monto < 0 && entero !== 0 ? "-" : ""}$${conMiles}`
}
