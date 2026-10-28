"use client"

import { Mail, Phone, User } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import type { DatosDeNuevoCliente } from "../_datos"
import { Aviso } from "@/components/panel/aviso"

interface PropsDeModalNuevoCliente {
  /** Con `editando`, el mismo formulario cambia los datos de un cliente que ya existe. */
  editando?: boolean
  form: DatosDeNuevoCliente
  guardando: boolean
  /**
   * Por qué no se pudo crear el cliente, si falló. Se muestra dentro del modal
   * y no en la página: mientras el modal está abierto, la página queda tapada.
   */
  aviso: string
  onCambiarCampo: (campo: "nombre" | "email" | "telefono", valor: string) => void
  onCambiarWhatsapp: (acepta: boolean) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

/**
 * Un cliente nuevo, o uno que se edita (`editando`): nombre, correo y
 * teléfono. Al editar, vaciar el correo o el teléfono los borra. El marco (`MarcoDeModal`) lo
 * hace un diálogo de verdad: se anuncia con su título, el foco entra al
 * nombre y no sale hasta cerrarlo, Escape o la X lo cierran salvo mientras
 * guarda, y al cerrarse el foco vuelve al botón que lo abrió.
 */
export function ModalNuevoCliente({
  editando = false,
  form,
  guardando,
  aviso,
  onCambiarCampo,
  onCambiarWhatsapp,
  onSubmit,
  onCerrar,
}: PropsDeModalNuevoCliente) {
  return (
    <MarcoDeModal titulo={editando ? "Editar cliente" : "Nuevo cliente"} bloqueado={guardando} alCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-5">
        {/* Al abrir, el foco va al nombre. `MarcoDeModal` anota antes quién lo abrió. */}
        <CampoFormulario
          autoFocus
          etiqueta="Nombre completo"
          placeholder="Nombre del cliente"
          value={form.nombre}
          onChange={(e) => onCambiarCampo("nombre", e.target.value)}
          icono={<User className="size-4" aria-hidden="true" strokeWidth={1.75} />}
          required
        />
        <CampoFormulario
          etiqueta="Correo electrónico"
          type="email"
          placeholder="email@ejemplo.com"
          value={form.email}
          onChange={(e) => onCambiarCampo("email", e.target.value)}
          icono={<Mail className="size-4" aria-hidden="true" strokeWidth={1.75} />}
        />
        <CampoFormulario
          etiqueta="Teléfono"
          type="tel"
          placeholder="+56 9 1234 5678"
          value={form.telefono}
          onChange={(e) => onCambiarCampo("telefono", e.target.value)}
          icono={<Phone className="size-4" aria-hidden="true" strokeWidth={1.75} />}
        />

        {/* Casilla nativa: el lector de pantalla la anuncia como tal y la etiqueta la marca. */}
        <label className="flex cursor-pointer items-start gap-3 text-sm text-navy">
          <input
            type="checkbox"
            checked={form.aceptaWhatsapp}
            onChange={(e) => onCambiarWhatsapp(e.target.checked)}
            className="anillo-foco mt-0.5 size-4 shrink-0 cursor-pointer accent-navy"
          />
          <span>Acepta recibir mensajes por WhatsApp</span>
        </label>

        {aviso && <Aviso>{aviso}</Aviso>}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" className="w-full" cargando={guardando}>
            {editando ? "Guardar cambios" : "Guardar cliente"}
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}
