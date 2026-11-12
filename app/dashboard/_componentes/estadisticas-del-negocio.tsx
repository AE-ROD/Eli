"use client"

import { CalendarDays, Users, DollarSign, type LucideIcon } from "lucide-react"
import { formatearHora } from "@/lib/fechas"
import { formatearMonto } from "@/lib/dinero"
import type { ColorDeModulo } from "@/lib/modulos"
import { vocabularioDe } from "@/lib/vocabulario"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { TarjetaEstadistica } from "./tarjeta-estadistica"
import { puedeVerIngresos, type EstadisticasDelPanel } from "../_datos"
import { frasesDelInicio } from "../_frases"

type FrasesDeLasEstadisticas = ReturnType<typeof frasesDelInicio>["estadisticas"]

interface Tarjeta {
  titulo: string
  valor: string | number
  icono: LucideIcon
  /** El de la agenda para las citas, el de clientes y el de reportes para lo cobrado. */
  color: ColorDeModulo
  procedencia?: string
}

/**
 * De qué está hecha cada cifra. Devuelven `undefined` cuando no hay nada
 * verdadero que decir: una línea vaga es la misma mentira que un `+0%`, con
 * más palabras.
 */
function procedenciaDeCitas(estadisticas: EstadisticasDelPanel, frases: FrasesDeLasEstadisticas): string | undefined {
  if (estadisticas.citasHoy > 0) return undefined
  if (!estadisticas.proximaCita) return frases.ningunaAgendada

  // El día y la hora en la zona del negocio, la misma con la que el servidor decidió qué es "hoy".
  const { zona } = estadisticas
  const cuando = new Date(estadisticas.proximaCita.startTime)
  const dia = cuando.toLocaleDateString("es-CL", {
    ...(zona && { timeZone: zona }),
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  return frases.proximaCita(dia, formatearHora(estadisticas.proximaCita.startTime, zona))
}

function procedenciaDeClientes(estadisticas: EstadisticasDelPanel, frases: FrasesDeLasEstadisticas): string | undefined {
  const { clientesNuevosMes, totalClientes } = estadisticas

  if (totalClientes === 0) return frases.sinClientes

  return frases.clientesNuevos(clientesNuevosMes)
}

/**
 * Los ingresos son lo cobrado en el tablero (PRODUCTO.md, sección 7): una cita
 * completada en la agenda sin pasar por el cobro no suma, así que la línea
 * habla de atenciones cobradas y no de citas.
 */
function procedenciaDeIngresos(estadisticas: EstadisticasDelPanel, frases: FrasesDeLasEstadisticas): string | undefined {
  const cobradas = estadisticas.atencionesCobradasMes ?? 0
  // "en el tablero", o "en la sala de espera" en una clínica dental: el artículo concuerda con la palabra.
  const dondeSeCobra = frases.dondeSeCobra
  if (cobradas === 0) return `Se suma al cobrar en ${dondeSeCobra}. Todavía nada este mes.`

  const base = cobradas === 1 ? "1 atención cobrada" : `${cobradas} atenciones cobradas`
  const tendencia = estadisticas.tendencias.ingresos
  if (tendencia === undefined) return `${base} este mes.`

  const signo = tendencia >= 0 ? "+" : "−"
  return `${base} este mes · ${signo}${Math.abs(tendencia)}% vs el mes pasado.`
}

/*
 * Los títulos salen de las palabras del rubro: "Total de clientes" o "Total de
 * pacientes" (la cifra es el total del negocio, no los que vinieron hace poco:
 * decía "activos" y no lo eran), y "Citas hoy" u "Horas agendadas hoy".
 */

/** Mientras cargan, las tres tarjetas con un guion: nunca un cero que no es cierto. */
function tarjetasCargando(frases: FrasesDeLasEstadisticas): Tarjeta[] {
  return [
    { titulo: frases.citasHoy, valor: "—", icono: CalendarDays, color: "azul" },
    { titulo: frases.totalDeClientes, valor: "—", icono: Users, color: "lila" },
    { titulo: "Ingresos del mes", valor: "—", icono: DollarSign, color: "lima" },
  ]
}

function tarjetasDe(estadisticas: EstadisticasDelPanel, frases: FrasesDeLasEstadisticas): Tarjeta[] {
  return [
    {
      titulo: frases.citasHoy,
      valor: estadisticas.citasHoy,
      icono: CalendarDays,
      color: "azul",
      procedencia: procedenciaDeCitas(estadisticas, frases),
    },
    {
      titulo: frases.totalDeClientes,
      valor: estadisticas.totalClientes,
      icono: Users,
      color: "lila",
      procedencia: procedenciaDeClientes(estadisticas, frases),
    },
    ...(puedeVerIngresos(estadisticas)
      ? [
          {
            titulo: "Ingresos del mes",
            valor: formatearMonto(estadisticas.ingresosMes ?? 0),
            icono: DollarSign,
            color: "lima" as const,
            procedencia: procedenciaDeIngresos(estadisticas, frases),
          },
        ]
      : []),
  ]
}

interface PropsDeEstadisticasDelNegocio {
  /** Nulo mientras cargan. */
  estadisticas: EstadisticasDelPanel | null
}

/** Las tarjetas de arriba del panel: citas de hoy, clientes e ingresos del mes. */
export function EstadisticasDelNegocio({ estadisticas }: PropsDeEstadisticasDelNegocio) {
  const frases = frasesDelInicio(vocabularioDe(useRubroDelPanel()).palabras).estadisticas
  const tarjetas = estadisticas ? tarjetasDe(estadisticas, frases) : tarjetasCargando(frases)

  return (
    <div aria-busy={!estadisticas || undefined} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tarjetas.map((tarjeta) => (
        <TarjetaEstadistica
          key={tarjeta.titulo}
          titulo={tarjeta.titulo}
          valor={tarjeta.valor}
          icono={tarjeta.icono}
          color={tarjeta.color}
          procedencia={tarjeta.procedencia}
        />
      ))}
    </div>
  )
}
