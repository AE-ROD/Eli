"use client"

import { useEffect, useRef } from "react"
import { duracionParaMostrar, diaParaLeer, horasEnPunto } from "@/lib/fechas"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import { cn } from "@/lib/utils"
import { diasSemana } from "./controles-de-agenda"
import { estiloDeEstado } from "./estados-de-cita"
import { aQuienBloquea, citaPorConfirmar, destacaSinProfesional, nombreDeCliente, type Bloqueo, type Cita } from "../_datos"
import { columnasDeSolape, rangoDeHoras, recortarAHoras, tramoDeCita, tramoEnElDia, tramosDeFranjas } from "../_disposicion"
import { caeEnElDia, esHoyEn, horaEn } from "../_hora-del-negocio"
import { useZonaDelNegocio } from "./zona-del-negocio"

const ALTURA_HORA = 64 // px por hora: la clase `h-16` de cada franja
const ANCHO_DE_LAS_HORAS = 56 // px de la columna de las horas: la clase `w-14`
const ALTURA_MINIMA = 24 // px: una cita corta se dibuja al menos así de alta
const SEPARACION = 4 // px que se le restan al alto de cada cita

/**
 * Lo que ocupa en pantalla la cita más corta, en minutos: con eso se decide
 * si dos citas se pisan a la vista aunque no se pisen en el tiempo.
 */
const DURACION_VISUAL_MINIMA = Math.ceil(((ALTURA_MINIMA + SEPARACION) / ALTURA_HORA) * 60)

interface PropsDeVistaSemana {
  dias: Date[]
  citas: Cita[]
  /** El horario de atención del negocio, de toda la semana: amplía las horas que se dibujan. */
  horario: FranjaDelDia[]
  /** Bloqueos de horario del período: franjas grises detrás de las citas. */
  bloqueos: Bloqueo[]
  onSeleccionar: (cita: Cita) => void
  onSeleccionarBloqueo: (bloqueo: Bloqueo) => void
  /** Si hay profesionales a quien asignar: entonces las citas sin profesional se marcan (#103). */
  destacarSinProfesional?: boolean
}

/**
 * La semana en columnas, como mínimo de 8 a 20 y ampliada para que entren el
 * horario de atención y cualquier cita fuera de ese rango. Las citas que se
 * pisan van lado a lado, repartidas en columnas (`columnasDeSolape`). Se desplaza dentro de la tarjeta, en
 * alto y en ancho: en el teléfono los siete días no entran y cada uno guarda
 * un ancho donde el nombre se lee, en vez de apretarse hasta la inicial. La
 * fila de los días y la columna de las horas quedan fijas al desplazarse.
 * Cuando no entra a lo ancho, la semana de hoy se abre mostrando hoy y no el
 * domingo; cualquier otra, desde el principio.
 *
 * El radio de 24 px es el de la tarjeta (32) menos los 8 px que la separan
 * del borde: así las esquinas del área que se desplaza siguen la curva de la
 * tarjeta y no asoman.
 */
export function VistaSemana({
  dias,
  citas,
  horario,
  bloqueos,
  onSeleccionar,
  onSeleccionarBloqueo,
  destacarSinProfesional = false,
}: PropsDeVistaSemana) {
  const caja = useRef<HTMLDivElement>(null)
  // Días, horas y "hoy", en la zona del negocio (#99).
  const zona = useZonaDelNegocio()
  const esHoy = (dia: Date) => esHoyEn(dia, zona)
  const indiceDeHoy = dias.findIndex(esHoy)
  const primerDia = dias[0]?.toDateString()

  const citasPorDia = dias.map((dia) =>
    citas.filter((cita) => caeEnElDia(cita.startTime, dia, zona))
  )
  const diasDeLaSemanaVisibles = new Set(dias.map((dia) => dia.getDay()))
  const { desde, hasta } = rangoDeHoras([
    ...tramosDeFranjas(horario.filter((franja) => diasDeLaSemanaVisibles.has(franja.dayOfWeek))),
    ...citasPorDia.flat().map((cita) => tramoDeCita(cita, zona)),
  ])
  const horasDelDia = horasEnPunto(desde, hasta)

  // Sólo de costado, y sólo al cambiar de semana: el alto queda donde estaba.
  // Si la semana entra entera, el navegador deja el desplazamiento en cero.
  useEffect(() => {
    const contenedor = caja.current
    if (!contenedor) return
    const columnaDeHoy = indiceDeHoy >= 0 ? contenedor.querySelector<HTMLElement>(`[data-dia="${indiceDeHoy}"]`) : null
    contenedor.scrollLeft = columnaDeHoy ? columnaDeHoy.offsetLeft - ANCHO_DE_LAS_HORAS : 0
  }, [primerDia, indiceDeHoy])

  return (
    <div ref={caja} className="mx-2 mb-2 max-h-[calc(100dvh-17.5rem)] min-h-96 overflow-auto rounded-[24px] sm:mx-3 sm:mb-3">
      {/* Cada día, unos 80 px en el teléfono: se lee el nombre. Desde lg alcanza con 64. */}
      <div className="min-w-[40rem] lg:min-w-[32rem]">
        {/* Cabecera con días */}
        <div className="sticky top-0 z-20 flex border-b border-borde bg-tarjeta">
          <div className="sticky left-0 z-10 w-14 shrink-0 bg-tarjeta" />
          {dias.map((dia, i) => {
            const hoy = esHoy(dia)
            return (
              <div
                key={i}
                data-dia={i}
                aria-current={hoy ? "date" : undefined}
                className={cn("min-w-0 flex-1 border-l border-borde px-1 py-2.5 text-center", hoy && "bg-azul-suave/40")}
              >
                <p className="text-xs font-medium text-texto-2">{diasSemana[dia.getDay()]}</p>
                {/* Hoy, en un círculo navy: se ve sin depender del azul de la columna. */}
                <p
                  className={cn(
                    "mx-auto mt-1 grid size-8 place-items-center rounded-full font-medium tabular-nums",
                    hoy ? "bg-navy text-white" : "text-navy"
                  )}
                >
                  {dia.getDate()}
                </p>
              </div>
            )
          })}
        </div>

        {/* Grilla de horas con citas */}
        <div className="flex">
          {/* Columna de horas: fija a la izquierda al desplazarse de costado. */}
          <div className="sticky left-0 z-10 w-14 shrink-0 bg-tarjeta">
            {horasDelDia.map((hora) => (
              <div key={hora} className="h-16 pt-1 pr-2 text-right text-xs text-texto-2 tabular-nums">
                {hora}
              </div>
            ))}
          </div>

          {/* Columnas por día */}
          {dias.map((dia, indiceDia) => {
            const citasDelDia = citasPorDia[indiceDia]
            const lugares = columnasDeSolape(
              citasDelDia.map((cita) => ({ id: cita.id, ...tramoDeCita(cita, zona) })),
              DURACION_VISUAL_MINIMA
            )

            return (
              <div
                key={indiceDia}
                className={cn("relative min-w-0 flex-1 border-l border-borde", esHoy(dia) && "bg-azul-suave/40")}
              >
                {/* Líneas de hora: sólo dibujan la grilla, no se tocan. */}
                {horasDelDia.map((hora) => (
                  <div key={hora} aria-hidden="true" className="h-16 border-b border-borde" />
                ))}

                {/*
                  Bloqueos: franjas grises a todo el ancho, detrás de las citas.
                  Uno de varios días dibuja su pedazo en cada uno, recortado a
                  las horas que se muestran (no estira la grilla).
                */}
                {bloqueos.map((bloqueo) => {
                  const enElDia = tramoEnElDia(bloqueo, dia, zona)
                  const visible = enElDia && recortarAHoras(enElDia, desde, hasta)
                  if (!visible) return null
                  const arriba = ((visible.inicioMin - desde * 60) / 60) * ALTURA_HORA
                  const alto = Math.max(((visible.finMin - visible.inicioMin) / 60) * ALTURA_HORA - SEPARACION, ALTURA_MINIMA)
                  const quien = aQuienBloquea(bloqueo)
                  return (
                    <button
                      key={bloqueo.id}
                      type="button"
                      style={{ top: arriba, height: alto, left: 2, right: 2 }}
                      onClick={() => onSeleccionarBloqueo(bloqueo)}
                      aria-label={`Bloqueado: ${quien}${bloqueo.motivo ? `, ${bloqueo.motivo}` : ""}, ${diaParaLeer(dia)}, de ${horaEn(bloqueo.startTime, zona)} a ${horaEn(bloqueo.endTime, zona)}`}
                      className="absolute overflow-hidden rounded-[10px] border border-dashed border-texto-2/40 bg-borde/60 px-1.5 py-1 text-left text-texto-2 anillo-foco transition-shadow duration-200 ease-suave hover:shadow-md focus-visible:z-10"
                    >
                      <span className="block truncate text-xs font-medium">{bloqueo.motivo || "Bloqueado"}</span>
                      {alto > 32 && <span className="block truncate text-xs">{quien}</span>}
                    </button>
                  )
                })}

                {/* Citas */}
                {citasDelDia.map((cita) => {
                  const { inicioMin } = tramoDeCita(cita, zona)
                  const distanciaArriba = ((inicioMin - desde * 60) / 60) * ALTURA_HORA
                  const duracion = duracionParaMostrar(cita.startTime, cita.endTime)
                  const altura = Math.max((duracion / 60) * ALTURA_HORA - SEPARACION, ALTURA_MINIMA)
                  const estado = estiloDeEstado(cita.status, citaPorConfirmar(cita))
                  const sinProfesional = destacaSinProfesional(cita, destacarSinProfesional)
                  const { columna, columnas } = lugares.get(cita.id) ?? { columna: 0, columnas: 1 }
                  // Sola, 4 px de cada lado; compartiendo, 2 px, que el ancho es poco.
                  const margen = columnas > 1 ? 2 : 4
                  const ancho = 100 / columnas

                  return (
                    <button
                      key={cita.id}
                      type="button"
                      // La posición y el alto salen de la hora y la duración de cada cita.
                      style={{
                        top: distanciaArriba,
                        height: altura,
                        left: `calc(${columna * ancho}% + ${margen}px)`,
                        width: `calc(${ancho}% - ${margen * 2}px)`,
                      }}
                      onClick={() => onSeleccionar(cita)}
                      // Lo que la grilla dice con el lugar y el color, dicho para el lector de
                      // pantalla. Empieza por lo que se ve, para que también lo encuentre la voz.
                      aria-label={`${nombreDeCliente(cita)}, ${cita.title}, ${diaParaLeer(dia)}, de ${horaEn(cita.startTime, zona)} a ${horaEn(cita.endTime, zona)}, ${estado.texto}${sinProfesional ? ", sin profesional" : ""}`}
                      className={cn(
                        "absolute overflow-hidden rounded-[10px] border-l-[3px] px-1.5 py-1 text-left",
                        "anillo-foco transition-shadow duration-200 ease-suave hover:z-10 hover:shadow-md focus-visible:z-10",
                        estado.bloque,
                        // Sin profesional (#103): un borde punteado alrededor, además de dicho en el nombre accesible.
                        sinProfesional && "outline-2 -outline-offset-2 outline-dashed outline-naranja"
                      )}
                    >
                      {/* La cancelada, además del rojo, tachada: se distingue sin el color. */}
                      <span
                        className={cn(
                          "block truncate text-xs font-medium",
                          cita.status === "cancelada" && "line-through"
                        )}
                      >
                        {nombreDeCliente(cita)}
                      </span>
                      {altura > 32 && <span className="block truncate text-xs">{cita.title}</span>}
                      {sinProfesional && altura > 48 && <span className="block truncate text-xs font-medium">Sin profesional</span>}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
