"use client"

import { useState } from "react"
import { Boton } from "@/components/comunes/boton"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { aQuienBloquea, quitarBloqueo, type Bloqueo } from "../_datos"
import { diaLargoEn, horaEn } from "../_hora-del-negocio"
import { useZonaDelNegocio } from "./zona-del-negocio"

/** `martes 20 de octubre, 13:00`: un extremo del bloqueo, para leerlo, en la hora del negocio (#99). */
function cuando(iso: string, zona: string): string {
  return `${diaLargoEn(iso, zona)}, ${horaEn(iso, zona)}`
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
  const zona = useZonaDelNegocio()
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState("")

  const descripcion = `${aQuienBloquea(bloqueo)}: del ${cuando(bloqueo.startTime, zona)} al ${cuando(bloqueo.endTime, zona)}${
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
