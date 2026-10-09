"use client"

import { useId, useState, type FormEvent } from "react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { ANILLO_DE_FOCO, CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { consecuenciasDeAnular, type AtencionParaAnular } from "@/lib/acciones-del-tablero"
import { cn } from "@/lib/utils"

/** El servidor acepta hasta 500 caracteres de motivo. */
const LARGO_MAXIMO_DEL_MOTIVO = 500

interface ModalAnularProps {
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
export function ModalAnular({ atencion, aviso, guardando, onAnular, onCerrar }: ModalAnularProps) {
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
      <form onSubmit={anular} className="space-y-4">
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
            className={cn(CAMPO, "resize-none h-20")}
          />
        </div>

        {aviso && (
          <p role="alert" className="text-sm text-red-500">
            {aviso}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
          <BotonPrimario
            type="button"
            variante="secundario"
            anchoCompleto
            onClick={onCerrar}
            disabled={guardando}
            className={ANILLO_DE_FOCO}
          >
            No anular
          </BotonPrimario>
          <BotonPrimario
            type="submit"
            variante="peligro"
            anchoCompleto
            cargando={guardando}
            aria-label={guardando ? "Anulando" : undefined}
            className={ANILLO_DE_FOCO}
          >
            {cobrada ? "Anular cobro" : "Anular atención"}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
