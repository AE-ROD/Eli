"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Download, Printer } from "lucide-react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { MarcaDeEli } from "@/components/comunes/marca-de-eli"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { vocabularioDe } from "@/lib/vocabulario"
import { frasesDeConfiguracion } from "../_frases"

/**
 * `qrcode` se baja recién cuando la fila está encendida y se ve este recuadro,
 * como en el QR del inicio (`app/dashboard/_componentes/qr-del-local.tsx`).
 */
const cargarQrcode = () => import("qrcode").then((modulo) => modulo.default)

/** El navy del sistema, leído del token: el QR es una imagen y no entiende de clases. */
function colorNavy(): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue("--color-navy").trim()
  return /^#[0-9a-f]{6}$/i.test(valor) ? valor : "#071A31"
}

/** Corrección media (M): aguanta un afiche algo gastado o con reflejo, como el QR del inicio. */
const opcionesDelQr = () => ({
  errorCorrectionLevel: "M" as const,
  color: { dark: colorNavy(), light: "#FFFFFF" },
})

/** Un nombre de archivo sin tildes ni símbolos. */
function nombreDelArchivo(slug: string): string {
  return `qr-fila-${slug.replace(/[^a-z0-9-]/gi, "")}.png`
}

interface PropsDeQrDeLaFila {
  /** El enlace completo de la fila (`<origen>/fila/<slug>`); vacío mientras no se conoce el origen. */
  enlace: string
  slug: string
  nombreDelNegocio: string
}

/**
 * El enlace para anotarse en la fila virtual como código QR, para imprimirlo
 * y pegarlo en la entrada. Se genera en el navegador; se baja como PNG o se
 * imprime como afiche, con el mismo mecanismo que el QR de reservas del inicio
 * (`data-afiche` y `data-imprimiendo-afiche`, en `app/globals.css`).
 *
 * El QR no se lee con un lector de pantalla: su nombre dice a dónde lleva, y
 * el enlace va escrito arriba, en la misma tarjeta.
 */
export function QrDeLaFila({ enlace, slug, nombreDelNegocio }: PropsDeQrDeLaFila) {
  const frases = frasesDeConfiguracion(vocabularioDe(useRubroDelPanel()).palabras).filaVirtual.qr
  const [imagen, setImagen] = useState<{ enlace: string; datos: string } | null>(null)
  const [error, setError] = useState("")
  const [errorAlDescargar, setErrorAlDescargar] = useState("")

  useEffect(() => {
    if (!enlace) return
    let vigente = true
    const generar = async () => {
      const QRCode = await cargarQrcode()
      if (!vigente) return
      const svg = await QRCode.toString(enlace, { ...opcionesDelQr(), type: "svg", margin: 2 })
      if (!vigente) return
      setImagen({ enlace, datos: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` })
    }
    generar().catch(() => {
      if (vigente) setError("No se pudo generar el código QR.")
    })
    return () => {
      vigente = false
    }
  }, [enlace])

  // Sólo la imagen del enlace de ahora: si cambió, la anterior no sirve.
  const datos = imagen && imagen.enlace === enlace ? imagen.datos : null

  const descargar = async () => {
    setErrorAlDescargar("")
    try {
      const QRCode = await cargarQrcode()
      const png = await QRCode.toDataURL(enlace, { ...opcionesDelQr(), width: 1200, margin: 4 })
      const vinculo = document.createElement("a")
      vinculo.href = png
      vinculo.download = nombreDelArchivo(slug)
      document.body.appendChild(vinculo)
      vinculo.click()
      vinculo.remove()
    } catch {
      setErrorAlDescargar("No se pudo generar la imagen. Intenta de nuevo.")
    }
  }

  const imprimir = () => {
    const raiz = document.documentElement
    raiz.setAttribute("data-imprimiendo-afiche", "")
    window.addEventListener("afterprint", () => raiz.removeAttribute("data-imprimiendo-afiche"), { once: true })
    window.print()
  }

  if (error) return <Aviso className="mt-4">{error}</Aviso>

  return (
    <div className="mt-4 border-t border-borde pt-4">
      <p className="text-sm font-medium text-navy">{frases.titulo}</p>
      <p className="mt-1 text-sm text-texto-2">{frases.ayuda}</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="w-32 shrink-0 rounded-boton-lg bg-white p-1.5 shadow-[inset_0_0_0_1px_var(--color-borde)] squircle">
          {datos ? (
            // eslint-disable-next-line @next/next/no-img-element -- un data: generado en el navegador; next/image no aporta nada
            <img src={datos} alt={frases.nombre(enlace)} className="block aspect-square w-full" />
          ) : (
            <Esqueleto className="block aspect-square h-auto w-full" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <Boton icono={<Printer />} tamano="sm" onClick={imprimir} disabled={!datos} className="self-start">
            Imprimir afiche
          </Boton>
          <Boton variante="secundario" icono={<Download />} tamano="sm" onClick={descargar} disabled={!datos} className="self-start">
            Descargar imagen
          </Boton>
          {errorAlDescargar && <Aviso>{errorAlDescargar}</Aviso>}
        </div>
      </div>

      {datos &&
        createPortal(
          <div data-afiche="" aria-hidden="true">
            <div className="mx-auto flex min-h-[260mm] max-w-[180mm] flex-col items-center bg-crema px-10 py-14 text-center text-navy">
              <Antetitulo>{nombreDelNegocio}</Antetitulo>
              <p className="mt-4 font-serif text-6xl leading-[1.05] font-medium tracking-[-1.5px] text-balance">
                {frases.afiche.titulo}
              </p>
              <p className="mt-4 text-xl text-texto-2">{frases.afiche.subtitulo}</p>
              <div className="mt-10 w-[110mm] rounded-[24px] bg-white p-4 shadow-[inset_0_0_0_2px_var(--color-navy)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- la misma imagen del QR, más grande */}
                <img src={datos} alt="" className="block aspect-square w-full" />
              </div>
              <p className="mt-6 font-mono text-sm break-all text-texto-2">{enlace}</p>
              <p className="mt-auto inline-flex items-center gap-2 pt-10 text-base text-texto-2">
                <MarcaDeEli />
                Fila virtual con Eli
              </p>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
