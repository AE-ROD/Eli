"use client"

import { useState, useSyncExternalStore } from "react"
import { Copy, MessageCircle } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { cn } from "@/lib/utils"

/**
 * "Enviármelo por WhatsApp": el chat de WhatsApp sin destinatario, con el
 * texto ya escrito (`https://wa.me/?text=…`). Quien lo abre elige a quién
 * mandárselo, normalmente a sí mismo. El texto va codificado entero.
 */
export function enlaceParaMandarPorWhatsapp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`
}

/** El enlace completo (`https://…/reservar/…`) a partir de la ruta, con el origen de la página. */
export function enlaceCompleto(ruta: string, origen: string): string {
  if (!origen) return ruta
  try {
    return new URL(ruta, origen).href
  } catch {
    return ruta
  }
}

const sinSuscripcion = () => () => {}

/**
 * Guardar un enlace que sólo existe en esta pantalla (el de cancelar o cambiar
 * la reserva sin correo, el del turno de la fila): "Copiar enlace" y
 * "Enviármelo por WhatsApp". El enlace también va escrito, para copiarlo a
 * mano si el navegador no deja copiar. Lo que pasó al copiar se dice en una
 * región `status`, que existe siempre para que el lector de pantalla lo lea.
 */
export function GuardarEnlace({
  ruta,
  mensaje,
  textoDeCopiar = "Copiar enlace",
  className,
}: {
  /** La ruta del enlace (`/reservar/…`) o el enlace completo. */
  ruta: string
  /** El texto del mensaje de WhatsApp, con el enlace completo adentro. */
  mensaje: (enlace: string) => string
  textoDeCopiar?: string
  className?: string
}) {
  // El origen sólo existe en el navegador; en el servidor, la ruta tal cual.
  const origen = useSyncExternalStore(
    sinSuscripcion,
    () => window.location.origin,
    () => ""
  )
  const enlace = enlaceCompleto(ruta, origen)
  const [aviso, setAviso] = useState("")

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace)
      setAviso("Enlace copiado.")
    } catch {
      setAviso("No se pudo copiar solo: mantén apretado el enlace de abajo para copiarlo.")
    }
  }

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <Boton variante="secundario" icono={<Copy />} onClick={copiar} className="w-full sm:w-auto">
          {textoDeCopiar}
        </Boton>
        <Boton
          href={enlaceParaMandarPorWhatsapp(mensaje(enlace))}
          variante="secundario"
          icono={<MessageCircle />}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto"
        >
          Enviármelo por WhatsApp
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </Boton>
      </div>
      <p className="text-xs break-all text-texto-2">{enlace}</p>
      <p role="status" className="text-sm text-navy">
        {aviso}
      </p>
    </div>
  )
}
