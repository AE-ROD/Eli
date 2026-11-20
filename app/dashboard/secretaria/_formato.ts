/**
 * Cómo se muestran las cifras de la Secretaria en el panel. Sólo funciones
 * puras: las usan la página (servidor) y los componentes (navegador).
 */

const DOS_DECIMALES = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Dólares con dos decimales y coma: "US$5,00". */
export function formatearUsd(dolares: number): string {
  return `US$${DOS_DECIMALES.format(dolares)}`
}

/**
 * Lo gastado (en microdólares) en dólares. Un gasto de menos de un centavo no
 * se muestra como "US$0,00", que se leería como que no gastó nada.
 */
export function gastoEnUsd(microdolares: number): string {
  if (microdolares > 0 && microdolares < 10_000) return "menos de US$0,01"
  return formatearUsd(microdolares / 1_000_000)
}

/** El presupuesto (en centavos) en dólares: "US$5,00". */
export function presupuestoEnUsd(centavos: number): string {
  return formatearUsd(centavos / 100)
}

/** El porcentaje gastado, entero y acotado a 0–100 para la barra. */
export function porcentajeParaLaBarra(porcentaje: number): number {
  if (!Number.isFinite(porcentaje)) return 100
  return Math.min(100, Math.max(0, Math.round(porcentaje)))
}

/** Fecha y hora cortas en el reloj del negocio: "20 nov, 14:30". */
export function fechaCorta(iso: string, zona: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: zona,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

/**
 * Lee el presupuesto que escribió la dueña ("5", "5,50", "US$ 7.5") como
 * dólares. `null` si no es un monto válido (vacío, negativo, más de dos
 * decimales o más de 10.000, el tope del servidor).
 */
export function leerPresupuestoUsd(texto: string): number | null {
  const limpio = texto.replace(/us\$|\$|\s/gi, "").replace(",", ".")
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null
  const valor = Number(limpio)
  return valor <= 10_000 ? valor : null
}
