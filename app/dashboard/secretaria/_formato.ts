/**
 * Cómo se muestran las cifras de la Secretaria en el panel. Sólo funciones
 * puras: las usan la página (servidor) y los componentes (navegador).
 */

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
