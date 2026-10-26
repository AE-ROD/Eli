"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { LoaderCircle } from "lucide-react"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { Aviso } from "@/components/panel/aviso"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { nombreDelRol } from "@/lib/nombres-de-roles"
import { cn } from "@/lib/utils"
import { SeccionHorario } from "./seccion-horario"
import { leerHorario, type HorarioDelDia } from "../_datos"

export interface MiembroHorario {
  id: string        // BusinessMember.id
  nombre: string
  email: string
  role: string
}

interface PropsDeSelectorHorarioMiembro {
  horariosDelDueño: HorarioDelDia[]
  miembros: MiembroHorario[]
  nombreDelDueño: string
}

export function SelectorHorarioMiembro({ horariosDelDueño, miembros, nombreDelDueño }: PropsDeSelectorHorarioMiembro) {
  // null = owner; string = memberId del trabajador
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  // El del dueño viene del servidor una sola vez: lo que se guarda después se
  // anota acá, o volver a su pestaña mostraría el de antes (y, si no tenía
  // nada, el aviso de "todavía no está guardado").
  const [horariosDelDueñoActuales, setHorariosDelDueñoActuales] = useState<HorarioDelDia[]>(horariosDelDueño)
  const [horariosActivos, setHorariosActivos] = useState<HorarioDelDia[]>(horariosDelDueño)
  // Si la sección abierta tiene cambios sin guardar (K2), y a qué pestaña se
  // quería ir cuando se preguntó si descartarlos.
  const [pendiente, setPendiente] = useState(false)
  const [destinoPendiente, setDestinoPendiente] = useState<{ id: string | null } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState("")
  // El fundido es para el cambio de persona: lo primero que se pinta (que
  // viene del servidor) no espera a JavaScript para verse.
  const [cambioDePersona, setCambioDePersona] = useState(false)

  const pestañas = [
    { id: null, nombre: nombreDelDueño, sufijo: "(tú)" },
    ...miembros.map((miembro) => ({
      id: miembro.id,
      nombre: miembro.nombre,
      sufijo: nombreDelRol(miembro.role),
    })),
  ]

  const cambiarDePestaña = async (memberId: string | null) => {
    // Tocar la pestaña que ya está abierta sólo vuelve a pedir si la última vez
    // falló: es la forma de reintentar. Si cargó bien (o está cargando), nada.
    if (memberId === seleccionado && !aviso) return
    // Con cambios sin guardar, primero se pregunta: cambiar de persona los descarta.
    if (pendiente) {
      setDestinoPendiente({ id: memberId })
      return
    }
    await abrirPestaña(memberId)
  }

  const abrirPestaña = async (memberId: string | null) => {
    setSeleccionado(memberId)
    setAviso("")
    setPendiente(false)
    setCambioDePersona(true)

    if (memberId === null) {
      setHorariosActivos(horariosDelDueñoActuales)
      return
    }

    setCargando(true)
    const resultado = await leerHorario(memberId)
    setCargando(false)

    // Si no cargó, no se deja a la vista el horario de la pestaña anterior con
    // el nombre de esta: guardarlo pisaría el horario de este miembro con el
    // de otro.
    if (resultado.ok) setHorariosActivos(resultado.datos)
    else setAviso(resultado.error)
  }

  const pestañaActiva = pestañas.find((pestaña) => pestaña.id === seleccionado)

  /** Lo que se acaba de guardar es lo que se muestra si se vuelve a esta pestaña. */
  const alGuardar = (horarios: HorarioDelDia[]) => {
    setHorariosActivos(horarios)
    if (seleccionado === null) setHorariosDelDueñoActuales(horarios)
  }

  const descartarYCambiar = () => {
    if (!destinoPendiente) return
    const destino = destinoPendiente.id
    setDestinoPendiente(null)
    void abrirPestaña(destino)
  }

  return (
    <div className="space-y-4">
      {/* De quién es el horario: botones que dicen cuál está elegido (`aria-pressed`). */}
      <div role="group" aria-label="De quién es el horario" className="flex flex-wrap gap-2">
        {pestañas.map((pestaña) => {
          const activa = pestaña.id === seleccionado
          return (
            <button
              key={pestaña.id ?? "owner"}
              type="button"
              aria-pressed={activa}
              onClick={() => cambiarDePestaña(pestaña.id)}
              className={cn(
                "inline-flex min-h-11 max-w-full items-center gap-2 rounded-full px-4 py-2 text-left text-sm font-medium anillo-foco transition-colors duration-150 ease-suave",
                activa ? "bg-navy text-white" : "bg-tarjeta text-navy shadow-sm hover:bg-superficie"
              )}
            >
              <span className="min-w-0 break-words">{pestaña.nombre}</span>
              <span className={cn("shrink-0 text-xs", activa ? "text-white/75" : "text-texto-2")}>{pestaña.sufijo}</span>
            </button>
          )
        })}
      </div>

      {/* Contenido */}
      {cargando ? (
        <div aria-busy="true" className={cn(TARJETA_DEL_PANEL, "grid h-48 place-items-center")}>
          <LoaderCircle className="size-6 animate-spin text-navy" aria-hidden="true" />
          <span className="sr-only">Cargando el horario...</span>
        </div>
      ) : aviso ? (
        <Aviso>{aviso}</Aviso>
      ) : (
        // La clave rearma la sección con el horario de la persona elegida.
        <motion.div
          key={seleccionado ?? "owner"}
          initial={cambioDePersona ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: DURACION.hover, ease: CURVA.fundido }}
        >
          <SeccionHorario
            horariosIniciales={horariosActivos}
            memberId={seleccionado}
            titulo={seleccionado === null ? "Mi horario" : `Horario de ${pestañaActiva?.nombre}`}
            alCambiarPendiente={setPendiente}
            alGuardar={alGuardar}
          />
        </motion.div>
      )}

      <AnimatePresence>
        {destinoPendiente && (
          <ModalConfirmar
            titulo="¿Descartar los cambios sin guardar?"
            descripcion={`Cambiaste el horario de ${seleccionado === null ? nombreDelDueño : pestañaActiva?.nombre ?? "esta persona"} y no lo guardaste. Si cambias de persona, esos cambios se pierden.`}
            textoConfirmar="Descartar cambios"
            textoCancelar="Seguir editando"
            peligro
            onConfirmar={descartarYCambiar}
            onCerrar={() => setDestinoPendiente(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
