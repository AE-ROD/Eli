"use client"

import { useId, useState, type FormEvent } from "react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { consecuenciasDeAnular, type AtencionParaAnular } from "@/lib/acciones-del-tablero"
import { cn } from "@/lib/utils"

/** El servidor acepta hasta 500 caracteres de motivo. */
const LARGO_MAXIMO_DEL_MOTIVO = 500

interface PropsDeModalAnular {
  atencion: AtencionParaAnular
  /** Por qué no se pudo anular, si falló. */
  aviso: string
  guardando: boolean
  onAnular: (motivo: string) => void
  onCerrar: () => void
}

/**
 * Confirmar la anulación, con un motivo opcional que queda registrado. Lo usan
 * el tablero (antes o después de cobrar) y el historial de reportes, donde el
 * dueño anula cobros de días anteriores.
 */
export function ModalAnular({ atencion, aviso, guardando, onAnular, onCerrar }: PropsDeModalAnular) {
  const idDelMotivo = useId()
  const [motivo, setMotivo] = useState("")
  const cobrada = atencion.estado === "finalizada"

  const anular = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    onAnular(motivo)
  }

  return (
    <MarcoDeModal
      titulo={cobrada ? `¿Anular el cobro de ${atencion.cliente.nombre}?` : `¿Anular la atención de ${atencion.cliente.nombre}?`}
      descripcion={consecuenciasDeAnular(atencion)}
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      <form onSubmit={anular} className="space-y-5">
        <div>
          <label htmlFor={idDelMotivo} className={ETIQUETA}>
            Motivo (opcional)
          </label>
          <textarea
            id={idDelMotivo}
            value={motivo}
            maxLength={LARGO_MAXIMO_DEL_MOTIVO}
            disabled={guardando}
            onChange={(evento) => setMotivo(evento.target.value)}
            placeholder={cobrada ? "Ej.: se cobró de más, se cargó a otro cliente…" : "Ej.: se fue sin ser atendido…"}
            className={cn(CAMPO, "h-24 resize-none")}
          />
        </div>

        {aviso && <Aviso>{aviso}</Aviso>}

        {/* En el teléfono, uno debajo del otro y el que anula arriba: el que no se deshace no queda al alcance del pulgar por error. */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar} disabled={guardando}>
            No anular
          </BotonPrimario>
          <BotonPrimario
            type="submit"
            variante="peligro"
            anchoCompleto
            cargando={guardando}
            aria-label={guardando ? "Anulando" : undefined}
          >
            {cobrada ? "Anular cobro" : "Anular atención"}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
