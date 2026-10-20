"use client"

import { useState, useEffect, useId } from "react"
import { ChevronLeft, ChevronRight, Clock } from "lucide-react"
import { BotonIcono } from "@/components/comunes/boton-icono"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { comoTexto } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import { leerDisponibilidad } from "../_datos"

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

/** Los lugares que guarda el esqueleto mientras llegan las horas: dos filas. */
const LUGARES_MIENTRAS_CARGA = 6

/**
 * `jueves 15 de octubre`, con el año sólo si no es el de hoy. Es para leer:
 * lo que va al servidor sigue siendo `AAAA-MM-DD`.
 */
export function fechaParaLeer(fecha: Date): string {
  const año = fecha.getFullYear() === new Date().getFullYear() ? "" : ` de ${fecha.getFullYear()}`
  return `${DIAS_LARGOS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()].toLowerCase()}${año}`
}

/*
 * Lo elegido, en el azul de la Agenda con un borde navy de 2px: el pastel
 * solo no llega al 3:1 contra el blanco. Los bordes son `inset-ring`, que no
 * corren el contenido y que `anillo-foco` conserva al enfocar.
 */
const ELEGIDO = "bg-azul font-semibold text-navy inset-ring-2 inset-ring-navy"

interface PropsDeSelectorFechaHora {
  slug: string
  servicioId: string
  diasDisponibles: number[] // dayOfWeek con horario activo
  fechaSeleccionada: string // YYYY-MM-DD
  horaSeleccionada: string  // HH:MM
  onFecha: (fecha: string) => void
  onHora: (hora: string) => void
}

export function SelectorFechaHora({
  slug,
  servicioId,
  diasDisponibles,
  fechaSeleccionada,
  horaSeleccionada,
  onFecha,
  onHora,
}: PropsDeSelectorFechaHora) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const [mesActual, setMesActual] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const [horasLibres, setHorasLibres] = useState<string[]>([])
  const [cargandoHoras, setCargandoHoras] = useState(false)
  const [aviso, setAviso] = useState("")
  const idDelAviso = useId()

  useEffect(() => {
    if (!fechaSeleccionada || !servicioId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- arranca la carga de horas cuando cambia la fecha o el servicio
    setCargandoHoras(true)
    setHorasLibres([])
    setAviso("")
    onHora("")
    leerDisponibilidad(slug, fechaSeleccionada, servicioId).then((resultado) => {
      // Un pedido que falló no es un día sin horas libres: se dice qué pasó
      // en vez de mostrar "No hay horarios disponibles".
      if (resultado.ok) setHorasLibres(resultado.datos)
      else setAviso(resultado.error)
      setCargandoHoras(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaSeleccionada, servicioId])

  const primerDia = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1)
  // Cuántas celdas de la grilla quedan antes del día 1: la semana empieza en domingo.
  const celdasAntesDelPrimero = primerDia.getDay()
  const totalCeldas = 42

  const irAnterior = () => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1))
  const irSiguiente = () => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1))

  const nombreDelMes = `${MESES[mesActual.getMonth()]} ${mesActual.getFullYear()}`

  // Qué muestra la columna de horarios. Todo sale del estado de arriba.
  const estadoDeHoras = !fechaSeleccionada
    ? "sin-dia"
    : cargandoHoras
      ? "cargando"
      : aviso
        ? "aviso"
        : horasLibres.length === 0
          ? "sin-horas"
          : "con-horas"

  return (
    // Desde md, calendario y horarios lado a lado: al elegir el día, las horas aparecen a la vista.
    // A 768px cada columna mide 312px, lo justo para las siete celdas de 44px.
    <div className="grid gap-8 md:grid-cols-2 lg:gap-10">
      <div>
        {/* Navegación del mes */}
        <div className="flex items-center justify-between gap-2">
          <BotonIcono etiqueta="Mes anterior" icono={<ChevronLeft />} tamano="sm" onClick={irAnterior} />
          {/* Se anuncia al cambiar: quien no ve la grilla sabe a qué mes pasó. */}
          <p aria-live="polite" className="font-medium text-navy">
            {nombreDelMes}
          </p>
          <BotonIcono etiqueta="Mes siguiente" icono={<ChevronRight />} tamano="sm" onClick={irSiguiente} />
        </div>

        {/* Cabecera días: cada botón ya dice su día entero, así que no se lee. */}
        <div aria-hidden="true" className="mt-4 grid grid-cols-7 text-center text-xs font-medium text-texto-2">
          {DIAS.map((dia) => (
            <span key={dia} className="py-1">
              {dia}
            </span>
          ))}
        </div>

        {/* Celdas: 44px de lado, el mínimo para un dedo; desde 360px de ancho entran las siete. */}
        <div role="group" aria-label={`Días de ${nombreDelMes}`} className="mt-1 grid grid-cols-7 gap-y-1">
          {Array.from({ length: totalCeldas }, (_, i) => {
            const diaNum = i - celdasAntesDelPrimero + 1
            const fecha = new Date(mesActual.getFullYear(), mesActual.getMonth(), diaNum)
            const esDelMes = fecha.getMonth() === mesActual.getMonth() && diaNum > 0
            const esPasado = fecha < hoy
            const disponible = esDelMes && !esPasado && diasDisponibles.includes(fecha.getDay())
            // `toISOString` pasa la medianoche local a UTC: al este de Greenwich
            // (Madrid, Tokio) daba el día anterior al que se tocó.
            const iso = comoTexto(fecha)
            const seleccionado = iso === fechaSeleccionada
            const esHoy = fecha.toDateString() === hoy.toDateString()

            // Las celdas de otros meses guardan su lugar: la grilla tiene siempre seis filas y no salta.
            if (!esDelMes) return <span key={i} aria-hidden="true" className="h-11" />

            return (
              <button
                key={i}
                type="button"
                disabled={!disponible}
                onClick={() => disponible && onFecha(iso)}
                aria-pressed={seleccionado}
                aria-current={esHoy ? "date" : undefined}
                aria-label={fechaParaLeer(fecha)}
                className={cn(
                  "mx-auto grid size-11 place-items-center rounded-campo text-sm tabular-nums squircle anillo-foco",
                  "transition-[background-color,color,box-shadow] duration-150 ease-suave",
                  seleccionado
                    ? ELEGIDO
                    : disponible
                      ? "font-medium text-navy hover:bg-azul-suave"
                      : "cursor-not-allowed text-texto-2/45",
                  // Hoy va subrayado: se distingue sin depender del color.
                  esHoy && !seleccionado && "underline decoration-2 underline-offset-4"
                )}
              >
                {diaNum}
              </button>
            )
          })}
        </div>
      </div>

      {/* Slots de hora */}
      <div>
        <h3 className="flex items-center gap-2 font-medium text-navy">
          <Clock aria-hidden="true" className="size-4 text-texto-2" strokeWidth={1.75} />
          Horarios disponibles
        </h3>

        <div className="mt-4">
          {/*
            Siempre en la página, para que el lector de pantalla anuncie cuando
            cambia: "Cargando horarios…", cuántos hay o que no hay ninguno.
          */}
          <p
            role="status"
            className={cn(
              "text-sm text-texto-2",
              (estadoDeHoras === "cargando" || estadoDeHoras === "con-horas" || estadoDeHoras === "aviso") && "sr-only"
            )}
          >
            {estadoDeHoras === "sin-dia" && "Elige un día para ver los horarios libres."}
            {estadoDeHoras === "cargando" && "Cargando horarios…"}
            {estadoDeHoras === "sin-horas" && "No hay horarios disponibles para este día. Prueba con otro."}
            {estadoDeHoras === "con-horas" &&
              `${horasLibres.length} ${horasLibres.length === 1 ? "horario libre" : "horarios libres"}.`}
          </p>

          {estadoDeHoras === "cargando" && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">
              {Array.from({ length: LUGARES_MIENTRAS_CARGA }, (_, lugar) => (
                <Esqueleto key={lugar} className="h-11 rounded-campo" />
              ))}
            </div>
          )}

          {estadoDeHoras === "aviso" && (
            <div role="alert">
              <ErrorDeCampo id={idDelAviso}>{aviso}</ErrorDeCampo>
            </div>
          )}

          {estadoDeHoras === "con-horas" && (
            <div role="group" aria-label="Horarios libres" className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">
              {horasLibres.map((hora) => {
                const elegida = horaSeleccionada === hora
                return (
                  <button
                    key={hora}
                    type="button"
                    aria-pressed={elegida}
                    onClick={() => onHora(hora)}
                    className={cn(
                      "h-11 rounded-campo text-sm tabular-nums squircle anillo-foco",
                      "transition-[background-color,box-shadow] duration-150 ease-suave",
                      elegida
                        ? ELEGIDO
                        : "bg-tarjeta font-medium text-navy inset-ring-1 inset-ring-texto-2 hover:bg-azul-suave hover:inset-ring-navy"
                    )}
                  >
                    {hora}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
