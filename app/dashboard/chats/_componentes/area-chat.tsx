"use client"

import { useRef, useEffect, useId, useState } from "react"
import { ArrowLeft, Calendar, EllipsisVertical, LoaderCircle, Phone, Send, Smile, Video } from "lucide-react"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { CAMPO } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { BurbujaMensaje, type MensajeEnBurbuja } from "./burbuja-mensaje"
import type { Conversacion, Mensaje } from "../_datos"

const RESPUESTAS_RAPIDAS = [
  "¡Hola! ¿En qué puedo ayudarte?",
  "Tu cita está confirmada",
  "Te envío los detalles por aquí",
  "¿Prefieres llamar para más información?",
]

/** Los botones de sólo ícono de la cabecera: 40 px a la vista, 44 para el dedo. */
const BOTON_DE_ICONO =
  "relative grid size-10 shrink-0 place-items-center rounded-[12px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie after:absolute after:-inset-0.5"

function mensajeParaBurbuja(mensaje: Mensaje): MensajeEnBurbuja {
  return {
    id: mensaje.id,
    texto: mensaje.content,
    hora: new Date(mensaje.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false }),
    esPropio: mensaje.fromBusiness,
    leido: mensaje.fromBusiness,
  }
}

interface PropsDeAreaChat {
  conversacion: Conversacion
  mensajes: Mensaje[]
  cargando: boolean
  onEnviar: (texto: string) => Promise<void>
  /** En el teléfono la conversación ocupa el lugar de la lista: esto vuelve a ella. */
  onVolver?: () => void
  /**
   * El foco va al nombre de la conversación al abrirla. Lo pide la página
   * cuando la lista se oculta (el teléfono): el botón que se tocó ya no se ve
   * y el foco caía al `<body>`.
   */
  enfocarAlAbrir?: boolean
  className?: string
}

export function AreaChat({ conversacion, mensajes, cargando, onEnviar, onVolver, enfocarAlAbrir, className }: PropsDeAreaChat) {
  const idDelTitulo = useId()
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const mensajesRef = useRef<HTMLDivElement>(null)
  const refTitulo = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (mensajesRef.current) {
      mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight
    }
  }, [mensajes])

  useEffect(() => {
    if (enfocarAlAbrir) refTitulo.current?.focus()
  }, [enfocarAlAbrir, conversacion.id])

  const enviar = async () => {
    const textoLimpio = texto.trim()
    if (!textoLimpio || enviando) return
    setTexto("")
    setEnviando(true)
    try {
      await onEnviar(textoLimpio)
    } finally {
      setEnviando(false)
    }
  }

  const burbujas = mensajes.map(mensajeParaBurbuja)

  return (
    <section aria-labelledby={idDelTitulo} className={cn("min-h-0 min-w-0 flex-1 flex-col", className)}>
      {/* Cabecera. Si no entran los botones al lado del nombre, bajan a la derecha. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde px-3 py-2.5 sm:px-5">
        {onVolver && (
          <button type="button" onClick={onVolver} aria-label="Volver a las conversaciones" className={cn(BOTON_DE_ICONO, "md:hidden")}>
            <ArrowLeft className="size-5" aria-hidden="true" strokeWidth={1.75} />
          </button>
        )}
        <span className="hidden sm:block">
          <AvatarUsuario nombre={conversacion.customerName} tamaño="md" />
        </span>
        <div className="min-w-32 flex-1 py-1">
          {/* Recibe el foco por código al abrir la conversación en el teléfono; no es un control, no lleva anillo. */}
          <h2 ref={refTitulo} id={idDelTitulo} tabIndex={-1} className="font-semibold break-words outline-none">
            {conversacion.customerName}
          </h2>
          {conversacion.customerPhone && <p className="text-xs text-texto-2 tabular-nums">{conversacion.customerPhone}</p>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {conversacion.customerPhone && (
            <a href={`tel:${conversacion.customerPhone}`} aria-label={`Llamar a ${conversacion.customerName}`} className={BOTON_DE_ICONO}>
              <Phone className="size-5" aria-hidden="true" strokeWidth={1.75} />
            </a>
          )}
          <button type="button" aria-label="Videollamada" className={BOTON_DE_ICONO}>
            <Video className="size-5" aria-hidden="true" strokeWidth={1.75} />
          </button>
          <button type="button" aria-label="Agendar" className={BOTON_DE_ICONO}>
            <Calendar className="size-5" aria-hidden="true" strokeWidth={1.75} />
          </button>
          <button type="button" aria-label="Más opciones" className={BOTON_DE_ICONO}>
            <EllipsisVertical className="size-5" aria-hidden="true" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Mensajes */}
      <div ref={mensajesRef} aria-busy={cargando || undefined} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
        {cargando ? (
          <div className="flex justify-center py-8">
            <LoaderCircle className="size-6 animate-spin text-navy" aria-hidden="true" />
            <span className="sr-only">Cargando los mensajes...</span>
          </div>
        ) : burbujas.length === 0 ? (
          <p className="py-8 text-center text-sm text-texto-2">Sin mensajes aún. ¡Sé el primero en escribir!</p>
        ) : (
          burbujas.map((burbuja) => <BurbujaMensaje key={burbuja.id} mensaje={burbuja} />)
        )}
      </div>

      {/* Respuestas rápidas: llenan el campo, no envían. Si no entran, se desplazan de costado. */}
      <div role="group" aria-label="Respuestas rápidas" className="flex shrink-0 gap-2 overflow-x-auto border-t border-borde px-3 py-2.5 sm:px-5">
        {RESPUESTAS_RAPIDAS.map((respuestaRapida) => (
          <button
            key={respuestaRapida}
            type="button"
            onClick={() => setTexto(respuestaRapida)}
            className="inline-flex h-9 shrink-0 items-center rounded-full bg-superficie px-3.5 text-[13px] whitespace-nowrap text-navy anillo-foco transition-colors duration-150 ease-suave hover:bg-borde"
          >
            {respuestaRapida}
          </button>
        ))}
      </div>

      {/* Escribir */}
      <div className="shrink-0 border-t border-borde p-3 sm:px-5">
        <div className="flex items-end gap-2">
          <div className="relative min-w-0 flex-1">
            <textarea
              aria-label="Mensaje"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  enviar()
                }
              }}
              placeholder="Escribe un mensaje..."
              rows={1}
              className={cn(CAMPO, "block max-h-32 resize-none pr-12")}
            />
            <button
              type="button"
              aria-label="Emojis"
              className="absolute right-0.5 bottom-0.5 grid size-10 place-items-center rounded-[12px] text-texto-2 squircle anillo-foco transition-colors duration-150 ease-suave hover:text-navy"
            >
              <Smile className="size-5" aria-hidden="true" strokeWidth={1.75} />
            </button>
          </div>
          <button
            type="button"
            onClick={enviar}
            disabled={!texto.trim() || enviando}
            aria-label="Enviar mensaje"
            className="grid size-11 shrink-0 place-items-center rounded-boton bg-navy text-white squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-[#1d3a5c] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-navy"
          >
            <Send className="size-5" aria-hidden="true" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </section>
  )
}
