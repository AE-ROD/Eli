"use client"

import { useId, useRef, type ReactNode } from "react"
import Link from "next/link"
import { Package, Plus, Trash2, TriangleAlert } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { MAXIMO_DE_LINEAS_POR_ATENCION, deCentavos } from "@/lib/atenciones"
import { esDeProducto, totalDeFilasEnCentavos, type ErroresDeFila, type FilaDeServicio } from "@/lib/acciones-del-tablero"
import { formatearMonto, montoParaEscribir } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import type { Catalogo } from "../_datos"
import { Aviso } from "@/components/panel/aviso"

/** Ninguna atención real tiene más; es el tope del servidor. */
const MAXIMO_DE_FILAS = MAXIMO_DE_LINEAS_POR_ATENCION

/**
 * Las filas que se agregan en esta pestaña. Un contador y no un azar: las
 * claves sólo tienen que ser únicas mientras el modal está abierto.
 */
let filasAgregadas = 0

/** Lo que conviene saber de un campo sin ser un error: un servicio que salió del catálogo, alguien que dejó el equipo. */
function AyudaDeCampo({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 flex items-start gap-1.5 text-xs font-medium text-navy">
      <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={2} />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/**
 * Una fila vacía. Si hay un solo profesional posible (el dueño que atiende
 * solo), ya viene elegido: no hay nada que decidir.
 */
export function filaVacia(catalogo: Catalogo, clave: string): FilaDeServicio {
  const unico = catalogo.profesionales.length === 1 ? catalogo.profesionales[0].id : ""
  return { clave, servicioId: "", profesional: unico, precio: "" }
}

/** Una fila de producto vacía (#67): quien lo vendió, como en un servicio. */
function filaDeProductoVacia(catalogo: Catalogo, clave: string): FilaDeServicio {
  return { ...filaVacia(catalogo, clave), tipo: "producto", productoId: "" }
}

interface PropsDeEditorDeServicios {
  filas: FilaDeServicio[]
  catalogo: Catalogo
  /** Dueño y encargado eligen quién hace cada servicio; el profesional no, quedan a su nombre. */
  eligeProfesional: boolean
  /** Para el aviso de catálogo vacío: a quien puede cargar servicios se le da el enlace. */
  puedeConfigurarServicios: boolean
  /** Los errores de cada fila, por su clave. Vacío hasta el primer intento de guardar. */
  errores: Record<string, ErroresDeFila>
  deshabilitado?: boolean
  onCambiar: (filas: FilaDeServicio[]) => void
}

/**
 * Las líneas de una atención como filas editables: servicio, profesional y
 * precio. El precio se precarga del catálogo al elegir el servicio y se puede
 * ajustar; el total se suma en vivo, en centavos.
 */
export function EditorDeServicios({
  filas,
  catalogo,
  eligeProfesional,
  puedeConfigurarServicios,
  errores,
  deshabilitado = false,
  onCambiar,
}: PropsDeEditorDeServicios) {
  const idBase = useId()
  const botonAgregar = useRef<HTMLButtonElement>(null)
  const totalCentavos = totalDeFilasEnCentavos(filas)
  // Un tablero viejo, cargado antes de que el servidor mandara productos, no los trae.
  const productos = catalogo.productos ?? []
  const idDe = (clave: string, campo: string) => `${idBase}-${clave}-${campo}`

  const cambiarFila = (clave: string, cambios: Partial<FilaDeServicio>) =>
    onCambiar(filas.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)))

  /** Como `elegirServicio`: el precio del catálogo pisa lo escrito, y sin precio queda vacío. */
  const elegirProducto = (fila: FilaDeServicio, productoId: string) => {
    const precio = productos.find((producto) => producto.id === productoId)?.precio
    cambiarFila(fila.clave, { productoId, precio: precio == null ? "" : montoParaEscribir(precio) })
  }

  const elegirServicio = (fila: FilaDeServicio, servicioId: string) => {
    const precio = catalogo.servicios.find((servicio) => servicio.id === servicioId)?.precio
    // El precio del catálogo pisa lo escrito: se eligió otro servicio. Sin
    // precio en el catálogo queda vacío, para que alguien lo escriba en vez
    // de cobrar un cero que nadie decidió. Se escribe como lo lee el campo
    // ("8000,50"): con un punto, "10.005" se leería como diez mil cinco.
    cambiarFila(fila.clave, { servicioId, precio: precio == null ? "" : montoParaEscribir(precio) })
  }

  // El foco sigue a lo que se hace: a la fila nueva al agregar, y al botón de
  // agregar al quitar una, porque el botón que se apretó desaparece con su
  // fila y el foco caería fuera del diálogo.
  const agregar = (deProducto = false) => {
    filasAgregadas += 1
    const clave = `nueva-${filasAgregadas}`
    onCambiar([...filas, deProducto ? filaDeProductoVacia(catalogo, clave) : filaVacia(catalogo, clave)])
    requestAnimationFrame(() => document.getElementById(idDe(clave, "servicio"))?.focus())
  }

  const quitar = (clave: string) => {
    onCambiar(filas.filter((fila) => fila.clave !== clave))
    requestAnimationFrame(() => botonAgregar.current?.focus())
  }

  return (
    <div className="space-y-3">
      {catalogo.servicios.length === 0 && (
        <Aviso tono="atencion">
          Todavía no hay servicios en el catálogo.{" "}
          {puedeConfigurarServicios ? (
            <Link
              href="/dashboard/configuracion"
              className="rounded-sm underline decoration-[1.5px] underline-offset-4 anillo-foco"
            >
              Agrégalos en Configuración
            </Link>
          ) : (
            "Pídele al dueño o al encargado que los cargue en Configuración."
          )}
        </Aviso>
      )}

      {filas.length === 0 && catalogo.servicios.length > 0 && <p className="text-sm text-texto-2">Sin servicios todavía.</p>}

      {filas.map((fila, indice) => {
        const numero = indice + 1
        const deLaFila = errores[fila.clave] ?? {}
        const id = (campo: string) => idDe(fila.clave, campo)
        const producto = esDeProducto(fila)
        const servicioEnCatalogo = catalogo.servicios.some((servicio) => servicio.id === fila.servicioId)
        const productoEnCatalogo = productos.some((candidato) => candidato.id === fila.productoId)
        const nombreDelServicio = producto
          ? (productos.find((candidato) => candidato.id === fila.productoId)?.nombre ?? fila.servicioOriginal)
          : (catalogo.servicios.find((servicio) => servicio.id === fila.servicioId)?.nombre ?? fila.servicioOriginal)
        const elegido = producto ? fila.productoId : fila.servicioId
        const loQueEs = producto ? "Producto" : "Servicio"

        return (
          // Cada servicio en un bloque gris: los campos blancos se recortan
          // contra él y se ve dónde termina uno y empieza el otro.
          <fieldset
            key={fila.clave}
            className="grid grid-cols-1 items-start gap-3 rounded-[20px] bg-superficie p-3 squircle sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_auto] sm:p-4"
          >
            <legend className="sr-only">
              {loQueEs} {numero}
            </legend>

            <div className={cn(!eligeProfesional && "sm:col-span-2")}>
              <label htmlFor={id("servicio")} className={ETIQUETA}>
                {loQueEs}
              </label>
              <select
                id={id("servicio")}
                value={elegido ?? ""}
                disabled={deshabilitado}
                required
                aria-invalid={deLaFila.servicio ? true : undefined}
                aria-describedby={deLaFila.servicio || (!elegido && fila.servicioOriginal) ? id("servicio-ayuda") : undefined}
                onChange={(evento) =>
                  producto ? elegirProducto(fila, evento.target.value) : elegirServicio(fila, evento.target.value)
                }
                className={cn(CAMPO, deLaFila.servicio && CAMPO_CON_ERROR)}
              >
                <option value="">{producto ? "Elegir producto" : "Elegir servicio"}</option>
                {(producto ? productos : catalogo.servicios).map((opcion) => (
                  <option key={opcion.id} value={opcion.id}>
                    {opcion.nombre}
                  </option>
                ))}
                {/* Uno desactivado no está en el catálogo, pero la línea lo tiene: se conserva. */}
                {!producto && fila.servicioId && !servicioEnCatalogo && (
                  <option value={fila.servicioId}>{fila.servicioOriginal ?? "Servicio"} (fuera del catálogo)</option>
                )}
                {producto && fila.productoId && !productoEnCatalogo && (
                  <option value={fila.productoId}>{fila.servicioOriginal ?? "Producto"} (ya no se vende)</option>
                )}
              </select>
              {deLaFila.servicio ? (
                <p id={id("servicio-ayuda")} className={ERROR_DE_CAMPO}>
                  {deLaFila.servicio}
                  {fila.servicioOriginal && !elegido && ` «${fila.servicioOriginal}» no está en el catálogo.`}
                </p>
              ) : (
                !elegido &&
                fila.servicioOriginal && (
                  <AyudaDeCampo id={id("servicio-ayuda")}>
                    «{fila.servicioOriginal}» no está en el catálogo: elige otro.
                  </AyudaDeCampo>
                )
              )}
            </div>

            {eligeProfesional && (
              <div>
                <label htmlFor={id("profesional")} className={ETIQUETA}>
                  Profesional
                </label>
                <select
                  id={id("profesional")}
                  value={fila.profesional}
                  disabled={deshabilitado}
                  required
                  aria-invalid={deLaFila.profesional ? true : undefined}
                  aria-describedby={
                    deLaFila.profesional || (!fila.profesional && fila.profesionalOriginal) ? id("profesional-ayuda") : undefined
                  }
                  onChange={(evento) => cambiarFila(fila.clave, { profesional: evento.target.value })}
                  className={cn(CAMPO, deLaFila.profesional && CAMPO_CON_ERROR)}
                >
                  <option value="">Elegir profesional</option>
                  {catalogo.profesionales.map((profesional) => (
                    <option key={profesional.id} value={profesional.id}>
                      {profesional.nombre}
                    </option>
                  ))}
                </select>
                {!fila.profesional && fila.profesionalOriginal ? (
                  // Quien la hizo dejó el equipo: su nombre ayuda a decidir a quién reasignarla.
                  deLaFila.profesional ? (
                    <p id={id("profesional-ayuda")} className={ERROR_DE_CAMPO}>
                      Falta asignar: {fila.profesionalOriginal} ya no está en el equipo.
                    </p>
                  ) : (
                    <AyudaDeCampo id={id("profesional-ayuda")}>
                      Falta asignar: {fila.profesionalOriginal} ya no está en el equipo.
                    </AyudaDeCampo>
                  )
                ) : (
                  deLaFila.profesional && (
                    <p id={id("profesional-ayuda")} className={ERROR_DE_CAMPO}>
                      {deLaFila.profesional}
                    </p>
                  )
                )}
              </div>
            )}

            <div>
              <label htmlFor={id("precio")} className={ETIQUETA}>
                Precio
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-2" aria-hidden="true">
                  $
                </span>
                {/*
                  Texto y no número: en un `type="number"` Chromium descartaba
                  la coma y "8000,50" llegaba como 800050. `inputMode` deja el
                  teclado numérico en el teléfono; lo escrito lo lee `leerMonto`
                  (8000,50, 8.000,50 y 8000.50 son el mismo precio).
                */}
                <input
                  id={id("precio")}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={fila.precio}
                  disabled={deshabilitado}
                  required
                  aria-invalid={deLaFila.precio ? true : undefined}
                  aria-describedby={deLaFila.precio ? id("precio-error") : undefined}
                  onChange={(evento) => cambiarFila(fila.clave, { precio: evento.target.value })}
                  className={cn(CAMPO, "pl-7 tabular-nums", deLaFila.precio && CAMPO_CON_ERROR)}
                />
              </div>
              {deLaFila.precio && (
                <p id={id("precio-error")} className={ERROR_DE_CAMPO}>
                  {deLaFila.precio}
                </p>
              )}
            </div>

            {/*
              En el teléfono, a lo ancho y con su nombre; desde sm, sólo el
              ícono, a la altura de los campos (baja lo que mide la etiqueta).
            */}
            <div className="flex justify-end">
              <Boton
                variante="fantasma"
                tamano="sm"
                onClick={() => quitar(fila.clave)}
                disabled={deshabilitado}
                aria-label={`Quitar el ${loQueEs.toLowerCase()} ${numero}${nombreDelServicio ? `: ${nombreDelServicio}` : ""}`}
                title="Quitar"
                className="text-texto-2 hover:bg-error/8 hover:text-error sm:mt-6.5 sm:size-11 sm:px-0 sm:after:hidden"
              >
                <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
                <span className="sm:hidden">Quitar</span>
              </Boton>
            </div>
          </fieldset>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* El tope cuenta servicios y productos juntos: es el de líneas de la atención. */}
        <div className="flex flex-wrap gap-2">
          <Boton
            ref={botonAgregar}
            variante="secundario"
            tamano="sm"
            onClick={() => agregar()}
            disabled={deshabilitado || filas.length >= MAXIMO_DE_FILAS || catalogo.servicios.length === 0}
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
            Agregar servicio
          </Boton>
          {productos.length > 0 && (
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => agregar(true)}
              disabled={deshabilitado || filas.length >= MAXIMO_DE_FILAS}
            >
              <Package aria-hidden="true" className="size-4" strokeWidth={2} />
              Agregar producto
            </Boton>
          )}
        </div>
        <p className="text-sm" aria-live="polite">
          <span className="text-texto-2">{eligeProfesional ? "Total" : "Total de tus servicios"}:</span>{" "}
          <span className="text-base font-semibold tabular-nums">{formatearMonto(deCentavos(totalCentavos))}</span>
        </p>
      </div>
    </div>
  )
}
