"use client"

import { useState, type FormEvent } from "react"
import { TriangleAlert } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import {
  filaDesdeLinea,
  filaDesdeReserva,
  lineasDesdeFilas,
  type FilaDeServicio,
  type LineaPedida,
} from "@/lib/acciones-del-tablero"
import type { Atencion, Catalogo } from "../_datos"
import { Aviso } from "@/components/panel/aviso"
import { EditorDeServicios, filaVacia } from "./editor-de-servicios"

/**
 * Con qué filas se abre el editor: las líneas que ya tiene la atención; si no
 * tiene y nació de una reserva, lo que dice la reserva (`filaDesdeReserva`);
 * si no, una fila vacía.
 */
function filasIniciales(atencion: Atencion, catalogo: Catalogo): FilaDeServicio[] {
  if (atencion.lineas.length > 0) return atencion.lineas.map(filaDesdeLinea)
  if (atencion.reserva) return [filaDesdeReserva(atencion.reserva, catalogo, "fila-inicial")]
  return [filaVacia(catalogo, "fila-inicial")]
}

interface PropsDeModalServicios {
  atencion: Atencion
  catalogo: Catalogo
  eligeProfesional: boolean
  puedeConfigurarServicios: boolean
  /**
   * Si se abrió porque a la atención le falta algo para avanzar: qué le
   * falta. Se muestra arriba, para que se entienda por qué apareció.
   */
  requisito: string | null
  /** "Guardar", o "Guardar y …" si al guardar se sigue con el movimiento que se pidió. */
  textoDelBoton: string
  /** Por qué no se pudo guardar, si falló. */
  aviso: string
  guardando: boolean
  onGuardar: (lineas: LineaPedida[]) => void
  onCerrar: () => void
}

/** Editar los servicios de una atención: qué se hizo, quién lo hizo y a qué precio. */
export function ModalServicios({
  atencion,
  catalogo,
  eligeProfesional,
  puedeConfigurarServicios,
  requisito,
  textoDelBoton,
  aviso,
  guardando,
  onGuardar,
  onCerrar,
}: PropsDeModalServicios) {
  // Las filas se toman una sola vez, al abrir: la recarga del tablero cada
  // 30 segundos no pisa lo que se está escribiendo. Si la atención cambió
  // entretanto, el servidor responde 409 y el tablero se recarga.
  const [filas, setFilas] = useState<FilaDeServicio[]>(() => filasIniciales(atencion, catalogo))
  const [intentoGuardar, setIntentoGuardar] = useState(false)

  const validacion = lineasDesdeFilas(filas, eligeProfesional)
  const errores = intentoGuardar && !validacion.ok ? validacion.errores : {}

  const guardar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setIntentoGuardar(true)
    if (validacion.ok) onGuardar(validacion.lineas)
  }

  return (
    <MarcoDeModal
      antetitulo="Tablero"
      titulo={`Servicios de ${atencion.cliente.nombre}`}
      descripcion={
        requisito ? (
          // Por qué se abrió: lo que le falta a la atención para avanzar.
          <span className="mt-3 flex items-start gap-2.5 rounded-campo bg-naranja-suave px-4 py-3 font-medium text-navy squircle">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            <span className="min-w-0">{requisito}</span>
          </span>
        ) : eligeProfesional ? undefined : (
          "Ves y cambias sólo tus servicios; los de tus compañeros no se tocan. Quedan a tu nombre."
        )
      }
      ancho="lg"
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      <form onSubmit={guardar} noValidate className="space-y-6">
        <EditorDeServicios
          filas={filas}
          catalogo={catalogo}
          eligeProfesional={eligeProfesional}
          puedeConfigurarServicios={puedeConfigurarServicios}
          errores={errores}
          deshabilitado={guardando}
          onCambiar={setFilas}
        />

        {intentoGuardar && !validacion.ok && (
          <Aviso tono="error" rol="alert">
            Revisa los servicios marcados.
          </Aviso>
        )}
        {aviso && (
          <Aviso tono="error" rol="alert">
            {aviso}
          </Aviso>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Boton type="button" variante="secundario" onClick={onCerrar} disabled={guardando} className="w-full">
            Cancelar
          </Boton>
          <Boton
            type="submit"
            cargando={guardando}
            // Mientras guarda, el botón muestra sólo el ícono que gira: el
            // nombre dice qué está haciendo.
            aria-label={guardando ? "Guardando" : undefined}
            className="w-full"
          >
            {textoDelBoton}
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}
