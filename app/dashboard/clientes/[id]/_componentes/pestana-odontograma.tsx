"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Boton } from "@/components/comunes/boton"
import { Aviso } from "@/components/panel/aviso"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { Odontograma } from "@/components/panel/odontograma/odontograma"
import { mismasMarcas } from "@/components/panel/odontograma/marcas"
import { MENSAJE_ODONTOGRAMA_SIN_HALLAZGOS, type PlanRespuesta } from "@/lib/edicion-del-plan"
import { errorDelOdontograma, type OdontogramaRespuesta } from "@/lib/ficha-clinica"
import type { MarcaDelOdontograma } from "@/lib/odontograma"
import { propuestaDesdeOdontograma } from "@/lib/plan-de-tratamiento"
import { cn } from "@/lib/utils"
import { crearVersionDelPlan, guardarOdontograma } from "../_datos"
import { fechaYHora } from "../_formato"
import { useCambiosSinGuardar } from "./cambios-sin-guardar"

interface PropsDePestanaOdontograma {
  pacienteId: string
  inicial: OdontogramaRespuesta
  editable: boolean
  /** El plan del paciente: para saber si "Generar presupuesto" reemplaza una versión. */
  plan: PlanRespuesta | null
  zona: string
  /** Con el plan nuevo, ya armado: la ficha lo muestra en su pestaña. */
  alArmarPresupuesto: (plan: PlanRespuesta) => void
  /** Con el odontograma recién guardado: la pestaña Prótesis dibuja lo ausente según lo guardado. */
  alGuardar?: (odontograma: OdontogramaRespuesta) => void
}

/**
 * El odontograma del paciente con lo de guardar: los toques cambian una copia
 * local, y "Guardar odontograma" manda el conjunto entero (la API lo
 * reemplaza). Mientras haya cambios sin guardar se dice, con una barra que
 * acompaña al bajar, y se pregunta antes de salir de la ficha.
 *
 * "Generar presupuesto" arma una versión del plan desde el odontograma
 * guardado (guarda antes lo que falte). Si ya hay un plan vigente, lo
 * reemplaza: se pregunta antes.
 */
export function PestanaOdontograma({ pacienteId, inicial, editable, plan, zona, alArmarPresupuesto, alGuardar }: PropsDePestanaOdontograma) {
  const [guardado, setGuardado] = useState(inicial)
  const [marcas, setMarcas] = useState<MarcaDelOdontograma[]>(inicial.marcas)
  const [guardando, setGuardando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [aviso, setAviso] = useState("")
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [listo, setListo] = useState("")
  /** Lo de guardar y su resultado: adonde va el foco si el botón que se usó desaparece. */
  const resultado = useRef<HTMLDivElement>(null)

  const hayCambios = !mismasMarcas(marcas, guardado.marcas)
  const vigente = plan?.plan ?? null
  const puedeArmarPlan = editable && !!plan?.puedeEditar

  // Con cambios sin guardar, se pregunta antes de cerrar, recargar o irse por un enlace del panel.
  useCambiosSinGuardar("odontograma", "el odontograma", hayCambios)

  // Al guardar o descartar, la barra (con el botón que tenía el foco) se va y
  // el foco caería al <body>: va al mensaje de lo que pasó, que se lee al llegar.
  // Sólo cuando los cambios se acaban, no al abrir la página.
  const habiaCambios = useRef(hayCambios)
  useEffect(() => {
    const venia = habiaCambios.current
    habiaCambios.current = hayCambios
    if (venia && !hayCambios && document.activeElement === document.body) resultado.current?.focus()
  }, [hayCambios])

  const cambiar = (nuevas: MarcaDelOdontograma[]) => {
    setMarcas(nuevas)
    setListo("")
  }

  /** Guarda lo marcado. Devuelve si quedó guardado; si no, el motivo queda en `aviso`. */
  const guardar = async (): Promise<boolean> => {
    const error = errorDelOdontograma(marcas)
    if (error) {
      setAviso(error)
      return false
    }
    setAviso("")
    setGuardando(true)
    const resultado = await guardarOdontograma(pacienteId, marcas)
    setGuardando(false)
    if (!resultado.ok) {
      setAviso(resultado.error)
      return false
    }
    // Lo local no se pisa: si se siguió marcando mientras guardaba, eso sigue como cambio.
    setGuardado(resultado.datos)
    alGuardar?.(resultado.datos)
    setListo("Odontograma guardado.")
    return true
  }

  const descartar = () => {
    setMarcas(guardado.marcas)
    setAviso("")
    setListo("Se descartaron los cambios: el odontograma quedó como estaba guardado.")
  }

  const armar = async () => {
    setAvisoDelModal("")
    setAviso("")
    setGenerando(true)
    if (hayCambios && !(await guardar())) {
      setGenerando(false)
      setConfirmando(false)
      return
    }
    const resultado = await crearVersionDelPlan(pacienteId, "odontograma")
    setGenerando(false)
    if (!resultado.ok) {
      if (confirmando) setAvisoDelModal(resultado.error)
      else setAviso(resultado.error)
      return
    }
    setConfirmando(false)
    alArmarPresupuesto(resultado.datos)
  }

  const generarPresupuesto = () => {
    // Sin caries ni extracciones no hay nada que proponer: se dice sin ir al servidor.
    if (propuestaDesdeOdontograma(marcas, []).length === 0) {
      setAviso(MENSAJE_ODONTOGRAMA_SIN_HALLAZGOS)
      return
    }
    if (vigente) {
      setAvisoDelModal("")
      setConfirmando(true)
      return
    }
    void armar()
  }

  const actualizado = guardado.odontogramaActualizadoEn
    ? `Actualizado el ${fechaYHora(guardado.odontogramaActualizadoEn, zona)}${guardado.odontogramaActualizadoPor ? ` por ${guardado.odontogramaActualizadoPor}` : ""}`
    : "Todavía no se guardó ningún hallazgo."

  return (
    <>
      <Odontograma
        marcas={marcas}
        alCambiar={editable ? cambiar : undefined}
        actualizado={actualizado}
        accionesDelResumen={
          puedeArmarPlan && (
            <div className="space-y-2">
              <Boton type="button" className="w-full" cargando={generando && !confirmando} onClick={generarPresupuesto}>
                {hayCambios ? "Guardar y generar presupuesto" : "Generar presupuesto"}
              </Boton>
              <p className="text-xs text-pretty text-texto-2">
                {vigente
                  ? `Rehace el plan desde el odontograma: reemplaza la versión ${vigente.version}.`
                  : "Arma el plan con una restauración por cada pieza con caries y una exodoncia por cada extracción indicada."}
              </p>
            </div>
          )
        }
        pie={
          editable && (
            // Con cambios, pegado abajo mientras se ve el odontograma: los cambios
            // no se pierden de vista. Lo pega este bloque y no la barra: un
            // `sticky` se mueve sólo dentro de su padre.
            <div
              ref={resultado}
              tabIndex={-1}
              className={cn("space-y-3 rounded-[20px] anillo-foco", hayCambios && "sticky bottom-3 z-10")}
            >
              {aviso && <Aviso>{aviso}</Aviso>}
              {hayCambios ? (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[20px] bg-navy px-4 py-3 text-white shadow-md squircle anillo-foco-claro">
                  <p className="text-sm font-medium">Tienes cambios sin guardar en el odontograma.</p>
                  <div className="flex flex-wrap gap-2">
                    <Boton type="button" variante="fantasma" tamano="sm" className="text-white hover:bg-white/10" disabled={guardando} onClick={descartar}>
                      Descartar cambios
                    </Boton>
                    <Boton type="button" variante="invertido" tamano="sm" cargando={guardando} onClick={() => void guardar()}>
                      Guardar odontograma
                    </Boton>
                  </div>
                </div>
              ) : (
                listo && (
                  <Aviso tono="listo" rol="status">
                    {listo}
                  </Aviso>
                )
              )}
            </div>
          )
        }
      />

      <AnimatePresence>
        {confirmando && vigente && (
          <ModalConfirmar
            titulo="¿Rehacer el plan desde el odontograma?"
            descripcion={`Se arma la versión ${vigente.version + 1} con lo que pide el odontograma y reemplaza a la versión ${vigente.version}, que queda como anterior. Lo aprobado y lo agendado en la versión ${vigente.version} no pasa a la nueva.${hayCambios ? " Antes se guardan los cambios del odontograma." : ""}`}
            textoConfirmar="Rehacer el plan"
            textoCancelar="Dejar el plan como está"
            trabajando={generando}
            aviso={avisoDelModal}
            onConfirmar={() => void armar()}
            onCerrar={() => setConfirmando(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
