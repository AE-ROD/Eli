"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import type { OpcionesDeProtesisRespuesta, ProtesisRespuesta } from "@/lib/edicion-de-protesis"
import type { PlanRespuesta } from "@/lib/edicion-del-plan"
import type { MarcaDelOdontograma } from "@/lib/odontograma"
import { cn } from "@/lib/utils"
import { leerOpcionesDeProtesis, leerPlanDelPaciente, leerProtesis } from "../_datos"
import { NuevaProtesis } from "./nueva-protesis"
import { TarjetaDeProtesis } from "./tarjeta-de-protesis"

interface PropsDePestanaProtesis {
  pacienteId: string
  /** Se piden la primera vez que se abre la pestaña. */
  activa: boolean
  /** Las marcas del odontograma guardado. */
  odontograma: readonly MarcaDelOdontograma[]
  plan: PlanRespuesta | null
  alCambiarPlan: (plan: PlanRespuesta) => void
  esLaDuena: boolean
  nombreDeQuienMira: string
  zona: string
}

/**
 * La pestaña Prótesis de la ficha (sólo dueño y odontólogos: el encargado no
 * la ve): el historial de prótesis del paciente, de la más nueva a la más
 * vieja, y "Nueva prótesis". Las prótesis y el catálogo (materiales,
 * laboratorios, tratantes) se piden la primera vez que se abre.
 */
export function PestanaProtesis({
  pacienteId,
  activa,
  odontograma,
  plan,
  alCambiarPlan,
  esLaDuena,
  nombreDeQuienMira,
  zona,
}: PropsDePestanaProtesis) {
  const [protesis, setProtesis] = useState<ProtesisRespuesta[]>([])
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [opciones, setOpciones] = useState<OpcionesDeProtesisRespuesta | null>(null)
  const [estado, setEstado] = useState<"sin-pedir" | "cargando" | "lista" | "error">("sin-pedir")
  const [aviso, setAviso] = useState("")
  const [avisoDeOpciones, setAvisoDeOpciones] = useState("")
  const [creando, setCreando] = useState(false)
  const [listo, setListo] = useState("")
  const idDelTitulo = useId()
  const botonNueva = useRef<HTMLButtonElement>(null)
  const resultado = useRef<HTMLDivElement>(null)
  /** Al cerrar "Nueva prótesis", adónde va el foco: al botón que la abrió, o al mensaje de lo creado. */
  const focoAlCerrar = useRef<"boton" | "resultado" | null>(null)

  const cargar = async () => {
    const [deLaFicha, delCatalogo] = await Promise.all([leerProtesis(pacienteId), leerOpcionesDeProtesis(pacienteId)])
    if (delCatalogo.ok) {
      setOpciones(delCatalogo.datos)
      setAvisoDeOpciones("")
    } else setAvisoDeOpciones(delCatalogo.error)
    if (!deLaFicha.ok) {
      setAviso(deLaFicha.error)
      return false
    }
    setAviso("")
    setProtesis(deLaFicha.datos.protesis)
    setPuedeEditar(deLaFicha.datos.puedeEditar)
    return true
  }

  // La primera vez que se abre la pestaña. El estado cambia en la respuesta, no acá.
  useEffect(() => {
    if (!activa || estado !== "sin-pedir") return
    let vigente = true
    Promise.all([leerProtesis(pacienteId), leerOpcionesDeProtesis(pacienteId)]).then(([deLaFicha, delCatalogo]) => {
      if (!vigente) return
      if (delCatalogo.ok) setOpciones(delCatalogo.datos)
      else setAvisoDeOpciones(delCatalogo.error)
      if (!deLaFicha.ok) {
        setAviso(deLaFicha.error)
        setEstado("error")
        return
      }
      setProtesis(deLaFicha.datos.protesis)
      setPuedeEditar(deLaFicha.datos.puedeEditar)
      setEstado("lista")
    })
    return () => {
      vigente = false
    }
  }, [activa, estado, pacienteId])

  useEffect(() => {
    if (creando || !focoAlCerrar.current) return
    if (focoAlCerrar.current === "boton") botonNueva.current?.focus()
    else resultado.current?.focus()
    focoAlCerrar.current = null
  }, [creando])

  const reintentar = async () => {
    setEstado("cargando")
    setEstado((await cargar()) ? "lista" : "error")
  }

  const reemplazar = (actualizada: ProtesisRespuesta) =>
    setProtesis((previas) => previas.map((otra) => (otra.id === actualizada.id ? actualizada : otra)))

  /** Después de agregar una prótesis al plan: el plan se vuelve a leer y se dice en qué etapa quedó. */
  const alAgregarAlPlan = async (etapaId: string) => {
    const respuesta = await leerPlanDelPaciente(pacienteId)
    if (!respuesta.ok) return null
    alCambiarPlan(respuesta.datos)
    return respuesta.datos.plan?.etapas.find((etapa) => etapa.id === etapaId)?.nombre ?? null
  }

  const vigente = plan?.plan ?? null

  return (
    <div className="space-y-6">
      <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
        <EncabezadoDeTarjeta
          id={idDelTitulo}
          titulo="Prótesis"
          subtitulo="Las prótesis del paciente: el diseño, el laboratorio, el seguimiento y el valor."
          accion={
            puedeEditar &&
            !creando &&
            opciones?.puedeEditar && (
              <Boton
                ref={botonNueva}
                type="button"
                tamano="sm"
                icono={<Plus aria-hidden="true" />}
                onClick={() => {
                  setListo("")
                  setCreando(true)
                }}
              >
                Nueva prótesis
              </Boton>
            )
          }
        />

        <div ref={resultado} tabIndex={-1} className="mt-4 space-y-3 empty:hidden focus:outline-none">
          {listo && (
            <Aviso tono="listo" rol="status">
              {listo}
            </Aviso>
          )}
          {aviso && (
            <Aviso
              accion={
                estado === "error" && (
                  <Boton type="button" variante="secundario" tamano="sm" onClick={() => void reintentar()}>
                    Reintentar
                  </Boton>
                )
              }
            >
              {aviso}
            </Aviso>
          )}
          {avisoDeOpciones && <Aviso tono="atencion">{avisoDeOpciones}</Aviso>}
        </div>

        {estado === "lista" && protesis.length === 0 && !creando && (
          <EstadoVacio className="mt-4" titulo="Sin prótesis todavía">
            {puedeEditar ? "Diseña la primera con «Nueva prótesis»." : "Todavía no se registró ninguna."}
          </EstadoVacio>
        )}
      </section>

      {creando && opciones && (
        <NuevaProtesis
          pacienteId={pacienteId}
          opciones={opciones}
          odontograma={odontograma}
          esLaDuena={esLaDuena}
          nombreDeQuienMira={nombreDeQuienMira}
          alCrear={(nueva) => {
            setProtesis((previas) => [nueva, ...previas])
            setListo(`Prótesis creada: ${nueva.nombreParaElPlan}. Quedó en «Toma de impresión».`)
            focoAlCerrar.current = "resultado"
            setCreando(false)
          }}
          alCancelar={() => {
            focoAlCerrar.current = "boton"
            setCreando(false)
          }}
        />
      )}

      {estado === "sin-pedir" || estado === "cargando" ? (
        <div aria-busy="true" className="space-y-4">
          <span className="sr-only">Cargando prótesis...</span>
          {[0, 1].map((i) => (
            <div key={i} aria-hidden="true" className={cn(TARJETA_DEL_PANEL, "space-y-3 p-5 sm:p-6")}>
              <Esqueleto className="h-6 w-2/3" />
              <Esqueleto className="w-1/2" />
              <Esqueleto className="w-4/5" />
            </div>
          ))}
        </div>
      ) : (
        protesis.length > 0 && (
          <section aria-label="Historial de prótesis" className="space-y-4">
            {protesis.map((una) => (
              <TarjetaDeProtesis
                key={una.id}
                pacienteId={pacienteId}
                protesis={una}
                puedeEditar={puedeEditar}
                laboratorios={opciones?.laboratorios ?? null}
                planEditable={!!plan?.puedeEditar}
                hayPlanVigente={!!vigente}
                zona={zona}
                alCambiar={reemplazar}
                alAgregarAlPlan={alAgregarAlPlan}
              />
            ))}
          </section>
        )
      )}
    </div>
  )
}
