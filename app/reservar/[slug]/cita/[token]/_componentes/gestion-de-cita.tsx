"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarCheck, CalendarClock, CalendarX2, Check, Navigation, X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { formatearMonto } from "@/lib/dinero"
import { deTexto, formatearDuracionDeServicio } from "@/lib/fechas"
import { rebajaDeLaHora, type PrecioDeLaHora } from "@/lib/hora-valle"
import { cn } from "@/lib/utils"
import { EncabezadoDeReserva } from "../../../_componentes/encabezado-de-reserva"
import { direccionConComuna } from "../../../_componentes/reglas-de-la-sede"
import { SelectorFechaHora, fechaParaLeer } from "../../../_componentes/selector-fecha-hora"
import { SelectorProfesional } from "../../../_componentes/selector-profesional"
import { frasesDeLaGestion } from "../../../_frases"
import { FRASES_DE_LAS_SEDES } from "../../../_frases-de-sedes"
import {
  cancelarCita,
  leerCita,
  leerHorasParaReagendar,
  reagendarCita,
  type CitaDelEnlace,
  type ProfesionalParaCambiar,
} from "../_datos"
import {
  NADIE_MARCADO,
  alElegirProfesional,
  conQuienQuedo,
  diasDeLaEleccion,
  eleccionDelPedido,
  noHayNadaQueCambiar,
  nombreDeLoMarcado,
  profesionalMarcadoAlAbrir,
} from "./reglas-de-la-gestion"

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

  // Con quién se reagenda (plan con varios profesionales): `undefined` es "no se
  // tocó el selector", y vale lo que había al abrir (quien atiende hoy). Al
  // marcar a otro, el día y la hora se sueltan y se dice (`avisoDelProfesional`).
  const [marcadoPorQuien, setMarcadoPorQuien] = useState<string | null | undefined>(undefined)
  const [avisoDelProfesional, setAvisoDelProfesional] = useState("")
  const citaDeLaVista = vista.tipo === "cita" ? vista.cita : null
  const profesionales = citaDeLaVista?.profesionales ?? []
  const marcadoAlAbrir = citaDeLaVista ? profesionalMarcadoAlAbrir(citaDeLaVista, profesionales) : null
  const marcado = marcadoPorQuien === undefined ? marcadoAlAbrir : marcadoPorQuien
  const eleccion = useMemo(() => eleccionDelPedido(marcadoAlAbrir, marcado), [marcadoAlAbrir, marcado])

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

  const cargarHoras = useCallback((dia: string) => leerHorasParaReagendar(slug, token, dia, eleccion), [slug, token, eleccion])

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
    const resultado = await reagendarCita(slug, token, fecha, hora, rubro, eleccion)
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
    setMarcadoPorQuien(undefined)
    setAvisoDelProfesional("")
    setAviso(
      frases.reagendada(diaParaLeer(resultado.datos.fecha), resultado.datos.hora, conQuienQuedo(eleccion, resultado.datos.profesional))
    )
    // El plazo se cuenta desde la cita nueva: se vuelve a leer.
    void cargar()
  }

  const elegirModo = (nuevo: Modo) => {
    setModo(nuevo)
    setError("")
    setAviso("")
    // Cada vez que se abre el cambio, parte de quien atiende la cita hoy.
    setMarcadoPorQuien(undefined)
    setAvisoDelProfesional("")
  }

  const elegirFecha = (nueva: string) => {
    setAvisoDelProfesional("")
    setFecha(nueva)
  }

  // Otro profesional es otra agenda: el día y la hora que ya se habían elegido se
  // sueltan, con un aviso, y el calendario vuelve a pedir las horas de la nueva.
  const elegirProfesional = (nuevo: string | null) => {
    const { cambia, avisa } = alElegirProfesional(marcado, nuevo, { fecha, hora })
    if (!cambia) return
    setMarcadoPorQuien(nuevo)
    setFecha("")
    elegirHora("", null)
    setAvisoDelProfesional(avisa ? frases.profesional.cambiaste : "")
  }

  // Con a quién elegir, el selector va antes del calendario; sin nadie marcado
  // (quien la atiende ya no se puede elegir) no hay horas que mostrar todavía.
  const hayQueElegir = profesionales.length > 0
  const sinElegirConQuien = marcado === NADIE_MARCADO
  const sinCambios = noHayNadaQueCambiar(cita, { fecha, hora }, eleccion)

  return (
    <>
      <EncabezadoDeReserva ref={titulo} antetitulo={cita.negocio.nombre} titulo={frases.tuCita} />
      <Tarjeta className="mx-auto mt-8 max-w-2xl px-4 py-6 sm:p-8 md:mt-12 lg:p-10">
        <div className="flex items-center gap-4">
          <CuadroDeIcono icono={CalendarCheck} color="azul" tamano="lg" activo />
          <p className="titulo-3 min-w-0 break-words text-navy">{cita.servicio.nombre}</p>
        </div>
        <ResumenDeLaCita className="mt-6 border-t border-borde pt-3" cita={cita} sinServicio terminoDelServicio={frases.terminoDelServicio} />
        {cita.sede?.mapas && <ComoLlegar sede={cita.sede.nombre} mapas={cita.sede.mapas} />}

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
              {frases.mismoServicio(nombreDeLoMarcado(cita.profesional, profesionales, marcadoAlAbrir, marcado))}
              {/* Reagendar no cambia de sede: las horas son las de esa sede. */}
              {cita.sede && ` ${FRASES_DE_LAS_SEDES.reagendarEnLaSede(cita.sede.nombre)}`}
            </p>
            {hayQueElegir && (
              <ProfesionalAlReagendar
                profesionales={profesionales}
                marcado={marcado}
                onElegir={elegirProfesional}
                aviso={avisoDelProfesional}
                cualquiera={frases.profesional.cualquiera}
              />
            )}
            <div className="mt-6">
              {sinElegirConQuien ? (
                <p className="text-sm text-texto-2">{frases.profesional.elige}</p>
              ) : (
                <SelectorFechaHora
                  cargarHoras={cargarHoras}
                  claveDeHoras={`${token}|${recargasDeHoras}|${eleccion.tipo === "uno" ? eleccion.id : eleccion.tipo}`}
                  diasDisponibles={diasDeLaEleccion(cita.diasConAtencion, profesionales, eleccion)}
                  zona={cita.zona}
                  fechaSeleccionada={fecha}
                  horaSeleccionada={hora}
                  onFecha={elegirFecha}
                  onHora={elegirHora}
                  // Clínica dental: una urgencia sólo se mueve a otra hora de hoy.
                  soloHoy={cita.soloHoy === true}
                />
              )}
            </div>
            {fecha && hora && sinCambios && (
              <p role="status" className="mt-6 text-sm text-texto-2">
                {frases.sinCambios}
              </p>
            )}
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
              <Boton icono={<Check />} disabled={!fecha || !hora || sinCambios} cargando={trabajando} onClick={reagendar} className="w-full sm:w-auto">
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

/**
 * "¿Con quién?" al cambiar la cita: el mismo selector de la reserva
 * (`SelectorProfesional`: "Cualquiera disponible" primero y una persona por
 * botón, con `aria-pressed`, 44px y foco visible), antes del calendario. `marcado`
 * es un id, `null` para "cualquiera", o `NADIE_MARCADO` si quien la atiende hoy ya
 * no se puede elegir (no sale marcado ningún botón). El `aviso` ("Cambiaste de
 * estilista: elige de nuevo el día y la hora.") va en una región `status` que
 * existe siempre, para que el lector de pantalla lo anuncie al aparecer.
 */
export function ProfesionalAlReagendar({
  profesionales,
  marcado,
  onElegir,
  aviso,
  cualquiera,
}: {
  profesionales: ProfesionalParaCambiar[]
  marcado: string | null
  onElegir: (profesionalId: string | null) => void
  aviso: string
  /** Cómo se dice "cualquiera" (`frasesDeLaGestion`): en una clínica, "La primera hora disponible". */
  cualquiera?: { nombre: string; detalle: string }
}) {
  return (
    <>
      <div className="mt-6">
        <SelectorProfesional profesionales={profesionales} elegido={marcado} onElegir={onElegir} cualquiera={cualquiera} />
      </div>
      <p role="status" className={cn("text-sm text-texto-2", aviso && "mt-4")}>
        {aviso}
      </p>
    </>
  )
}

/** Los enlaces de mapa abren aparte y no le pasan quién los abrió. */
const AFUERA = { target: "_blank", rel: "noopener noreferrer" } as const

/** "Cómo llegar" a la sede de la cita, en Google Maps y en Waze. El nombre de la sede va en el texto para el lector de pantalla. */
export function ComoLlegar({ sede, mapas }: { sede: string; mapas: { googleMaps: string; waze: string } }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Boton
        href={mapas.googleMaps}
        variante="secundario"
        icono={<Navigation />}
        aria-label={FRASES_DE_LAS_SEDES.comoLlegar(sede, "Google Maps")}
        {...AFUERA}
      >
        Google Maps
      </Boton>
      <Boton
        href={mapas.waze}
        variante="secundario"
        icono={<Navigation />}
        aria-label={FRASES_DE_LAS_SEDES.comoLlegar(sede, "Waze")}
        {...AFUERA}
      >
        Waze
      </Boton>
    </div>
  )
}

export function ResumenDeLaCita({
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
  // Plan Independiente: la sede de la cita, con su dirección. Sin sede, nada cambia.
  if (cita.sede) {
    filas.push([FRASES_DE_LAS_SEDES.terminoDeLaSede, cita.sede.nombre], [FRASES_DE_LAS_SEDES.terminoDeLaDireccion, direccionConComuna(cita.sede)])
  }
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
