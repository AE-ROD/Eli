"use client"

import { useState, useEffect, useMemo } from "react"
import { ChevronLeft, ChevronRight, Clock, Calendar } from "lucide-react"
import { t } from "@/lib/i18n/booking"

interface SelectorFechaHoraProps {
  slug: string
  servicioId: string
  memberId?: string | null
  diasDisponibles: number[]
  fechaSeleccionada: string
  horaSeleccionada: string
  onFecha: (f: string) => void
  onHora: (h: string) => void
  locale?: string
}

export function SelectorFechaHora({
  slug,
  servicioId,
  memberId,
  diasDisponibles,
  fechaSeleccionada,
  horaSeleccionada,
  onFecha,
  onHora,
  locale = "es",
}: SelectorFechaHoraProps) {
  const intlLocale = locale === "pt" ? "pt-BR" : locale === "en" ? "en-US" : "es-MX"

  const hoy = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [mesActual, setMesActual] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const [slots, setSlots] = useState<string[]>([])
  const [cargandoSlots, setCargandoSlots] = useState(false)

  useEffect(() => {
    if (!fechaSeleccionada || !servicioId) return
    setCargandoSlots(true)
    setSlots([])
    onHora("")
    const url = `/api/reservar/${slug}/slots?fecha=${fechaSeleccionada}&servicioId=${servicioId}${memberId ? `&memberId=${memberId}` : ""}`
    fetch(url)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setCargandoSlots(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaSeleccionada, servicioId, memberId])

  // Day headers using Intl (T-DR4)
  const cabeceraDias = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const ref = new Date(2024, 0, i)  // Jan 0–6 2024: Sun–Sat
      return new Intl.DateTimeFormat(intlLocale, { weekday: "short" }).format(ref)
    })
  }, [intlLocale])

  const nombreMes = useMemo(() => {
    return new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" }).format(mesActual)
  }, [mesActual, intlLocale])

  const primerDia = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1)
  const offset = primerDia.getDay()
  const totalCeldas = 42

  const irAnterior = () => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1))
  const irSiguiente = () => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1))

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={irAnterior}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-foreground capitalize">{nombreMes}</span>
        <button
          type="button"
          onClick={irSiguiente}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center" role="row">
        {cabeceraDias.map((d) => (
          <div key={d} className="py-1 text-xs font-medium text-muted-foreground capitalize" role="columnheader">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={nombreMes}>
        {Array.from({ length: totalCeldas }, (_, i) => {
          const diaNum = i - offset + 1
          const fecha = new Date(mesActual.getFullYear(), mesActual.getMonth(), diaNum)
          const esDelMes = fecha.getMonth() === mesActual.getMonth() && diaNum > 0
          const esPasado = fecha < hoy
          const disponible = esDelMes && !esPasado && diasDisponibles.includes(fecha.getDay())
          const iso = fecha.toISOString().split("T")[0]
          const seleccionado = iso === fechaSeleccionada
          const esHoy = fecha.toDateString() === hoy.toDateString()

          const fullLabel = esDelMes
            ? new Intl.DateTimeFormat(intlLocale, { weekday: "long", day: "numeric", month: "long" }).format(fecha)
            : ""

          return (
            <button
              key={i}
              type="button"
              disabled={!disponible}
              aria-disabled={!disponible && esDelMes ? "true" : undefined}
              aria-pressed={seleccionado}
              aria-label={fullLabel || undefined}
              onClick={() => disponible && onFecha(iso)}
              className={`aspect-square rounded-md text-sm transition-all ${disponible && !seleccionado ? "hover:scale-110" : ""} ${
                !esDelMes ? "invisible" :
                seleccionado ? "bg-primary text-primary-foreground font-semibold" :
                esHoy ? "ring-2 ring-primary text-primary font-semibold hover:bg-primary/10" :
                disponible ? "hover:bg-primary/10 text-foreground" :
                "text-muted-foreground/40 cursor-not-allowed"
              }`}
            >
              {esDelMes && diaNum > 0 ? diaNum : ""}
            </button>
          )
        })}
      </div>

      {/* Time slots */}
      {fechaSeleccionada && (
        <div className="pt-2">
          <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t(locale, "availableSlots")}
          </p>
          {cargandoSlots ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : slots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <Calendar className="h-8 w-8 opacity-40" />
              <p className="text-sm text-center">{t(locale, "noSlotsAvailable")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2" role="listbox" aria-label={t(locale, "availableSlots")}>
              {slots.map((slot) => {
                const selected = horaSeleccionada === slot
                return (
                  <button
                    key={slot}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onHora(slot)}
                    className={`py-2 rounded-full text-sm font-medium border transition-all hover:scale-105 active:scale-95 ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50 hover:bg-primary/5 text-foreground"
                    }`}
                  >
                    {slot}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
