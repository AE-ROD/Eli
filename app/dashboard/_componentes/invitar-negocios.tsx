"use client"

import { useId, useState } from "react"
import { Check, Copy, Gift } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Insignia } from "@/components/comunes/insignia"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { enlaceDeInvitacion, type DatosDeInvitacion } from "@/lib/invitar-negocios"
import { DIAS_EXTRA_POR_REFERIDO } from "@/lib/precios"
import { cn } from "@/lib/utils"

/** "1 negocio se registró", "3 negocios se registraron". */
function textoDeRegistrados(cuantos: number): string {
  return cuantos === 1
    ? "1 negocio se registró con tu enlace."
    : `${cuantos} negocios se registraron con tu enlace.`
}

/**
 * "Invita a otro negocio": el enlace de invitación del negocio, para copiarlo,
 * y si ya sumó sus días por invitar. Sólo la ve el dueño
 * (`puedeInvitarNegocios`). De los invitados no muestra nada más que cuántos
 * son: son negocios de otra gente.
 */
export function InvitarNegocios({ datos }: { datos: DatosDeInvitacion }) {
  const idDelTitulo = useId()
  const [copiado, setCopiado] = useState(false)
  // Como en `EnlaceDeReservas`: la tarjeta se dibuja recién cuando llegan los
  // datos, ya en el navegador, así que el origen está.
  const enlace = enlaceDeInvitacion(typeof window !== "undefined" ? window.location.origin : "", datos.codigo)

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(enlace)
    } catch {
      return
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Invita a otro negocio"
        subtitulo={`Si un negocio crea su cuenta con tu enlace y recibe su primera reserva, sumas ${DIAS_EXTRA_POR_REFERIDO} días a tu prueba. Una vez.`}
        icono={{ figura: Gift, color: "lima" }}
        accion={
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={copiarEnlace}
            icono={copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          >
            {copiado ? "Copiado" : "Copiar"}
            <span className="sr-only"> el enlace de invitación</span>
          </Boton>
        }
      />

      {/* Entero, aunque baje de renglón: es lo que se va a compartir. */}
      <p className="mt-4 rounded-[12px] bg-superficie px-3 py-2 font-mono text-sm break-all text-navy squircle">
        {enlace}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        {datos.yaSumoLosDias ? (
          <Insignia tono="lima">Ya sumaste {DIAS_EXTRA_POR_REFERIDO} días por invitar</Insignia>
        ) : (
          <Insignia>Aún sin días sumados por invitar</Insignia>
        )}
        {datos.registrados > 0 && <p className="text-sm text-texto-2">{textoDeRegistrados(datos.registrados)}</p>}
      </div>

      {/* El texto del botón cambia, pero el lector de pantalla no siempre lo dice: esto sí. */}
      <p role="status" className="sr-only">
        {copiado ? "Enlace de invitación copiado" : ""}
      </p>
    </section>
  )
}
