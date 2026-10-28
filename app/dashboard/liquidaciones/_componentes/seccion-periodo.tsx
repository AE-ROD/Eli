"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarRange, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Selector } from "@/components/comunes/selector"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import {
  DIAS_DE_LA_SEMANA,
  NOMBRES_DE_PERIODO,
  TIPOS_DE_PERIODO,
  type ConfiguracionDePeriodo,
  type TipoDePeriodo,
} from "@/lib/periodos-de-liquidacion"
import { cn } from "@/lib/utils"
import { guardarConfiguracion } from "../_datos"

/**
 * Cada cuánto se liquida al equipo. La edita sólo la dueña; el encargado la
 * ve. Cambiarla afecta lo que viene: la próxima liquidación de cada uno
 * arranca al día siguiente de su última.
 */
export function SeccionPeriodo({ inicial, editable }: { inicial: ConfiguracionDePeriodo; editable: boolean }) {
  const router = useRouter()
  const idDelTitulo = useId()
  const [config, setConfig] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [listo, setListo] = useState(false)
  const pendiente = config.periodo !== inicial.periodo || config.inicioSemana !== inicial.inicioSemana

  const texto =
    inicial.periodo === "semanal"
      ? `Semanal, de ${DIAS_DE_LA_SEMANA[inicial.inicioSemana].toLowerCase()} a ${DIAS_DE_LA_SEMANA[(inicial.inicioSemana + 6) % 7].toLowerCase()}`
      : NOMBRES_DE_PERIODO[inicial.periodo]

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setError("")
    setListo(false)
    setGuardando(true)
    const resultado = await guardarConfiguracion(config)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    setListo(true)
    router.refresh()
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Período"
        subtitulo={editable ? "Cada cuánto le pagas al equipo" : texto}
        icono={{ figura: CalendarRange }}
      />
      {editable && (
        <form onSubmit={guardar} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Selector
              etiqueta="Cada cuánto"
              value={config.periodo}
              onChange={(evento) => {
                setConfig({ ...config, periodo: evento.target.value as TipoDePeriodo })
                setListo(false)
              }}
              opciones={TIPOS_DE_PERIODO.map((tipo) => ({ valor: tipo, texto: NOMBRES_DE_PERIODO[tipo] }))}
            />
            {config.periodo === "semanal" && (
              <Selector
                etiqueta="La semana empieza el"
                value={String(config.inicioSemana)}
                onChange={(evento) => {
                  setConfig({ ...config, inicioSemana: Number(evento.target.value) })
                  setListo(false)
                }}
                opciones={DIAS_DE_LA_SEMANA.map((dia, indice) => ({ valor: String(indice), texto: dia }))}
              />
            )}
          </div>
          <p className="text-sm text-texto-2">
            Cambiarlo sólo afecta lo que viene: lo ya cerrado no se toca, y la próxima liquidación de cada uno empieza al
            día siguiente de su última.
          </p>
          <BotonPrimario
            type="submit"
            tamaño="sm"
            icono={<Save className="h-4 w-4" />}
            cargando={guardando}
            variante={pendiente ? "primario" : "secundario"}
          >
            {listo && !pendiente ? "Guardado" : "Guardar"}
          </BotonPrimario>
          <p role="status" className="sr-only">
            {listo ? "Período guardado" : ""}
          </p>
          {error && <Aviso>{error}</Aviso>}
        </form>
      )}
    </section>
  )
}
