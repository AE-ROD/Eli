"use client"

import { useEffect, useState } from "react"
import { Calendar, Clock } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Selector } from "@/components/comunes/selector"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { Aviso } from "@/components/panel/aviso"
import type { Advertencia } from "@/lib/mover-cita"
import {
  asignarProfesional,
  leerProfesionales,
  moverCita,
  nombreDeCliente,
  type Cita,
  type DatosDeMoverCita,
  type Profesional,
} from "../_datos"
import { fechaEn, horaEn } from "../_hora-del-negocio"
import { useZonaDelNegocio } from "./zona-del-negocio"

interface PropsDeModalMoverCita {
  cita: Cita
  /** Sólo dueño y encargado reasignan; el profesional no ve el selector. */
  puedeAsignarProfesional: boolean
  /**
   * Sólo elegir el profesional de una cita sin asignar (#103): no se ofrecen
   * la fecha ni las horas, y se manda sólo el profesional
   * (`asignarProfesional`). Un choque se avisa igual que al mover.
   */
  soloAsignar?: boolean
  onMovida: () => void
  onCerrar: () => void
}

/**
 * Cambiar la fecha, las horas y (dueño y encargado) el profesional de una
 * cita. Si el servidor advierte un choque o que queda fuera del horario, se
 * muestra la advertencia y se pregunta: guardar igual es un segundo envío
 * confirmado. Cambiar cualquier campo descarta la advertencia, que era de lo
 * de antes.
 */
export function ModalMoverCita({
  cita,
  puedeAsignarProfesional,
  soloAsignar = false,
  onMovida,
  onCerrar,
}: PropsDeModalMoverCita) {
  // Fecha y horas en la zona del negocio, como se muestran y se guardan (#99).
  const zona = useZonaDelNegocio()
  const [form, setForm] = useState<DatosDeMoverCita>(() => ({
    fecha: fechaEn(cita.startTime, zona),
    horaInicio: horaEn(cita.startTime, zona),
    horaFin: horaEn(cita.endTime, zona),
    memberId: cita.memberId ?? "",
  }))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [advertencias, setAdvertencias] = useState<Advertencia[]>([])
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [avisoDeEquipo, setAvisoDeEquipo] = useState("")

  useEffect(() => {
    if (!puedeAsignarProfesional) return
    leerProfesionales().then((resultado) => {
      if (resultado.ok) setProfesionales(resultado.datos)
      else setAvisoDeEquipo(resultado.error)
    })
  }, [puedeAsignarProfesional])

  const cambiar = (campo: keyof DatosDeMoverCita, valor: string) => {
    setForm((previo) => ({ ...previo, [campo]: valor }))
    setAdvertencias([])
    setError("")
  }

  const guardar = async (confirmar: boolean) => {
    setError("")
    setGuardando(true)
    const resultado = soloAsignar
      ? await asignarProfesional(cita.id, form.memberId, { confirmar })
      : await moverCita(cita.id, form, zona, {
          confirmar,
          // Si el equipo no cargó, no se manda el profesional: se deja el que tenía.
          asignaProfesional: puedeAsignarProfesional && profesionales.length > 0,
        })
    setGuardando(false)

    if (resultado.tipo === "guardada") return onMovida()
    if (resultado.tipo === "advertencias") return setAdvertencias(resultado.advertencias)
    setAdvertencias([])
    setError(resultado.error)
  }

  const hayAdvertencias = advertencias.length > 0
  // Asignando, sin el equipo cargado o sin elegir a nadie no hay nada que guardar.
  const faltaElegir = soloAsignar && (profesionales.length === 0 || !form.memberId)

  return (
    <MarcoDeModal
      titulo={soloAsignar ? "Asignar profesional" : "Cambiar fecha y hora"}
      antetitulo={nombreDeCliente(cita)}
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      <form
        onSubmit={(evento) => {
          evento.preventDefault()
          guardar(false)
        }}
        className="space-y-5"
      >
        {!soloAsignar && (
          <>
            <CampoFormulario
              etiqueta="Fecha"
              type="date"
              value={form.fecha}
              onChange={(e) => cambiar("fecha", e.target.value)}
              icono={<Calendar className="size-4" aria-hidden="true" strokeWidth={1.75} />}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <CampoFormulario
                etiqueta="Hora inicio"
                type="time"
                value={form.horaInicio}
                onChange={(e) => cambiar("horaInicio", e.target.value)}
                icono={<Clock className="size-4" aria-hidden="true" strokeWidth={1.75} />}
                required
              />
              <CampoFormulario
                etiqueta="Hora fin"
                type="time"
                value={form.horaFin}
                onChange={(e) => cambiar("horaFin", e.target.value)}
                icono={<Clock className="size-4" aria-hidden="true" strokeWidth={1.75} />}
                required
              />
            </div>
          </>
        )}

        {puedeAsignarProfesional && avisoDeEquipo && <Aviso>{avisoDeEquipo}</Aviso>}

        {puedeAsignarProfesional && profesionales.length > 0 && (
          <Selector
            etiqueta="Profesional"
            value={form.memberId}
            onChange={(e) => cambiar("memberId", e.target.value)}
            opciones={profesionales.map((profesional) => ({ valor: profesional.id, texto: profesional.nombre }))}
          >
            <option value="">Sin asignar</option>
          </Selector>
        )}

        {error && <Aviso>{error}</Aviso>}

        {hayAdvertencias && (
          <Aviso tono="atencion" rol="alert" titulo="¿Guardar igual?">
            {advertencias.map((advertencia) => (
              <span key={advertencia.tipo} className="block">
                {advertencia.mensaje}
              </span>
            ))}
          </Aviso>
        )}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Boton>
          {hayAdvertencias ? (
            <Boton type="button" className="w-full" cargando={guardando} onClick={() => guardar(true)}>
              Guardar igual
            </Boton>
          ) : (
            <Boton type="submit" className="w-full" cargando={guardando} disabled={faltaElegir}>
              {soloAsignar ? "Asignar" : "Guardar cambios"}
            </Boton>
          )}
        </div>
      </form>
    </MarcoDeModal>
  )
}
