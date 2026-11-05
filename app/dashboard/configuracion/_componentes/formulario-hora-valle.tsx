"use client"

import { useId, useState } from "react"
import { Percent, Plus, Save, Trash2 } from "lucide-react"
import { BotonIcono } from "@/components/comunes/boton-icono"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Interruptor } from "@/components/comunes/interruptor"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import {
  MAX_FRANJAS_DE_HORA_VALLE,
  PORCENTAJE_MAXIMO_DE_HORA_VALLE,
  PORCENTAJE_MINIMO_DE_HORA_VALLE,
  type FranjaDeHoraValle,
} from "@/lib/hora-valle"
import { pedir, conJson, type Resultado } from "@/lib/peticiones"
import { cn } from "@/lib/utils"

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

/** La que se propone al agregar una franja: un martes a media mañana. */
const FRANJA_SUGERIDA: FranjaDeHoraValle = { dayOfWeek: 2, desde: "10:00", hasta: "12:00", porcentaje: 15 }

interface ServicioDeHoraValle {
  id: string
  nombre: string
  excluido: boolean
}

interface ConfiguracionGuardada {
  activa: boolean
  franjas: FranjaDeHoraValle[]
}

function guardarConfiguracion(activa: boolean, franjas: FranjaDeHoraValle[]): Promise<Resultado<ConfiguracionGuardada>> {
  return pedir<ConfiguracionGuardada>(
    "/api/configuracion/hora-valle",
    "No se pudo guardar",
    conJson("PUT", { activa, franjas })
  )
}

function guardarExclusion(id: string, excluido: boolean): Promise<Resultado<{ id: string; excluido: boolean }>> {
  return pedir(
    `/api/configuracion/hora-valle/servicios/${encodeURIComponent(id)}`,
    "No se pudo guardar",
    conJson("PUT", { excluido })
  )
}

const igual = (a: FranjaDeHoraValle[], b: FranjaDeHoraValle[]) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Precios de hora valle (#89c): un % de rebaja para las reservas de la
 * página que EMPIEZAN dentro de una franja (día y horas). Viene apagada.
 * El interruptor se guarda al tocarlo; las franjas, con "Guardar"; cada
 * servicio excluido, al marcarlo. Las citas que se anotan en el panel no se
 * rebajan solas.
 */
export function FormularioHoraValle({
  activaInicial,
  franjasIniciales,
  serviciosIniciales,
}: {
  activaInicial: boolean
  franjasIniciales: FranjaDeHoraValle[]
  serviciosIniciales: ServicioDeHoraValle[]
}) {
  const idDelTitulo = useId()
  const idBase = useId()
  const [activa, setActiva] = useState(activaInicial)
  const [guardadas, setGuardadas] = useState<FranjaDeHoraValle[]>(franjasIniciales)
  const [franjas, setFranjas] = useState<FranjaDeHoraValle[]>(franjasIniciales)
  const [servicios, setServicios] = useState(serviciosIniciales)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [anuncio, setAnuncio] = useState("")

  const pendiente = !igual(franjas, guardadas)

  const guardar = async (nuevaActiva: boolean, nuevasFranjas: FranjaDeHoraValle[]) => {
    if (guardando) return
    setError("")
    setAnuncio("")
    setGuardando(true)
    const resultado = await guardarConfiguracion(nuevaActiva, nuevasFranjas)
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    setActiva(resultado.datos.activa)
    setGuardadas(resultado.datos.franjas)
    setFranjas(resultado.datos.franjas)
    setAnuncio(resultado.datos.activa ? "Hora valle: guardado" : "Hora valle: apagada")
  }

  // Al encender o apagar se guardan las franjas que ya estaban guardadas: lo
  // que se está editando sigue pendiente hasta "Guardar".
  const cambiarInterruptor = (nueva: boolean) => guardar(nueva, guardadas)

  const cambiarFranja = (indice: number, cambio: Partial<FranjaDeHoraValle>) => {
    setFranjas(franjas.map((franja, i) => (i === indice ? { ...franja, ...cambio } : franja)))
    setAnuncio("")
  }

  const cambiarExclusion = async (servicio: ServicioDeHoraValle, excluido: boolean) => {
    setError("")
    setAnuncio("")
    const resultado = await guardarExclusion(servicio.id, excluido)
    if (!resultado.ok) return setError(resultado.error)
    setServicios(servicios.map((s) => (s.id === servicio.id ? { ...s, excluido: resultado.datos.excluido } : s)))
    setAnuncio(`${servicio.nombre}: ${resultado.datos.excluido ? "sin rebaja" : "con rebaja"}`)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Precios de hora valle"
        subtitulo="Llena las horas más tranquilas"
        icono={{ figura: Percent }}
      />

      <div className="mt-5">
        <Interruptor
          etiqueta="Rebajar las horas valle"
          descripcion="Quien reserva por tu página a una hora de estas franjas paga menos: lo ve en las horas y en el resumen. Cuenta la hora en que empieza la cita. Las citas que anotas en la agenda no se rebajan solas."
          activo={activa}
          alCambiar={cambiarInterruptor}
        />
      </div>

      {activa && (
        <>
          <form
            onSubmit={(evento) => {
              evento.preventDefault()
              guardar(true, franjas)
            }}
            className="mt-6 space-y-4"
          >
            <p className={CLASES_DE_ETIQUETA}>Franjas</p>
            {franjas.length === 0 && (
              <p className="text-sm text-texto-2">Todavía no hay franjas: agrega una para que se note la rebaja.</p>
            )}
            <ul className="space-y-3">
              {franjas.map((franja, indice) => {
                const id = `${idBase}-${indice}`
                return (
                  <li key={indice} className="flex flex-wrap items-end gap-3 rounded-campo bg-superficie p-3 squircle">
                    <div className="min-w-0 space-y-1">
                      <label htmlFor={`${id}-dia`} className="block text-xs text-texto-2">
                        Día
                      </label>
                      <select
                        id={`${id}-dia`}
                        value={franja.dayOfWeek}
                        onChange={(evento) => cambiarFranja(indice, { dayOfWeek: Number(evento.target.value) })}
                        className={cn(CAMPO, "w-36")}
                      >
                        {DIAS.map((dia, numero) => (
                          <option key={dia} value={numero}>
                            {dia}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <label htmlFor={`${id}-desde`} className="block text-xs text-texto-2">
                        Desde
                      </label>
                      <input
                        id={`${id}-desde`}
                        type="time"
                        value={franja.desde}
                        onChange={(evento) => cambiarFranja(indice, { desde: evento.target.value })}
                        className={cn(CAMPO, "w-32")}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <label htmlFor={`${id}-hasta`} className="block text-xs text-texto-2">
                        Hasta
                      </label>
                      <input
                        id={`${id}-hasta`}
                        type="time"
                        value={franja.hasta}
                        onChange={(evento) => cambiarFranja(indice, { hasta: evento.target.value })}
                        className={cn(CAMPO, "w-32")}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <label htmlFor={`${id}-porcentaje`} className="block text-xs text-texto-2">
                        % menos
                      </label>
                      <input
                        id={`${id}-porcentaje`}
                        type="number"
                        inputMode="numeric"
                        min={PORCENTAJE_MINIMO_DE_HORA_VALLE}
                        max={PORCENTAJE_MAXIMO_DE_HORA_VALLE}
                        step={1}
                        value={Number.isNaN(franja.porcentaje) ? "" : franja.porcentaje}
                        onChange={(evento) => cambiarFranja(indice, { porcentaje: evento.target.valueAsNumber })}
                        className={cn(CAMPO, "w-24")}
                      />
                    </div>
                    <BotonIcono
                      etiqueta={`Quitar la franja del ${DIAS[franja.dayOfWeek]?.toLowerCase() ?? ""}`}
                      icono={<Trash2 />}
                      tamano="sm"
                      onClick={() => setFranjas(franjas.filter((_, i) => i !== indice))}
                    />
                  </li>
                )
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <BotonPrimario
                type="button"
                tamaño="sm"
                variante="secundario"
                icono={<Plus className="h-4 w-4" />}
                disabled={franjas.length >= MAX_FRANJAS_DE_HORA_VALLE}
                onClick={() => setFranjas([...franjas, FRANJA_SUGERIDA])}
              >
                Agregar franja
              </BotonPrimario>
              <BotonPrimario
                type="submit"
                tamaño="sm"
                icono={<Save className="h-4 w-4" />}
                cargando={guardando}
                variante={pendiente ? "primario" : "secundario"}
              >
                {pendiente ? "Guardar franjas" : "Guardado"}
              </BotonPrimario>
            </div>
            <p className="text-sm text-texto-2">
              De {PORCENTAJE_MINIMO_DE_HORA_VALLE}% a {PORCENTAJE_MAXIMO_DE_HORA_VALLE}%, hasta{" "}
              {MAX_FRANJAS_DE_HORA_VALLE} franjas, sin que se pisen en el mismo día. El precio se redondea al peso.
            </p>
          </form>

          {servicios.length > 0 && (
            <fieldset className="mt-6">
              <legend className={CLASES_DE_ETIQUETA}>Servicios sin rebaja</legend>
              <p className="mt-1 text-sm text-texto-2">Los marcados cuestan lo mismo a cualquier hora.</p>
              <ul className="mt-3 space-y-2">
                {servicios.map((servicio) => (
                  <li key={servicio.id}>
                    <label className="flex min-h-11 items-center gap-3 text-sm text-navy">
                      <input
                        type="checkbox"
                        checked={servicio.excluido}
                        onChange={(evento) => cambiarExclusion(servicio, evento.target.checked)}
                        className="size-5 accent-navy anillo-foco"
                      />
                      {servicio.nombre}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
        </>
      )}

      <p role="status" className="sr-only">
        {anuncio}
      </p>
      {error && <Aviso className="mt-4">{error}</Aviso>}
    </section>
  )
}
