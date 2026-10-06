/**
 * Clases de Tailwind que repiten los formularios y botones del panel. Son las
 * que ya usan los modales y `CampoFormulario`, escritas una sola vez para que
 * el tablero y los reportes no copien cada uno las suyas. Se combinan con
 * `cn` (`lib/utils.ts`), que resuelve los choques: `cn(CAMPO, CAMPO_CON_ERROR)`
 * deja el borde rojo y no los dos.
 */

/**
 * El anillo que marca qué tiene el foco del teclado. Sólo con `focus-visible`:
 * al tocar con el dedo o hacer clic no aparece, al navegar con Tab sí.
 */
export const ANILLO_DE_FOCO =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"

/** Campo de texto, número, fecha o selector: el mismo borde y foco que `CampoFormulario`. */
export const CAMPO =
  "w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"

/** Lo que se suma a `CAMPO` cuando el valor no sirve. */
export const CAMPO_CON_ERROR = "border-red-500 focus:ring-red-500/20 focus:border-red-500"

/** La etiqueta de un campo, arriba de él. */
export const ETIQUETA = "block text-sm font-medium text-foreground mb-1.5"

/** El mensaje de error al lado de un campo, en el rojo de los avisos del repo. */
export const ERROR_DE_CAMPO = "text-xs text-red-500 mt-1"
