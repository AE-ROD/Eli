"use client"

import { useState, type ReactNode } from "react"
import Image, { type ImageProps } from "next/image"

interface PropsDeImagenConRespaldo extends Omit<ImageProps, "onError"> {
  /**
   * Lo que se muestra si la imagen no carga (iniciales, un color liso, nada).
   * Sin él, un error de carga deja el lugar vacío en vez del ícono de imagen rota.
   */
  respaldo?: ReactNode
}

/**
 * Una imagen que no deja un hueco roto: si el archivo no carga (la foto se
 * quitó, el almacenamiento no responde, se cortó la conexión), muestra el
 * `respaldo`. Es la `Image` de Next con las mismas props; recuerda cuál `src`
 * falló, así que al cambiar a otra foto vuelve a intentar.
 */
export function ImagenConRespaldo({ respaldo = null, src, alt, ...resto }: PropsDeImagenConRespaldo) {
  const [fallida, setFallida] = useState<ImageProps["src"] | null>(null)
  if (fallida === src) return <>{respaldo}</>
  return <Image {...resto} src={src} alt={alt} onError={() => setFallida(src)} />
}
