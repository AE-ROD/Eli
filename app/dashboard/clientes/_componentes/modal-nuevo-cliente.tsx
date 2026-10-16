"use client"

import { Mail, Phone, User } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import type { DatosDeNuevoCliente } from "../_datos"
import { Aviso } from "@/components/panel/aviso"

interface ModalNuevoClienteProps {
  form: DatosDeNuevoCliente
  guardando: boolean
  /**
   * Por qué no se pudo crear el cliente, si falló. Se muestra dentro del modal
   * y no en la página: mientras el modal está abierto, la página queda tapada.
   */
  aviso: string
  onFormChange: (campo: keyof DatosDeNuevoCliente, valor: string) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

/**
 * Un cliente nuevo: nombre, correo y teléfono. El marco (`MarcoDeModal`) lo
 * hace un diálogo de verdad: se anuncia con su título, el foco entra al
 * nombre y no sale hasta cerrarlo, Escape o la X lo cierran salvo mientras
 * guarda, y al cerrarse el foco vuelve al botón que lo abrió.
 */
export function ModalNuevoCliente({
  form,
  guardando,
  aviso,
  onFormChange,
  onSubmit,
  onCerrar,
}: ModalNuevoClienteProps) {
  return (
    <MarcoDeModal titulo="Nuevo cliente" bloqueado={guardando} alCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-5">
        {/* Al abrir, el foco va al nombre. `MarcoDeModal` anota antes quién lo abrió. */}
        <CampoFormulario
          autoFocus
          etiqueta="Nombre completo"
          placeholder="Nombre del cliente"
          value={form.nombre}
          onChange={(e) => onFormChange("nombre", e.target.value)}
          icono={<User className="size-4" aria-hidden="true" strokeWidth={1.75} />}
          required
        />
        <CampoFormulario
          etiqueta="Correo electrónico"
          type="email"
          placeholder="email@ejemplo.com"
          value={form.email}
          onChange={(e) => onFormChange("email", e.target.value)}
          icono={<Mail className="size-4" aria-hidden="true" strokeWidth={1.75} />}
        />
        <CampoFormulario
          etiqueta="Teléfono"
          type="tel"
          placeholder="+52 555 123 4567"
          value={form.telefono}
          onChange={(e) => onFormChange("telefono", e.target.value)}
          icono={<Phone className="size-4" aria-hidden="true" strokeWidth={1.75} />}
        />

        {aviso && <Aviso>{aviso}</Aviso>}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" className="w-full" cargando={guardando}>
            Guardar cliente
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}
