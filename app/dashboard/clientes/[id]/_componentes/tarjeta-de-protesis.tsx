"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { AnimatePresence } from "framer-motion"
import { Check } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { CAMPO, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import type { EtapaRespuesta, ProtesisRespuesta } from "@/lib/edicion-de-protesis"
import type { ColorDeModulo } from "@/lib/modulos"
import { MENSAJE_ENTREGA_SIN_LABORATORIO, estaCerrada, nombreDeEstado } from "@/lib/protesis"
import { cn } from "@/lib/utils"
import { agregarProtesisAlPlan, cambiarProtesis } from "../_datos"
import { fechaCorta, fechaYHora } from "../_formato"
import { cambiosDeLaEdicion, edicionDe, tituloDeProtesis, type EdicionDeProtesis } from "../_protesis"
import { ResumenDeProtesis } from "./resumen-de-protesis"
import { SelectorDeTono } from "./tono-de-protesis"

/** El tono del estado: en curso, el naranja de lo que se está atendiendo; entregada, el lima de lo cobrado; anulada, gris. */
function tonoDelEstado(estado: string): ColorDeModulo | "gris" {
  if (estado === "entregada") return "lima"
  if (estado === "anulada") return "gris"
  return "naranja"
}

/** Lo que dice cada etapa arriba de su nombre. */
function rotuloDeEtapa(etapa: EtapaRespuesta, indice: number): string {
  if (etapa.situacion === "hecha") return "Hecho"
  if (etapa.situacion === "actual") return "Ahora"
  if (etapa.situacion === "saltada") return "Se saltó"
  return `Paso ${indice + 1}`
}

interface PropsDeTarjetaDeProtesis {
  pacienteId: string
  protesis: ProtesisRespuesta
  puedeEditar: boolean
  /** Los laboratorios activos, para cambiarlo. `null` mientras cargan. */
  laboratorios: { id: string; nombre: string }[] | null
  /** Si el paciente tiene un plan vigente que quien mira puede editar: si no, "Agregar al plan" no se puede. */
  planEditable: boolean
  hayPlanVigente: boolean
  zona: string
  alCambiar: (protesis: ProtesisRespuesta) => void
  /** Después de agregarla al plan: la ficha vuelve a leer el plan y dice en qué etapa quedó. */
  alAgregarAlPlan: (etapaId: string) => Promise<string | null>
}

/**
 * Una prótesis del historial: su resumen (`ResumenDeProtesis`: quién la
 * hace, el diseño, el material, el tono, la entrega, el valor y el reparto
 * que le toca ver a quien mira) y el seguimiento con los pasos de su tipo
 * (`etapas`, como las arma el servidor), con la fecha y el autor de cada uno.
 *
 * El seguimiento sólo avanza, al paso que sigue según el tipo
 * (`siguienteEstado`). "Entregada" no se deshace: se pregunta antes.
 * Mientras no esté entregada ni anulada se cambian el laboratorio, la entrega
 * estimada y el tono. "Anular", antes de entregar.
 *
 * Si el técnico lleva parte (`requiereLaboratorioParaEntregar`, sin decir
 * cuánto) y falta el laboratorio, "Marcar como entregada" lleva primero a
 * elegirlo: sin laboratorio su parte no tendría a quién pagarse.
 */
export function TarjetaDeProtesis({
  pacienteId,
  protesis,
  puedeEditar,
  laboratorios,
  planEditable,
  hayPlanVigente,
  zona,
  alCambiar,
  alAgregarAlPlan,
}: PropsDeTarjetaDeProtesis) {
  const [modal, setModal] = useState<"entregar" | "anular" | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [aviso, setAviso] = useState("")
  const [listo, setListo] = useState("")
  /** Lo que se está cambiando (laboratorio, entrega y tono), o `null` si no se está editando. */
  const [edicion, setEdicion] = useState<EdicionDeProtesis | null>(null)
  const [avisoDeLaEdicion, setAvisoDeLaEdicion] = useState("")
  /** Al abrir la edición: a qué campo va el foco. */
  const focoAlEditar = useRef<"laboratorio" | "titulo" | null>(null)
  /** Si la edición se abrió desde "Marcar como entregada" porque faltaba el laboratorio. */
  const editaParaEntregar = useRef(false)
  const botonAvanzar = useRef<HTMLButtonElement>(null)
  /** El resultado de lo último que se hizo: adonde va el foco si el botón que se usó desaparece. */
  const resultado = useRef<HTMLDivElement>(null)
  const botonEditar = useRef<HTMLButtonElement>(null)
  const id = useId()

  const cerrada = estaCerrada(protesis.estado)
  const siguiente = protesis.siguienteEstado
  const editable = puedeEditar && !cerrada
  /** Entregar ahora perdería la parte del técnico: falta elegir el laboratorio. */
  const faltaLaboratorioParaEntregar = siguiente === "entregada" && protesis.requiereLaboratorioParaEntregar && !protesis.laboratorio

  useEffect(() => {
    if (!edicion || !focoAlEditar.current) return
    document.getElementById(focoAlEditar.current === "laboratorio" ? `${id}-laboratorio` : `${id}-editar`)?.focus()
    focoAlEditar.current = null
  }, [edicion, id])

  const enfocarResultadoSiSePerdio = () => {
    if (document.activeElement === document.body) resultado.current?.focus()
  }

  const cambiar = async (datos: Parameters<typeof cambiarProtesis>[2], mensaje: string, conModal: boolean) => {
    setTrabajando(true)
    setAviso("")
    setListo("")
    setAvisoDelModal("")
    const respuesta = await cambiarProtesis(pacienteId, protesis.id, datos)
    setTrabajando(false)
    if (!respuesta.ok) {
      if (conModal) setAvisoDelModal(respuesta.error)
      else setAviso(respuesta.error)
      return
    }
    alCambiar(respuesta.datos)
    setModal(null)
    setEdicion(null)
    setListo(mensaje)
    // El botón se deshabilitó mientras se guardaba: si el foco se perdió, va al mensaje.
    if (!conModal) requestAnimationFrame(enfocarResultadoSiSePerdio)
  }

  const avanzar = () => {
    if (!siguiente) return
    if (siguiente === "entregada" && faltaLaboratorioParaEntregar) {
      // Con la edición ya abierta no se pisa lo que se está escribiendo: sólo se va al laboratorio.
      if (!edicion) return abrirEdicion("laboratorio", true)
      editaParaEntregar.current = true
      return document.getElementById(`${id}-laboratorio`)?.focus()
    }
    if (siguiente === "entregada") {
      setAvisoDelModal("")
      return setModal("entregar")
    }
    void cambiar({ estado: siguiente }, `Seguimiento: quedó en «${nombreDeEstado(siguiente)}».`, false)
  }

  const abrirEdicion = (foco: "laboratorio" | "titulo", paraEntregar = false) => {
    focoAlEditar.current = foco
    editaParaEntregar.current = paraEntregar
    setAvisoDeLaEdicion("")
    setListo("")
    setAviso("")
    setEdicion(edicionDe(protesis))
  }

  const cerrarEdicion = () => {
    const volverAEntregar = editaParaEntregar.current
    editaParaEntregar.current = false
    setEdicion(null)
    requestAnimationFrame(() => (volverAEntregar ? botonAvanzar.current : botonEditar.current)?.focus())
  }

  const guardarEdicion = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!edicion || trabajando) return
    const cambios = cambiosDeLaEdicion(edicionDe(protesis), edicion)
    if (!cambios) return cerrarEdicion()
    setTrabajando(true)
    setAvisoDeLaEdicion("")
    const respuesta = await cambiarProtesis(pacienteId, protesis.id, cambios)
    setTrabajando(false)
    if (!respuesta.ok) return setAvisoDeLaEdicion(respuesta.error)
    alCambiar(respuesta.datos)
    setEdicion(null)
    // Si se abrió para poder entregar y ya tiene laboratorio, el foco vuelve a "Marcar como entregada".
    const listaParaEntregar = editaParaEntregar.current && respuesta.datos.laboratorio !== null
    editaParaEntregar.current = false
    setListo(listaParaEntregar ? "Se guardó el laboratorio: ya puedes marcarla como entregada." : "Se guardaron los cambios de la prótesis.")
    requestAnimationFrame(() => ((listaParaEntregar ? botonAvanzar.current : botonEditar.current) ?? resultado.current)?.focus())
  }

  const agregarAlPlan = async () => {
    setTrabajando(true)
    setAviso("")
    setListo("")
    const respuesta = await agregarProtesisAlPlan(pacienteId, protesis.id)
    if (!respuesta.ok) {
      setTrabajando(false)
      return setAviso(respuesta.error)
    }
    alCambiar(respuesta.datos.protesis)
    const etapa = await alAgregarAlPlan(respuesta.datos.etapaId)
    setTrabajando(false)
    setListo(etapa ? `Se agregó al plan y presupuesto, en la etapa «${etapa}».` : "Se agregó al plan y presupuesto.")
    // El botón se va: el foco pasa al mensaje.
    requestAnimationFrame(enfocarResultadoSiSePerdio)
  }

  // Las opciones del laboratorio: los activos y, si el de la prótesis ya no lo está, también ése.
  const opcionesDeLaboratorio = [
    ...(protesis.laboratorio && !laboratorios?.some((lab) => lab.id === protesis.laboratorio?.id) ? [protesis.laboratorio] : []),
    ...(laboratorios ?? []),
  ]

  return (
    <article aria-labelledby={`${id}-titulo`} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <ResumenDeProtesis
        titulo={tituloDeProtesis(protesis.tipo, protesis.arcada)}
        idDelTitulo={`${id}-titulo`}
        subtitulo={`Creada el ${fechaCorta(protesis.createdAt, zona)} por ${protesis.creadoPorNombre}`}
        accion={
          <span className="flex flex-wrap gap-1.5">
            <Insignia tono={tonoDelEstado(protesis.estado)}>{nombreDeEstado(protesis.estado)}</Insignia>
            {protesis.enElPlan && <Insignia tono="lila">En el plan</Insignia>}
          </span>
        }
        aviso={
          protesis.estado === "anulada" && (
            <Aviso tono="info" className="mt-4">
              Anulada{protesis.anuladaEn ? ` el ${fechaYHora(protesis.anuladaEn, zona)}` : ""}
              {protesis.anuladaPorNombre ? ` por ${protesis.anuladaPorNombre}` : ""}. No cambia más.
            </Aviso>
          )
        }
        tipo={protesis.tipo}
        tratante={protesis.tratante.nombre}
        laboratorio={protesis.laboratorio}
        accionSinLaboratorio={
          editable &&
          !edicion && (
            <Boton type="button" variante="secundario" tamano="sm" onClick={() => abrirEdicion("laboratorio")}>
              Elegir laboratorio
            </Boton>
          )
        }
        piezas={protesis.piezas}
        pilares={protesis.pilares}
        zonas={protesis.zonas}
        material={protesis.material}
        unidades={protesis.unidades}
        tono={protesis.tono}
        entregaEstimada={protesis.entregaEstimada}
        dinero={protesis}
        reparto={protesis.reparto}
        tratanteEsLaDuena={protesis.tratante.esLaDuena}
      />

      {edicion && (
        <form
          onSubmit={guardarEdicion}
          noValidate
          aria-labelledby={`${id}-editar`}
          className="mt-5 rounded-[24px] border-[1.5px] border-borde p-4 squircle sm:p-5"
        >
          <h4 id={`${id}-editar`} tabIndex={-1} className="font-semibold focus:outline-none">
            Laboratorio, entrega y tono
          </h4>
          <p className="mt-0.5 text-[13px] text-texto-2">Se pueden cambiar hasta que la prótesis se entregue.</p>
          {faltaLaboratorioParaEntregar && (
            <Aviso tono="info" className="mt-3">
              Para marcarla como entregada, primero elige el laboratorio: se le debe su parte.
            </Aviso>
          )}
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
            <div>
              <label htmlFor={`${id}-laboratorio`} className={ETIQUETA}>
                Técnico / laboratorio
              </label>
              <select
                id={`${id}-laboratorio`}
                value={edicion.laboratorioId ?? ""}
                onChange={(evento) => setEdicion({ ...edicion, laboratorioId: evento.target.value || null })}
                disabled={laboratorios === null}
                className={cn(CAMPO, "cursor-pointer text-base")}
              >
                <option value="">{laboratorios === null ? "Cargando laboratorios..." : "Sin laboratorio asignado"}</option>
                {opcionesDeLaboratorio.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-entrega`} className={ETIQUETA}>
                Entrega estimada
              </label>
              <input
                id={`${id}-entrega`}
                type="date"
                min="2000-01-01"
                value={edicion.entregaEstimada}
                onChange={(evento) => setEdicion({ ...edicion, entregaEstimada: evento.target.value })}
                className={cn(CAMPO, "text-base")}
              />
            </div>
          </div>
          {laboratorios !== null && laboratorios.length === 0 && (
            <p className="mt-2 text-[13px] text-texto-2">No hay laboratorios activos: la dueña los agrega en Configuración.</p>
          )}
          <p id={`${id}-tono`} className={cn(ETIQUETA, "mt-4")}>
            Tono VITA classical
          </p>
          <SelectorDeTono valor={edicion.tono} alCambiar={(tono) => setEdicion({ ...edicion, tono })} idDelNombre={`${id}-tono`} />
          {avisoDeLaEdicion && <Aviso className="mt-4">{avisoDeLaEdicion}</Aviso>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Boton type="submit" tamano="sm" cargando={trabajando}>
              Guardar cambios
            </Boton>
            <Boton type="button" variante="secundario" tamano="sm" disabled={trabajando} onClick={cerrarEdicion}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}

      <div className="mt-5 border-t border-borde pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h4 id={`${id}-seguimiento`} className="font-semibold">
            Seguimiento
          </h4>
          {!cerrada && <span className="text-[13px] text-texto-2">La liquidación se libera al entregar</span>}
        </div>
        <ol aria-labelledby={`${id}-seguimiento`} className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
          {protesis.etapas.map((etapa, indice) => {
            const esLaActual = etapa.situacion === "actual"
            const hecha = etapa.situacion === "hecha"
            return (
              <li
                key={etapa.id}
                aria-current={esLaActual ? "step" : undefined}
                className={cn(
                  "rounded-[20px] border-[1.5px] p-3 squircle",
                  esLaActual
                    ? "border-navy bg-lila-suave"
                    : hecha && etapa.id === "entregada"
                      ? "border-transparent bg-lima-suave"
                      : hecha || etapa.situacion === "saltada"
                        ? "border-transparent bg-superficie"
                        : "border-dashed border-borde bg-tarjeta"
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-texto-2 uppercase">
                  {hecha && <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
                  {esLaActual ? <span className="text-navy">Ahora</span> : rotuloDeEtapa(etapa, indice)}
                </span>
                <span className={cn("mt-1 block", esLaActual ? "font-semibold" : "font-medium")}>{etapa.nombre}</span>
                {etapa.fecha && (
                  <span className="mt-1 block text-[12px] leading-snug text-texto-2">
                    {fechaYHora(etapa.fecha, zona)}
                    {etapa.autorNombre && ` · ${etapa.autorNombre}`}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      <div ref={resultado} tabIndex={-1} className="mt-4 space-y-3 empty:hidden focus:outline-none">
        {listo && (
          <Aviso tono="listo" rol="status">
            {listo}
          </Aviso>
        )}
        {aviso && <Aviso>{aviso}</Aviso>}
      </div>

      {puedeEditar && (
        <div className="mt-4 flex flex-wrap items-start gap-2">
          {!cerrada && siguiente && (
            <Boton
              ref={botonAvanzar}
              type="button"
              tamano="sm"
              cargando={trabajando && !modal && !edicion}
              disabled={trabajando}
              aria-describedby={faltaLaboratorioParaEntregar ? `${id}-falta-laboratorio` : undefined}
              onClick={avanzar}
            >
              {siguiente === "entregada" ? "Marcar como entregada" : `Pasar a ${nombreDeEstado(siguiente)}`}
            </Boton>
          )}
          {editable && !edicion && (
            <Boton ref={botonEditar} type="button" variante="secundario" tamano="sm" disabled={trabajando} onClick={() => abrirEdicion("titulo")}>
              Cambiar laboratorio, entrega o tono
            </Boton>
          )}
          {protesis.estado !== "anulada" && !protesis.enElPlan && (
            <Boton
              type="button"
              variante="secundario"
              tamano="sm"
              disabled={trabajando || !hayPlanVigente || !planEditable}
              aria-describedby={!hayPlanVigente ? `${id}-sin-plan` : undefined}
              onClick={() => void agregarAlPlan()}
            >
              Agregar al plan y presupuesto
            </Boton>
          )}
          {!cerrada && (
            <Boton
              type="button"
              variante="fantasma"
              tamano="sm"
              className="text-error hover:bg-error/8"
              disabled={trabajando}
              onClick={() => {
                setAvisoDelModal("")
                setModal("anular")
              }}
            >
              Anular
            </Boton>
          )}
        </div>
      )}
      {puedeEditar && faltaLaboratorioParaEntregar && (
        <p id={`${id}-falta-laboratorio`} className="mt-2 text-[13px] text-texto-2">
          {MENSAJE_ENTREGA_SIN_LABORATORIO} «Marcar como entregada» te lleva a elegirlo.
        </p>
      )}
      {puedeEditar && protesis.estado !== "anulada" && !protesis.enElPlan && !hayPlanVigente && (
        <p id={`${id}-sin-plan`} className="mt-2 text-[13px] text-texto-2">
          Para agregarla al plan, primero arma un plan en «Plan y presupuesto».
        </p>
      )}

      <AnimatePresence onExitComplete={enfocarResultadoSiSePerdio}>
        {modal === "entregar" && (
          <ModalConfirmar
            titulo="Marcar como entregada"
            descripcion="La entrega queda con la fecha de hoy y tu nombre, y no se deshace: una prótesis entregada no cambia más ni se anula. Al entregarla se libera la parte de la odontóloga y la del laboratorio."
            textoConfirmar="Marcar como entregada"
            textoCancelar="Todavía no"
            trabajando={trabajando}
            aviso={avisoDelModal}
            onConfirmar={() => void cambiar({ estado: "entregada" }, "Seguimiento: quedó entregada.", true)}
            onCerrar={() => setModal(null)}
          />
        )}
        {modal === "anular" && (
          <ModalConfirmar
            titulo="Anular la prótesis"
            descripcion="Queda en el historial como anulada, con la fecha y tu nombre. No se deshace."
            textoConfirmar="Anular la prótesis"
            textoCancelar="No anular"
            peligro
            trabajando={trabajando}
            aviso={avisoDelModal}
            onConfirmar={() => void cambiar({ estado: "anulada" }, "La prótesis quedó anulada.", true)}
            onCerrar={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </article>
  )
}
