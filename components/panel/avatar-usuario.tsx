"use client"

import Image from "next/image"
import { FONDO_FUERTE } from "@/components/comunes/colores-de-modulo"
import type { ColorDeModulo } from "@/lib/modulos"
import { cn } from "@/lib/utils"

interface PropsDeAvatarUsuario {
  nombre: string
  imagenUrl?: string
  tamaño?: "xs" | "sm" | "md" | "lg" | "xl"
  enLinea?: boolean
}

const tamañosClases = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-xl",
}

const tamañosIndicador = {
  xs: "size-1.5 ring-1",
  sm: "size-2 ring-[1.5px]",
  md: "size-2.5 ring-2",
  lg: "size-3 ring-2",
  xl: "size-4 ring-2",
}

/**
 * Los pasteles fuertes, con las iniciales en navy: todos pasan de 9:1. Las
 * iniciales blancas sobre los colores de antes quedaban entre 2,1 y 3,7:1.
 */
const COLORES = Object.keys(FONDO_FUERTE) as ColorDeModulo[]

function obtenerIniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .map((parte) => parte[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** El mismo nombre da siempre el mismo color. */
function obtenerColorFondo(nombre: string): string {
  const indice = nombre.split("").reduce((suma, letra) => suma + letra.charCodeAt(0), 0) % COLORES.length
  return FONDO_FUERTE[COLORES[indice]]
}

/**
 * La foto de una persona o, sin foto, sus iniciales sobre un pastel. Es
 * decorativo: siempre va junto al nombre, que es lo que se lee, así que no
 * repite el nombre para el lector de pantalla. Todo es `span` para que pueda
 * ir dentro de un botón (una tarjeta que se abre).
 */
export function AvatarUsuario({ nombre, imagenUrl, tamaño = "md", enLinea }: PropsDeAvatarUsuario) {
  return (
    <span className="relative block shrink-0">
      {imagenUrl ? (
        <Image
          src={imagenUrl}
          alt=""
          width={64}
          height={64}
          className={cn(tamañosClases[tamaño], "block rounded-full object-cover")}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            tamañosClases[tamaño],
            obtenerColorFondo(nombre),
            "flex items-center justify-center rounded-full font-medium tracking-[0.02em] text-navy select-none"
          )}
        >
          {obtenerIniciales(nombre)}
        </span>
      )}
      {enLinea !== undefined && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-0 bottom-0 rounded-full ring-tarjeta",
            tamañosIndicador[tamaño],
            enLinea ? "bg-lima" : "bg-texto-2"
          )}
        />
      )}
    </span>
  )
}
