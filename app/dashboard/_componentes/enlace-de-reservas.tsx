"use client"

import { useId, useState } from "react"
import { ArrowUpRight, Check, Copy, Link2 } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"

interface PropsDeEnlaceDeReservas {
  /** El slug del negocio: la página pública es `/reservar/<slug>`. */
  slug: string
}

/** El enlace público de reservas del negocio, para copiarlo o abrirlo. */
export function EnlaceDeReservas({ slug }: PropsDeEnlaceDeReservas) {
  const idDelTitulo = useId()
  const [copiado, setCopiado] = useState(false)
  const enlace =
    typeof window !== "undefined" ? `${window.location.origin}/reservar/${slug}` : `/reservar/${slug}`

  const copiarEnlace = async () => {
    await navigator.clipboard.writeText(enlace)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Tu enlace de reservas"
        // Entero, aunque baje de renglón: es lo que se va a compartir.
        subtitulo={<span className="font-mono break-all text-navy">{enlace}</span>}
        icono={{ figura: Link2, color: "azul" }}
        accion={
          <>
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={copiarEnlace}
              icono={copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            >
              {copiado ? "Copiado" : "Copiar"}
            </Boton>
            <Boton href={`/reservar/${slug}`} target="_blank" tamano="sm" icono={<ArrowUpRight aria-hidden="true" />}>
              Ver página
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </Boton>
          </>
        }
      />
      {/* El texto del botón cambia, pero el lector de pantalla no siempre lo dice: esto sí. */}
      <p role="status" className="sr-only">
        {copiado ? "Enlace copiado" : ""}
      </p>
    </section>
  )
}
