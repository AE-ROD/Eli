"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { CircleAlert, Plus, Trash2 } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO } from "@/components/panel/estilos"
import {
  cuantosCaben,
  filaEnBlanco,
  filasEnBlanco,
  leerPegadoDeLaTabla,
  opcionesDeDuracion,
  repartirPegado,
  revisarFilas,
  type FilaEditable,
} from "@/lib/carga-de-servicios"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { categoriasDe } from "@/lib/lista-de-servicios"
import { MAX_SERVICIOS_POR_LOTE, mensajeDeTopeDeServicios, type ServicioParaCargar } from "@/lib/servicios-en-lote"
import { cn } from "@/lib/utils"
import type { PalabrasDelRubro } from "@/lib/vocabulario"
import type { frasesDeConfiguracion } from "../_frases"

type FrasesDeServicios = ReturnType<typeof frasesDeConfiguracion>["servicios"]

/** Con cuántas filas vacías empieza la tabla. */
const FILAS_INICIALES = 5

/** Las columnas en una pantalla ancha: nombre, duración, precio, categoría y el botón de quitar. */
const COLUMNAS = "sm:grid-cols-[minmax(0,2fr)_8.5rem_7.5rem_minmax(0,1.4fr)_2.75rem]"

/** Identifica cada fila mientras se edita, aunque se quiten otras. Un contador del módulo: sirve a todas las tablas abiertas. */
let ultimaClave = 0
const nuevaClave = () => `fila-${++ultimaClave}`

type Campo = "name" | "duration" | "price" | "category"

interface PropsDeCargaVarios {
  frases: FrasesDeServicios
  palabras: PalabrasDelRubro
  nombresExistentes: readonly string[]
  categoriasExistentes: readonly string[]
  cantidadExistente: number
  enviando: boolean
  alAgregar: (servicios: ServicioParaCargar[]) => void
}

/**
 * "Agregar varios": una tabla para escribir varios servicios a la vez, con
 * cinco filas vacías al empezar. Se mueve como una planilla: Enter baja a la
 * misma celda de la fila de abajo (y en la última, agrega una fila) y pegar
 * varias líneas desde una planilla en el nombre de una fila las reparte en
 * filas. Las filas sin nada escrito se ignoran al agregar.
 *
 * Los errores de cada fila (los mismos mensajes del servidor) aparecen al
 * intentar agregar y se corrigen en vivo; si hay alguno no se envía nada y el
 * foco va a la primera fila con problema.
 */
export function CargaVarios({ frases, palabras, nombresExistentes, categoriasExistentes, cantidadExistente, enviando, alAgregar }: PropsDeCargaVarios) {
  const f = frases.carga.varios
  const idDeLasCategorias = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const botonAgregarFila = useRef<HTMLButtonElement>(null)
  /** Adónde va el foco cuando se dibujen las filas nuevas (una fila recién agregada, la que quedó al quitar otra). */
  const porEnfocar = useRef<{ clave: string; campo: Campo } | null>(null)
  const [filas, setFilas] = useState<FilaEditable[]>(() => filasEnBlanco(FILAS_INICIALES, nuevaClave))
  const [intentado, setIntentado] = useState(false)
  const [aviso, setAviso] = useState("")

  const revision = useMemo(
    () => revisarFilas(filas, nombresExistentes, categoriasExistentes),
    [filas, nombresExistentes, categoriasExistentes]
  )
  // Las categorías del negocio y las que ya se escribieron en la tabla: la segunda fila reusa la que se acaba de inventar.
  const sugerencias = useMemo(
    () => categoriasDe([...categoriasExistentes, ...filas.map((fila) => fila.category)].map((category) => ({ category }))),
    [categoriasExistentes, filas]
  )
  const sePasaDelTope = revision.servicios.length > cuantosCaben(cantidadExistente)
  const conProblemas = revision.errores.size

  const enfocar = (clave: string, campo: Campo) =>
    contenedor.current?.querySelector<HTMLElement>(`[data-celda="${campo}-${clave}"]`)?.focus()

  useEffect(() => {
    if (!porEnfocar.current) return
    enfocar(porEnfocar.current.clave, porEnfocar.current.campo)
    porEnfocar.current = null
  })

  const cambiar = (clave: string, cambios: Partial<FilaEditable>) =>
    setFilas((previas) => previas.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)))

  const agregarFila = () => {
    if (filas.length >= MAX_SERVICIOS_POR_LOTE) return setAviso(f.filasLlenas(MAX_SERVICIOS_POR_LOTE))
    const nueva = filaEnBlanco(nuevaClave())
    setAviso("")
    setFilas((previas) => [...previas, nueva])
    porEnfocar.current = { clave: nueva.clave, campo: "name" }
  }

  const quitarFila = (indice: number) => {
    const vecina = filas[indice + 1] ?? filas[indice - 1]
    setAviso("")
    setFilas((previas) => previas.filter((_, i) => i !== indice))
    if (vecina) porEnfocar.current = { clave: vecina.clave, campo: "name" }
    else botonAgregarFila.current?.focus()
  }

  /**
   * Enter en una celda de texto baja a la misma de la fila siguiente; en la última fila, agrega una.
   * La lista de duraciones no lo hace: Enter es lo que elige una opción cuando está desplegada.
   */
  const alTeclear = (evento: React.KeyboardEvent, indice: number, campo: Exclude<Campo, "duration">) => {
    if (evento.key !== "Enter" || evento.nativeEvent.isComposing) return
    evento.preventDefault()
    const siguiente = filas[indice + 1]
    if (siguiente) enfocar(siguiente.clave, campo)
    else agregarFila()
  }

  /** Varias líneas pegadas en el nombre de una fila se reparten desde esa fila; un valor suelto se pega como siempre. */
  const alPegar = (evento: React.ClipboardEvent<HTMLInputElement>, indice: number) => {
    const pegado = evento.clipboardData.getData("text")
    if (!/[\t\r\n]/.test(pegado.trim())) return
    evento.preventDefault()
    const { servicios, sinLeer } = leerPegadoDeLaTabla(pegado)
    if (servicios.length === 0) return setAviso(f.pegadoVacio)
    const repartido = repartirPegado(filas, indice, servicios, nuevaClave)
    setFilas(repartido.filas)
    setAviso(f.pegado(servicios.length - repartido.recortados, sinLeer, repartido.recortados))
  }

  const agregar = () => {
    setIntentado(true)
    setAviso("")
    if (conProblemas > 0) {
      const primera = filas.find((fila) => revision.errores.has(fila.clave))
      if (primera) enfocar(primera.clave, "name")
      return
    }
    if (revision.servicios.length === 0 || sePasaDelTope) return
    alAgregar(revision.servicios)
  }

  return (
    <div className="space-y-4" ref={contenedor}>
      <p className="text-sm text-texto-2">{f.intro}</p>

      {/* Los títulos de las columnas, en una pantalla ancha; en el teléfono cada celda lleva el suyo. */}
      <div aria-hidden="true" className={cn("hidden gap-2 text-xs font-medium text-texto-2 sm:grid", COLUMNAS)}>
        <span>{f.columnas.nombre}</span>
        <span>{f.columnas.duracion}</span>
        <span>{f.columnas.precio}</span>
        <span>{f.columnas.categoria}</span>
        <span />
      </div>

      <datalist id={idDeLasCategorias}>
        {sugerencias.map((categoria) => (
          <option key={categoria} value={categoria} />
        ))}
      </datalist>

      {filas.length === 0 ? (
        <p className="py-4 text-center text-sm text-texto-2">{f.sinFilas}</p>
      ) : (
        <ul className="max-h-[min(26rem,55dvh)] space-y-3 overflow-y-auto pr-1 sm:space-y-2">
          {filas.map((fila, indice) => {
            const numero = indice + 1
            const error = intentado ? revision.errores.get(fila.clave) : undefined
            const idDelError = `${fila.clave}-error`
            return (
              <li key={fila.clave} className={cn("rounded-[20px] bg-superficie p-3 sm:bg-transparent sm:p-0", error && "ring-1 ring-error sm:ring-0")}>
                <div className={cn("grid gap-2 sm:items-center", COLUMNAS)}>
                  <Celda titulo={f.columnas.nombre}>
                    <input
                      data-celda={`name-${fila.clave}`}
                      type="text"
                      aria-label={f.de(f.columnas.nombre, numero)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? idDelError : undefined}
                      value={fila.name}
                      onChange={(evento) => cambiar(fila.clave, { name: evento.target.value })}
                      onKeyDown={(evento) => alTeclear(evento, indice, "name")}
                      onPaste={(evento) => alPegar(evento, indice)}
                      maxLength={100}
                      autoComplete="off"
                      className={cn(CAMPO, error && CAMPO_CON_ERROR)}
                    />
                  </Celda>
                  <Celda titulo={f.columnas.duracion}>
                    <select
                      data-celda={`duration-${fila.clave}`}
                      aria-label={f.de(f.columnas.duracion, numero)}
                      value={fila.duration}
                      onChange={(evento) => cambiar(fila.clave, { duration: Number(evento.target.value) })}
                      className={CAMPO}
                    >
                      {opcionesDeDuracion(fila.duration).map((minutos) => (
                        <option key={minutos} value={minutos}>
                          {formatearDuracionDeServicio(minutos)}
                        </option>
                      ))}
                    </select>
                  </Celda>
                  <Celda titulo={f.columnas.precio}>
                    <input
                      data-celda={`price-${fila.clave}`}
                      type="text"
                      inputMode="decimal"
                      aria-label={f.de(f.columnas.precio, numero)}
                      value={fila.price}
                      onChange={(evento) => cambiar(fila.clave, { price: evento.target.value })}
                      onKeyDown={(evento) => alTeclear(evento, indice, "price")}
                      placeholder="0"
                      autoComplete="off"
                      className={cn(CAMPO, "tabular-nums")}
                    />
                  </Celda>
                  <Celda titulo={f.columnas.categoria}>
                    <input
                      data-celda={`category-${fila.clave}`}
                      type="text"
                      aria-label={f.de(f.columnas.categoria, numero)}
                      list={idDeLasCategorias}
                      value={fila.category}
                      onChange={(evento) => cambiar(fila.clave, { category: evento.target.value })}
                      onKeyDown={(evento) => alTeclear(evento, indice, "category")}
                      maxLength={40}
                      autoComplete="off"
                      className={CAMPO}
                    />
                  </Celda>
                  <button
                    type="button"
                    onClick={() => quitarFila(indice)}
                    aria-label={f.quitarFila(numero)}
                    title={f.quitarFila(numero)}
                    className="grid size-11 shrink-0 place-items-center justify-self-end rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-error/6 hover:text-error"
                  >
                    <Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} />
                  </button>
                </div>
                {error && (
                  <p id={idDelError} className={cn(ERROR_DE_CAMPO, "flex items-start gap-1.5")}>
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {f.motivo(error)}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div>
        <Boton ref={botonAgregarFila} variante="secundario" tamano="sm" icono={<Plus />} onClick={agregarFila}>
          {f.agregarFila}
        </Boton>
      </div>

      {/* Lo del pegado y lo del tope se anuncia: no se ve de dónde viene sin mirar la tabla. */}
      <div role="status" aria-live="polite">
        {aviso && <Aviso tono="info">{aviso}</Aviso>}
      </div>
      {intentado && conProblemas > 0 && <Aviso>{f.revisa(conProblemas)}</Aviso>}
      {sePasaDelTope && (
        <Aviso tono="atencion" rol="status">
          {mensajeDeTopeDeServicios(cantidadExistente, revision.servicios.length, palabras.servicio)}
        </Aviso>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-40 flex-1 text-sm text-texto-2">{revision.conContenido === 0 ? f.sinNada : ""}</p>
        <BotonPrimario cargando={enviando} disabled={revision.conContenido === 0 || sePasaDelTope} onClick={agregar}>
          {frases.carga.agregar(revision.conContenido)}
        </BotonPrimario>
      </div>
    </div>
  )
}

/** Una celda de la fila: en el teléfono lleva su título arriba; en pantalla ancha lo da el encabezado de la tabla. */
function Celda({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span aria-hidden="true" className="mb-1 block text-xs font-medium text-texto-2 sm:hidden">
        {titulo}
      </span>
      {children}
    </div>
  )
}
