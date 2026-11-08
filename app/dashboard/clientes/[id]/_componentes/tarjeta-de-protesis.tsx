"use client"

import { useId, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Check } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { CAMPO, ETIQUETA, TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import type { ProtesisRespuesta } from "@/lib/edicion-de-protesis"
import type { ColorDeModulo } from "@/lib/modulos"
import {
  PASOS_DEL_SEGUIMIENTO,
  estaCerrada,
  llevaBase,
  nombreDeArcada,
  nombreDeEstado,
  nombreDeZona,
  textoDeUnidades,
  type PasoDelSeguimiento,
} from "@/lib/protesis"
import { cn } from "@/lib/utils"
import { agregarProtesisAlPlan, cambiarProtesis } from "../_datos"
import { fechaCorta, fechaYHora, pesos } from "../_formato"
import { RepartoDeProtesis } from "./reparto-de-protesis"

/** Qué dice el botón que avanza a cada paso. "Enviar al laboratorio" sólo registra el paso. */
const TEXTO_PARA_AVANZAR: Record<PasoDelSeguimiento, string> = {
  impresion: "Volver a Impresión",
  "en-laboratorio": "Enviar al laboratorio",
  prueba: "Pasar a Prueba en boca",
  ajustes: "Pasar a Ajustes",
  entregada: "Marcar como entregada",
}

/** El tono del estado: en curso, el naranja de lo que se está atendiendo; entregada, el lima de lo cobrado; anulada, gris. */
function tonoDelEstado(estado: string): ColorDeModulo | "gris" {
  if (estado === "entregada") return "lima"
  if (estado === "anulada") return "gris"
  return "naranja"
}

interface PropsDeTarjetaDeProtesis {
  pacienteId: string
  protesis: ProtesisRespuesta
  puedeEditar: boolean
  /** Los laboratorios activos, para elegir al enviarla. `null` mientras cargan. */
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
 * Una prótesis del historial: el diseño, el material, el laboratorio, la
 * entrega estimada, el valor con lo pagado y el saldo, el reparto que le toca
 * ver a quien mira y el seguimiento con la fecha y el autor de cada paso.
 *
 * El seguimiento sólo avanza, de a un paso. "Enviar al laboratorio" registra
 * el paso (y el laboratorio, si se elige ahí): no se envía nada. "Entregada"
 * no se deshace: se pregunta antes. "Anular", antes de entregar.
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
  const [modal, setModal] = useState<"enviar" | "entregar" | "anular" | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [aviso, setAviso] = useState("")
  const [listo, setListo] = useState("")
  const [laboratorioElegido, setLaboratorioElegido] = useState(protesis.laboratorio?.id ?? "")
  /** El resultado de lo último que se hizo: adonde va el foco si el botón que se usó desaparece. */
  const resultado = useRef<HTMLDivElement>(null)
  const id = useId()

  const cerrada = estaCerrada(protesis.estado)
  const siguiente = protesis.siguienteEstado
  const posicionActual = PASOS_DEL_SEGUIMIENTO.findIndex((paso) => paso.id === protesis.estado)
  // Anulada: el último paso al que llegó es el del último evento que no es la anulación.
  const ultimoPaso = protesis.eventos.filter((evento) => evento.estado !== "anulada").at(-1)?.estado
  const alcanzado = posicionActual >= 0 ? posicionActual : PASOS_DEL_SEGUIMIENTO.findIndex((paso) => paso.id === ultimoPaso)

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
    setListo(mensaje)
  }

  const avanzar = () => {
    if (!siguiente) return
    if (siguiente === "en-laboratorio") {
      setLaboratorioElegido(protesis.laboratorio?.id ?? "")
      setAvisoDelModal("")
      return setModal("enviar")
    }
    if (siguiente === "entregada") {
      setAvisoDelModal("")
      return setModal("entregar")
    }
    void cambiar({ estado: siguiente }, `Seguimiento: quedó en ${nombreDeEstado(siguiente)}.`, false)
  }

  const enviar = () => {
    if (!laboratorioElegido) return setAvisoDelModal("Elige el laboratorio antes de enviarla.")
    const cambiaElLaboratorio = laboratorioElegido !== protesis.laboratorio?.id
    void cambiar(
      { estado: "en-laboratorio", ...(cambiaElLaboratorio && { laboratorioId: laboratorioElegido }) },
      "Seguimiento: quedó en En laboratorio.",
      true
    )
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

  // Las opciones del laboratorio al enviarla: los activos y, si el de la prótesis ya no lo está, también ése.
  const opcionesDeLaboratorio = [
    ...(protesis.laboratorio && !laboratorios?.some((lab) => lab.id === protesis.laboratorio?.id) ? [protesis.laboratorio] : []),
    ...(laboratorios ?? []),
  ]

  const detalles: { clave: string; valor: string }[] = [
    { clave: "Arcada", valor: nombreDeArcada(protesis.arcada) },
    {
      clave: "Piezas protésicas",
      valor: protesis.tipo === "total" ? `Todas (${protesis.piezas.length})` : protesis.piezas.join(", ") || "—",
    },
    ...(protesis.pilares.length > 0 ? [{ clave: "Pilares o ganchos", valor: protesis.pilares.join(", ") }] : []),
    ...(llevaBase(protesis.tipo)
      ? [{ clave: "Zonas de la base", valor: protesis.zonas.map(nombreDeZona).join(", ") || "—" }]
      : []),
    {
      clave: "Material",
      valor: `${protesis.material.nombre} · ${textoDeUnidades(protesis.material.unidad, protesis.unidades)} × ${pesos(protesis.material.precioUnitarioCents)}`,
    },
    { clave: "Tratante", valor: protesis.tratante.nombre },
    { clave: "Laboratorio", valor: protesis.laboratorio?.nombre ?? "Sin laboratorio todavía" },
    { clave: "Entrega estimada", valor: protesis.entregaEstimada ? fechaDelDia(protesis.entregaEstimada) : "Sin fecha" },
  ]

  return (
    <article aria-labelledby={`${id}-titulo`} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-[1_1_260px]">
          <h3 id={`${id}-titulo`} className={cn(TITULO_DE_TARJETA, "break-words")}>
            {protesis.nombreParaElPlan}
          </h3>
          <p className="mt-1 text-[13px] text-texto-2">
            Creada el {fechaCorta(protesis.createdAt, zona)} por {protesis.creadoPorNombre}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Insignia tono={tonoDelEstado(protesis.estado)}>{nombreDeEstado(protesis.estado)}</Insignia>
          {protesis.enElPlan && <Insignia tono="lila">En el plan</Insignia>}
        </div>
      </div>

      {protesis.estado === "anulada" && (
        <Aviso tono="info" className="mt-4">
          Anulada{protesis.anuladaEn ? ` el ${fechaYHora(protesis.anuladaEn, zona)}` : ""}
          {protesis.anuladaPorNombre ? ` por ${protesis.anuladaPorNombre}` : ""}. No cambia más.
        </Aviso>
      )}

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-4">
        <dl className="min-w-0 flex-[1_1_280px]">
          {detalles.map((fila) => (
            <div key={fila.clave} className="flex justify-between gap-3 border-t border-borde py-2 text-sm first:border-t-0 first:pt-0">
              <dt className="shrink-0 text-texto-2">{fila.clave}</dt>
              <dd className="min-w-0 text-right font-medium break-words">{fila.valor}</dd>
            </div>
          ))}
        </dl>

        <div className="min-w-0 flex-[1_1_280px]">
          <dl className="grid grid-cols-3 gap-2">
            {[
              { clave: "Valor", cents: protesis.valorCents },
              { clave: "Pagado", cents: protesis.pagadoCents },
              { clave: "Saldo", cents: protesis.saldoCents },
            ].map((fila) => (
              <div key={fila.clave} className="min-w-0 rounded-[16px] bg-superficie px-3 py-2.5 squircle">
                <dt className="text-[13px] text-texto-2">{fila.clave}</dt>
                <dd className="mt-0.5 font-semibold break-words tabular-nums">{pesos(fila.cents)}</dd>
              </div>
            ))}
          </dl>
          {protesis.reparto && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">{protesis.reparto.visible === "suyo" ? "Tu parte" : "Reparto"}</h4>
              <RepartoDeProtesis
                reparto={protesis.reparto}
                tratante={protesis.tratante.nombre}
                laboratorio={protesis.laboratorio?.nombre ?? null}
                tratanteEsLaDuena={protesis.tratante.esLaDuena}
                className="mt-2"
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-5">
        <h4 id={`${id}-seguimiento`} className="text-sm font-semibold">
          Seguimiento con el laboratorio
        </h4>
        <ol aria-labelledby={`${id}-seguimiento`} className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2">
          {PASOS_DEL_SEGUIMIENTO.map((paso, indice) => {
            const evento = protesis.eventos.find((otro) => otro.estado === paso.id)
            // Entregada: el último paso también está hecho, no "en curso".
            const entregada = protesis.estado === "entregada"
            const esElActual = paso.id === protesis.estado && !entregada
            const hecho = indice <= alcanzado
            return (
              <li
                key={paso.id}
                aria-current={esElActual ? "step" : undefined}
                className={cn(
                  "rounded-[20px] border-[1.5px] p-3 squircle",
                  esElActual
                    ? "border-navy bg-lila-suave"
                    : entregada && paso.id === "entregada"
                      ? "border-transparent bg-lima-suave"
                      : hecho
                        ? "border-transparent bg-superficie"
                        : "border-borde bg-tarjeta"
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-texto-2 uppercase">
                  {hecho && !esElActual && <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
                  {esElActual ? <span className="text-navy">Ahora</span> : hecho ? "Hecho" : `Paso ${indice + 1}`}
                </span>
                <span className={cn("mt-1 block", esElActual ? "font-semibold" : "font-medium")}>{paso.nombre}</span>
                {evento ? (
                  <span className="mt-1 block text-[12px] leading-snug text-texto-2">
                    {fechaYHora(evento.createdAt, zona)} · {evento.autorNombre}
                  </span>
                ) : (
                  hecho && <span className="mt-1 block text-[12px] text-texto-2">Se saltó</span>
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
            <div>
              <Boton type="button" tamano="sm" cargando={trabajando && !modal} onClick={avanzar}>
                {TEXTO_PARA_AVANZAR[siguiente]}
              </Boton>
            </div>
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
      {puedeEditar && !cerrada && siguiente === "en-laboratorio" && (
        <p className="mt-2 text-[13px] text-texto-2">«Enviar al laboratorio» sólo registra el paso y la fecha: no se envía nada.</p>
      )}
      {puedeEditar && protesis.estado !== "anulada" && !protesis.enElPlan && !hayPlanVigente && (
        <p id={`${id}-sin-plan`} className="mt-2 text-[13px] text-texto-2">
          Para agregarla al plan, primero arma un plan en «Plan y presupuesto».
        </p>
      )}

      <AnimatePresence onExitComplete={enfocarResultadoSiSePerdio}>
        {modal === "enviar" && (
          <ModalConfirmar
            titulo="Enviar al laboratorio"
            descripcion="Registra que la prótesis pasó al laboratorio, con la fecha de hoy y tu nombre. No se envía nada: Eli no le avisa al laboratorio."
            textoConfirmar="Registrar el envío"
            textoCancelar="Cancelar"
            trabajando={trabajando}
            aviso={avisoDelModal}
            onConfirmar={enviar}
            onCerrar={() => setModal(null)}
          >
            <div>
              <label htmlFor={`${id}-laboratorio`} className={ETIQUETA}>
                Laboratorio
              </label>
              <select
                id={`${id}-laboratorio`}
                value={laboratorioElegido}
                onChange={(evento) => setLaboratorioElegido(evento.target.value)}
                disabled={laboratorios === null}
                className={cn(CAMPO, "cursor-pointer text-base")}
              >
                <option value="">{laboratorios === null ? "Cargando laboratorios..." : "Elige el laboratorio"}</option>
                {opcionesDeLaboratorio.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.nombre}
                  </option>
                ))}
              </select>
            </div>
          </ModalConfirmar>
        )}
        {modal === "entregar" && (
          <ModalConfirmar
            titulo="Marcar como entregada"
            descripcion="La entrega queda con la fecha de hoy y tu nombre, y no se deshace: una prótesis entregada no cambia más ni se anula."
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

/** "12 dic 2026", desde un día "AAAA-MM-DD" (sin hora: no depende de la zona). */
function fechaDelDia(dia: string): string {
  return fechaCorta(`${dia}T12:00:00Z`, "UTC")
}
