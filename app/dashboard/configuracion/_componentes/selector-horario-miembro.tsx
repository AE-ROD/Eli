"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { LoaderCircle } from "lucide-react"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { Aviso } from "@/components/panel/aviso"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { nombreDelRol } from "@/lib/nombres-de-roles"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { SeccionHorario } from "./seccion-horario"
import { leerHorario, type HorarioDelDia } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"

export interface MiembroHorario {
  id: string        // BusinessMember.id
  nombre: string
  email: string
  role: string
}

interface PropsDeSelectorHorarioMiembro {
  /** El horario general del negocio (el del dueño). */
  horariosDelDueño: HorarioDelDia[]
  miembros: MiembroHorario[]
  /** Cómo se llama la pestaña del horario general: el nombre del dueño o el del negocio. */
  nombreDelDueño: string
  /** Lo que va al lado: "(tú)" para el dueño; para el encargado, "Horario general". */
  sufijoDelGeneral?: string
  /** El `memberId` de quien mira, si es del equipo (el encargado): su pestaña dice "(tú)". */
  memberIdPropio?: string | null
}

export function SelectorHorarioMiembro({
  horariosDelDueño,
  miembros,
  nombreDelDueño,
  sufijoDelGeneral = "(tú)",
  memberIdPropio = null,
}: PropsDeSelectorHorarioMiembro) {
  // null = el horario general del negocio (el del dueño); string = memberId
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  // "Odontólogo" en vez de "Profesional" en una clínica dental.
  const rubro = useRubroDelPanel()
  const frases = frasesDeConfiguracion(vocabularioDe(rubro).palabras)
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
  // Cada apertura de una pestaña es una carga nueva: la clave de la sección
  // la incluye, así la sección se rearma con lo que llegó (también al volver
  // a la misma persona) y no se queda con el estado de la carga anterior.
  const [carga, setCarga] = useState(0)
  // La última pestaña pedida. Una respuesta que llega cuando ya se eligió otra
  // es de otra persona: se descarta, o su horario quedaba a la vista con el
  // nombre de ésta y "Guardar" lo escribía encima del suyo.
  const ultimoPedido = useRef(0)
  const pestañaVigente = useRef<string | null>(null)

  const pestañas = [
    { id: null, nombre: nombreDelDueño, sufijo: sufijoDelGeneral },
    ...miembros.map((miembro) => ({
      id: miembro.id,
      nombre: miembro.nombre,
      sufijo: miembro.id === memberIdPropio ? `${nombreDelRol(miembro.role, rubro)} (tú)` : nombreDelRol(miembro.role, rubro),
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
    const numero = ++ultimoPedido.current
    pestañaVigente.current = memberId
    setSeleccionado(memberId)
    setAviso("")
    setPendiente(false)
    setCambioDePersona(true)

    if (memberId === null) {
      // El general ya está acá. Si había una carga de otra persona en vuelo,
      // queda descartada (el número cambió) y el cargando se apaga ahora.
      setCargando(false)
      setHorariosActivos(horariosDelDueñoActuales)
      setCarga(numero)
      return
    }

    setCargando(true)
    const resultado = await leerHorario(memberId)
    if (numero !== ultimoPedido.current) return
    setCargando(false)

    // Si no cargó, no se deja a la vista el horario de la pestaña anterior con
    // el nombre de esta: guardarlo pisaría el horario de este miembro con el
    // de otro.
    if (resultado.ok) {
      setHorariosActivos(resultado.datos)
      setCarga(numero)
    } else setAviso(resultado.error)
  }

  const pestañaActiva = pestañas.find((pestaña) => pestaña.id === seleccionado)

  /**
   * Lo que se acaba de guardar es lo que se muestra si se vuelve a esta
   * pestaña. Dice de quién es: un guardado que termina cuando ya se cambió de
   * persona no toca lo que se ve de la otra.
   */
  const alGuardar = (memberId: string | null, horarios: HorarioDelDia[]) => {
    if (memberId === null) setHorariosDelDueñoActuales(horarios)
    if (memberId === pestañaVigente.current) setHorariosActivos(horarios)
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
          key={`${seleccionado ?? "owner"}-${carga}`}
          initial={cambioDePersona ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: DURACION.hover, ease: CURVA.fundido }}
        >
          <SeccionHorario
            horariosIniciales={horariosActivos}
            memberId={seleccionado}
            // Quien no tiene horario propio atiende en el del negocio: eso es lo que se le muestra.
            horarioDelNegocio={seleccionado === null ? undefined : horariosDelDueñoActuales}
            titulo={
              seleccionado === null
                ? sufijoDelGeneral === "(tú)"
                  ? "Mi horario"
                  : frases.horario.general
                : `Horario de ${pestañaActiva?.nombre}`
            }
            alCambiarPendiente={setPendiente}
            alGuardar={(horarios) => alGuardar(seleccionado, horarios)}
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
