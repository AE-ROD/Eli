/**
 * La parte de ajustar una foto que necesita el navegador: leerla (con su
 * orientación), dibujarla más chica en un `<canvas>` y codificarla de nuevo.
 * Las reglas (qué se acepta, a qué tamaño, cuántos intentos) son puras y viven
 * en `lib/ajustar-foto-en-cliente.ts`, con su test; acá sólo se las aplica.
 *
 * Sólo se llama desde un componente de cliente, en respuesta a que alguien
 * eligió un archivo. Recodificar la foto además le quita los datos EXIF, entre
 * ellos el lugar donde se tomó.
 */

import {
  OBJETIVO_A_ENVIAR_EN_BYTES,
  dimensionesDestino,
  intentosDeCompresion,
  ladoMaximoDe,
  validarFotoDeEntrada,
  type FormaDeFoto,
} from "@/lib/ajustar-foto-en-cliente"

export type ResultadoDeAjuste = { ok: true; foto: Blob } | { ok: false; error: string }

const NO_SE_PUDO_LEER = "No se pudo leer esa foto. Prueba con otra."
const SIGUE_PESANDO_DEMASIADO = "La foto sigue pesando demasiado aun achicada. Prueba con otra."

/** `toBlob` como promesa. Es `null` si el navegador no pudo codificar. */
function aBlob(lienzo: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolver) => lienzo.toBlob(resolver, tipo, calidad))
}

/**
 * Lee la imagen respetando la orientación que trae (una foto vertical del
 * celular se guarda de lado con una marca que dice cómo girarla). Los
 * navegadores que no entienden la opción la ignoran o fallan: se reintenta sin ella.
 */
async function leerImagen(archivo: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(archivo, { imageOrientation: "from-image" })
  } catch {
    try {
      return await createImageBitmap(archivo)
    } catch {
      return null
    }
  }
}

/**
 * La foto lista para mandar: achicada al tamaño que pide su forma, en WebP
 * (JPEG en un navegador que no sabe codificar WebP) y de menos de ~1,5 MB.
 * Nunca lanza: lo que sale mal vuelve como `{ ok: false, error }` con un
 * mensaje que se puede mostrar tal cual.
 */
export async function ajustarFoto(archivo: File, forma: FormaDeFoto): Promise<ResultadoDeAjuste> {
  const previa = validarFotoDeEntrada(archivo)
  if (!previa.ok) return previa

  const imagen = await leerImagen(archivo)
  if (!imagen) return { ok: false, error: NO_SE_PUDO_LEER }

  try {
    const lienzo = document.createElement("canvas")
    const contexto = lienzo.getContext("2d")
    if (!contexto) return { ok: false, error: NO_SE_PUDO_LEER }

    // Safari antiguo no codifica WebP y devuelve un PNG: en ese caso se pasa a
    // JPEG para este intento y los que siguen.
    let soloJpeg = false

    for (const intento of intentosDeCompresion(ladoMaximoDe(forma))) {
      const destino = dimensionesDestino(imagen.width, imagen.height, intento.lado)
      if (!destino) return { ok: false, error: NO_SE_PUDO_LEER }

      // Cambiar el tamaño del lienzo lo deja en blanco y devuelve el contexto a sus valores de fábrica.
      lienzo.width = destino.ancho
      lienzo.height = destino.alto
      contexto.imageSmoothingQuality = "high"
      const pintar = (fondoBlanco: boolean) => {
        // Un JPEG no tiene transparencia: un logo con fondo transparente saldría negro.
        if (fondoBlanco) {
          contexto.fillStyle = "#ffffff"
          contexto.fillRect(0, 0, destino.ancho, destino.alto)
        }
        contexto.drawImage(imagen, 0, 0, destino.ancho, destino.alto)
      }

      let blob: Blob | null = null
      if (!soloJpeg) {
        pintar(false)
        blob = await aBlob(lienzo, "image/webp", intento.calidad)
        if (blob?.type !== "image/webp") {
          soloJpeg = true
          blob = null
          contexto.clearRect(0, 0, destino.ancho, destino.alto)
        }
      }
      if (soloJpeg) {
        pintar(true)
        blob = await aBlob(lienzo, "image/jpeg", intento.calidad)
      }
      if (!blob) return { ok: false, error: NO_SE_PUDO_LEER }
      if (blob.size <= OBJETIVO_A_ENVIAR_EN_BYTES) return { ok: true, foto: blob }
    }
    return { ok: false, error: SIGUE_PESANDO_DEMASIADO }
  } finally {
    imagen.close()
  }
}
