"use client"

import { useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import QRCode from "qrcode"
import { Download, Printer, QrCode } from "lucide-react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { MarcaDeEli } from "@/components/comunes/marca-de-eli"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"

interface PropsDeQrDelLocal {
  /** El slug del negocio: el QR lleva a `/reservar/<slug>`. */
  slug: string
  nombreNegocio: string
}

/**
 * El navy del sistema, leído del token (`--color-navy`) para no escribirlo a
 * mano: el QR es una imagen y no entiende de clases. Sin él, el mismo valor.
 */
function colorNavy(): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue("--color-navy").trim()
  return /^#[0-9a-f]{6}$/i.test(valor) ? valor : "#071A31"
}

/**
 * Corrección de errores media (M): aguanta un afiche algo gastado o con un
 * reflejo y deja los módulos grandes para una cámara a un metro.
 */
const opcionesDelQr = () => ({
  errorCorrectionLevel: "M" as const,
  color: { dark: colorNavy(), light: "#FFFFFF" },
})

/** Un nombre de archivo sin tildes ni símbolos. */
function nombreDelArchivo(slug: string): string {
  return `qr-reservas-${slug.replace(/[^a-z0-9-]/gi, "")}.png`
}

/**
 * "Tu QR para el local": el enlace de reservas como código QR, para pegarlo
 * en el espejo, la caja o la vitrina. Se genera en el navegador, con el
 * enlace de verdad; se baja como PNG o se imprime como afiche.
 *
 * El QR no se puede leer con un lector de pantalla: su nombre dice a dónde
 * lleva, y el enlace va escrito al lado.
 */
export function QrDelLocal({ slug, nombreNegocio }: PropsDeQrDelLocal) {
  const idDelTitulo = useId()
  const [enlace, setEnlace] = useState("")
  const [imagen, setImagen] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const url = `${window.location.origin}/reservar/${slug}`
    let vigente = true
    QRCode.toString(url, { ...opcionesDelQr(), type: "svg", margin: 2 })
      .then((svg) => {
        if (!vigente) return
        setEnlace(url)
        setImagen(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      })
      .catch(() => {
        if (vigente) setError("No se pudo generar el código QR.")
      })
    return () => {
      vigente = false
    }
  }, [slug])

  const descargar = async () => {
    try {
      const datos = await QRCode.toDataURL(enlace, { ...opcionesDelQr(), width: 1200, margin: 4 })
      const vinculo = document.createElement("a")
      vinculo.href = datos
      vinculo.download = nombreDelArchivo(slug)
      document.body.appendChild(vinculo)
      vinculo.click()
      vinculo.remove()
    } catch {
      setError("No se pudo generar la imagen. Intenta de nuevo.")
    }
  }

  const imprimir = () => {
    const raiz = document.documentElement
    raiz.setAttribute("data-imprimiendo-afiche", "")
    // En algunos navegadores `print()` vuelve antes de imprimir: la marca se
    // saca recién cuando la impresión terminó o se canceló.
    window.addEventListener("afterprint", () => raiz.removeAttribute("data-imprimiendo-afiche"), { once: true })
    window.print()
  }

  const nombreDelQr = enlace ? `Código QR que lleva a tu página de reservas: ${enlace}` : ""

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Tu QR para el local"
        subtitulo="Quien lo escanea llega directo a tu página de reservas."
        icono={{ figura: QrCode, color: "azul" }}
      />

      {error ? (
        <Aviso className="mt-5">{error}</Aviso>
      ) : (
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="w-40 shrink-0 self-center rounded-boton-lg p-1.5 shadow-[inset_0_0_0_1px_var(--color-borde)] squircle sm:self-auto">
            {imagen ? (
              // eslint-disable-next-line @next/next/no-img-element -- un data: generado en el navegador; next/image no aporta nada
              <img src={imagen} alt={nombreDelQr} className="block aspect-square w-full" />
            ) : (
              <Esqueleto className="block aspect-square h-auto w-full" />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2.5">
            <p className="font-mono text-sm break-all text-texto-2">{enlace || " "}</p>
            <Boton icono={<Printer />} tamano="sm" onClick={imprimir} disabled={!imagen} className="self-start">
              Imprimir afiche
            </Boton>
            <Boton
              variante="secundario"
              icono={<Download />}
              tamano="sm"
              onClick={descargar}
              disabled={!imagen}
              className="self-start"
            >
              Descargar imagen
            </Boton>
          </div>
        </div>
      )}

      <p className="mt-5 rounded-boton-lg bg-superficie px-4 py-3.5 text-sm text-pretty text-navy squircle">
        Pégalo en el espejo, en la caja o en la vitrina. Sirve también para tus historias de Instagram.
      </p>

      {imagen && createPortal(<Afiche nombreNegocio={nombreNegocio} imagen={imagen} enlace={enlace} />, document.body)}
    </section>
  )
}

/**
 * Lo que sale en la hoja al imprimir. No se ve en pantalla: lo muestran sólo
 * las reglas de impresión de `app/globals.css`, mientras dura "Imprimir afiche".
 */
function Afiche({ nombreNegocio, imagen, enlace }: { nombreNegocio: string; imagen: string; enlace: string }) {
  return (
    <div data-afiche="" aria-hidden="true">
      <div className="mx-auto flex min-h-[260mm] max-w-[180mm] flex-col items-center bg-crema px-10 py-14 text-center text-navy">
        <Antetitulo>{nombreNegocio}</Antetitulo>
        <p className="mt-4 font-serif text-6xl leading-[1.05] font-medium tracking-[-1.5px] text-balance">
          Reserva tu próxima hora
        </p>
        <p className="mt-4 text-xl text-texto-2">Escanea con la cámara de tu teléfono</p>
        <div className="mt-10 w-[110mm] rounded-[24px] bg-white p-4 shadow-[inset_0_0_0_2px_var(--color-navy)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- la misma imagen del QR, más grande */}
          <img src={imagen} alt="" className="block aspect-square w-full" />
        </div>
        <p className="mt-6 font-mono text-sm break-all text-texto-2">{enlace}</p>
        <p className="mt-auto inline-flex items-center gap-2 pt-10 text-base text-texto-2">
          <MarcaDeEli />
          Reservas con Eli
        </p>
      </div>
    </div>
  )
}
