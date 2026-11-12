"use client"

import { useEffect, useEffectEvent, useId, useMemo, useState } from "react"
import { LoaderCircle, Search } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { CasillaDeSeleccion } from "@/components/panel/casilla-de-seleccion"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { sugeridosParaCargar, vistaDeSugeridos, type SugeridoDelRubro } from "@/lib/carga-de-servicios"
import { formatearMonto } from "@/lib/dinero"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { alternarUna, conMarca, estadoDeLaSeleccion } from "@/lib/seleccion-multiple"
import type { ServicioParaCargar } from "@/lib/servicios-en-lote"
import { cn } from "@/lib/utils"
import type { PalabrasDelRubro } from "@/lib/vocabulario"
import { leerSugeridos } from "../_datos"
import type { frasesDeConfiguracion } from "../_frases"

type FrasesDeServicios = ReturnType<typeof frasesDeConfiguracion>["servicios"]

interface PropsDeCargaSugeridos {
  frases: FrasesDeServicios
  palabras: PalabrasDelRubro
  /** Los nombres y categorías que el negocio ya tiene, para no repetir ni inventar otra variante. */
  nombresExistentes: readonly string[]
  categoriasExistentes: readonly string[]
  enviando: boolean
  alAgregar: (servicios: ServicioParaCargar[]) => void
}

type Estado = { tipo: "cargando" } | { tipo: "error"; mensaje: string } | { tipo: "listo"; sugeridos: SugeridoDelRubro[] }

/**
 * "Sugeridos de tu rubro": los servicios que casi todo local del oficio ofrece,
 * agrupados por categoría y con una casilla cada uno (y una por categoría). Los
 * que el negocio ya tiene salen deshabilitados con "Ya lo tienes". Se agregan
 * tal cual, con la duración y el precio que se ven: se editan después.
 */
export function CargaSugeridos({ frases, palabras, nombresExistentes, categoriasExistentes, enviando, alAgregar }: PropsDeCargaSugeridos) {
  const idDelBuscador = useId()
  const f = frases.carga.sugeridos
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" })
  const [intento, setIntento] = useState(0)
  const [texto, setTexto] = useState("")
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set())

  // Con las palabras de ahora, sin volver a pedir la lista cada vez que cambian de identidad.
  const pedirLosSugeridos = useEffectEvent(() => leerSugeridos(palabras))

  useEffect(() => {
    let cancelado = false
    pedirLosSugeridos().then((resultado) => {
      if (!cancelado) setEstado(resultado.ok ? { tipo: "listo", sugeridos: resultado.datos } : { tipo: "error", mensaje: resultado.error })
    })
    return () => {
      cancelado = true
    }
  }, [intento])

  const sugeridos = useMemo(() => (estado.tipo === "listo" ? estado.sugeridos : []), [estado])
  const vista = useMemo(() => vistaDeSugeridos(sugeridos, texto, nombresExistentes), [sugeridos, texto, nombresExistentes])
  // Todo lo marcado que se puede agregar, también lo que la búsqueda de ahora esconde.
  const paraAgregar = useMemo(
    () => sugeridosParaCargar(sugeridos, seleccion, nombresExistentes, categoriasExistentes),
    [sugeridos, seleccion, nombresExistentes, categoriasExistentes]
  )
  const hayUrgencia = sugeridos.some((sugerido) => sugerido.esUrgencia)
  const todosMarcados = vista.marcables.length > 0 && vista.marcables.every((clave) => seleccion.has(clave))

  const reintentar = () => {
    setEstado({ tipo: "cargando" })
    setIntento((n) => n + 1)
  }

  if (estado.tipo === "cargando") {
    return (
      <p role="status" className="flex items-center gap-2 py-6 text-sm text-texto-2">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        {f.cargando}
      </p>
    )
  }

  if (estado.tipo === "error") {
    return (
      <Aviso accion={<BotonPrimario variante="secundario" tamaño="sm" onClick={reintentar}>{f.reintentar}</BotonPrimario>}>
        {estado.mensaje}
      </Aviso>
    )
  }

  if (sugeridos.length === 0) {
    return (
      <EstadoVacio titulo={f.vacio.titulo}>{f.vacio.ayuda}</EstadoVacio>
    )
  }

  const nadaQueAgregar = vistaDeSugeridos(sugeridos, "", nombresExistentes).marcables.length === 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-texto-2">{f.intro}</p>

      {nadaQueAgregar ? (
        <Aviso tono="info" rol="status">
          {f.todosAgregados}
        </Aviso>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="min-w-48 flex-1">
              <label htmlFor={idDelBuscador} className={ETIQUETA}>
                {f.buscar}
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-texto-2" aria-hidden="true" />
                <input
                  id={idDelBuscador}
                  type="search"
                  value={texto}
                  onChange={(evento) => setTexto(evento.target.value)}
                  placeholder={f.buscarAyuda}
                  autoComplete="off"
                  maxLength={100}
                  className={cn(CAMPO, "pl-10")}
                />
              </div>
            </div>
            <BotonPrimario
              variante="fantasma"
              tamaño="sm"
              disabled={vista.marcables.length === 0}
              onClick={() => setSeleccion((previa) => conMarca(previa, vista.marcables, !todosMarcados))}
            >
              {todosMarcados ? f.desmarcarTodos : f.marcarTodos}
            </BotonPrimario>
          </div>

          {hayUrgencia && (
            <Aviso tono="info" rol="status">
              {f.urgenciaAviso}
            </Aviso>
          )}

          {/* Lo largo de la lista se desplaza adentro: el buscador y el botón de agregar quedan a la vista. */}
          <div className="max-h-[min(26rem,50dvh)] space-y-4 overflow-y-auto pr-1">
            {vista.visibles === 0 && <p className="py-4 text-center text-sm text-texto-2">{f.sinResultados}</p>}
            {vista.grupos.map((grupo) => {
              const marcables = grupo.servicios.filter((s) => !s.yaLoTiene).map((s) => s.clave)
              const nombre = grupo.categoria
              return (
                <section key={grupo.clave}>
                  <div className="flex items-center gap-1 rounded-[16px] bg-superficie pl-1 pr-3 squircle">
                    <CasillaDeSeleccion
                      etiqueta={f.marcarCategoria(nombre)}
                      marcada={estadoDeLaSeleccion(seleccion, marcables) === "todos"}
                      algunas={estadoDeLaSeleccion(seleccion, marcables) === "algunos"}
                      deshabilitada={marcables.length === 0}
                      alCambiar={(marcado) => setSeleccion((previa) => conMarca(previa, marcables, marcado))}
                    />
                    <h4 className="min-w-0 flex-1 py-2 font-medium break-words">{nombre}</h4>
                    <span className="text-xs text-texto-2 tabular-nums">{frases.lista.cuantos(grupo.servicios.length)}</span>
                  </div>
                  <ul className="divide-y divide-borde px-1">
                    {grupo.servicios.map((sugerido) => (
                      <li key={sugerido.clave}>
                        <CasillaDeSeleccion
                          etiqueta={[
                            sugerido.name,
                            formatearDuracionDeServicio(sugerido.duration),
                            formatearMonto(sugerido.price),
                            ...(sugerido.yaLoTiene ? [f.yaLoTienes] : []),
                          ].join(", ")}
                          marcada={seleccion.has(sugerido.clave) && !sugerido.yaLoTiene}
                          deshabilitada={sugerido.yaLoTiene}
                          alCambiar={() => setSeleccion((previa) => alternarUna(previa, sugerido.clave))}
                          className="w-full py-1"
                        >
                          <span className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5", sugerido.yaLoTiene && "text-texto-2")}>
                            <span className="min-w-40 flex-1 break-words">{sugerido.name}</span>
                            {sugerido.esUrgencia && <Insignia>{f.urgencia}</Insignia>}
                            <span className="text-[13px] text-texto-2">{formatearDuracionDeServicio(sugerido.duration)}</span>
                            <span className="min-w-16 text-right text-[13px] font-medium tabular-nums">{formatearMonto(sugerido.price)}</span>
                            {sugerido.yaLoTiene && <Insignia>{f.yaLoTienes}</Insignia>}
                          </span>
                        </CasillaDeSeleccion>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <p role="status" className="min-w-40 flex-1 text-sm text-texto-2">
              {paraAgregar.length === 0 ? f.marcaAlgo : ""}
            </p>
            <BotonPrimario cargando={enviando} disabled={paraAgregar.length === 0 && !enviando} onClick={() => alAgregar(paraAgregar)}>
              {f.agregar(paraAgregar.length)}
            </BotonPrimario>
          </div>
        </>
      )}
    </div>
  )
}
