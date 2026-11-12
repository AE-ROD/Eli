"use client"

import { Camera } from "lucide-react"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { cn } from "@/lib/utils"

interface PropsDeBotonDeMiFoto {
  /** La persona en sesión: de ahí salen las iniciales mientras no hay foto. */
  nombre: string
  /** La foto de su cuenta, o `undefined` si no tiene. */
  imagenUrl?: string
  /** Abre "Mi foto". Sin él (no hay proveedor) el avatar se ve, pero no es un botón. */
  alAbrir?: () => void
  className?: string
}

/**
 * El avatar de quien está en sesión: con su foto de cuenta, o sus iniciales.
 * Es también el botón "Cambiar mi foto": se toca el avatar y se abre el modal.
 *
 * El nombre accesible del botón es la acción ("Cambiar mi foto"); la foto en
 * sí es decorativa y no repite el nombre (`AvatarUsuario` va con `alt=""`): a
 * la persona la nombra el texto que está al lado, que sigue siendo su nombre.
 * 40 px a la vista y 44 de área táctil (`after:-inset-0.5`); el anillo del
 * foco es el de siempre. La cámara chica es sólo una pista visual.
 */
export function BotonDeMiFoto({ nombre, imagenUrl, alAbrir, className }: PropsDeBotonDeMiFoto) {
  if (!alAbrir) return <AvatarUsuario nombre={nombre} imagenUrl={imagenUrl} tamaño="md" />

  return (
    <button
      type="button"
      onClick={alAbrir}
      aria-label="Cambiar mi foto"
      title="Cambiar mi foto"
      className={cn(
        "group relative block shrink-0 rounded-full anillo-foco after:absolute after:-inset-0.5",
        className
      )}
    >
      <AvatarUsuario nombre={nombre} imagenUrl={imagenUrl} tamaño="md" />
      <span
        aria-hidden="true"
        className="absolute -right-1 -bottom-1 grid size-[18px] place-items-center rounded-full bg-tarjeta text-navy ring-1 ring-borde transition-colors duration-150 ease-suave group-hover:bg-superficie"
      >
        <Camera className="size-2.5" strokeWidth={2} />
      </span>
    </button>
  )
}
