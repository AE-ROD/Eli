import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge resuelve los choques entre clases de Tailwind que conoce,
 * pero no los nombres propios de los tokens de `app/globals.css`: sin esto,
 * `cn("rounded-tarjeta", "rounded-[24px]")` dejaba las dos y ganaba la que el
 * CSS escribía después, que va por orden alfabético. Los colores y las
 * sombras con nombre de tamaño ya los reconoce solo (`bg-navy`, `shadow-md`).
 * Un radio, una curva o una animación nueva en `@theme` suma acá su nombre;
 * una sombra con nombre propio, en una lista `shadow`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['boton', 'boton-lg', 'campo', 'panel', 'tarjeta', 'seccion'],
      ease: ['suave', 'fundido'],
      animate: ['brillo'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
