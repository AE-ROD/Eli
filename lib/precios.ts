import { esPlanValido, type PlanId } from "@/lib/planes"

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

/**
 * Días que suma a la prueba de quien invita la primera reserva pública de un
 * negocio invitado. Se dan una sola vez en total por negocio.
 */
export const DIAS_EXTRA_POR_REFERIDO = 7

/**
 * El día de la prueba desde el que el dueño ve el aviso en la barra lateral:
 * el quinto, para que le queden tres días para actuar antes de que termine.
 */
export const DIA_DEL_AVISO_DE_PRUEBA = 5

// El tipo vive en `lib/planes.ts`; se vuelve a exportar para no romper a quien lo importaba de acá.
export type { PlanId }

export interface CalculoDePrecio {
  /**
   * El plan al que corresponde el cálculo: el que se pidió, o, sin plan,
   * Independiente con una persona y Equipo con dos o más.
   */
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
 * Cuánto se paga al mes según cuántas personas atienden y, si se sabe, el plan
 * contratado.
 *
 * Sin plan (`undefined` o `null`: la calculadora de la landing, que sugiere uno
 * según cuántas personas son):
 * - 1 → Independiente, $9.990.
 * - 2 a 5 → Equipo, $34.990.
 * - 6 o más → Equipo más $4.990 por cada una desde la sexta.
 *
 * Con plan (el de un negocio que ya lo eligió, `lib/planes.ts`):
 * - `"independiente"` → siempre $9.990, sin adicionales.
 * - `"equipo"` → $34.990, que incluye 5 personas, aunque haya una sola; desde
 *   la sexta suma $4.990 por cada una, como siempre.
 *
 * Una entrada que no es un entero de 1 o más (0, negativos, decimales, NaN,
 * Infinity), o un plan que no existe, lanza un `RangeError` en vez de
 * redondearse o caer a un plan: un negocio sin nadie que atienda o con "2,5
 * personas" es un error de quien llama, y un precio inventado en silencio es
 * justo lo que no puede mostrarse.
 */
export function calcularPrecio(personas: number, plan?: PlanId | null): CalculoDePrecio {
  if (!Number.isSafeInteger(personas) || personas < 1) {
    throw new RangeError(`Las personas que atienden tienen que ser un entero de 1 o más; llegó ${personas}.`)
  }
  if (plan !== undefined && plan !== null && !esPlanValido(plan)) {
    throw new RangeError(`El plan no existe: ${String(plan)}.`)
  }

  // Independiente: un solo precio, sin importar cuántas personas lleguen.
  if (plan === "independiente" || (!plan && personas === 1)) {
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
