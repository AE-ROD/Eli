"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CalendarCheck, CalendarClock, CalendarX2, Check, X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { formatearMonto } from "@/lib/dinero"
import { deTexto, formatearDuracionDeServicio } from "@/lib/fechas"
import { rebajaDeLaHora, type PrecioDeLaHora } from "@/lib/hora-valle"
import { EncabezadoDeReserva } from "../../../_componentes/encabezado-de-reserva"
import { SelectorFechaHora, fechaParaLeer } from "../../../_componentes/selector-fecha-hora"
import { frasesDeLaGestion } from "../../../_frases"
import { cancelarCita, leerCita, leerHorasParaReagendar, reagendarCita, type CitaDelEnlace } from "../_datos"

/** Si el servidor no dijo qué días atiende (ya no hay quién la tome), todos: la disponibilidad lo explica. */
const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6]

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

/**
 * La cita del enlace: qué, dónde, con quién y cuándo, y los botones para
 * cancelarla o cambiarla mientras esté dentro del plazo del negocio. Un
 * enlace que no sirve (inválido, de una cita cancelada o pasada) se dice así,
 * sin más detalle: el servidor no distingue por qué.
 *
 * `rubro` (`Business.type`, que la página lee de la base por `slug`) pone las
 * palabras de la reserva: "Tu hora" y "al salón" en un salón, "Tu cita" y "al
 * local" si el rubro es desconocido o la página no lo conoce (`null`).
 */
export function GestionDeCita({ slug, token, rubro = null }: { slug: string; token: string; rubro?: string | null }) {
  const frases = frasesDeLaGestion(rubro)
  const [vista, setVista] = useState<Vista>({ tipo: "cargando" })
  const [modo, setModo] = useState<Modo>("ver")
  const [fecha, setFecha] = useState("")
  const [hora, setHora] = useState("")
  // Hora valle (#89c): si a la hora elegida la cita queda con otro precio.
  const [precioNuevo, setPrecioNuevo] = useState<PrecioDeLaHora | null>(null)
  const elegirHora = (nueva: string, precio: PrecioDeLaHora | null) => {
    setHora(nueva)
    setPrecioNuevo(precio)
  }
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState("")
  const [aviso, setAviso] = useState("")
  // Sube cuando reagendar falla (lo típico: la hora se tomó entretanto). Va
  // en la clave de las horas, así que el selector las vuelve a pedir y suelta
  // la hora elegida, en vez de seguir ofreciendo la que ya no está libre.
  const [recargasDeHoras, setRecargasDeHoras] = useState(0)
  const titulo = useRef<HTMLHeadingElement>(null)

  const cargar = useCallback(async () => {
    const resultado = await leerCita(slug, token, rubro)
    if (resultado.ok) setVista({ tipo: "cita", cita: resultado.datos })
    else if (resultado.codigo === 404) setVista({ tipo: "no-sirve" })
    else setVista({ tipo: "error", mensaje: resultado.error })
  }, [slug, token, rubro])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga la cita al abrir el enlace
    void cargar()
  }, [cargar])

  const cargarHoras = useCallback((dia: string) => leerHorasParaReagendar(slug, token, dia), [slug, token])

  if (vista.tipo === "cargando") {
    return (
      <div aria-busy="true" className="mx-auto max-w-xl">
        <span className="sr-only">{frases.cargando}</span>
        <Esqueleto className="mx-auto h-10 w-2/3" />
        <Esqueleto className="mt-8 h-56 w-full rounded-tarjeta" />
      </div>
    )
  }

  if (vista.tipo === "no-sirve") {
    return (
      <>
        <EncabezadoDeReserva antetitulo={frases.tuCita} titulo="Este enlace no sirve" />
        <Tarjeta className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-5 px-6 py-10 text-center sm:px-10 md:mt-12">
          <CuadroDeIcono icono={CalendarX2} color="azul" tamano="lg" />
          <p className="cuerpo-xl text-pretty text-texto-2">
            {frases.noSirve}
          </p>
        </Tarjeta>
      </>
    )
  }

  // Sin red o con el servidor fallando no se sabe nada del enlace: no se dice
  // que no sirve (antes sí, y la persona lo daba por perdido), se ofrece reintentar.
  if (vista.tipo === "error") {
    return (
      <>
        <EncabezadoDeReserva antetitulo={frases.tuCita} titulo={frases.errores.cargar} />
        <Tarjeta className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-5 px-6 py-10 text-center sm:px-10 md:mt-12">
          <CuadroDeIcono icono={CalendarX2} color="azul" tamano="lg" />
          <p className="cuerpo-xl text-pretty text-texto-2">
            {vista.mensaje}
            <span className="mt-2 block">Tu enlace sigue sirviendo: vuelve a intentarlo.</span>
          </p>
          <Boton
            onClick={() => {
              setVista({ tipo: "cargando" })
              void cargar()
            }}
          >
            Reintentar
          </Boton>
        </Tarjeta>
      </>
    )
  }

  const { cita } = vista

  if (vista.tipo === "cancelada") {
    return (
      <>
        <EncabezadoDeReserva ref={titulo} antetitulo={cita.negocio.nombre} titulo={frases.cancelada.titulo} bajada={frases.cancelada.bajada} />
        <Tarjeta className="mx-auto mt-8 max-w-xl px-6 py-8 sm:p-10 md:mt-12">
          <ResumenDeLaCita cita={cita} terminoDelServicio={frases.terminoDelServicio} />
        </Tarjeta>
      </>
    )
  }

  const cancelar = async () => {
    setTrabajando(true)
    setError("")
    const resultado = await cancelarCita(slug, token, rubro)
    setTrabajando(false)
    if (!resultado.ok) return setError(resultado.error)
    setVista({ tipo: "cancelada", cita })
    titulo.current?.focus()
  }

  const reagendar = async () => {
    setTrabajando(true)
    setError("")
    const resultado = await reagendarCita(slug, token, fecha, hora, rubro)
    setTrabajando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      setRecargasDeHoras((previas) => previas + 1)
      return
    }
    setVista({
      tipo: "cita",
      cita: {
        ...cita,
        fecha: resultado.datos.fecha,
        hora: resultado.datos.hora,
        profesional: resultado.datos.profesional ?? cita.profesional,
        precio: resultado.datos.precio ?? cita.precio,
      },
    })
    setModo("ver")
    setFecha("")
    elegirHora("", null)
    setAviso(frases.reagendada(diaParaLeer(resultado.datos.fecha), resultado.datos.hora))
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
      <EncabezadoDeReserva ref={titulo} antetitulo={cita.negocio.nombre} titulo={frases.tuCita} />
      <Tarjeta className="mx-auto mt-8 max-w-2xl px-4 py-6 sm:p-8 md:mt-12 lg:p-10">
        <div className="flex items-center gap-4">
          <CuadroDeIcono icono={CalendarCheck} color="azul" tamano="lg" activo />
          <p className="titulo-3 min-w-0 break-words text-navy">{cita.servicio.nombre}</p>
        </div>
        <ResumenDeLaCita className="mt-6 border-t border-borde pt-3" cita={cita} sinServicio terminoDelServicio={frases.terminoDelServicio} />

        {aviso && (
          <p role="status" className="mt-6 rounded-campo bg-azul-suave px-4 py-3 text-sm text-navy">
            {aviso}
          </p>
        )}

        {!cita.sePuedeCambiar ? (
          <p className="mt-6 rounded-campo bg-superficie px-4 py-3 text-sm text-texto-2">
            {frases.fueraDePlazo(cita.plazoHoras, cita.negocio.nombre)}
          </p>
        ) : modo === "ver" ? (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Boton variante="secundario" icono={<X />} onClick={() => elegirModo("confirmar-cancelacion")} className="w-full sm:w-auto">
              {frases.cancelar}
            </Boton>
            {cita.sePuedeReagendar && (
              <Boton icono={<CalendarClock />} onClick={() => elegirModo("reagendar")} className="w-full sm:w-auto">
                Cambiar día u hora
              </Boton>
            )}
          </div>
        ) : modo === "confirmar-cancelacion" ? (
          <div className="mt-8 rounded-panel bg-superficie p-5 squircle sm:p-6">
            <p className="font-medium text-navy">{frases.confirmarCancelacion.pregunta}</p>
            <p className="mt-1 text-sm text-texto-2">El horario queda libre para otra persona y no se puede deshacer.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Boton variante="secundario" onClick={() => elegirModo("ver")} disabled={trabajando} className="w-full sm:w-auto">
                {frases.confirmarCancelacion.mantener}
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
              {frases.mismoServicio(cita.profesional)}
            </p>
            <div className="mt-6">
              <SelectorFechaHora
                cargarHoras={cargarHoras}
                claveDeHoras={`${token}|${recargasDeHoras}`}
                diasDisponibles={cita.diasConAtencion && cita.diasConAtencion.length > 0 ? cita.diasConAtencion : TODOS_LOS_DIAS}
                zona={cita.zona}
                fechaSeleccionada={fecha}
                horaSeleccionada={hora}
                onFecha={setFecha}
                onHora={elegirHora}
                // Clínica dental: una urgencia sólo se mueve a otra hora de hoy.
                soloHoy={cita.soloHoy === true}
              />
            </div>
            {hora && precioNuevo && precioNuevo.precio !== null && (
              <p role="status" className="mt-6 rounded-campo bg-azul-suave px-4 py-3 text-sm text-navy">
                A esta hora el precio cambia:{" "}
                {precioNuevo.precioNormal !== null && (
                  <>
                    <s className="text-texto-2">
                      <span className="sr-only">antes </span>
                      {formatearMonto(precioNuevo.precioNormal)}
                    </s>{" "}
                  </>
                )}
                <strong className="font-semibold">{formatearMonto(precioNuevo.precio)}</strong>
                {/* El % sólo si es lo que de verdad baja; con un servicio sin rebaja, no lo es (QA#14). */}
                {precioNuevo.porcentaje > 0
                  ? rebajaDeLaHora(precioNuevo)?.enTodo
                    ? ` (hora valle, ${precioNuevo.porcentaje}% menos).`
                    : " (hora valle)."
                  : "."}
              </p>
            )}
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

function ResumenDeLaCita({
  cita,
  sinServicio = false,
  terminoDelServicio,
  className,
}: {
  cita: CitaDelEnlace
  sinServicio?: boolean
  /** Cómo se llama la fila del servicio: "Servicio", o "Motivo" en una clínica dental. */
  terminoDelServicio: string
  className?: string
}) {
  const filas: [string, string][] = []
  if (!sinServicio) filas.push([terminoDelServicio, cita.servicio.nombre])
  if (cita.servicio.duracion) filas.push(["Duración", formatearDuracionDeServicio(cita.servicio.duracion)])
  if (cita.profesional) filas.push(["Con", cita.profesional])
  filas.push(["Día", diaParaLeer(cita.fecha)], ["Hora", cita.hora])
  // El precio guardado en la cita (#156): el de hora valle si se reservó o
  // reagendó en una, y el nuevo después de reagendar. Sin precio, no se muestra.
  if (cita.precio !== null) filas.push(["Precio", formatearMonto(cita.precio)])
  filas.push(["Dónde", cita.negocio.nombre])
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
