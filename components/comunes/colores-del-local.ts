import type { ClaveDeColor } from "@/lib/pagina-del-negocio"

/**
 * Las clases de cada color de la paleta del local (`PALETA_DEL_LOCAL`, en
 * `lib/pagina-del-negocio.ts`), escritas enteras para que Tailwind las
 * genere. Fondo y texto van juntos: son el par que el test comprueba con
 * contraste AA. Las usan la página pública y el selector de Configuración.
 *
 * `Record` sobre la clave: un color nuevo en la paleta no compila hasta que
 * tenga sus clases acá.
 */
export const CLASES_DEL_LOCAL: Record<ClaveDeColor, string> = {
  cielo: "bg-azul text-navy",
  durazno: "bg-naranja text-navy",
  lavanda: "bg-lila text-navy",
  pistacho: "bg-lima text-navy",
  menta: "bg-turquesa text-navy",
  arena: "bg-borde text-navy",
  noche: "bg-navy text-crema",
}
