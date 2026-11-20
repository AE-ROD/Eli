"use client"

import { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Plus, Save, X } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { BotonDeFila } from "@/components/panel/boton-de-fila"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { FilaDeDia } from "@/components/panel/fila-de-dia"
import { RangoDeHoras } from "@/components/panel/rango-de-horas"
import type { FranjaHorario } from "@/lib/horario-dia"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { guardarHorarioDeSede, type ChoqueDelServidor, type Sede } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"
import { DIAS } from "../_horario"
import {
  FRANJA_POR_DEFECTO,
  choquesConOtrasSedes,
  diasConAtencion,
  diasDeLosChoques,
  diasParaGuardar,
  franjaNueva,
  huboCambios,
  problemasDeLaSemana,
  semanaParaEditar,
  textoDeChoque,
  textosDeChoquesDelServidor,
  type DiaDeLaSemana,
} from "../_sedes"
import { BarraParaGuardarEnElCelular, FilaDeDiaCompacta, HojaDeHorasDelDia, LISTAS_GRANDES } from "./horario-en-el-celular"

interface PropsDeEditorDeHorarioDeSede {
  /** La sede, tal como está guardada. */
  sede: Sede
  /** Todas las sedes del negocio, con lo que tienen guardado: contra ellas se revisan los choques. */
  sedes: readonly Sede[]
  /** Lo que quedó guardado, para que quien lo contiene no vuelva a mostrar lo de antes. */
  alGuardar: (sede: Sede) => void
  /** Avisa si hay cambios sin guardar: la lista pregunta antes de descartarlos. */
  alCambiarPendiente: (pendiente: boolean) => void
  alCerrar: () => void
}

/**
 * La grilla semanal de una sede: cada día, de lunes a domingo, con su
 * interruptor y una o más franjas de horas («09:00 a 13:00» y «15:00 a
 * 19:00»). Es el mismo editor de horas de «Horario» (`FilaDeDia`,
 * `RangoDeHoras`), con varias franjas por día. Se guarda por sede y reemplaza
 * toda la grilla.
 *
 * Mientras se edita se avisa, en vivo, si una franja se pisa con la de otra
 * sede activa el mismo día (`choquesConOtrasSedes`, la misma regla del
 * servidor); con un choque, o con una franja que termina antes de empezar, no
 * se puede guardar. Si el servidor igual la rechaza (otra sesión cambió algo),
 * se muestra su mensaje y los días que se pisan. Las franjas que se pisan
 * dentro de la misma sede se unen al guardar.
 */
export function EditorDeHorarioDeSede({ sede, sedes, alGuardar, alCambiarPendiente, alCerrar }: PropsDeEditorDeHorarioDeSede) {
  const base = useId()
  const palabras = vocabularioDe(useRubroDelPanel()).palabras
  const { editor: frases, anuncios } = frasesDeConfiguracion(palabras).sedes
  const idDelTitulo = `${base}-titulo`

  const [guardada, setGuardada] = useState<DiaDeLaSemana[]>(() => semanaParaEditar(sede.horarios))
  const [semana, setSemana] = useState<DiaDeLaSemana[]>(guardada)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [rechazo, setRechazo] = useState<{ mensaje: string; choques: ChoqueDelServidor[] } | null>(null)
  // Los elementos a los que debe ir el foco después del próximo dibujo: el primero que exista (una franja nueva, el botón que sobrevive).
  const pedirFoco = useRef<string[] | null>(null)
  // En el celular, el día cuyas franjas se están cambiando en la hoja.
  const [diaEnLaHoja, setDiaEnLaHoja] = useState<number | null>(null)

  const pendiente = huboCambios(guardada, semana)
  const problemas = problemasDeLaSemana(semana)
  const choques = choquesConOtrasSedes(sede.id, semana, sedes)
  const bloqueado = problemas.length > 0 || choques.length > 0

  useEffect(() => {
    alCambiarPendiente(pendiente)
  }, [pendiente, alCambiarPendiente])
  // Al irse, deja de haber cambios sin guardar de este editor: si no, la lista seguía preguntando por ellos.
  const avisarAlIrse = useRef(alCambiarPendiente)
  useEffect(() => {
    avisarAlIrse.current = alCambiarPendiente
  }, [alCambiarPendiente])
  useEffect(() => () => avisarAlIrse.current(false), [])

  // Corre después de cada dibujo, ya con la franja nueva (o sin la quitada) en el DOM.
  useEffect(() => {
    const candidatos = pedirFoco.current
    if (!candidatos) return
    pedirFoco.current = null
    // Sólo lo que se ve: en el celular la grilla de escritorio está oculta, y al revés.
    candidatos
      .map((id) => document.getElementById(id))
      .find((elemento) => elemento !== null && elemento.getClientRects().length > 0)
      ?.focus()
  })

  const idDelInterruptor = (dia: number) => `${base}-dia-${dia}`
  // Los de la hoja del celular llevan otro prefijo: las dos versiones están en el DOM a la vez.
  const idDelDesde = (dia: number, indice: number, enLaHoja = false) => `${base}${enLaHoja ? "-hoja" : ""}-dia-${dia}-franja-${indice}`
  const idDeAgregar = (dia: number, enLaHoja = false) => `${base}${enLaHoja ? "-hoja" : ""}-agregar-${dia}`

  const cambiarFranjas = (dayOfWeek: number, cambiar: (franjas: FranjaHorario[]) => FranjaHorario[]) => {
    setSemana((previos) => previos.map((dia) => (dia.dayOfWeek === dayOfWeek ? { ...dia, franjas: cambiar(dia.franjas) } : dia)))
    setGuardado(false)
    setRechazo(null)
  }

  const alternarDia = (dia: DiaDeLaSemana) => cambiarFranjas(dia.dayOfWeek, (franjas) => (franjas.length > 0 ? [] : [{ ...FRANJA_POR_DEFECTO }]))

  const cambiarHora = (dayOfWeek: number, indice: number, campo: keyof FranjaHorario, valor: string) =>
    cambiarFranjas(dayOfWeek, (franjas) => franjas.map((franja, i) => (i === indice ? { ...franja, [campo]: valor } : franja)))

  const agregarFranja = (dia: DiaDeLaSemana) => {
    const nueva = franjaNueva(dia.franjas)
    if (!nueva) return
    cambiarFranjas(dia.dayOfWeek, (franjas) => [...franjas, nueva])
    pedirFoco.current = [idDelDesde(dia.dayOfWeek, dia.franjas.length, true), idDelDesde(dia.dayOfWeek, dia.franjas.length)]
  }

  const quitarFranja = (dia: DiaDeLaSemana, indice: number) => {
    cambiarFranjas(dia.dayOfWeek, (franjas) => franjas.filter((_, i) => i !== indice))
    // La franja que tenía el foco desaparece: pasa al botón de agregar, o al interruptor si el día queda apagado.
    pedirFoco.current =
      dia.franjas.length > 1
        ? [idDeAgregar(dia.dayOfWeek, true), idDeAgregar(dia.dayOfWeek), idDelInterruptor(dia.dayOfWeek)]
        : [idDeAgregar(dia.dayOfWeek, true), idDelInterruptor(dia.dayOfWeek)]
  }

  const guardar = async () => {
    if (guardando || bloqueado || !pendiente) return
    setRechazo(null)
    setGuardando(true)
    const resultado = await guardarHorarioDeSede(sede.id, diasParaGuardar(semana), palabras)
    setGuardando(false)
    if (!resultado.ok) return setRechazo({ mensaje: resultado.error, choques: resultado.choques })
    // Lo que quedó guardado (con las franjas ya unidas) es lo que se ve.
    const quedo = semanaParaEditar(resultado.datos.horarios)
    setGuardada(quedo)
    setSemana(quedo)
    setGuardado(true)
    alGuardar(resultado.datos)
  }

  const anuncioDelEstado = [
    choques.length > 0 ? frases.choques.anuncio(diasDeLosChoques(choques)) : "",
    problemas.length > 0 ? problemas[0].mensaje : "",
    guardado && !pendiente ? anuncios.horarioGuardado(sede.nombre) : "",
  ]
    .filter(Boolean)
    .join(" ")

  /** Las franjas de un día con sus horas, quitar y «Otro tramo»: en la grilla de escritorio y en la hoja del celular. */
  function franjasDelDia(dia: DiaDeLaSemana, enLaHoja = false) {
    const nombreDelDia = DIAS[dia.dayOfWeek]
    const hayLugar = franjaNueva(dia.franjas) !== null
    return (
      <div className={cn("flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-1", enLaHoja && cn("gap-3", LISTAS_GRANDES))}>
        {enLaHoja && dia.franjas.length === 0 && <p className="text-sm text-texto-2">{frases.sinAtencion}</p>}
        {/* En la hoja no se ve el aviso de la grilla: los cruces de este día van acá. */}
        {enLaHoja && choques.some((choque) => choque.dayOfWeek === dia.dayOfWeek) && (
          <Aviso tono="atencion" titulo={frases.choques.titulo(choques.filter((choque) => choque.dayOfWeek === dia.dayOfWeek).length)}>
            <ul className="list-disc space-y-0.5 pl-5">
              {choques
                .filter((choque) => choque.dayOfWeek === dia.dayOfWeek)
                .map((choque) => (
                  <li key={`${choque.conSede}-${choque.estaFranja.startTime}-${choque.suFranja.startTime}`}>{textoDeChoque(choque)}</li>
                ))}
            </ul>
          </Aviso>
        )}
        {dia.franjas.map((franja, indice) => {
          const problema = problemas.find((otro) => otro.dayOfWeek === dia.dayOfWeek && otro.indice === indice)
          return (
            // Sin identificador propio: el lugar de la franja es su clave (se reordena sólo al guardar).
            <div key={indice} className="min-w-0">
              <div className="flex w-full min-w-0 items-center gap-1">
                <RangoDeHoras
                  etiqueta={frases.franja(nombreDelDia, indice + 1, dia.franjas.length)}
                  desde={franja.startTime}
                  hasta={franja.endTime}
                  alCambiarDesde={(valor) => cambiarHora(dia.dayOfWeek, indice, "startTime", valor)}
                  alCambiarHasta={(valor) => cambiarHora(dia.dayOfWeek, indice, "endTime", valor)}
                  idDelDesde={idDelDesde(dia.dayOfWeek, indice, enLaHoja)}
                />
                <BotonDeFila
                  etiqueta={frases.quitarFranja(nombreDelDia, indice + 1)}
                  titulo="Quitar"
                  icono={<X className="size-4" aria-hidden="true" strokeWidth={1.75} />}
                  onClick={() => quitarFranja(dia, indice)}
                />
              </div>
              {problema && (
                <div className="mt-1">
                  <ErrorDeCampo id={`${base}${enLaHoja ? "-hoja" : ""}-error-${dia.dayOfWeek}-${indice}`}>{problema.mensaje}</ErrorDeCampo>
                </div>
              )}
            </div>
          )
        })}
        {hayLugar && (
          <div>
            <BotonPrimario
              id={idDeAgregar(dia.dayOfWeek, enLaHoja)}
              type="button"
              variante="fantasma"
              tamaño="sm"
              icono={<Plus className="h-4 w-4" />}
              aria-label={frases.agregarFranja(nombreDelDia)}
              onClick={() => agregarFranja(dia)}
            >
              {frases.agregarFranjaVisible}
            </BotonPrimario>
          </div>
        )}
      </div>
    )
  }

  /** Las horas de un día, para su fila del celular: «09:00 – 13:00», «15:00 – 19:00». */
  const resumenDelDia = (dia: DiaDeLaSemana) => dia.franjas.map((franja) => `${franja.startTime} – ${franja.endTime}`)
  const resumenParaLeer = (dia: DiaDeLaSemana) => dia.franjas.map((franja) => `de ${franja.startTime} a ${franja.endTime}`).join(" y ")

  const diaDeLaHoja = semana.find((dia) => dia.dayOfWeek === diaEnLaHoja) ?? null

  return (
    <div role="group" aria-labelledby={idDelTitulo} className="rounded-campo bg-superficie p-3 squircle lg:p-5">
      <h5 id={idDelTitulo} className="font-medium text-navy break-words">
        {frases.titulo(sede.nombre)}
      </h5>
      <p className="mt-1 text-sm text-pretty text-texto-2">{frases.ayuda}</p>

      {/* Lo que cambia mientras se edita, para el lector de pantalla. */}
      <p role="status" className="sr-only">
        {anuncioDelEstado}
      </p>

      {choques.length > 0 && (
        <Aviso tono="atencion" titulo={frases.choques.titulo(choques.length)} className="mt-4">
          <ul className="list-disc space-y-0.5 pl-5">
            {choques.map((choque) => (
              <li key={`${choque.dayOfWeek}-${choque.conSede}-${choque.estaFranja.startTime}-${choque.suFranja.startTime}`}>
                {textoDeChoque(choque)}
              </li>
            ))}
          </ul>
          <p className="mt-2">{frases.choques.ayuda}</p>
        </Aviso>
      )}

      {rechazo && (
        <Aviso titulo={rechazo.mensaje} className="mt-4">
          {rechazo.choques.length > 0 ? (
            <>
              <p>{frases.choques.delServidor}:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {textosDeChoquesDelServidor(rechazo.choques, sedes).map((texto) => (
                  <li key={texto}>{texto}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Aviso>
      )}

      {diasConAtencion(semana) === 0 && (
        <Aviso tono="info" className="mt-4">
          {frases.sinDias}
        </Aviso>
      )}

      {/* En el celular, cada día en una fila compacta; sus franjas se cambian en una hoja (`horario-en-el-celular.tsx`). */}
      <ul className="mt-3 divide-y divide-borde lg:hidden">
        {semana.map((dia) => (
          <FilaDeDiaCompacta
            key={dia.dayOfWeek}
            etiqueta={DIAS[dia.dayOfWeek]}
            activo={dia.franjas.length > 0}
            alAlternar={() => alternarDia(dia)}
            resumen={resumenDelDia(dia)}
            resumenParaLeer={resumenParaLeer(dia)}
            conProblema={
              problemas.some((problema) => problema.dayOfWeek === dia.dayOfWeek) ||
              choques.some((choque) => choque.dayOfWeek === dia.dayOfWeek)
            }
            alAbrirLasHoras={() => setDiaEnLaHoja(dia.dayOfWeek)}
            textoSinAtencion={frases.sinAtencion}
          />
        ))}
      </ul>

      <ul className="mt-4 divide-y divide-borde max-lg:hidden">
        {semana.map((dia) => {
          const nombreDelDia = DIAS[dia.dayOfWeek]
          return (
            <FilaDeDia
              key={dia.dayOfWeek}
              etiqueta={nombreDelDia}
              activo={dia.franjas.length > 0}
              alAlternar={() => alternarDia(dia)}
              idDelInterruptor={idDelInterruptor(dia.dayOfWeek)}
              alineacion="arriba"
              textoSinAtencion={frases.sinAtencion}
            >
              {franjasDelDia(dia)}
            </FilaDeDia>
          )
        })}
      </ul>

      <AnimatePresence>
        {diaDeLaHoja && (
          <HojaDeHorasDelDia
            key="hoja-del-dia"
            dia={DIAS[diaDeLaHoja.dayOfWeek]}
            descripcion={frases.titulo(sede.nombre)}
            alCerrar={() => setDiaEnLaHoja(null)}
          >
            {franjasDelDia(diaDeLaHoja, true)}
          </HojaDeHorasDelDia>
        )}
      </AnimatePresence>

      {/* En el celular, con cambios sin guardar, «Guardar horario» queda fijo abajo. */}
      <BarraParaGuardarEnElCelular visible={pendiente} guardando={guardando} deshabilitado={bloqueado} alGuardar={guardar}>
        {frases.guardar}
      </BarraParaGuardarEnElCelular>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <BotonPrimario
          type="button"
          tamaño="sm"
          icono={<Save className="h-4 w-4" />}
          cargando={guardando}
          disabled={bloqueado || !pendiente}
          variante={pendiente ? "primario" : "secundario"}
          onClick={guardar}
          className={cn(pendiente && "max-lg:hidden")}
        >
          {guardado && !pendiente ? frases.guardado : frases.guardar}
        </BotonPrimario>
        <BotonPrimario type="button" tamaño="sm" variante="fantasma" onClick={alCerrar} disabled={guardando}>
          {frases.cerrar}
        </BotonPrimario>
        {pendiente && !guardando && <p className="text-sm text-texto-2">{frases.sinGuardar}</p>}
      </div>
    </div>
  )
}
