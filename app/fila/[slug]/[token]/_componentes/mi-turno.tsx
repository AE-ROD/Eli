"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { CircleCheck, Hourglass, LogOut, Scissors, SearchX } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { EncabezadoDeReserva } from "@/app/reservar/[slug]/_componentes/encabezado-de-reserva"
import { POLLING_DEL_CELULAR_MS } from "@/lib/fila-virtual"
import { pedir, pedirConCodigo } from "@/lib/peticiones"

type EstadoDelTurno = "esperando" | "atendiendo" | "terminado" | "fuera" | "vencido"

interface Turno {
  negocio: string
  numero: number
  nombre: string
  estado: EstadoDelTurno
  adelante: number
  minutos: number
}

/** "Faltan 3 personas", "Eres el siguiente". */
function textoDeAdelante(adelante: number): string {
  if (adelante === 0) return "Eres el siguiente"
  return adelante === 1 ? "Tienes 1 persona adelante" : `Tienes ${adelante} personas adelante`
}

/** "Unos 40 minutos", "Unas 1 h 15 min": la estimación es gruesa y se dice así. */
function textoDeMinutos(minutos: number): string {
  if (minutos <= 0) return "Ya casi"
  if (minutos < 60) return `Unos ${minutos} minutos`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return `Unas ${horas} h${resto ? ` ${resto} min` : ""}`
}

const TEXTOS: Record<Exclude<EstadoDelTurno, "esperando">, { titulo: string; bajada: string }> = {
  atendiendo: { titulo: "Es tu turno", bajada: "Ya te están atendiendo. ¡Que te vaya bien!" },
  terminado: { titulo: "Listo", bajada: "Tu atención terminó. Gracias por venir." },
  fuera: { titulo: "Ya no estás en la fila", bajada: "Saliste de la fila o el local cerró tu turno. Si quieres, vuelve a anotarte." },
  vencido: { titulo: "Este turno ya pasó", bajada: "Era de otro día. Si quieres, vuelve a anotarte." },
}

/**
 * El turno en el celular: el número en grande, cuántas personas van antes y
 * el tiempo estimado, que se actualizan solos cada ~20 s mientras la página
 * está a la vista. "Salir de la fila" pide confirmar antes.
 */
export function MiTurno({ slug, token }: { slug: string; token: string }) {
  const idDelError = useId()
  const [turno, setTurno] = useState<Turno | null>(null)
  const [noExiste, setNoExiste] = useState(false)
  const [error, setError] = useState("")
  const [confirmando, setConfirmando] = useState(false)
  const [saliendo, setSaliendo] = useState(false)

  const url = `/api/reservar/${encodeURIComponent(slug)}/fila/${encodeURIComponent(token)}`

  const cargar = useCallback(async () => {
    const resultado = await pedirConCodigo<Turno>(url, "No se pudo actualizar tu turno")
    if (resultado.ok) {
      setTurno(resultado.datos)
      setError("")
    } else if (resultado.codigo === 404) {
      setNoExiste(true)
    } else {
      setError(`${resultado.error}. Se vuelve a intentar solo.`)
    }
  }, [url])

  useEffect(() => {
    let vigente = true
    const tick = () => {
      if (vigente && document.visibilityState === "visible") void cargar()
    }
    tick()
    const intervalo = window.setInterval(tick, POLLING_DEL_CELULAR_MS)
    document.addEventListener("visibilitychange", tick)
    return () => {
      vigente = false
      window.clearInterval(intervalo)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [cargar])

  const salir = async () => {
    setSaliendo(true)
    const resultado = await pedir(url, "No se pudo salir de la fila, intenta de nuevo", { method: "POST" })
    setSaliendo(false)
    setConfirmando(false)
    if (!resultado.ok) return setError(resultado.error)
    await cargar()
  }

  if (noExiste) {
    return (
      <>
        <EncabezadoDeReserva antetitulo="Fila virtual" titulo="No encontramos este turno" />
        <Tarjeta className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-5 px-6 py-10 text-center sm:px-10 md:mt-12">
          <CuadroDeIcono icono={SearchX} color="azul" tamano="lg" />
          <p className="cuerpo-xl text-pretty text-texto-2">Revisa que el enlace esté completo, o vuelve a anotarte en la fila.</p>
        </Tarjeta>
      </>
    )
  }

  if (!turno) {
    return (
      <>
        <EncabezadoDeReserva antetitulo="Fila virtual" titulo="Tu turno" bajada={error || "Cargando..."} />
      </>
    )
  }

  const esperando = turno.estado === "esperando"
  const textos = turno.estado === "esperando" ? null : TEXTOS[turno.estado]

  return (
    <>
      <EncabezadoDeReserva
        antetitulo={turno.negocio}
        titulo={textos ? textos.titulo : `Hola, ${turno.nombre}`}
        bajada={textos ? textos.bajada : "Deja esta página abierta: se actualiza sola."}
      />

      <Tarjeta className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-6 px-6 py-8 text-center sm:p-10 md:mt-12">
        <div>
          <p className="text-sm font-medium text-texto-2">Tu número</p>
          <p className="font-serif text-7xl leading-none font-medium tracking-[-2px] text-navy tabular-nums">{turno.numero}</p>
        </div>

        {esperando ? (
          <div aria-live="polite" className="flex w-full flex-col gap-3">
            <p className="flex items-center justify-center gap-2 text-lg font-medium text-navy">
              <Hourglass aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
              {textoDeAdelante(turno.adelante)}
            </p>
            <p className="text-texto-2">
              Tiempo estimado: <strong className="font-semibold text-navy">{textoDeMinutos(turno.minutos)}</strong>
            </p>
            <p className="text-[13px] text-texto-2">Es una estimación: depende de lo que se haga cada persona.</p>
          </div>
        ) : (
          <CuadroDeIcono icono={turno.estado === "atendiendo" ? Scissors : CircleCheck} color="azul" tamano="lg" />
        )}

        {error && (
          <div role="alert" className="w-full">
            <ErrorDeCampo id={idDelError}>{error}</ErrorDeCampo>
          </div>
        )}

        {esperando &&
          (confirmando ? (
            <div className="flex w-full flex-col gap-3">
              <p className="font-medium text-navy">¿Seguro que quieres salir de la fila? Perderás tu número.</p>
              <Boton tamano="lg" cargando={saliendo} onClick={salir} className="w-full">
                Sí, salir de la fila
              </Boton>
              <Boton variante="secundario" tamano="lg" onClick={() => setConfirmando(false)} className="w-full">
                Seguir en la fila
              </Boton>
            </div>
          ) : (
            <Boton variante="secundario" tamano="md" icono={<LogOut />} onClick={() => setConfirmando(true)}>
              Salir de la fila
            </Boton>
          ))}
      </Tarjeta>
    </>
  )
}
