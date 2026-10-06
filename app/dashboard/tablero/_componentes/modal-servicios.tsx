"use client"

import { useState, type FormEvent } from "react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import {
  filaDesdeLinea,
  lineasDesdeFilas,
  type FilaDeServicio,
  type LineaPedida,
} from "@/lib/acciones-del-tablero"
import type { Atencion, Catalogo } from "../_datos"
import { EditorDeServicios, filaVacia } from "./editor-de-servicios"
import { MarcoDeModal } from "./marco-de-modal"

interface ModalServiciosProps {
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
}: ModalServiciosProps) {
  // Las filas se toman una sola vez, al abrir: la recarga del tablero cada
  // 30 segundos no pisa lo que se está escribiendo. Si la atención cambió
  // entretanto, el servidor responde 409 y el tablero se recarga.
  const [filas, setFilas] = useState<FilaDeServicio[]>(() =>
    atencion.lineas.length > 0 ? atencion.lineas.map(filaDesdeLinea) : [filaVacia(catalogo, "fila-inicial")]
  )
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
      titulo={`Servicios de ${atencion.cliente.nombre}`}
      descripcion={
        requisito ? (
          <span className="block rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-3 mt-2">{requisito}</span>
        ) : eligeProfesional ? undefined : (
          "Ves y cambias sólo tus servicios; los de tus compañeros no se tocan. Quedan a tu nombre."
        )
      }
      ancho="lg"
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      <form onSubmit={guardar} noValidate className="space-y-5">
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
          <p role="alert" className="text-sm text-red-500">
            Revisa los servicios marcados.
          </p>
        )}
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
            Cancelar
          </BotonPrimario>
          <BotonPrimario
            type="submit"
            anchoCompleto
            cargando={guardando}
            // Mientras guarda, el botón muestra sólo el ícono que gira: sin
            // esto, el lector de pantalla anunciaría un botón sin nombre.
            aria-label={guardando ? "Guardando" : undefined}
            className={ANILLO_DE_FOCO}
          >
            {textoDelBoton}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
