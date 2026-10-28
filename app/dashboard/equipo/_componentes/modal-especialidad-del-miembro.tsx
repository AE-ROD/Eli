"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { guardarEspecialidadDelMiembro, type MiembroDelEquipo } from "../_datos"

/** El mismo tope que valida el servidor (y Configuración › Tu página pública). */
const LARGO_MAXIMO = 60

interface PropsDeModalEspecialidadDelMiembro {
  miembro: MiembroDelEquipo
  alCerrar: () => void
  /** Se llama con la especialidad que quedó guardada y el texto del aviso de éxito. */
  alGuardar: (especialidad: string | null, aviso: string) => void
}

/**
 * "Especialidad": lo que la página pública muestra junto al profesional
 * ("Colorista", "Barbero"). Vacía, no se muestra nada.
 */
export function ModalEspecialidadDelMiembro({ miembro, alCerrar, alGuardar }: PropsDeModalEspecialidadDelMiembro) {
  const [especialidad, setEspecialidad] = useState(miembro.especialidad ?? "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    setError("")
    setGuardando(true)
    const resultado = await guardarEspecialidadDelMiembro(miembro.id, especialidad)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    const guardada = resultado.datos.especialidad
    alGuardar(
      guardada,
      guardada
        ? `Se guardó la especialidad de ${miembro.user.name}.`
        : `Se quitó la especialidad de ${miembro.user.name}.`
    )
  }

  return (
    <MarcoDeModal
      titulo={`Especialidad de ${miembro.user.name}`}
      antetitulo="Equipo"
      descripcion="Se muestra junto a su nombre en la página de reservas. Déjala vacía para no mostrar ninguna."
      bloqueado={guardando}
      alCerrar={alCerrar}
    >
      <form onSubmit={guardar} className="space-y-5">
        <CampoFormulario
          etiqueta="Especialidad"
          placeholder="Ej: Colorista"
          value={especialidad}
          maxLength={LARGO_MAXIMO}
          onChange={(evento) => setEspecialidad(evento.target.value)}
          autoComplete="off"
        />

        {error && <Aviso>{error}</Aviso>}

        <BotonPrimario type="submit" anchoCompleto cargando={guardando} icono={<Check className="h-4 w-4" />}>
          Guardar especialidad
        </BotonPrimario>
      </form>
    </MarcoDeModal>
  )
}
