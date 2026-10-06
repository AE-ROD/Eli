"use client"

import { motion } from "framer-motion"
import { CalendarDays, Users, DollarSign, type LucideIcon } from "lucide-react"
import { formatearHora } from "@/lib/fechas"
import { formatearMonto } from "@/lib/dinero"
import { TarjetaEstadistica } from "./tarjeta-estadistica"
import { puedeVerIngresos, type EstadisticasDelPanel } from "../_datos"

const contenedorVariantes = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const itemVariantes = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

interface Tarjeta {
  titulo: string
  valor: string | number
  icono: LucideIcon
  colorIcono: "primario" | "exito" | "info"
  procedencia?: string
}

/**
 * De qué está hecha cada cifra. Devuelven `undefined` cuando no hay nada
 * verdadero que decir: una línea vaga es la misma mentira que un `+0%`, con
 * más palabras.
 */
function procedenciaDeCitas(estadisticas: EstadisticasDelPanel): string | undefined {
  if (estadisticas.citasHoy > 0) return undefined
  if (!estadisticas.proximaCita) return "Ninguna agendada todavía."

  const cuando = new Date(estadisticas.proximaCita.startTime)
  const dia = cuando.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })
  return `La próxima es el ${dia} a las ${formatearHora(estadisticas.proximaCita.startTime)}.`
}

function procedenciaDeClientes(estadisticas: EstadisticasDelPanel): string | undefined {
  const { clientesNuevosMes, totalClientes } = estadisticas

  if (totalClientes === 0) return "Se suman solos cuando alguien reserva."
  if (clientesNuevosMes === 0) return "Ninguno nuevo este mes."

  return clientesNuevosMes === 1 ? "1 nuevo este mes." : `${clientesNuevosMes} nuevos este mes.`
}

/**
 * Los ingresos son lo cobrado en el tablero (PRODUCTO.md, sección 7): una cita
 * completada en la agenda sin pasar por el cobro no suma, así que la línea
 * habla de atenciones cobradas y no de citas.
 */
function procedenciaDeIngresos(estadisticas: EstadisticasDelPanel): string | undefined {
  const cobradas = estadisticas.atencionesCobradasMes ?? 0
  if (cobradas === 0) return "Se suma al cobrar en el tablero. Todavía nada este mes."

  const base = cobradas === 1 ? "1 atención cobrada" : `${cobradas} atenciones cobradas`
  const tendencia = estadisticas.tendencias.ingresos
  if (tendencia === undefined) return `${base} este mes.`

  const signo = tendencia >= 0 ? "+" : "−"
  return `${base} este mes · ${signo}${Math.abs(tendencia)}% vs el mes pasado.`
}

/** Mientras cargan, las tres tarjetas con un guion: nunca un cero que no es cierto. */
const TARJETAS_CARGANDO: Tarjeta[] = [
  { titulo: "Citas hoy", valor: "—", icono: CalendarDays, colorIcono: "primario" },
  { titulo: "Clientes activos", valor: "—", icono: Users, colorIcono: "exito" },
  { titulo: "Ingresos del mes", valor: "—", icono: DollarSign, colorIcono: "info" },
]

function tarjetasDe(estadisticas: EstadisticasDelPanel): Tarjeta[] {
  return [
    {
      titulo: "Citas hoy",
      valor: estadisticas.citasHoy,
      icono: CalendarDays,
      colorIcono: "primario",
      procedencia: procedenciaDeCitas(estadisticas),
    },
    {
      titulo: "Clientes activos",
      valor: estadisticas.totalClientes,
      icono: Users,
      colorIcono: "exito",
      procedencia: procedenciaDeClientes(estadisticas),
    },
    ...(puedeVerIngresos(estadisticas)
      ? [
          {
            titulo: "Ingresos del mes",
            valor: formatearMonto(estadisticas.ingresosMes ?? 0),
            icono: DollarSign,
            colorIcono: "info" as const,
            procedencia: procedenciaDeIngresos(estadisticas),
          },
        ]
      : []),
  ]
}

interface EstadisticasDelNegocioProps {
  /** Nulo mientras cargan. */
  estadisticas: EstadisticasDelPanel | null
}

/** Las tarjetas de arriba del panel: citas de hoy, clientes e ingresos del mes. */
export function EstadisticasDelNegocio({ estadisticas }: EstadisticasDelNegocioProps) {
  const tarjetas = estadisticas ? tarjetasDe(estadisticas) : TARJETAS_CARGANDO

  return (
    <motion.section variants={contenedorVariantes} initial="hidden" animate="show">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tarjetas.map((tarjeta) => (
          <motion.div key={tarjeta.titulo} variants={itemVariantes}>
            <TarjetaEstadistica
              titulo={tarjeta.titulo}
              valor={tarjeta.valor}
              icono={tarjeta.icono}
              colorIcono={tarjeta.colorIcono}
              procedencia={tarjeta.procedencia}
            />
          </motion.div>
        ))}
      </div>
    </motion.section>
  )
}
