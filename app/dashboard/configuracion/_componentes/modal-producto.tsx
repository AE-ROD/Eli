"use client"

import { Package, Percent } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import type { DatosDeProducto } from "../_datos"

interface PropsDeModalProducto {
  form: DatosDeProducto
  guardando: boolean
  /** Por qué no se pudo guardar, si falló: dentro del modal, que tapa la sección. */
  aviso: string
  modoEdicion: boolean
  /** Sólo la dueña fija el % de comisión: para el resto el campo no aparece. */
  conPorcentaje: boolean
  onCambiarCampo: (campo: keyof DatosDeProducto, valor: string) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

/** Crear o editar un producto del catálogo: nombre, precio y, para la dueña, su % de comisión. */
export function ModalProducto({
  form,
  guardando,
  aviso,
  modoEdicion,
  conPorcentaje,
  onCambiarCampo,
  onSubmit,
  onCerrar,
}: PropsDeModalProducto) {
  return (
    <MarcoDeModal
      titulo={modoEdicion ? "Editar producto" : "Nuevo producto"}
      antetitulo="Productos"
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <CampoFormulario
          etiqueta="Nombre del producto"
          placeholder="Ej.: Shampoo, Cera para el pelo..."
          value={form.nombre}
          onChange={(e) => onCambiarCampo("nombre", e.target.value)}
          icono={<Package className="h-4 w-4" />}
          maxLength={100}
          required
        />

        <CampoFormulario
          etiqueta="Precio (opcional)"
          // Texto y no número, como el precio de un servicio: lo lee `leerMonto`.
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={form.precio}
          onChange={(e) => onCambiarCampo("precio", e.target.value)}
          icono={<span className="text-sm" aria-hidden="true">$</span>}
          className="tabular-nums"
        />

        {conPorcentaje && (
          <div>
            <CampoFormulario
              etiqueta="Comisión de quien lo vende (opcional)"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej.: 10"
              value={form.porcentaje}
              onChange={(e) => onCambiarCampo("porcentaje", e.target.value)}
              icono={<Percent className="h-4 w-4" />}
              className="tabular-nums"
            />
            <p className="mt-1.5 text-xs text-texto-2">
              Vacío es &quot;sin configurar&quot;: lo que se venda queda pendiente hasta que lo fijes. Cambiarlo no toca lo ya
              cobrado.
            </p>
          </div>
        )}

        {aviso && <Aviso>{aviso}</Aviso>}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar} disabled={guardando}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
            {modoEdicion ? "Guardar cambios" : "Crear producto"}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
