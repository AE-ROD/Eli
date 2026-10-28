"use client"

import { useState } from "react"
import { Boton } from "@/components/comunes/boton"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { formatearHora } from "@/lib/fechas"
import { aQuienBloquea, quitarBloqueo, type Bloqueo } from "../_datos"

/** `martes 20 de octubre, 13:00`: un extremo del bloqueo, para leerlo. */
function cuando(iso: string): string {
  const dia = new Date(iso).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
  return `${dia}, ${formatearHora(iso)}`
}

interface PropsDeModalBloqueo {
  bloqueo: Bloqueo
  /** Si quien mira puede quitarlo. Lo decide `puedeGestionarBloqueoDe`; el servidor lo vuelve a verificar. */
  puedeQuitar: boolean
  onQuitado: () => void
  onCerrar: () => void
}

/**
 * Lo que se abre al tocar un bloqueo en la agenda: de quién es, cuándo y por
 * qué, y quitarlo si se puede. A quien no puede (un profesional ante un
 * bloqueo de todo el negocio) sólo se le muestra.
 */
export function ModalBloqueo({ bloqueo, puedeQuitar, onQuitado, onCerrar }: PropsDeModalBloqueo) {
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState("")

  const descripcion = `${aQuienBloquea(bloqueo)}: del ${cuando(bloqueo.startTime)} al ${cuando(bloqueo.endTime)}${
    bloqueo.motivo ? ` (${bloqueo.motivo})` : ""
  }.`

  if (!puedeQuitar) {
    return (
      <MarcoDeModal titulo="Horario bloqueado" descripcion={descripcion} alCerrar={onCerrar}>
        <p className="text-sm text-texto-2">Sólo el dueño o un encargado pueden quitar este bloqueo.</p>
        <Boton type="button" variante="secundario" className="mt-5 w-full" onClick={onCerrar}>
          Cerrar
        </Boton>
      </MarcoDeModal>
    )
  }

  const quitar = async () => {
    setAviso("")
    setTrabajando(true)
    const resultado = await quitarBloqueo(bloqueo.id)
    setTrabajando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    onQuitado()
  }

  return (
    <ModalConfirmar
      titulo="¿Quitar este bloqueo?"
      descripcion={descripcion}
      textoConfirmar="Quitar bloqueo"
      textoCancelar="Dejarlo"
      peligro
      trabajando={trabajando}
      aviso={aviso}
      onConfirmar={quitar}
      onCerrar={onCerrar}
    />
  )
}
