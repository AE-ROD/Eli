"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CalendarCheck, CalendarClock, CalendarX2, Check, X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { deTexto, formatearDuracionDeServicio } from "@/lib/fechas"
import { EncabezadoDeReserva } from "../../../_componentes/encabezado-de-reserva"
import { SelectorFechaHora, fechaParaLeer } from "../../../_componentes/selector-fecha-hora"
import { cancelarCita, leerCita, leerHorasParaReagendar, reagendarCita, type CitaDelEnlace } from "../_datos"

type Vista =
  | { tipo: "cargando" }
  | { tipo: "no-sirve" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "cita"; cita: CitaDelEnlace }
  | { tipo: "cancelada"; cita: CitaDelEnlace }

type Modo = "ver" | "confirmar-cancelacion" | "reagendar"

/** "jueves 15 de octubre", o la fecha tal como llegó si no se puede leer. */
function diaParaLeer(fecha: string): string {
  const dia = deTexto(fecha)
  return dia ? fechaParaLeer(dia) : fecha
}

function plazoParaLeer(horas: number): string {
  if (horas === 0) return "hasta la hora de la cita"
  return `hasta ${horas} ${horas === 1 ? "hora" : "horas"} antes`
}

/**
 * La cita del enlace: qué, dónde, con quién y cuándo, y los botones para
 * cancelarla o cambiarla mientras esté dentro del plazo del negocio. Un
 * enlace que no sirve (inválido, de una cita cancelada o pasada) se dice así,
 * sin más detalle: el servidor no distingue por qué.
 */
export function GestionDeCita({ slug, token }: { slug: string; token: string }) {
  const [vista, setVista] = useState<Vista>({ tipo: "cargando" })
  const [modo, setModo] = useState<Modo>("ver")
  const [fecha, setFecha] = useState("")
  const [hora, setHora] = useState("")
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState("")
  const [aviso, setAviso] = useState("")
  const titulo = useRef<HTMLHeadingElement>(null)

  const cargar = useCallback(async () => {
    const resultado = await leerCita(slug, token)
    if (resultado.ok) setVista({ tipo: "cita", cita: resultado.datos })
    else if (resultado.codigo === 404) setVista({ tipo: "no-sirve" })
    else setVista({ tipo: "error", mensaje: resultado.error })
  }, [slug, token])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga la cita al abrir el enlace
    void cargar()
  }, [cargar])

  const cargarHoras = useCallback((dia: string) => leerHorasParaReagendar(slug, token, dia), [slug, token])

  if (vista.tipo === "cargando") {
    return (
      <div aria-busy="true" className="mx-auto max-w-xl">
        <span className="sr-only">Cargando tu cita...</span>
        <Esqueleto className="mx-auto h-10 w-2/3" />
        <Esqueleto className="mt-8 h-56 w-full rounded-tarjeta" />
      </div>
    )
  }

  if (vista.tipo === "no-sirve" || vista.tipo === "error") {
    return (
      <>
        <EncabezadoDeReserva antetitulo="Tu cita" titulo="Este enlace no sirve" />
        <Tarjeta className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-5 px-6 py-10 text-center sm:px-10 md:mt-12">
          <CuadroDeIcono icono={CalendarX2} color="azul" tamano="lg" />
          <p className="cuerpo-xl text-pretty text-texto-2">
            {vista.tipo === "error"
              ? vista.mensaje
              : "El enlace no es válido, o la cita ya pasó o se canceló. Si necesitas algo, contacta directamente al local."}
          </p>
        </Tarjeta>
      </>
    )
  }

  const { cita } = vista

  if (vista.tipo === "cancelada") {
    return (
      <>
        <EncabezadoDeReserva ref={titulo} antetitulo={cita.negocio.nombre} titulo="Cita cancelada" bajada="Le avisamos al local. El horario quedó libre." />
        <Tarjeta className="mx-auto mt-8 max-w-xl px-6 py-8 sm:p-10 md:mt-12">
          <ResumenDeLaCita cita={cita} />
        </Tarjeta>
      </>
    )
  }

  const cancelar = async () => {
    setTrabajando(true)
    setError("")
    const resultado = await cancelarCita(slug, token)
    setTrabajando(false)
    if (!resultado.ok) return setError(resultado.error)
    setVista({ tipo: "cancelada", cita })
    titulo.current?.focus()
  }

  const reagendar = async () => {
    setTrabajando(true)
    setError("")
    const resultado = await reagendarCita(slug, token, fecha, hora)
    setTrabajando(false)
    if (!resultado.ok) return setError(resultado.error)
    setVista({ tipo: "cita", cita: { ...cita, fecha: resultado.datos.fecha, hora: resultado.datos.hora, profesional: resultado.datos.profesional ?? cita.profesional } })
    setModo("ver")
    setFecha("")
    setHora("")
    setAviso(`Listo: tu cita quedó el ${diaParaLeer(resultado.datos.fecha)} a las ${resultado.datos.hora}. Le avisamos al local.`)
    // El plazo se cuenta desde la cita nueva: se vuelve a leer.
    void cargar()
  }

  const elegirModo = (nuevo: Modo) => {
    setModo(nuevo)
    setError("")
    setAviso("")
  }

  return (
    <>
      <EncabezadoDeReserva ref={titulo} antetitulo={cita.negocio.nombre} titulo="Tu cita" />
      <Tarjeta className="mx-auto mt-8 max-w-2xl px-4 py-6 sm:p-8 md:mt-12 lg:p-10">
        <div className="flex items-center gap-4">
          <CuadroDeIcono icono={CalendarCheck} color="azul" tamano="lg" activo />
          <p className="titulo-3 min-w-0 break-words text-navy">{cita.servicio.nombre}</p>
        </div>
        <ResumenDeLaCita className="mt-6 border-t border-borde pt-3" cita={cita} sinServicio />

        {aviso && (
          <p role="status" className="mt-6 rounded-campo bg-azul-suave px-4 py-3 text-sm text-navy">
            {aviso}
          </p>
        )}

        {!cita.sePuedeCambiar ? (
          <p className="mt-6 rounded-campo bg-superficie px-4 py-3 text-sm text-texto-2">
            Esta cita se puede cancelar o cambiar por acá {plazoParaLeer(cita.plazoHoras)}. Ya no se puede: si necesitas
            cancelarla o cambiarla, contacta directamente a {cita.negocio.nombre}.
          </p>
        ) : modo === "ver" ? (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Boton variante="secundario" icono={<X />} onClick={() => elegirModo("confirmar-cancelacion")} className="w-full sm:w-auto">
              Cancelar cita
            </Boton>
            {cita.sePuedeReagendar && (
              <Boton icono={<CalendarClock />} onClick={() => elegirModo("reagendar")} className="w-full sm:w-auto">
                Cambiar día u hora
              </Boton>
            )}
          </div>
        ) : modo === "confirmar-cancelacion" ? (
          <div className="mt-8 rounded-panel bg-superficie p-5 squircle sm:p-6">
            <p className="font-medium text-navy">¿Seguro que quieres cancelar tu cita?</p>
            <p className="mt-1 text-sm text-texto-2">El horario queda libre para otra persona y no se puede deshacer.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Boton variante="secundario" onClick={() => elegirModo("ver")} disabled={trabajando} className="w-full sm:w-auto">
                No, mantenerla
              </Boton>
              <Boton icono={<X />} cargando={trabajando} onClick={cancelar} className="w-full sm:w-auto">
                Sí, cancelar
              </Boton>
            </div>
          </div>
        ) : (
          <div className="mt-8">
            <h2 className="titulo-3 text-navy">Elige otro día y hora</h2>
            <p className="mt-1 text-sm text-texto-2">
              Mismo servicio{cita.profesional ? `, con ${cita.profesional}` : ""}.
            </p>
            {cita.diasConAtencion.length === 0 && (
              <p className="mt-3 rounded-campo bg-superficie px-4 py-3 text-sm text-texto-2">
                No hay días con atención para cambiarla por acá. Contacta directamente a {cita.negocio.nombre}.
              </p>
            )}
            <div className="mt-6">
              <SelectorFechaHora
                cargarHoras={cargarHoras}
                claveDeHoras={token}
                diasDisponibles={cita.diasConAtencion}
                zona={cita.zona}
                fechaSeleccionada={fecha}
                horaSeleccionada={hora}
                onFecha={setFecha}
                onHora={setHora}
              />
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Boton variante="secundario" onClick={() => elegirModo("ver")} disabled={trabajando} className="w-full sm:w-auto">
                Volver
              </Boton>
              <Boton icono={<Check />} disabled={!fecha || !hora} cargando={trabajando} onClick={reagendar} className="w-full sm:w-auto">
                Cambiar a esta hora
              </Boton>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-6">
            <ErrorDeCampo id="error-de-gestion">{error}</ErrorDeCampo>
          </div>
        )}
      </Tarjeta>
    </>
  )
}

function ResumenDeLaCita({ cita, sinServicio = false, className }: { cita: CitaDelEnlace; sinServicio?: boolean; className?: string }) {
  const filas: [string, string][] = []
  if (!sinServicio) filas.push(["Servicio", cita.servicio.nombre])
  if (cita.servicio.duracion) filas.push(["Duración", formatearDuracionDeServicio(cita.servicio.duracion)])
  if (cita.profesional) filas.push(["Con", cita.profesional])
  filas.push(["Día", diaParaLeer(cita.fecha)], ["Hora", cita.hora], ["Dónde", cita.negocio.nombre])
  return (
    <dl className={["divide-y divide-borde text-sm", className].filter(Boolean).join(" ")}>
      {filas.map(([termino, valor]) => (
        <div key={termino} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <dt className="shrink-0 text-texto-2">{termino}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-navy tabular-nums">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}
