"use client"

import { useDeferredValue, useId, useMemo, useRef, useState } from "react"
import { CircleAlert, CircleCheck, Download, FileUp } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { CAMPO, ETIQUETA } from "@/components/panel/estilos"
import {
  FILAS_MAXIMAS_EN_LA_VISTA_PREVIA,
  cuantosCaben,
  leerArchivoDeServicios,
  leerYRevisarTexto,
  plantillaDeServicios,
} from "@/lib/carga-de-servicios"
import { formatearMonto } from "@/lib/dinero"
import { ejemplosDe } from "@/lib/ejemplos-por-rubro"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { mensajeDeTopeDeServicios, type ServicioParaCargar } from "@/lib/servicios-en-lote"
import { cn } from "@/lib/utils"
import type { PalabrasDelRubro } from "@/lib/vocabulario"
import type { frasesDeConfiguracion } from "../_frases"

type FrasesDeServicios = ReturnType<typeof frasesDeConfiguracion>["servicios"]

interface PropsDeCargaPegar {
  frases: FrasesDeServicios
  palabras: PalabrasDelRubro
  rubro: string | null
  nombresExistentes: readonly string[]
  categoriasExistentes: readonly string[]
  /** Cuántos servicios tiene hoy el negocio: lo que cabe hasta el tope. */
  cantidadExistente: number
  enviando: boolean
  alAgregar: (servicios: ServicioParaCargar[]) => void
}

/**
 * "Pegar o importar": se pega la planilla (Excel, Google Sheets) o se elige un
 * CSV, y una vista previa dice fila por fila qué se va a agregar y qué no, con
 * el motivo. Sólo se agrega lo que está listo. La revisión de acá es del
 * navegador; el servidor vuelve a revisar todo al agregar, y la pantalla lo dice.
 */
export function CargaPegar({ frases, palabras, rubro, nombresExistentes, categoriasExistentes, cantidadExistente, enviando, alAgregar }: PropsDeCargaPegar) {
  const idDelTexto = useId()
  const idDeLasInstrucciones = useId()
  const f = frases.carga.pegar
  const entradaDeArchivo = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState("")
  const [archivo, setArchivo] = useState<string | null>(null)
  const [errorDelArchivo, setErrorDelArchivo] = useState("")
  const ejemplos = ejemplosDe(rubro)

  // Pegar 2 MB de texto no congela la caja: la vista previa se pone al día cuando el navegador puede.
  const textoDiferido = useDeferredValue(texto)
  const lectura = useMemo(
    () => leerYRevisarTexto(textoDiferido, nombresExistentes, categoriasExistentes),
    [textoDiferido, nombresExistentes, categoriasExistentes]
  )
  const hayFilas = lectura.filas.length > 0
  const caben = cuantosCaben(cantidadExistente)
  const sePasaDelTope = lectura.listas > caben
  const mostradas = lectura.filas.slice(0, FILAS_MAXIMAS_EN_LA_VISTA_PREVIA)

  const elegirArchivo = async (evento: React.ChangeEvent<HTMLInputElement>) => {
    const elegido = evento.target.files?.[0]
    // Vacío el campo para que elegir el mismo archivo otra vez (ya corregido) vuelva a leerlo.
    evento.target.value = ""
    if (!elegido) return
    const leido = await leerArchivoDeServicios(elegido)
    if (!leido.ok) return setErrorDelArchivo(f.errorDelArchivo[leido.motivo])
    setErrorDelArchivo("")
    setArchivo(elegido.name)
    setTexto(leido.texto)
  }

  /** La plantilla se arma en el navegador (un Blob): no hay nada que pedirle al servidor. */
  const descargarPlantilla = () => {
    const url = URL.createObjectURL(new Blob([plantillaDeServicios(rubro)], { type: "text/csv;charset=utf-8" }))
    const enlace = document.createElement("a")
    enlace.href = url
    enlace.download = f.nombreDeLaPlantilla
    document.body.append(enlace)
    enlace.click()
    enlace.remove()
    // El navegador ya empezó la descarga: la dirección temporal no hace falta más.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="space-y-4">
      <ol id={idDeLasInstrucciones} className="list-decimal space-y-1 pl-5 text-sm text-texto-2">
        {f.instrucciones.map((instruccion) => (
          <li key={instruccion}>{instruccion}</li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Boton variante="secundario" tamano="sm" icono={<FileUp />} onClick={() => entradaDeArchivo.current?.click()}>
          {f.archivo}
        </Boton>
        <Boton variante="fantasma" tamano="sm" icono={<Download />} onClick={descargarPlantilla}>
          {f.plantilla}
        </Boton>
        {/* Escondido del todo: el botón de arriba lo abre. Un `hidden` también se puede abrir con `click()`. */}
        <input ref={entradaDeArchivo} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={elegirArchivo} />
      </div>

      {errorDelArchivo && <Aviso>{errorDelArchivo}</Aviso>}
      {archivo && !errorDelArchivo && (
        <p role="status" className="text-sm text-texto-2">
          {f.archivoLeido(archivo)}
        </p>
      )}

      <div>
        <label htmlFor={idDelTexto} className={ETIQUETA}>
          {f.etiqueta}
        </label>
        <textarea
          id={idDelTexto}
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value)
            setArchivo(null)
          }}
          aria-describedby={idDeLasInstrucciones}
          placeholder={`Nombre\tDuración\tPrecio\tCategoría\n${ejemplos.servicios[0]}\t45\t15000\t${ejemplos.categorias[0]}`}
          spellCheck={false}
          autoComplete="off"
          rows={5}
          className={cn(CAMPO, "resize-y font-mono text-[13px] leading-relaxed whitespace-pre")}
        />
      </div>

      {hayFilas ? (
        <div className="space-y-3">
          <p role="status" className="text-sm font-medium">
            {f.cuenta(lectura.listas, lectura.conProblemas)}
          </p>

          {!lectura.titulosReconocidos && (
            <Aviso tono="info" rol="status">
              {f.sinTitulos}
            </Aviso>
          )}

          {/* La tabla se desplaza dentro de su marco; con tabindex se puede recorrer con el teclado. */}
          <div role="region" aria-label={f.vistaPrevia} tabIndex={0} className="max-h-80 overflow-auto rounded-[16px] border border-borde anillo-foco">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <caption className="sr-only">{f.vistaPrevia}</caption>
              <thead className="sticky top-0 bg-superficie text-xs text-texto-2">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">{f.columnas.fila}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{f.columnas.nombre}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{f.columnas.duracion}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{f.columnas.precio}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{f.columnas.categoria}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{f.columnas.estado}</th>
                </tr>
              </thead>
              <tbody>
                {mostradas.map((fila) => {
                  const servicio = fila.servicio
                  return (
                    <tr key={fila.fila} className={cn("border-t border-borde align-top", fila.error && "bg-error/6")}>
                      <td className="px-3 py-2 tabular-nums text-texto-2">{fila.fila}</td>
                      <td className="px-3 py-2 break-words">{servicio?.name ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{servicio ? formatearDuracionDeServicio(servicio.duration) : "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {servicio ? (servicio.price === null ? <span className="text-texto-2">{f.sinPrecio}</span> : formatearMonto(servicio.price)) : "—"}
                      </td>
                      <td className="px-3 py-2 break-words">{servicio?.category ?? "—"}</td>
                      <td className="px-3 py-2">
                        {fila.error ? (
                          <span className="flex items-start gap-1.5 font-medium text-error">
                            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                            {f.motivo(fila.error)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
                            {f.listaParaAgregar}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {lectura.filas.length > mostradas.length && (
            <p className="text-sm text-texto-2">{f.recortada(mostradas.length, lectura.filas.length)}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-texto-2">{f.sinFilas}</p>
      )}

      {sePasaDelTope && (
        <Aviso tono="atencion" rol="status">
          {mensajeDeTopeDeServicios(cantidadExistente, lectura.listas, palabras.servicio)}
        </Aviso>
      )}

      <p className="text-sm text-texto-2">{f.revision}</p>

      <div className="flex justify-end">
        <BotonPrimario cargando={enviando} disabled={lectura.listas === 0 || sePasaDelTope} onClick={() => alAgregar(lectura.servicios)}>
          {frases.carga.agregar(lectura.listas)}
        </BotonPrimario>
      </div>
    </div>
  )
}
