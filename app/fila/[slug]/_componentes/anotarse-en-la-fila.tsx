"use client"

import { useEffect, useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Clock, ListOrdered, Ticket, UsersRound } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { EncabezadoDeReserva } from "@/app/reservar/[slug]/_componentes/encabezado-de-reserva"
import { frasesDeLaFila } from "@/app/reservar/[slug]/_frases"
import {
  LARGO_MAXIMO_NOMBRE_EN_FILA,
  enlaceDelTurno,
  guardarTurno,
  leerTurnoGuardado,
  olvidarTurno,
  tokenDelEnlace,
  turnoSigueVivo,
} from "@/lib/fila-virtual"
import { pedir, pedirConCodigo, conJson } from "@/lib/peticiones"

interface PropsDeAnotarse {
  slug: string
  nombreNegocio: string
  /** El rubro del negocio (`Business.type`): "El salón no está atendiendo". Sin él, "El local". */
  rubro?: string | null
  abierto: boolean
  esperando: number
  llena: boolean
}

/** "Hay 3 personas esperando". */
function textoDeEspera(esperando: number): string {
  if (esperando === 0) return "No hay nadie esperando: eres el primero."
  return esperando === 1 ? "Hay 1 persona esperando." : `Hay ${esperando} personas esperando.`
}

/** Lo que hace falta del turno guardado para mostrarlo: su número y su enlace. */
interface TurnoGuardado {
  numero: number
  enlace: string
}

/**
 * Anotarse en la fila: nombre (obligatorio) y correo (opcional, sólo para el
 * aviso "ya casi es tu turno"). Al anotarse va a la página de su turno, que
 * es la que conviene dejar abierta en el teléfono.
 *
 * El turno se recuerda en este navegador (#155): si quien vuelve a abrir el
 * enlace general ya tiene uno vivo (esperando o en atención), ve su número y
 * el enlace a su turno en vez del formulario, para no ocupar dos lugares.
 * Sólo se muestra el número, nunca el nombre con que se anotó.
 *
 * La acción principal es "Anotar a otra persona", y olvida el turno
 * guardado: si la página quedó abierta en un equipo compartido (la tablet
 * del local), quien llega después no entra al turno de otro, que muestra su
 * nombre y deja sacarlo de la fila. Quien sí es el dueño del turno lo
 * abre con "Ver mi turno", o desde el enlace que le quedó.
 */
export function AnotarseEnLaFila({ slug, nombreNegocio, rubro = null, abierto, esperando, llena }: PropsDeAnotarse) {
  const frases = frasesDeLaFila(rubro)
  const router = useRouter()
  const idDelError = useId()
  const [nombre, setNombre] = useState("")
  const [email, setEmail] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [turnoGuardado, setTurnoGuardado] = useState<TurnoGuardado | null>(null)

  const anotarAOtraPersona = () => {
    olvidarTurno(slug)
    setTurnoGuardado(null)
  }

  // El turno guardado se lee sólo en el navegador y se pregunta al servidor
  // si sigue vivo. Uno que terminó, salió o ya no existe se olvida. Si la
  // consulta falla (sin conexión, límite), se muestra el formulario: el
  // turno queda guardado para la próxima vez.
  useEffect(() => {
    const token = leerTurnoGuardado(slug)
    if (!token) return
    let vigente = true
    void pedirConCodigo<{ numero: number; estado: string }>(
      `/api/reservar/${encodeURIComponent(slug)}/fila/${encodeURIComponent(token)}`,
      "No se pudo revisar tu turno"
    ).then((resultado) => {
      if (!vigente) return
      if (resultado.ok && turnoSigueVivo(resultado.datos.estado)) {
        setTurnoGuardado({ numero: resultado.datos.numero, enlace: enlaceDelTurno(slug, token) })
      } else if (resultado.ok || resultado.codigo === 404) {
        olvidarTurno(slug)
      }
    })
    return () => {
      vigente = false
    }
  }, [slug])

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
    const token = tokenDelEnlace(resultado.datos.enlace)
    if (token) guardarTurno(slug, token)
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
        {turnoGuardado ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <CuadroDeIcono icono={Ticket} color="azul" tamano="lg" />
            <p className="cuerpo-xl text-pretty text-texto-2">
              Desde este teléfono ya se anotó el número <strong className="text-navy">{turnoGuardado.numero}</strong>.
            </p>
            <Boton onClick={anotarAOtraPersona} tamano="lg" className="w-full">
              Anotar a otra persona
            </Boton>
            <Boton href={turnoGuardado.enlace} variante="secundario" className="w-full">
              Ver mi turno
            </Boton>
          </div>
        ) : !abierto ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <CuadroDeIcono icono={Clock} color="azul" tamano="lg" />
            <p className="cuerpo-xl text-pretty text-texto-2">{frases.cerrado}</p>
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
