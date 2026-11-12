"use client"

import { useEffect, useId, useRef } from "react"
import Link from "next/link"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { cn } from "@/lib/utils"
import { conMayuscula, vocabularioDe } from "@/lib/vocabulario"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import { fechaYMinutosEn } from "@/lib/zona-horaria"
import { estiloDeEstado } from "./estados-de-cita"
import { useAhora } from "./usar-ahora"
import { useZonaDelNegocio } from "./zona-del-negocio"
import {
  aQuienBloquea,
  citaPorConfirmar,
  destacaSinProfesional,
  nombreDeCliente,
  nombreDelProfesional,
  type Bloqueo,
  type Cita,
  type SillonDeLaAgenda,
} from "../_datos"
import { frasesDeLaAgenda } from "../_frases"
import { rangoDeHoras, recortarAHoras, tramoDeCita, tramoEnElDia, tramosDeFranjas } from "../_disposicion"
import {
  ALTO_DE_FILA,
  altoDeLaGrilla,
  citasPorColumna,
  columnasDeLaGrilla,
  columnasDelBloqueo,
  filasDeLaGrilla,
  horaDelMinuto,
  lineaDeAhora,
  lugaresEnLaColumna,
  posicionDelBloque,
  type ColumnaDeLaGrilla,
  type VerPor,
} from "../_grilla-del-dia"
import { caeEnElDia, esHoyEn, horaEn } from "../_hora-del-negocio"
import { sedeParaMostrar } from "../_sedes"
import { useSedesDeLaAgenda } from "./sedes-de-la-agenda"

/** El ancho de la columna de las horas: la clase `w-14`. */
const ANCHO_DE_LAS_HORAS = 56
/** Lo mínimo que mide una columna: el nombre del paciente se lee entero en la mayoría. */
const ANCHO_MINIMO_DE_COLUMNA = 148
/**
 * Cuánto antes de la hora actual se abre la grilla de hoy: una hora y media
 * fila más, para que el rótulo de esa hora no quede debajo de la cabecera.
 */
const ANTES_DE_AHORA = 4.5 * ALTO_DE_FILA

/** Los botones de "Ver por": el sillón y quien atiende, con la palabra del rubro ("Odontólogo"). */
function opcionesDeVerPor(palabraProfesional: string): { id: VerPor; texto: string }[] {
  return [
    { id: "sillon", texto: "Sillón" },
    { id: "odontologo", texto: palabraProfesional },
  ]
}

interface PropsDeGrillaDelDia {
  fecha: Date
  citas: Cita[]
  /** El horario de atención de toda la semana: amplía las horas que se dibujan. */
  horario: FranjaDelDia[]
  bloqueos: Bloqueo[]
  /** Los sillones de la clínica, activos e inactivos. */
  sillones: SillonDeLaAgenda[]
  /** Quienes atienden, para las columnas por odontólogo (sólo quien asigna lo lee; si no, salen de las citas). */
  equipo: { id: string; nombre: string }[]
  verPor: VerPor
  onVerPor: (verPor: VerPor) => void
  onSeleccionar: (cita: Cita) => void
  onSeleccionarBloqueo: (bloqueo: Bloqueo) => void
  /** La cita abierta en el detalle: su bloque lleva un borde navy. */
  citaElegidaId?: string | null
  /** Si hay odontólogos a quien asignar: entonces las citas sin odontólogo se marcan (#103). */
  destacarSinProfesional?: boolean
  /** Si quien mira gestiona los sillones: el aviso de "sin sillones" lleva a Configuración. */
  gestionaSillones?: boolean
  /** Si los sillones no cargaron: se avisa, y la vista por sillón muestra sólo lo que traen las citas. */
  avisoDeSillones?: string
}

/**
 * La vista Día de la clínica dental: una grilla con una columna por sillón o
 * por odontólogo ("Ver por"), filas de 15 minutos con el rótulo cada media
 * hora y, hoy, la línea de la hora actual. Cada cita es un botón con su rango,
 * su estado en palabras, el paciente y el motivo; su nombre accesible lo dice
 * todo, también la columna. Las que se pisan en una columna van lado a lado.
 * Las columnas y la posición de cada bloque salen de `_grilla-del-dia.ts`.
 *
 * Los bloqueos del día van en una lista de botones encima de la grilla, que
 * abren su detalle; en la grilla son una franja rayada que no se toca (uno de
 * todo el negocio cruza todas las columnas; el de un odontólogo, su columna
 * en la vista por odontólogo).
 *
 * La grilla se desplaza dentro de su caja, en alto y en ancho: en el teléfono
 * cada columna guarda un ancho donde se lee, y la página no se desplaza de
 * costado. La fila de las columnas y la de las horas quedan fijas. Hoy se abre
 * una hora antes de la actual.
 */
export function GrillaDelDia({
  fecha,
  citas,
  horario,
  bloqueos,
  sillones,
  equipo,
  verPor,
  onVerPor,
  onSeleccionar,
  onSeleccionarBloqueo,
  citaElegidaId = null,
  destacarSinProfesional = false,
  gestionaSillones = false,
  avisoDeSillones = "",
}: PropsDeGrillaDelDia) {
  const zona = useZonaDelNegocio()
  // La grilla es de la clínica dental, pero sus palabras salen del vocabulario como en el resto del panel.
  const { palabras } = vocabularioDe(useRubroDelPanel())
  const frases = frasesDeLaAgenda(palabras)
  const caja = useRef<HTMLDivElement>(null)
  const idDeVerPor = useId()
  const idDeBloqueos = useId()
  const ahora = useAhora("grilla-del-dia")

  // El día y las horas, en la zona del negocio (#99).
  const citasDelDia = citas.filter((cita) => caeEnElDia(cita.startTime, fecha, zona))
  const franjasDelDia = horario.filter((franja) => franja.dayOfWeek === fecha.getDay())
  const { desde, hasta } = rangoDeHoras([
    ...tramosDeFranjas(franjasDelDia),
    ...citasDelDia.map((cita) => tramoDeCita(cita, zona)),
  ])
  const filas = filasDeLaGrilla(desde, hasta)
  const alto = altoDeLaGrilla(desde, hasta)

  const columnas = columnasDeLaGrilla(verPor, sillones, equipo, citasDelDia, palabras.profesional.singular)
  const porColumna = citasPorColumna(citasDelDia, columnas, verPor, (cita) => tramoDeCita(cita, zona).inicioMin)

  // Cada bloqueo, recortado al día y a las horas que se muestran.
  const bloqueosDelDia = bloqueos.flatMap((bloqueo) => {
    const enElDia = tramoEnElDia(bloqueo, fecha, zona)
    const visible = enElDia && recortarAHoras(enElDia, desde, hasta)
    return visible ? [{ bloqueo, ...visible }] : []
  })

  const esHoy = esHoyEn(fecha, zona, new Date(ahora))
  const linea = lineaDeAhora(esHoy ? fechaYMinutosEn(new Date(ahora), zona).minutos : null, desde, hasta)
  const sinSillones = verPor === "sillon" && !avisoDeSillones && !sillones.some((sillon) => sillon.activo)

  // Hoy, la grilla se abre una hora antes de la actual; otro día, desde arriba.
  // Sólo al cambiar de día, de vista o de horas dibujadas: después, donde la
  // deje quien la mira (recargar las citas no la mueve).
  const diaVisto = fecha.toDateString()
  useEffect(() => {
    const contenedor = caja.current
    if (!contenedor) return
    const reloj = new Date()
    const alAbrir = lineaDeAhora(esHoyEn(fecha, zona, reloj) ? fechaYMinutosEn(reloj, zona).minutos : null, desde, hasta)
    contenedor.scrollTop = alAbrir === null ? 0 : Math.max(alAbrir - ANTES_DE_AHORA, 0)
    // `fecha` entra por `diaVisto`: otro objeto con el mismo día no vuelve a mover la grilla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaVisto, verPor, desde, hasta, zona])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span id={idDeVerPor} className="text-sm text-texto-2">
            Ver por
          </span>
          {/* Botones que dicen cuál está elegido (`aria-pressed`), como la vista de la agenda. */}
          <div role="group" aria-labelledby={idDeVerPor} className="flex gap-1 rounded-full bg-superficie p-1">
            {opcionesDeVerPor(frases.grilla.verPorProfesional).map(({ id, texto }) => {
              const elegida = verPor === id
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={elegida}
                  onClick={() => onVerPor(id)}
                  className={cn(
                    // 36px a la vista; el ::after lleva el área que se toca a 44.
                    "relative inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium",
                    "after:absolute after:inset-x-0 after:-inset-y-1 anillo-foco transition-colors duration-150 ease-suave",
                    elegida ? "bg-navy text-white" : "text-navy hover:bg-borde"
                  )}
                >
                  {texto}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {avisoDeSillones && (
        <div className="px-4 pb-3 sm:px-6">
          <Aviso tono="atencion" rol="status" titulo="No se pudieron cargar los sillones">
            {avisoDeSillones} La grilla muestra sólo los sillones que tienen citas este día.
          </Aviso>
        </div>
      )}

      {sinSillones && (
        <div className="px-4 pb-3 sm:px-6">
          <Aviso tono="info">
            {gestionaSillones ? (
              <>
                Todavía no hay sillones activos. Agrégalos en{" "}
                <Link
                  href="/dashboard/configuracion#sillones"
                  className="rounded-sm font-medium text-navy underline decoration-[1.5px] underline-offset-4 anillo-foco"
                >
                  Configuración
                </Link>{" "}
                para ver el día por sillón.
              </>
            ) : (
              "Todavía no hay sillones activos: los agrega la dueña o el encargado en Configuración."
            )}
          </Aviso>
        </div>
      )}

      {bloqueosDelDia.length > 0 && (
        <div className="px-4 pb-3 sm:px-6">
          <h3 id={idDeBloqueos} className="sr-only">
            Bloqueos del día
          </h3>
          <ul aria-labelledby={idDeBloqueos} className="flex flex-wrap gap-2">
            {bloqueosDelDia.map(({ bloqueo }) => (
              <li key={bloqueo.id}>
                <button
                  type="button"
                  onClick={() => onSeleccionarBloqueo(bloqueo)}
                  className="flex min-h-11 items-center gap-2 rounded-[14px] border border-dashed border-texto-2/40 bg-borde/60 px-3 py-1.5 text-left text-sm text-texto-2 squircle anillo-foco"
                >
                  <span className="min-w-0 break-words">
                    <span className="font-medium">Bloqueado</span>
                    {` · ${aQuienBloquea(bloqueo, palabras)}`}
                    {bloqueo.motivo && ` · ${bloqueo.motivo}`}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">
                    {horaEn(bloqueo.startTime, zona)} – {horaEn(bloqueo.endTime, zona)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        El radio de 24 px es el de la tarjeta (32) menos los 8 px que la separan
        del borde, como en la semana: las esquinas siguen la curva de la tarjeta.
      */}
      <div ref={caja} className="mx-2 mb-2 max-h-[calc(100dvh-17.5rem)] min-h-96 overflow-auto rounded-[24px] sm:mx-3 sm:mb-3">
        <div style={{ minWidth: ANCHO_DE_LAS_HORAS + columnas.length * ANCHO_MINIMO_DE_COLUMNA }}>
          {/* La fila de las columnas: fija arriba al desplazarse. */}
          <div className="sticky top-0 z-30 flex border-b border-borde bg-tarjeta">
            <div className="sticky left-0 z-10 w-14 shrink-0 bg-tarjeta" />
            {columnas.map((columna) => (
              <CabeceraDeColumna
                key={columna.id}
                columna={columna}
                cantidad={porColumna.get(columna.id)?.length ?? 0}
                frases={frases}
              />
            ))}
          </div>

          <div className="relative flex" style={{ height: alto }}>
            {/* Las horas: fijas a la izquierda al desplazarse de costado. El rótulo, cada media hora. */}
            <div aria-hidden="true" className="sticky left-0 z-20 w-14 shrink-0 bg-tarjeta">
              {filas.map(
                (fila, i) =>
                  fila.rotulo && (
                    <span
                      key={fila.minuto}
                      style={{ top: i * ALTO_DE_FILA }}
                      className={cn(
                        "absolute right-2 text-xs text-texto-2 tabular-nums",
                        // La primera, debajo del borde de la cabecera; las demás, centradas en su línea.
                        i === 0 ? "pt-1" : "-translate-y-1/2"
                      )}
                    >
                      {fila.rotulo}
                    </span>
                  )
              )}
            </div>

            {columnas.map((columna) => {
              const deLaColumna = porColumna.get(columna.id) ?? []
              const lugares = lugaresEnLaColumna(deLaColumna.map((cita) => ({ id: cita.id, ...tramoDeCita(cita, zona) })))
              const franjas = bloqueosDelDia.filter(({ bloqueo }) =>
                columnasDelBloqueo(bloqueo, verPor, columnas).includes(columna.id)
              )
              const cantidad = deLaColumna.length

              return (
                <div
                  key={columna.id}
                  role="group"
                  aria-label={`${columna.nombre}${columna.inactiva ? ", desactivado" : ""}: ${
                    cantidad === 0 ? frases.sinCitas : frases.cuantasCitas(cantidad)
                  }`}
                  className="relative min-w-0 flex-1 border-l border-borde"
                  style={{
                    // Una línea cada 15 minutos; la de la media hora, más marcada.
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${ALTO_DE_FILA - 1}px, color-mix(in srgb, var(--color-borde) 55%, transparent) ${ALTO_DE_FILA - 1}px ${ALTO_DE_FILA}px), repeating-linear-gradient(to bottom, transparent 0 ${ALTO_DE_FILA * 2 - 1}px, var(--color-borde) ${ALTO_DE_FILA * 2 - 1}px ${ALTO_DE_FILA * 2}px)`,
                  }}
                >
                  {/* Bloqueos: una franja rayada detrás de las citas. Se abren desde la lista de arriba. */}
                  {franjas.map(({ bloqueo, inicioMin, finMin }) => {
                    const posicion = posicionDelBloque({ inicioMin, finMin }, desde, hasta)
                    if (!posicion) return null
                    return (
                      <div
                        key={bloqueo.id}
                        aria-hidden="true"
                        style={{ top: posicion.arriba, height: posicion.alto }}
                        className="absolute inset-x-1 overflow-hidden rounded-[10px] bg-[repeating-linear-gradient(135deg,var(--color-superficie)_0_6px,var(--color-borde)_6px_12px)] px-2 py-1 text-xs font-medium text-texto-2"
                      >
                        <span className="block truncate">{bloqueo.motivo || "Bloqueado"}</span>
                      </div>
                    )
                  })}

                  {deLaColumna.map((cita) => (
                    <BloqueDeCita
                      key={cita.id}
                      cita={cita}
                      zona={zona}
                      desde={desde}
                      hasta={hasta}
                      lugar={lugares.get(cita.id) ?? { columna: 0, columnas: 1 }}
                      verPor={verPor}
                      elegida={cita.id === citaElegidaId}
                      sinProfesional={destacaSinProfesional(cita, destacarSinProfesional)}
                      onSeleccionar={onSeleccionar}
                    />
                  ))}
                </div>
              )
            })}

            {/* La hora actual: una línea navy sobre todas las columnas, con la hora fija a la izquierda. */}
            {linea !== null && (
              <div
                aria-hidden="true"
                style={{ top: linea }}
                className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
              >
                <span className="sticky left-1 rounded-full bg-navy px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">
                  {horaDelMinuto(fechaYMinutosEn(new Date(ahora), zona).minutos)}
                </span>
                <span className="h-0.5 flex-1 bg-navy" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** El nombre de la columna y cuántas citas tiene; un sillón desactivado lo dice. */
function CabeceraDeColumna({
  columna,
  cantidad,
  frases,
}: {
  columna: ColumnaDeLaGrilla
  cantidad: number
  frases: ReturnType<typeof frasesDeLaAgenda>
}) {
  return (
    <div className="min-w-0 flex-1 border-l border-borde px-2.5 py-2.5">
      <p className="truncate font-semibold" title={columna.nombre}>
        {columna.nombre}
      </p>
      <p className="truncate text-[13px] text-texto-2">
        {columna.inactiva ? "Desactivado · " : ""}
        {cantidad === 0 ? conMayuscula(frases.sinCitas) : frases.cuantasCitas(cantidad)}
      </p>
    </div>
  )
}

interface PropsDeBloqueDeCita {
  cita: Cita
  zona: string
  desde: number
  hasta: number
  lugar: { columna: number; columnas: number }
  verPor: VerPor
  elegida: boolean
  sinProfesional: boolean
  onSeleccionar: (cita: Cita) => void
}

/**
 * Una cita en la grilla: un botón que abre su detalle (clic, Enter o
 * Espacio). Dice el rango y el estado en palabras, el paciente y el motivo, lo
 * que entre según su alto; el nombre accesible lo dice todo, también el
 * sillón o el odontólogo de la otra vista.
 */
function BloqueDeCita({ cita, zona, desde, hasta, lugar, verPor, elegida, sinProfesional, onSeleccionar }: PropsDeBloqueDeCita) {
  // "Sin paciente", el estado y "sin odontólogo": la grilla es de la clínica dental.
  const { palabras } = vocabularioDe(useRubroDelPanel())
  const frases = frasesDeLaAgenda(palabras)
  // Etapa 9: con varias sedes la hora dice la suya; con una o ninguna, la grilla de siempre.
  const { modo: modoDeSedes } = useSedesDeLaAgenda()
  const sede = sedeParaMostrar(cita, modoDeSedes)
  const posicion = posicionDelBloque(tramoDeCita(cita, zona), desde, hasta)
  if (!posicion) return null

  const estado = estiloDeEstado(cita.status, citaPorConfirmar(cita), palabras)
  const inicio = horaEn(cita.startTime, zona)
  const fin = horaEn(cita.endTime, zona)
  const paciente = nombreDeCliente(cita, palabras.cliente.singular)
  const odontologo = nombreDelProfesional(cita, frases.profesional.etiqueta)
  // Lo de la otra vista: por sillón, con quién; por odontólogo, en qué sillón.
  const otraColumna =
    verPor === "sillon"
      ? odontologo
        ? `con ${odontologo}`
        : null
      : cita.sillon?.nombre
        ? `en ${cita.sillon.nombre}`
        : "sin sillón"
  const nombreAccesible = [
    `De ${inicio} a ${fin}`,
    paciente,
    cita.title,
    estado.texto,
    otraColumna,
    sede ? frases.sede.enNombreAccesible(sede) : null,
    cita.primeraVez ? frases.grilla.primeraVez : null,
    sinProfesional ? frases.profesional.sinEnMedioDeFrase : null,
  ]
    .filter(Boolean)
    .join(", ")

  const { columna, columnas } = lugar
  // Sola, 4 px de cada lado; compartiendo, 2 px, que el ancho es poco.
  const margen = columnas > 1 ? 2 : 4
  const ancho = 100 / columnas
  // Una cita de menos de media hora no tiene alto para tres renglones.
  const corta = posicion.alto < 3 * 16 + 8

  return (
    <button
      type="button"
      onClick={() => onSeleccionar(cita)}
      aria-label={nombreAccesible}
      // Con el mouse, lo que no entra se lee entero al pasar por encima.
      title={nombreAccesible}
      aria-current={elegida ? "true" : undefined}
      style={{
        top: posicion.arriba,
        height: posicion.alto,
        left: `calc(${columna * ancho}% + ${margen}px)`,
        width: `calc(${ancho}% - ${margen * 2}px)`,
      }}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-[12px] border-l-[3px] px-2 py-1 text-left",
        "anillo-foco transition-shadow duration-200 ease-suave hover:z-10 hover:shadow-md focus-visible:z-10",
        corta && "justify-center",
        estado.bloque,
        // La elegida, con un borde navy por dentro.
        elegida && "shadow-[inset_0_0_0_2px_var(--color-navy)]",
        // Sin odontólogo (#103): un borde punteado alrededor, además de dicho en el nombre accesible.
        sinProfesional && "outline-2 -outline-offset-2 outline-dashed outline-naranja"
      )}
    >
      {corta ? (
        // Corta: lo que más importa en un renglón, la hora y el paciente. El resto, en su nombre.
        <span className={cn("block truncate text-xs leading-4 font-medium", cita.status === "cancelada" && "line-through")}>
          <span className="tabular-nums">{inicio}</span> {paciente}
        </span>
      ) : (
        <>
          <span className="block truncate text-xs leading-4 font-semibold tabular-nums">
            {inicio}–{fin}
          </span>
          {/* La cancelada, además del rojo, tachada: se distingue sin el color. */}
          <span className={cn("block truncate text-sm leading-5 font-medium", cita.status === "cancelada" && "line-through")}>
            {paciente}
          </span>
          {/* El estado en palabras va primero: en una columna angosta, lo que se corta es el motivo. */}
          <span className="block truncate text-xs leading-4">
            <span className="font-medium">{estado.texto}</span> · {cita.title}
            {sede && ` · ${sede}`}
          </span>
        </>
      )}
    </button>
  )
}
