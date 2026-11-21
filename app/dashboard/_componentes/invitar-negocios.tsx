"use client"

import { useId, useState } from "react"
import { Check, ChevronDown, Copy, Gift } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Insignia } from "@/components/comunes/insignia"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { RELLENO_DE_TARJETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
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
  const idDeLaTarjeta = useId()
  const [copiado, setCopiado] = useState(false)
  // En el celular la tarjeta arranca plegada en una fila: no es lo del día.
  const [abierta, setAbierta] = useState(false)
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
    <div className="flex flex-col gap-2">
      {/* Sólo en el celular: la fila que abre y cierra la tarjeta. En el computador va abierta siempre. */}
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idDeLaTarjeta}
        onClick={() => setAbierta((antes) => !antes)}
        className="flex min-h-12 w-full items-center gap-3 rounded-[16px] bg-lima-suave px-3.5 py-2.5 text-left text-sm font-medium text-navy squircle anillo-foco escritorio:hidden"
      >
        <Gift className="size-5 shrink-0" aria-hidden="true" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">Invita a otro negocio y suma {DIAS_EXTRA_POR_REFERIDO} días</span>
        <ChevronDown
          className={cn("size-5 shrink-0 transition-transform duration-200 ease-suave", abierta && "rotate-180")}
          aria-hidden="true"
          strokeWidth={1.75}
        />
      </button>
      <section
        id={idDeLaTarjeta}
        aria-labelledby={idDelTitulo}
        className={cn(TARJETA_DEL_PANEL, RELLENO_DE_TARJETA, !abierta && "max-escritorio:hidden")}
      >
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
    </div>
  )
}
