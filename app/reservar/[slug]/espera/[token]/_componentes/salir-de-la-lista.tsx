"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Hourglass } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { EncabezadoDeReserva } from "../../../_componentes/encabezado-de-reserva"
import { salirDeLaListaDeEspera } from "../../../_datos"
import { frasesDeLaEspera } from "../../../_frases"

/**
 * Confirmar la salida de la lista de espera. La respuesta del servidor es la
 * misma con un enlace válido o uno que ya no sirve, así que la pantalla
 * también: "Listo". `rubro` (`Business.type`) pone la palabra de la reserva
 * que se libera ("una hora").
 */
export function SalirDeLaLista({ slug, token, rubro = null }: { slug: string; token: string; rubro?: string | null }) {
  const frases = frasesDeLaEspera(rubro)
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState("")
  const idDelError = useId()
  // Al salir, el botón (y su tarjeta) desaparece y el foco caía al <body>: va
  // al título, que ya dice "Listo" y lo anuncia el lector de pantalla.
  const titulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (listo) titulo.current?.focus()
  }, [listo])

  const confirmar = async (evento: FormEvent) => {
    evento.preventDefault()
    setError("")
    setEnviando(true)
    const resultado = await salirDeLaListaDeEspera(slug, token)
    setEnviando(false)
    if (resultado.ok) setListo(true)
    else setError(resultado.error)
  }

  return (
    <>
      <EncabezadoDeReserva
        ref={titulo}
        antetitulo="Lista de espera"
        titulo={listo ? "Listo" : "¿Salir de la lista de espera?"}
        bajada={listo ? frases.listo : frases.confirmar}
      />
      {!listo && (
        <Tarjeta className="mx-auto mt-8 max-w-xl px-6 py-8 sm:p-10 md:mt-12">
          <form onSubmit={confirmar} className="flex flex-col items-center gap-5 text-center">
            <CuadroDeIcono icono={Hourglass} color="azul" tamano="lg" />
            {error && (
              <div role="alert" className="w-full">
                <ErrorDeCampo id={idDelError}>{error}</ErrorDeCampo>
              </div>
            )}
            <Boton type="submit" tamano="lg" cargando={enviando} className="w-full">
              Salir de la lista
            </Boton>
          </form>
        </Tarjeta>
      )}
    </>
  )
}
