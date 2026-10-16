"use client"

import { User, Phone } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import type { DatosDeNuevaConversacion } from "../_datos"

interface ModalNuevaConversacionProps {
  form: DatosDeNuevaConversacion
  guardando: boolean
  /**
   * Por qué no se pudo crear la conversación, si falló. Se muestra dentro del
   * modal y no en la página: mientras el modal está abierto, la página queda
   * tapada.
   */
  aviso: string
  onFormChange: (campo: keyof DatosDeNuevaConversacion, valor: string) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

export function ModalNuevaConversacion({
  form,
  guardando,
  aviso,
  onFormChange,
  onSubmit,
  onCerrar,
}: ModalNuevaConversacionProps) {
  return (
    <MarcoDeModal titulo="Nueva conversación" antetitulo="Chats" bloqueado={guardando} alCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-5">
        <CampoFormulario
          etiqueta="Nombre del cliente"
          placeholder="Nombre completo"
          value={form.nombre}
          onChange={(e) => onFormChange("nombre", e.target.value)}
          icono={<User className="h-4 w-4" />}
          required
        />
        <CampoFormulario
          etiqueta="Teléfono (opcional)"
          type="tel"
          placeholder="+52 555 123 4567"
          value={form.telefono}
          onChange={(e) => onFormChange("telefono", e.target.value)}
          icono={<Phone className="h-4 w-4" />}
        />
        {aviso && <Aviso>{aviso}</Aviso>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar} disabled={guardando}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
            Crear
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
