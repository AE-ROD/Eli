"use client"

import type { ReactNode } from "react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"

interface PropsDeModalConfirmar {
  titulo: string
  /** Qué pasa si se confirma: lo que se pierde y lo que queda. Se lee también con el lector de pantalla. */
  descripcion: ReactNode
  /** Más detalle debajo de la descripción, si hace falta (una lista de lo que se borra). */
  children?: ReactNode
  textoConfirmar: string
  textoCancelar: string
  /** Rojo: lo que se confirma no se deshace. */
  peligro?: boolean
  /** Mientras se hace, el modal no se cierra y el botón muestra que está trabajando. */
  trabajando?: boolean
  /** Por qué no se pudo, si falló. */
  aviso?: string
  onConfirmar: () => void
  onCerrar: () => void
}

/**
 * Preguntar antes de algo que no se deshace o que pierde trabajo: eliminar un
 * cliente, anular una invitación, descartar un horario sin guardar. Reemplaza
 * a `confirm()` del navegador, que no se puede leer bien, no dice qué queda y
 * no respeta el diseño.
 *
 * Como `ModalAnular`, en el teléfono los botones van uno debajo del otro y el
 * que confirma arriba: el que no se deshace no queda al alcance del pulgar
 * por error. Van en el `pie` del marco: en el celular, fijos abajo de la hoja.
 */
export function ModalConfirmar({
  titulo,
  descripcion,
  children,
  textoConfirmar,
  textoCancelar,
  peligro = false,
  trabajando = false,
  aviso = "",
  onConfirmar,
  onCerrar,
}: PropsDeModalConfirmar) {
  // Sin detalle ni aviso no hay cuerpo: el título, la descripción y los botones.
  const cuerpo = (children || aviso) && (
    <div className="space-y-5">
      {children}
      {aviso && <Aviso>{aviso}</Aviso>}
    </div>
  )

  return (
    <MarcoDeModal
      titulo={titulo}
      descripcion={descripcion}
      bloqueado={trabajando}
      alCerrar={onCerrar}
      pie={
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar} disabled={trabajando}>
            {textoCancelar}
          </BotonPrimario>
          <BotonPrimario
            type="button"
            variante={peligro ? "peligro" : "primario"}
            anchoCompleto
            cargando={trabajando}
            onClick={onConfirmar}
          >
            {textoConfirmar}
          </BotonPrimario>
        </div>
      }
    >
      {cuerpo}
    </MarcoDeModal>
  )
}
