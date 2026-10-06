"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight, Clock } from "lucide-react"
import { leerDisponibilidad } from "../_datos"

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

interface SelectorFechaHoraProps {
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
}: SelectorFechaHoraProps) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const [mesActual, setMesActual] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const [horasLibres, setHorasLibres] = useState<string[]>([])
  const [cargandoHoras, setCargandoHoras] = useState(false)
  const [aviso, setAviso] = useState("")

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

  return (
    <div className="space-y-4">
      {/* Navegación del mes */}
      <div className="flex items-center justify-between">
        <button onClick={irAnterior} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-foreground">
          {MESES[mesActual.getMonth()]} {mesActual.getFullYear()}
        </span>
        <button onClick={irSiguiente} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Cabecera días */}
      <div className="grid grid-cols-7 text-center">
        {DIAS.map((dia) => (
          <div key={dia} className="py-1 text-xs font-medium text-muted-foreground">{dia}</div>
        ))}
      </div>

      {/* Celdas */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: totalCeldas }, (_, i) => {
          const diaNum = i - celdasAntesDelPrimero + 1
          const fecha = new Date(mesActual.getFullYear(), mesActual.getMonth(), diaNum)
          const esDelMes = fecha.getMonth() === mesActual.getMonth() && diaNum > 0
          const esPasado = fecha < hoy
          const disponible = esDelMes && !esPasado && diasDisponibles.includes(fecha.getDay())
          const iso = fecha.toISOString().split("T")[0]
          const seleccionado = iso === fechaSeleccionada
          const esHoy = fecha.toDateString() === hoy.toDateString()

          return (
            <motion.button
              key={i}
              type="button"
              disabled={!disponible}
              onClick={() => disponible && onFecha(iso)}
              className={`aspect-square rounded-lg text-sm transition-all ${
                !esDelMes ? "invisible" :
                seleccionado ? "bg-primary text-primary-foreground font-semibold" :
                esHoy ? "ring-2 ring-primary text-primary font-semibold hover:bg-primary/10" :
                disponible ? "hover:bg-primary/10 text-foreground" :
                "text-muted-foreground/40 cursor-not-allowed"
              }`}
              whileHover={disponible && !seleccionado ? { scale: 1.1 } : {}}
            >
              {esDelMes && diaNum > 0 ? diaNum : ""}
            </motion.button>
          )
        })}
      </div>

      {/* Slots de hora */}
      {fechaSeleccionada && (
        <div className="pt-2">
          <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Horarios disponibles
          </p>
          {cargandoHoras ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : aviso ? (
            <p role="alert" className="text-sm text-red-500 text-center py-4">
              {aviso}
            </p>
          ) : horasLibres.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay horarios disponibles para este día
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {horasLibres.map((hora) => (
                <motion.button
                  key={hora}
                  type="button"
                  onClick={() => onHora(hora)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                    horaSeleccionada === hora
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/50 hover:bg-primary/5 text-foreground"
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {hora}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
