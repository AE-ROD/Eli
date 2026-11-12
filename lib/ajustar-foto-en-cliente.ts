/**
 * Las reglas de una foto antes de mandarla al servidor, sin pantalla: qué se
 * acepta, de qué tamaño sale y cuántos intentos se hacen para que pese poco.
 *
 * Por qué se ajusta en el navegador: una foto del celular pesa de 3 a 8 MB y
 * se muestra en un círculo de 80 px o en una portada de 832 px. Mandarla
 * entera gasta datos móviles de quien la sube y a veces ni cabe en el tope del
 * pedido. El navegador la achica y la recodifica (`components/panel/ajustar-foto.ts`,
 * que es la parte que toca el DOM); el servidor igual la valida y la vuelve a
 * procesar, así que nada de esto es una barrera de seguridad, sólo cortesía.
 */

/** Los formatos que el servidor acepta (`Content-Type` del PUT). */
export const TIPOS_DE_FOTO_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"] as const

export type TipoDeFoto = (typeof TIPOS_DE_FOTO_ACEPTADOS)[number]

/** Para el `accept` del `<input type="file">`: el selector de archivos ofrece sólo estos. */
export const ACCEPT_DE_FOTO = TIPOS_DE_FOTO_ACEPTADOS.join(",")

/** Lo más que se lee de entrada: una foto de celular grande pesa 8 MB; 15 deja margen sin abrir una bomba. */
export const MAXIMO_DE_ENTRADA_EN_BYTES = 15 * 1024 * 1024

/** Lo que se busca mandar: con esto un celular con datos móviles no se queda esperando. */
export const OBJETIVO_A_ENVIAR_EN_BYTES = 1.5 * 1024 * 1024

/**
 * Cómo se muestra la foto: `circulo` para una persona o un logo, `banner` para
 * la portada. Decide hasta cuántos píxeles de lado se conserva.
 */
export type FormaDeFoto = "circulo" | "banner"

/**
 * El lado largo máximo de lo que se manda. Un círculo se ve a 80 px como
 * mucho: 800 cubre una pantalla de alta densidad con holgura. La portada se
 * ve a 832 px de ancho: 1600 cubre la misma densidad.
 */
const LADO_MAXIMO: Record<FormaDeFoto, number> = { circulo: 800, banner: 1600 }

export function ladoMaximoDe(forma: FormaDeFoto): number {
  return LADO_MAXIMO[forma]
}

export interface Dimensiones {
  ancho: number
  alto: number
}

/**
 * Las dimensiones a las que se dibuja la foto: la misma proporción, con el
 * lado largo en `maxLado` como mucho. Nunca agranda: una foto más chica que
 * el máximo queda como está. Ningún lado baja de 1 px. `null` si algún dato no
 * es un número positivo (una imagen sin tamaño no se puede dibujar).
 */
export function dimensionesDestino(ancho: number, alto: number, maxLado: number): Dimensiones | null {
  if (![ancho, alto, maxLado].every((valor) => Number.isFinite(valor) && valor > 0)) return null
  const escala = Math.min(1, maxLado / Math.max(ancho, alto))
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  }
}

export type ResultadoDeValidacion = { ok: true } | { ok: false; error: string }

const MB = 1024 * 1024

/**
 * Si el archivo que eligió la persona se puede intentar. Se mira el tipo que
 * declara el navegador y el tamaño, nada más: si el contenido no es una imagen
 * de verdad, lo dice `createImageBitmap` al leerla (y, antes de guardar, el
 * servidor).
 */
export function validarFotoDeEntrada(archivo: { type: string; size: number }): ResultadoDeValidacion {
  const tipo = archivo.type.toLowerCase()
  if (tipo === "image/heic" || tipo === "image/heif") {
    return { ok: false, error: "Esa foto está en formato HEIC y no se puede subir. Elige otra en JPG, PNG o WebP." }
  }
  if (!(TIPOS_DE_FOTO_ACEPTADOS as readonly string[]).includes(tipo)) {
    return { ok: false, error: "Elige una foto en formato JPG, PNG o WebP." }
  }
  if (archivo.size <= 0) return { ok: false, error: "El archivo está vacío. Elige otra foto." }
  if (archivo.size > MAXIMO_DE_ENTRADA_EN_BYTES) {
    return { ok: false, error: `La foto pesa más de ${MAXIMO_DE_ENTRADA_EN_BYTES / MB} MB. Elige una más liviana.` }
  }
  return { ok: true }
}

/** Un intento de recodificar: el lado largo y la calidad (0 a 1) con que se comprime. */
export interface IntentoDeCompresion {
  lado: number
  calidad: number
}

/**
 * Los intentos, del que más calidad conserva al que más comprime, hasta que
 * uno cabe en `OBJETIVO_A_ENVIAR_EN_BYTES`. Casi toda foto cabe en el primero;
 * los siguientes existen para la que es puro detalle (una foto nítida de
 * mucho follaje) y para que no se quede en un error si el primero pasa por poco.
 */
export function intentosDeCompresion(maxLado: number): IntentoDeCompresion[] {
  return [
    { lado: maxLado, calidad: 0.85 },
    { lado: maxLado, calidad: 0.7 },
    { lado: Math.round(maxLado * 0.75), calidad: 0.7 },
    { lado: Math.round(maxLado * 0.5), calidad: 0.6 },
  ]
}
