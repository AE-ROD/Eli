"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle, RotateCcw, SendHorizontal } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { enviarAlSimulador, reiniciarSimulador, type RespuestaDelSimulador } from "../_datos"

/** El número de la clienta de prueba, si la dueña no pone otro. */
const TELEFONO_DE_PRUEBA = "+56 9 1111 1111"
/** El mismo tope que el servidor (`LARGO_MAXIMO_DEL_MENSAJE`). */
const LARGO_MAXIMO = 1000

interface Burbuja {
  id: number
  de: "clienta" | "eli"
  texto: string
}

type Nota = { tono: "atencion" | "info"; texto: string } | null

/** Qué decirle a la dueña cuando Eli no responde o deriva. */
function notaDeLaRespuesta(respuesta: RespuestaDelSimulador): Nota {
  if (respuesta.derivada) {
    return {
      tono: "atencion",
      texto:
        "Eli le pasó esta conversación a una persona. Desde ahora no responde más aquí: toca «Empezar de nuevo» para seguir probando.",
    }
  }
  if (respuesta.sinRespuesta === "humana") {
    return {
      tono: "atencion",
      texto: "Esta conversación ya está con una persona, así que Eli no responde. Toca «Empezar de nuevo» para probar otra vez.",
    }
  }
  if (respuesta.sinRespuesta === "apagada") {
    return { tono: "info", texto: "Eli está apagada y no respondió." }
  }
  if (respuesta.sinRespuesta === "error") {
    return { tono: "atencion", texto: "Eli tuvo un problema para responder. Intenta de nuevo en un momento." }
  }
  return null
}

/**
 * El simulador: la dueña escribe como si fuera una clienta y ve lo que Eli le
 * contestaría por WhatsApp. Usa la agenda real, así que lo que reserve queda
 * agendado de verdad.
 */
export function Simulador({ activa }: { activa: boolean }) {
  const router = useRouter()
  const idDelTitulo = useId()
  const idDelTelefono = useId()
  const idDelMensaje = useId()
  const [telefono, setTelefono] = useState(TELEFONO_DE_PRUEBA)
  const [mensaje, setMensaje] = useState("")
  const [burbujas, setBurbujas] = useState<Burbuja[]>([])
  const [escribiendo, setEscribiendo] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)
  const [error, setError] = useState("")
  const [nota, setNota] = useState<Nota>(null)
  const siguienteId = useRef(0)
  /** Un ref y no sólo el estado: un doble Enter llega antes de que se dibuje el botón ocupado. */
  const ocupado = useRef(false)
  const refLista = useRef<HTMLOListElement>(null)

  // La conversación baja sola al último mensaje.
  useEffect(() => {
    const lista = refLista.current
    if (lista) lista.scrollTop = lista.scrollHeight
  }, [burbujas, escribiendo])

  const agregar = (de: Burbuja["de"], texto: string) => {
    siguienteId.current += 1
    const burbuja = { id: siguienteId.current, de, texto }
    setBurbujas((anteriores) => [...anteriores, burbuja])
  }

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    const texto = mensaje.trim()
    if (!texto || ocupado.current) return
    ocupado.current = true
    setError("")
    setNota(null)
    agregar("clienta", texto)
    setMensaje("")
    setEscribiendo(true)
    const resultado = await enviarAlSimulador(telefono.trim(), texto)
    setEscribiendo(false)
    ocupado.current = false
    if (!resultado.ok) return setError(resultado.error)
    for (const respuesta of resultado.datos.respuestas) agregar("eli", respuesta)
    setNota(notaDeLaRespuesta(resultado.datos))
    // Si reservó o derivó, lo demás de la página (consumo, derivadas) cambió.
    router.refresh()
  }

  const empezarDeNuevo = async () => {
    if (ocupado.current) return
    ocupado.current = true
    setError("")
    setReiniciando(true)
    const resultado = await reiniciarSimulador(telefono.trim())
    setReiniciando(false)
    ocupado.current = false
    if (!resultado.ok) return setError(resultado.error)
    setBurbujas([])
    setNota(null)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "flex flex-col p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Pruébala"
        subtitulo="Escríbele como si fueras una clienta y mira lo que respondería por WhatsApp."
        icono={{ figura: MessageCircle }}
        accion={
          <BotonPrimario
            type="button"
            variante="secundario"
            tamaño="sm"
            icono={<RotateCcw className="h-4 w-4" />}
            cargando={reiniciando}
            onClick={empezarDeNuevo}
          >
            Empezar de nuevo
          </BotonPrimario>
        }
      />

      <Aviso tono="atencion" className="mt-5">
        Las reservas que haga en el simulador quedan en tu agenda de verdad.
      </Aviso>
      {!activa && (
        <p className="mt-3 text-sm text-texto-2">
          Eli está apagada para tus clientas, pero aquí puedes probarla igual.
        </p>
      )}

      <div className="mt-4">
        <label htmlFor={idDelTelefono} className={ETIQUETA}>
          Teléfono de la clienta de prueba
        </label>
        <input
          id={idDelTelefono}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={telefono}
          onChange={(evento) => setTelefono(evento.target.value)}
          className={cn(CAMPO, "sm:max-w-xs")}
        />
        <p className="mt-1.5 text-xs text-texto-2">Con otro número, Eli empieza una conversación nueva.</p>
      </div>

      {/* El chat: la clienta a la derecha, Eli a la izquierda, como en WhatsApp. */}
      <ol
        ref={refLista}
        aria-label="Conversación de prueba"
        aria-live="polite"
        className="mt-4 flex h-80 flex-col gap-2 overflow-y-auto rounded-[24px] bg-superficie p-3 squircle sm:h-96 sm:p-4"
      >
        {burbujas.length === 0 && !escribiendo && (
          <li className="m-auto max-w-xs text-center text-sm text-pretty text-texto-2">
            Prueba con algo como «Hola, ¿tienen hora para mañana?»
          </li>
        )}
        {burbujas.map((burbuja) => (
          <li
            key={burbuja.id}
            className={cn(
              "max-w-[85%] rounded-[18px] px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap",
              burbuja.de === "clienta"
                ? "self-end rounded-br-[6px] bg-navy text-white"
                : "self-start rounded-bl-[6px] bg-tarjeta text-navy shadow-sm"
            )}
          >
            <span className="sr-only">{burbuja.de === "clienta" ? "Clienta: " : "Eli: "}</span>
            {burbuja.texto}
          </li>
        ))}
        {escribiendo && (
          <li className="self-start rounded-[18px] rounded-bl-[6px] bg-tarjeta px-3.5 py-2 text-sm text-texto-2 italic shadow-sm">
            Eli está escribiendo…
          </li>
        )}
      </ol>

      {nota && (
        <Aviso tono={nota.tono} rol="status" className="mt-3">
          {nota.texto}
        </Aviso>
      )}
      {error && <Aviso className="mt-3">{error}</Aviso>}

      <form onSubmit={enviar} className="mt-3 flex items-end gap-2">
        <label htmlFor={idDelMensaje} className="sr-only">
          Mensaje
        </label>
        <textarea
          id={idDelMensaje}
          rows={1}
          maxLength={LARGO_MAXIMO}
          value={mensaje}
          placeholder="Escribe un mensaje"
          onChange={(evento) => setMensaje(evento.target.value)}
          onKeyDown={(evento) => {
            // Enter envía, como en WhatsApp web; Shift+Enter baja de línea.
            if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
              evento.preventDefault()
              evento.currentTarget.form?.requestSubmit()
            }
          }}
          className={cn(CAMPO, "max-h-32 min-w-0 flex-1 resize-none")}
        />
        <BotonPrimario
          type="submit"
          tamaño="sm"
          cargando={escribiendo}
          aria-label="Enviar"
          className="min-h-11 shrink-0"
          icono={<SendHorizontal className="h-4 w-4" />}
        >
          <span className="hidden sm:inline">Enviar</span>
        </BotonPrimario>
      </form>
    </section>
  )
}
