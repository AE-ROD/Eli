"use client"

import { useId, useState } from "react"
import { Boton } from "@/components/comunes/boton"
import { Selector } from "@/components/comunes/selector"
import { Aviso } from "@/components/panel/aviso"
import { cn } from "@/lib/utils"
import { asignarSillon, opcionesDeSillon, type SillonDeLaAgenda, type SillonDeLaCita } from "../_datos"

interface PropsDeAsignarSillon {
  citaId: string
  /** El sillón que tiene la cita ahora (`null`, sin sillón). */
  sillonId: string | null
  sillon: SillonDeLaCita | null
  /** Los sillones de la clínica: se ofrecen los activos, y el actual aunque esté desactivado. */
  sillones: readonly SillonDeLaAgenda[]
  /** Ya se guardó en el servidor: quien lo usa muestra la cita con su sillón nuevo. */
  onAsignado: (sillonId: string | null, sillon: SillonDeLaCita | null) => void
  /** La etiqueta del selector. Por defecto, "Asignar sillón". */
  etiqueta?: string
  /** El nombre del paciente, para el nombre accesible del selector cuando hay varios en la página. */
  paciente?: string
  className?: string
}

/**
 * "Asignar sillón" de una cita de la clínica dental: el selector y el botón
 * que guarda (`PATCH /api/citas/[id]/sillon`). Guardar es un botón y no el
 * cambio del selector: con el teclado, recorrer las opciones no guarda nada.
 *
 * Si el sillón ya tiene otra cita a esa hora, el servidor responde 409
 * `sillon-ocupado` y se dice así, con su mensaje (qué cita y a qué hora): no
 * hay "guardar igual", el sillón atiende a uno a la vez. Lo usan el panel de
 * la cita en la agenda y la sala de espera del inicio.
 */
export function AsignarSillon({
  citaId,
  sillonId,
  sillon,
  sillones,
  onAsignado,
  etiqueta = "Asignar sillón",
  paciente,
  className,
}: PropsDeAsignarSillon) {
  const idDelSelector = useId()
  const [elegido, setElegido] = useState(sillonId ?? "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<{ texto: string; ocupado: boolean } | null>(null)
  const [listo, setListo] = useState("")
  const opciones = opcionesDeSillon(sillones, { sillonId, sillon })

  const guardar = async (evento: React.SyntheticEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (guardando) return
    setError(null)
    setListo("")
    setGuardando(true)
    const resultado = await asignarSillon(citaId, elegido || null)
    setGuardando(false)
    if (resultado.tipo !== "asignado") {
      return setError({ texto: resultado.error, ocupado: resultado.tipo === "ocupado" })
    }
    setElegido(resultado.sillonId ?? "")
    setListo(resultado.sillon ? `Quedó en ${resultado.sillon.nombre}.` : "Quedó sin sillón.")
    onAsignado(resultado.sillonId, resultado.sillon)
  }

  return (
    <form onSubmit={guardar} className={cn("space-y-2", className)}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Selector
            id={idDelSelector}
            etiqueta={etiqueta}
            aria-label={paciente ? `${etiqueta} para ${paciente}` : undefined}
            value={elegido}
            onChange={(evento) => {
              setElegido(evento.target.value)
              setError(null)
              setListo("")
            }}
            opciones={opciones}
          >
            <option value="">Sin sillón</option>
          </Selector>
        </div>
        <Boton
          type="submit"
          variante="secundario"
          className="h-12 shrink-0"
          cargando={guardando}
          disabled={elegido === (sillonId ?? "")}
        >
          Asignar
        </Boton>
      </div>
      {error &&
        (error.ocupado ? (
          <Aviso titulo="Sillón ocupado">{error.texto}</Aviso>
        ) : (
          <Aviso>{error.texto}</Aviso>
        ))}
      {listo && (
        <Aviso tono="listo" rol="status">
          {listo}
        </Aviso>
      )}
    </form>
  )
}
