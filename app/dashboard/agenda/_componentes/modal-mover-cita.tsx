"use client"

import { useEffect, useState } from "react"
import { Calendar, Clock } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Selector } from "@/components/comunes/selector"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { Aviso } from "@/components/panel/aviso"
import { comoTexto } from "@/lib/fechas"
import type { Advertencia } from "@/lib/mover-cita"
import {
  leerProfesionales,
  moverCita,
  nombreDeCliente,
  type Cita,
  type DatosDeMoverCita,
  type Profesional,
} from "../_datos"

/** `09:05`, en la hora local, como lo entrega un `<input type="time">`. */
function horaLocal(iso: string): string {
  const fecha = new Date(iso)
  return `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`
}

interface PropsDeModalMoverCita {
  cita: Cita
  /** Sólo dueño y encargado reasignan; el profesional no ve el selector. */
  puedeAsignarProfesional: boolean
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
export function ModalMoverCita({ cita, puedeAsignarProfesional, onMovida, onCerrar }: PropsDeModalMoverCita) {
  const [form, setForm] = useState<DatosDeMoverCita>(() => ({
    fecha: comoTexto(new Date(cita.startTime)),
    horaInicio: horaLocal(cita.startTime),
    horaFin: horaLocal(cita.endTime),
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
    const resultado = await moverCita(cita.id, form, {
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

  return (
    <MarcoDeModal titulo="Cambiar fecha y hora" antetitulo={nombreDeCliente(cita)} bloqueado={guardando} alCerrar={onCerrar}>
      <form
        onSubmit={(evento) => {
          evento.preventDefault()
          guardar(false)
        }}
        className="space-y-5"
      >
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
            <Boton type="submit" className="w-full" cargando={guardando}>
              Guardar cambios
            </Boton>
          )}
        </div>
      </form>
    </MarcoDeModal>
  )
}
