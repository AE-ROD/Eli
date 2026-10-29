"use client"

import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Clock, ListOrdered, UsersRound } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { EncabezadoDeReserva } from "@/app/reservar/[slug]/_componentes/encabezado-de-reserva"
import { LARGO_MAXIMO_NOMBRE_EN_FILA } from "@/lib/fila-virtual"
import { pedir, conJson } from "@/lib/peticiones"

interface PropsDeAnotarse {
  slug: string
  nombreNegocio: string
  abierto: boolean
  esperando: number
  llena: boolean
}

/** "Hay 3 personas esperando". */
function textoDeEspera(esperando: number): string {
  if (esperando === 0) return "No hay nadie esperando: eres el primero."
  return esperando === 1 ? "Hay 1 persona esperando." : `Hay ${esperando} personas esperando.`
}

/**
 * Anotarse en la fila: nombre (obligatorio) y correo (opcional, sólo para el
 * aviso "ya casi es tu turno"). Al anotarse va a la página de su turno, que
 * es la que conviene dejar abierta en el teléfono.
 */
export function AnotarseEnLaFila({ slug, nombreNegocio, abierto, esperando, llena }: PropsDeAnotarse) {
  const router = useRouter()
  const idDelError = useId()
  const [nombre, setNombre] = useState("")
  const [email, setEmail] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")

  const anotarse = async (evento: FormEvent) => {
    evento.preventDefault()
    setError("")
    if (nombre.trim().length < 2) return setError("Escribe tu nombre para que te llamen.")
    setEnviando(true)
    const resultado = await pedir<{ numero: number; enlace: string }>(
      `/api/reservar/${encodeURIComponent(slug)}/fila`,
      "No se pudo anotar en la fila, intenta de nuevo",
      conJson("POST", { nombre: nombre.trim(), email: email.trim() })
    )
    if (!resultado.ok) {
      setEnviando(false)
      return setError(resultado.error)
    }
    router.replace(resultado.datos.enlace)
  }

  return (
    <>
      <EncabezadoDeReserva
        antetitulo="Fila virtual"
        titulo={nombreNegocio}
        bajada="Anótate desde tu celular y espera tranquilo: te mostramos cuántas personas tienes adelante."
      />

      <Tarjeta className="mx-auto mt-8 max-w-xl px-6 py-8 sm:p-10 md:mt-12">
        {!abierto ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <CuadroDeIcono icono={Clock} color="azul" tamano="lg" />
            <p className="cuerpo-xl text-pretty text-texto-2">
              El local no está atendiendo en este momento. La fila se abre en su horario de atención.
            </p>
          </div>
        ) : llena ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <CuadroDeIcono icono={UsersRound} color="azul" tamano="lg" />
            <p className="cuerpo-xl text-pretty text-texto-2">La fila está llena por ahora. Intenta de nuevo en un rato.</p>
          </div>
        ) : (
          <form onSubmit={anotarse} className="flex flex-col gap-5" noValidate>
            <p className="flex items-center gap-2 text-sm font-medium text-navy">
              <ListOrdered aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
              {textoDeEspera(esperando)}
            </p>
            <CampoFormulario
              etiqueta="Tu nombre"
              name="nombre"
              autoComplete="name"
              required
              maxLength={LARGO_MAXIMO_NOMBRE_EN_FILA}
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              placeholder="Como quieres que te llamen"
            />
            <div>
              <CampoFormulario
                etiqueta="Tu correo (opcional)"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                aria-describedby={`${idDelError}-ayuda`}
              />
              <p id={`${idDelError}-ayuda`} className="mt-2 text-sm text-texto-2">
                Si lo dejas, te escribimos cuando ya casi sea tu turno. No lo usamos para nada más.
              </p>
            </div>
            {error && (
              <div role="alert">
                <ErrorDeCampo id={idDelError}>{error}</ErrorDeCampo>
              </div>
            )}
            <Boton type="submit" tamano="lg" cargando={enviando} className="w-full">
              Anotarme en la fila
            </Boton>
          </form>
        )}
      </Tarjeta>
    </>
  )
}
