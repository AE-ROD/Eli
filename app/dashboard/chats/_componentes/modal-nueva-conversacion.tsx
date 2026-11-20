"use client"

import { useId } from "react"
import { User, Phone } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import type { DatosDeNuevaConversacion } from "../_datos"

interface PropsDeModalNuevaConversacion {
  form: DatosDeNuevaConversacion
  guardando: boolean
  /**
   * Por qué no se pudo crear la conversación, si falló. Se muestra dentro del
   * modal y no en la página: mientras el modal está abierto, la página queda
   * tapada.
   */
  aviso: string
  onCambiarCampo: (campo: keyof DatosDeNuevaConversacion, valor: string) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

export function ModalNuevaConversacion({
  form,
  guardando,
  aviso,
  onCambiarCampo,
  onSubmit,
  onCerrar,
}: PropsDeModalNuevaConversacion) {
  // El botón de crear va en el pie del marco, fuera del <form>: lo nombra con `form`.
  const idDelFormulario = useId()
  return (
    <MarcoDeModal
      titulo="Nueva conversación"
      antetitulo="Chats"
      bloqueado={guardando}
      alCerrar={onCerrar}
      pie={
        <div className="flex gap-3 lg:pt-1">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar} disabled={guardando}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" form={idDelFormulario} anchoCompleto cargando={guardando}>
            Crear
          </BotonPrimario>
        </div>
      }
    >
      <form id={idDelFormulario} onSubmit={onSubmit} className="space-y-5">
        <CampoFormulario
          etiqueta="Nombre del cliente"
          placeholder="Nombre completo"
          value={form.nombre}
          onChange={(e) => onCambiarCampo("nombre", e.target.value)}
          icono={<User className="h-4 w-4" />}
          required
        />
        <CampoFormulario
          etiqueta="Teléfono (opcional)"
          type="tel"
          placeholder="+56 9 1234 5678"
          value={form.telefono}
          onChange={(e) => onCambiarCampo("telefono", e.target.value)}
          icono={<Phone className="h-4 w-4" />}
        />
        {aviso && <Aviso>{aviso}</Aviso>}
      </form>
    </MarcoDeModal>
  )
}
