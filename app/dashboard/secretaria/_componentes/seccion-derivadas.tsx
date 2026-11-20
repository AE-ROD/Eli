"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, UserRound } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { mostrarTelefono } from "@/lib/telefono"
import { cn } from "@/lib/utils"
import { devolverAEli } from "../_datos"
import { fechaCorta } from "../_formato"
import type { ConversacionDerivada } from "../_lecturas"

/**
 * Las conversaciones reales que Eli le pasó a una persona. Mientras están
 * aquí Eli no les responde; "Devolver a Eli" hace que vuelva a atenderlas
 * desde el próximo mensaje.
 */
export function SeccionDerivadas({ derivadas, zona }: { derivadas: ConversacionDerivada[]; zona: string }) {
  const router = useRouter()
  const [devolviendo, setDevolviendo] = useState<string | null>(null)
  const ocupado = useRef(false)
  const [error, setError] = useState("")

  const devolver = async (id: string) => {
    if (ocupado.current) return
    ocupado.current = true
    setError("")
    setDevolviendo(id)
    const resultado = await devolverAEli(id)
    ocupado.current = false
    setDevolviendo(null)
    if (!resultado.ok) return setError(resultado.error)
    router.refresh()
  }

  return (
    <section aria-labelledby="secretaria-derivadas" className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id="secretaria-derivadas"
        titulo="Con una persona"
        subtitulo="Conversaciones que Eli te pasó. Respóndelas desde tu WhatsApp; Eli no les escribe hasta que se las devuelvas."
        icono={{ figura: UserRound }}
      />

      {error && <Aviso className="mt-4">{error}</Aviso>}

      {derivadas.length === 0 ? (
        <EstadoVacio className="mt-5">No hay conversaciones esperando a una persona.</EstadoVacio>
      ) : (
        <ul className="mt-5 divide-y divide-borde">
          {derivadas.map((conversacion) => (
            <li key={conversacion.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium break-words text-navy">
                  {conversacion.nombre || mostrarTelefono(conversacion.telefono)}
                </p>
                {conversacion.nombre && <p className="text-texto-2">{mostrarTelefono(conversacion.telefono)}</p>}
                {conversacion.motivo && <p className="mt-1 text-pretty text-navy">{conversacion.motivo}</p>}
                <p className="mt-1 text-xs text-texto-2">{fechaCorta(conversacion.derivadaAt, zona)}</p>
              </div>
              <BotonPrimario
                type="button"
                variante="secundario"
                tamaño="sm"
                icono={<Bot className="h-4 w-4" />}
                cargando={devolviendo === conversacion.id}
                onClick={() => devolver(conversacion.id)}
                className="self-start"
              >
                Devolver a Eli
              </BotonPrimario>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
