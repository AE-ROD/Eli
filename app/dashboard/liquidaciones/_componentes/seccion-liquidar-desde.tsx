"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarCheck, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { fechaParaLeer } from "@/lib/periodos-de-liquidacion"
import { cn } from "@/lib/utils"
import { guardarLiquidarDesde } from "../_datos"

interface Props {
  /** La guardada, o `null` si todavía no se fijó. */
  liquidarDesde: string | null
  /** Hoy en la zona del negocio: lo que se propone por defecto. */
  hoy: string
  /** La dueña (`puedeConfigurarLiquidacion`). */
  editable: boolean
  /** Ya hay liquidaciones no anuladas: la fecha queda fija. */
  bloqueada: boolean
}

/**
 * "Liquidar desde": lo cobrado antes de esta fecha nunca entra a una
 * liquidación (lo que ya se pagó por fuera de Eli no se paga dos veces).
 * Mientras no esté fijada, no se liquida. La fija la dueña, y se puede
 * cambiar hasta que se cierre la primera liquidación.
 */
export function SeccionLiquidarDesde({ liquidarDesde, hoy, editable, bloqueada }: Props) {
  const router = useRouter()
  const idDelTitulo = useId()
  const idDelCampo = useId()
  const [fecha, setFecha] = useState(liquidarDesde ?? hoy)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setError("")
    if (!fecha) return setError("Elige la fecha.")
    setGuardando(true)
    const resultado = await guardarLiquidarDesde(fecha)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    router.refresh()
  }

  const subtitulo = liquidarDesde
    ? `Se liquida lo cobrado desde el ${fechaParaLeer(liquidarDesde)}`
    : "Todavía no se eligió desde qué fecha se liquida"

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta id={idDelTitulo} titulo="Liquidar desde" subtitulo={subtitulo} icono={{ figura: CalendarCheck }} />
      {!liquidarDesde && !editable && (
        <Aviso tono="info" className="mt-4">
          La dueña tiene que elegir desde qué fecha se liquida antes de cerrar la primera liquidación.
        </Aviso>
      )}
      {editable && !bloqueada && (
        <form onSubmit={guardar} className="mt-5 space-y-4">
          <div className="max-w-xs space-y-2">
            <label htmlFor={idDelCampo} className={CLASES_DE_ETIQUETA}>
              Liquidar lo cobrado desde
            </label>
            <input id={idDelCampo} type="date" value={fecha} onChange={(evento) => setFecha(evento.target.value)} className={CAMPO} />
          </div>
          <p className="text-sm text-texto-2">
            Lo cobrado antes de esta fecha, y los adelantos y vales anteriores, no entran nunca: úsala para no pagar dos
            veces lo que ya pagaste por fuera. Puedes cambiarla hasta cerrar la primera liquidación.
          </p>
          <BotonPrimario type="submit" tamaño="sm" icono={<Save className="h-4 w-4" />} cargando={guardando}>
            Guardar
          </BotonPrimario>
          {error && <Aviso>{error}</Aviso>}
        </form>
      )}
      {editable && bloqueada && (
        <p className="mt-4 text-sm text-texto-2">Ya hay liquidaciones cerradas: esta fecha ya no se cambia.</p>
      )}
    </section>
  )
}
