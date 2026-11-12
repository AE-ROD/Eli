"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { Pestanas, idDePanel, idDePestana, type Pestana } from "@/components/panel/pestanas"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { nombresEnUso } from "@/lib/carga-de-servicios"
import { categoriasDe } from "@/lib/lista-de-servicios"
import type { ServicioParaCargar } from "@/lib/servicios-en-lote"
import { vocabularioDe } from "@/lib/vocabulario"
import type { Servicio } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"
import type { ResumenParaMostrar } from "../_frases-de-servicios"
import { CargaPegar } from "./carga-pegar"
import { CargaSugeridos } from "./carga-sugeridos"
import { CargaVarios } from "./carga-varios"
import { ResumenDeCargaAviso } from "./resumen-de-carga-aviso"

type IdDePestana = "sugeridos" | "pegar" | "varios"

interface PropsDeModalCargaRapida {
  /** Los servicios que ya tiene el negocio: sus nombres y categorías, y cuántos caben todavía. */
  servicios: readonly Servicio[]
  /**
   * Envía lo que se eligió y dice qué pasó. `cerrar` es que ya se agregó y el
   * resumen quedó en la sección: el modal se cierra. Si no, el resumen se
   * muestra acá y el modal sigue abierto con lo que se estaba armando.
   */
  alAgregar: (servicios: ServicioParaCargar[]) => Promise<{ resumen: ResumenParaMostrar; cerrar: boolean }>
  alCerrar: () => void
}

/**
 * La "Carga rápida": tres formas de agregar muchos servicios de una vez, como
 * pestañas (patrón de ARIA, con flechas): los sugeridos del rubro, una planilla
 * pegada o un CSV, y una tabla para escribirlos. Las tres quedan montadas
 * aunque no se vean, para que cambiar de pestaña no pierda lo que se estaba
 * armando. Las tres envían por acá: un solo envío a la vez, y mientras se envía
 * el modal no se cierra y los botones no responden.
 */
export function ModalCargaRapida({ servicios, alAgregar, alCerrar }: PropsDeModalCargaRapida) {
  const idBase = useId()
  const rubro = useRubroDelPanel()
  const palabras = useMemo(() => vocabularioDe(rubro).palabras, [rubro])
  const { servicios: frases } = useMemo(() => frasesDeConfiguracion(palabras), [palabras])
  const [activa, setActiva] = useState<IdDePestana>("sugeridos")
  const [enviando, setEnviando] = useState(false)
  const [resumen, setResumen] = useState<ResumenParaMostrar | null>(null)
  /** Sin esperar al render: un doble clic muy rápido no manda dos veces. */
  const enCurso = useRef(false)
  const avisoDelResumen = useRef<HTMLDivElement>(null)

  const nombresExistentes = useMemo(() => nombresEnUso(servicios), [servicios])
  const categoriasExistentes = useMemo(() => categoriasDe(servicios), [servicios])

  const pestanas: Pestana<IdDePestana>[] = [
    { id: "sugeridos", texto: frases.carga.pestanas.sugeridos },
    { id: "pegar", texto: frases.carga.pestanas.pegar },
    { id: "varios", texto: frases.carga.pestanas.varios },
  ]

  // El resumen aparece arriba, y el botón que lo causó está abajo: si el modal es más alto que la pantalla, se trae a la vista.
  useEffect(() => {
    avisoDelResumen.current?.scrollIntoView({ block: "nearest" })
  }, [resumen])

  const enviar = async (lista: ServicioParaCargar[]) => {
    if (enCurso.current || lista.length === 0) return
    enCurso.current = true
    setEnviando(true)
    setResumen(null)
    const respuesta = await alAgregar(lista)
    enCurso.current = false
    setEnviando(false)
    if (respuesta.cerrar) alCerrar()
    else setResumen(respuesta.resumen)
  }

  return (
    <MarcoDeModal
      titulo={frases.carga.titulo}
      antetitulo={frases.titulo}
      descripcion={frases.carga.descripcion}
      ancho="xl"
      bloqueado={enviando}
      alCerrar={alCerrar}
    >
      {/* Mientras se envía no se toca nada: ni las pestañas ni los campos ni los botones. */}
      <fieldset disabled={enviando} className="min-w-0">
        <Pestanas
          idBase={idBase}
          etiqueta={frases.carga.pestanas.etiqueta}
          pestanas={pestanas}
          activa={activa}
          alCambiar={(id) => {
            setActiva(id)
            setResumen(null)
          }}
        />

        <div ref={avisoDelResumen}>
          {resumen && <ResumenDeCargaAviso resumen={resumen} rol="alert" className="mt-5" />}
        </div>

        <div className="mt-5">
          {pestanas.map(({ id }) => (
            <div
              key={id}
              id={idDePanel(idBase, id)}
              role="tabpanel"
              aria-labelledby={idDePestana(idBase, id)}
              hidden={activa !== id}
            >
              {id === "sugeridos" && (
                <CargaSugeridos
                  frases={frases}
                  palabras={palabras}
                  nombresExistentes={nombresExistentes}
                  categoriasExistentes={categoriasExistentes}
                  enviando={enviando}
                  alAgregar={enviar}
                />
              )}
              {id === "pegar" && (
                <CargaPegar
                  frases={frases}
                  palabras={palabras}
                  rubro={rubro}
                  nombresExistentes={nombresExistentes}
                  categoriasExistentes={categoriasExistentes}
                  cantidadExistente={servicios.length}
                  enviando={enviando}
                  alAgregar={enviar}
                />
              )}
              {id === "varios" && (
                <CargaVarios
                  frases={frases}
                  palabras={palabras}
                  nombresExistentes={nombresExistentes}
                  categoriasExistentes={categoriasExistentes}
                  cantidadExistente={servicios.length}
                  enviando={enviando}
                  alAgregar={enviar}
                />
              )}
            </div>
          ))}
        </div>
      </fieldset>
    </MarcoDeModal>
  )
}
