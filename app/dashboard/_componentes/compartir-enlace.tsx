"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import { MessageCircle, QrCode, Share2 } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { enlaceDeWhatsApp } from "@/lib/lista-de-inicio"

/** `navigator.share` no cambia mientras la página está abierta: no hay a qué suscribirse. */
const sinSuscripcion = () => () => {}

/**
 * Si el navegador tiene la hoja de "Compartir" del sistema (casi todos los
 * teléfonos; pocos computadores). En el servidor y en la primera pintura,
 * `false`: así el HTML no cambia al hidratar.
 */
export function usePuedeCompartir(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )
}

export type ResultadoDeCompartir = "compartido" | "cancelado" | "fallo"

/**
 * Abre la hoja de "Compartir" del sistema con el mensaje (que ya lleva el
 * enlace). Cerrarla sin elegir nada no es un error.
 */
export async function compartirConElSistema(mensaje: string): Promise<ResultadoDeCompartir> {
  try {
    await navigator.share({ text: mensaje })
    return "compartido"
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelado"
    return "fallo"
  }
}

const AFUERA = { target: "_blank", rel: "noopener noreferrer" } as const

interface PropsDeBotonesParaCompartir {
  /** El mensaje entero, con el enlace (`mensajeParaCompartir`). */
  mensaje: string
  /** Después de mandarlo por WhatsApp o compartirlo (la lista de inicio lo da por compartido). */
  alCompartir?: () => void
  /** A dónde lleva "Ver QR". Sin él, el botón no aparece. */
  hrefDelQr?: string
  /** Al tocar "Ver QR", antes de ir (el modal de bienvenida se cierra). */
  alVerQr?: () => void
  /** Otros botones, después de WhatsApp (el "Copiar" de quien lo usa). */
  children?: ReactNode
}

/**
 * Las formas de hacer llegar el enlace de reservas, en botones con nombre:
 * "Enviar por WhatsApp" (abre WhatsApp con el mensaje escrito), "Compartir"
 * (sólo si el navegador tiene la hoja del sistema) y "Ver QR" (el código del
 * local, para imprimirlo o bajarlo).
 */
export function BotonesParaCompartir({ mensaje, alCompartir, hrefDelQr, alVerQr, children }: PropsDeBotonesParaCompartir) {
  const puedeCompartir = usePuedeCompartir()
  const [noSeCompartio, setNoSeCompartio] = useState(false)

  const compartir = async () => {
    setNoSeCompartio(false)
    const resultado = await compartirConElSistema(mensaje)
    if (resultado === "compartido") alCompartir?.()
    if (resultado === "fallo") setNoSeCompartio(true)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Boton href={enlaceDeWhatsApp(mensaje)} {...AFUERA} tamano="sm" icono={<MessageCircle />} onClick={alCompartir}>
          {/* En el celular se lee "WhatsApp" a secas, para que los botones entren en una fila. */}
          <span className="max-escritorio:sr-only">Enviar por </span>WhatsApp
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </Boton>
        {children}
        {puedeCompartir && (
          <Boton variante="secundario" tamano="sm" icono={<Share2 />} onClick={compartir}>
            Compartir
          </Boton>
        )}
        {hrefDelQr && (
          <Boton href={hrefDelQr} variante="secundario" tamano="sm" icono={<QrCode />} onClick={alVerQr}>
            <span className="max-escritorio:sr-only">Ver </span>QR
          </Boton>
        )}
      </div>
      <p role="status" className={noSeCompartio ? "mt-2 text-sm text-texto-2" : "sr-only"}>
        {noSeCompartio ? "No se pudo abrir Compartir en este navegador. Usa WhatsApp o copia el enlace." : ""}
      </p>
    </>
  )
}
