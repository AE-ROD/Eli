import {
  CLASES_DE_CAMPO,
  CLASES_DE_CAMPO_CON_ERROR,
  CLASES_DE_ETIQUETA,
} from "@/components/comunes/estilos-de-campo"

/**
 * Clases de Tailwind que repiten los formularios y las tarjetas del panel,
 * escritas una sola vez para que cada vista no copie las suyas. El aspecto de
 * los campos sale de `components/comunes/estilos-de-campo.ts`, el mismo de
 * `CampoFormulario`; acá sólo se agrega el tamaño, más compacto en el panel.
 * Se combinan con `cn` (`lib/utils.ts`), que resuelve los choques:
 * `cn(CAMPO, CAMPO_CON_ERROR)` deja el borde rojo y no los dos.
 */

/**
 * El anillo que marca qué tiene el foco del teclado: navy de 2px con el halo
 * pastel del módulo (`anillo-foco`, en `app/globals.css`). Sólo con
 * `focus-visible`: al tocar con el dedo o hacer clic no aparece, al navegar
 * con Tab sí.
 */
export const ANILLO_DE_FOCO = "anillo-foco"

/**
 * Campo de texto, número, fecha, hora o selector: el mismo borde y foco que
 * `CampoFormulario`, en 44px de alto (lo mínimo para un dedo) en vez de 48.
 */
export const CAMPO = `w-full min-h-11 px-3 py-2.5 text-sm ${CLASES_DE_CAMPO}`

/** Lo que se suma a `CAMPO` cuando el valor no sirve. */
export const CAMPO_CON_ERROR = CLASES_DE_CAMPO_CON_ERROR

/** La etiqueta de un campo, arriba de él. */
export const ETIQUETA = `${CLASES_DE_ETIQUETA} mb-1.5`

/** El mensaje de error al lado de un campo, en el rojo de error del sistema. */
export const ERROR_DE_CAMPO = "text-xs font-medium text-error mt-1"

/**
 * El título de una tarjeta del panel (su `<h2>`): la serif de los titulares
 * de sección, a 24px. El de la página, más grande, lo pone `BarraSuperior`.
 */
export const TITULO_DE_TARJETA = "titulo-3 font-serif text-navy text-balance"

/**
 * Una tarjeta del panel: blanca sobre crema, como `Tarjeta`, con el radio de
 * 32px que pide la densidad del panel en vez de 48. El relleno lo pone quien
 * la usa. Para darle esa forma a algo que no es `Tarjeta`, o pasárselo a
 * `Tarjeta` en `className`.
 */
export const TARJETA_DEL_PANEL = "rounded-panel bg-tarjeta text-navy shadow-sm squircle"
