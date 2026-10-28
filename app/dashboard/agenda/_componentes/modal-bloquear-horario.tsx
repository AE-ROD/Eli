"use client"

import { useEffect, useState } from "react"
import { Calendar, Clock, NotebookPen } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Selector } from "@/components/comunes/selector"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { Aviso } from "@/components/panel/aviso"
import {
  bloqueoEnBlanco,
  crearBloqueo,
  leerProfesionales,
  type DatosDeNuevoBloqueo,
  type Profesional,
} from "../_datos"

interface PropsDeModalBloquearHorario {
  /** El día que se está mirando: el bloqueo arranca ahí. */
  dia: Date
  /**
   * Dueño y encargado eligen a quién bloquear (un profesional o todo el
   * negocio). El profesional no elige: se bloquea su propia agenda.
   */
  eligeAQuien: boolean
  /** El `memberId` de quien bloquea, si es profesional: el único que puede bloquear. */
  memberIdPropio: string | null
  onCreado: () => void
  onCerrar: () => void
}

/**
 * Bloquear un tramo de la agenda (almuerzo, trámite, feriado): de un
 * profesional o, para dueño y encargado, de todo el negocio. En la agenda se
 * ve como una franja gris, y una cita encima pide confirmación. Quién puede
 * qué lo decide el servidor (`puedeGestionarBloqueoDe`); acá sólo se ofrece
 * lo que tiene sentido para cada uno.
 */
export function ModalBloquearHorario({ dia, eligeAQuien, memberIdPropio, onCreado, onCerrar }: PropsDeModalBloquearHorario) {
  const [form, setForm] = useState<DatosDeNuevoBloqueo>(() =>
    bloqueoEnBlanco(dia, eligeAQuien ? "" : (memberIdPropio ?? ""))
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [avisoDeEquipo, setAvisoDeEquipo] = useState("")

  useEffect(() => {
    if (!eligeAQuien) return
    // Si el equipo no carga, igual se puede bloquear todo el negocio.
    leerProfesionales().then((resultado) => {
      if (resultado.ok) setProfesionales(resultado.datos)
      else setAvisoDeEquipo(resultado.error)
    })
  }, [eligeAQuien])

  const cambiar = (campo: keyof DatosDeNuevoBloqueo, valor: string) => {
    setForm((previo) => {
      const siguiente = { ...previo, [campo]: valor }
      // Mover el inicio a un día después del fin arrastra el fin: casi
      // siempre se bloquea dentro de un mismo día.
      if (campo === "fechaDesde" && siguiente.fechaHasta < valor) siguiente.fechaHasta = valor
      return siguiente
    })
    setError("")
  }

  const guardar = async (evento: React.SyntheticEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setError("")
    setGuardando(true)
    const resultado = await crearBloqueo(form)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    onCreado()
  }

  return (
    <MarcoDeModal
      titulo="Bloquear horario"
      descripcion="Ese tramo se ve en gris en la agenda, y una cita encima pide confirmación."
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      <form onSubmit={guardar} className="space-y-5">
        {eligeAQuien && avisoDeEquipo && <Aviso>{avisoDeEquipo}</Aviso>}

        {eligeAQuien ? (
          <Selector
            etiqueta="A quién"
            value={form.memberId}
            onChange={(e) => cambiar("memberId", e.target.value)}
            opciones={profesionales.map((profesional) => ({ valor: profesional.id, texto: profesional.nombre }))}
          >
            <option value="">Todo el negocio</option>
          </Selector>
        ) : (
          <p className="text-sm text-texto-2">Se bloquea tu agenda.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <CampoFormulario
            etiqueta="Desde el día"
            type="date"
            value={form.fechaDesde}
            onChange={(e) => cambiar("fechaDesde", e.target.value)}
            icono={<Calendar className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            required
          />
          <CampoFormulario
            etiqueta="Hora"
            type="time"
            value={form.horaDesde}
            onChange={(e) => cambiar("horaDesde", e.target.value)}
            icono={<Clock className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            required
          />
          <CampoFormulario
            etiqueta="Hasta el día"
            type="date"
            value={form.fechaHasta}
            min={form.fechaDesde}
            onChange={(e) => cambiar("fechaHasta", e.target.value)}
            icono={<Calendar className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            required
          />
          <CampoFormulario
            etiqueta="Hora"
            type="time"
            value={form.horaHasta}
            onChange={(e) => cambiar("horaHasta", e.target.value)}
            icono={<Clock className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            required
          />
        </div>

        <CampoFormulario
          etiqueta="Motivo (opcional)"
          placeholder="Ej.: Almuerzo, trámite, feriado..."
          maxLength={120}
          value={form.motivo}
          onChange={(e) => cambiar("motivo", e.target.value)}
          icono={<NotebookPen className="size-4" aria-hidden="true" strokeWidth={1.75} />}
        />

        {error && <Aviso>{error}</Aviso>}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" className="w-full" cargando={guardando}>
            Bloquear
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}
