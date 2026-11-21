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
 * de sección, a 24px; en el celular, a 20. El de la página, más grande, lo
 * pone `BarraSuperior`.
 */
export const TITULO_DE_TARJETA = "titulo-3 font-serif text-navy text-balance max-escritorio:text-xl max-escritorio:leading-tight"

/**
 * Una tarjeta del panel: blanca sobre crema, como `Tarjeta`, con el radio de
 * 32px que pide la densidad del panel en vez de 48. El relleno lo pone quien
 * la usa. Para darle esa forma a algo que no es `Tarjeta`, o pasárselo a
 * `Tarjeta` en `className`.
 */
export const TARJETA_DEL_PANEL = "rounded-panel bg-tarjeta text-navy shadow-sm squircle"

/**
 * El relleno de una tarjeta del panel: 16 px en el celular (por debajo de
 * `escritorio`, 768 px), 24 desde ahí. Va junto a `TARJETA_DEL_PANEL`:
 * `cn(TARJETA_DEL_PANEL, RELLENO_DE_TARJETA)`. Reemplaza al `p-5 sm:p-6` de
 * cada vista (fase 2 del rediseño del celular).
 */
export const RELLENO_DE_TARJETA = "p-4 escritorio:p-6"

/**
 * Una fila de una lista del panel (una cita, un cliente, un cobro): 56 px de
 * alto como mínimo en el celular, 14 px de relleno a los lados, letra de 15.
 * Desde `escritorio`, 64 px y 16 px de relleno.
 */
export const FILA_DE_LISTA = "flex min-h-14 items-center gap-3 px-3.5 py-2.5 text-[15px] escritorio:min-h-16 escritorio:px-4 escritorio:py-3 escritorio:text-base"
