/**
 * El aspecto de los campos de formulario, escrito una sola vez para
 * `CampoFormulario`, `Selector` y los campos del panel
 * (`components/panel/estilos.ts`). Cada uno pone su tamaño; acá va lo que los
 * hace ver iguales: borde, radio, colores y foco. Se combinan con `cn`, que
 * resuelve los choques: `cn(CLASES_DE_CAMPO, CLASES_DE_CAMPO_CON_ERROR)` deja
 * el borde rojo y no los dos.
 */

/**
 * El borde es del gris de texto secundario y no del de los bordes
 * decorativos: un control necesita 3:1 contra el fondo y ese gris claro no
 * llega. El foco es el anillo navy con el halo del módulo (`anillo-foco`).
 */
export const CLASES_DE_CAMPO =
  "rounded-campo border border-texto-2 bg-tarjeta text-navy placeholder:text-texto-2 squircle anillo-foco transition-[border-color] duration-150 ease-suave hover:border-navy disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-texto-2"

/** Lo que se suma cuando el valor no sirve: borde rojo y más grueso, también en hover. */
export const CLASES_DE_CAMPO_CON_ERROR = "border-[1.5px] border-error hover:border-error"

/** La etiqueta, arriba del campo. */
export const CLASES_DE_ETIQUETA = "block text-sm font-medium text-navy"
