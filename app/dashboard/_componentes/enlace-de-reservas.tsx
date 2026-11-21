"use client"

import { useId, useState } from "react"
import { ArrowUpRight, Check, Copy, Link2 } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { RELLENO_DE_TARJETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { mensajeParaCompartir } from "@/lib/lista-de-inicio"
import { cn } from "@/lib/utils"
import { BotonesParaCompartir } from "./compartir-enlace"

interface PropsDeEnlaceDeReservas {
  /** El slug del negocio: la página pública es `/reservar/<slug>`. */
  slug: string
  /**
   * Después de copiarlo, mandarlo por WhatsApp o compartirlo (para la lista de
   * inicio: el enlace ya se compartió). Lo que haga no frena ni deshace nada.
   */
  alCompartir?: () => void
  /** Si "Ver QR" lleva a la tarjeta del QR (`#qr-del-local`), cuando está en la pantalla. */
  conQr?: boolean
}

/**
 * El enlace público de reservas del negocio, para mandarlo por WhatsApp,
 * copiarlo, compartirlo, ver su QR o abrir la página.
 */
export function EnlaceDeReservas({ slug, alCompartir, conQr = false }: PropsDeEnlaceDeReservas) {
  const idDelTitulo = useId()
  const rubro = useRubroDelPanel()
  const [copiado, setCopiado] = useState(false)
  const [noSeCopio, setNoSeCopio] = useState(false)
  const enlace =
    typeof window !== "undefined" ? `${window.location.origin}/reservar/${slug}` : `/reservar/${slug}`
  const mensaje = mensajeParaCompartir(rubro, enlace)

  // El portapapeles puede negarse (permiso, una página sin HTTPS, un navegador
  // viejo): entonces se dice y el enlace queda escrito para copiarlo a mano.
  // Sólo un copiado de verdad cuenta como compartido.
  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(enlace)
    } catch {
      setCopiado(false)
      setNoSeCopio(true)
      return
    }
    setNoSeCopio(false)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
    alCompartir?.()
  }

  return (
    // `id`: a dónde lleva el paso "Comparte tu enlace" de la lista de inicio.
    <section
      id="enlace-de-reservas"
      aria-labelledby={idDelTitulo}
      className={cn(TARJETA_DEL_PANEL, "scroll-mt-24", RELLENO_DE_TARJETA)}
    >
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Tu enlace de reservas"
        // Entero, aunque baje de renglón: es lo que se va a compartir.
        // En el celular, en una línea (se corta con "…"); si no se pudo copiar, entero, para copiarlo a mano.
        subtitulo={
          <span className={cn("font-mono text-navy", noSeCopio ? "break-all" : "max-escritorio:block max-escritorio:truncate escritorio:break-all")}>
            {enlace}
          </span>
        }
        icono={{ figura: Link2, color: "azul" }}
        accion={
          <Boton
            href={`/reservar/${slug}`}
            target="_blank"
            variante="secundario"
            tamano="sm"
            icono={<ArrowUpRight aria-hidden="true" />}
          >
            Ver página
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </Boton>
        }
      />
      <div className="mt-3 escritorio:mt-4">
        <BotonesParaCompartir mensaje={mensaje} alCompartir={alCompartir} hrefDelQr={conQr ? "#qr-del-local" : undefined}>
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={copiarEnlace}
            icono={copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          >
            {copiado ? "Copiado" : "Copiar"}
          </Boton>
        </BotonesParaCompartir>
      </div>
      {/* El texto del botón cambia, pero el lector de pantalla no siempre lo dice: esto sí. */}
      <p role="status" className={noSeCopio ? "mt-3 text-sm text-texto-2" : "sr-only"}>
        {copiado ? "Enlace copiado" : noSeCopio ? "No se pudo copiar. Selecciona el enlace de arriba y cópialo a mano." : ""}
      </p>
    </section>
  )
}
