"use client"

import Image from "next/image"

interface AvatarUsuarioProps {
  nombre: string
  imagenUrl?: string
  tamaño?: "xs" | "sm" | "md" | "lg" | "xl"
  enLinea?: boolean
}

const tamañosClases = {
  xs: "w-6 h-6 text-xs",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-16 h-16 text-xl",
}

const tamañosIndicador = {
  xs: "w-1.5 h-1.5 border",
  sm: "w-2 h-2 border",
  md: "w-2.5 h-2.5 border-2",
  lg: "w-3 h-3 border-2",
  xl: "w-4 h-4 border-2",
}

function obtenerIniciales(nombre: string): string {
  return nombre
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function obtenerColorFondo(nombre: string): string {
  const colores = [
    "bg-blue-500",
    "bg-green-500",
    "bg-amber-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-orange-500",
  ]
  const indice = nombre.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colores.length
  return colores[indice]
}

export function AvatarUsuario({
  nombre,
  imagenUrl,
  tamaño = "md",
  enLinea,
}: AvatarUsuarioProps) {
  return (
    <div className="relative">
      {imagenUrl ? (
        <Image
          src={imagenUrl}
          alt={nombre}
          width={64}
          height={64}
          className={`${tamañosClases[tamaño]} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`
            ${tamañosClases[tamaño]} 
            ${obtenerColorFondo(nombre)}
            rounded-full flex items-center justify-center text-white font-medium
          `}
        >
          {obtenerIniciales(nombre)}
        </div>
      )}
      {enLinea !== undefined && (
        <span
          className={`
            absolute bottom-0 right-0 
            ${tamañosIndicador[tamaño]}
            rounded-full border-background
            ${enLinea ? "bg-green-500" : "bg-gray-400"}
          `}
        />
      )}
    </div>
  )
}
