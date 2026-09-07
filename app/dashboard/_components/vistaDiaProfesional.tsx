"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { CalendarClock, Settings } from "lucide-react"
import { TarjetaCita } from "@/components/app/tarjetas/tarjeta-cita"
import { LineaDeTiempoDia, citaParaTarjeta } from "./lineaDeTiempoDia"
import { formatoDuracion, minutosLibresEnFranjas, type CitaDelDia, type FranjaHorario } from "@/lib/horario-dia"

/**
 * Lo mínimo de `StatsData` (app/dashboard/page.tsx) que necesita la vista del
 * profesional. Se define acá en vez de importar el tipo de `page.tsx` para no
 * acoplar un componente de `_components` a la página que lo consume.
 */
interface StatsParaProfesional {
  citasHoy: number
  citasHoyLista: CitaDelDia[]
  /** Ausente si no tiene horario activo cargado para hoy (contrato del endpoint). */
  horarioHoy?: FranjaHorario[]
}

interface VistaDiaProfesionalProps {
  stats: StatsParaProfesional | null
}

function tituloResumen(citasHoy: number): string {
  if (citasHoy === 0) return "Tu día está libre"
  return citasHoy === 1 ? "1 cita hoy" : `${citasHoy} citas hoy`
}

/** Lista simple de citas, reutilizada por los dos estados que no pueden dibujar la línea de tiempo (sin horario / horario inválido). */
function ListaCitasDelDia({ citas }: { citas: CitaDelDia[] }) {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-5">
      <h2 className="font-semibold text-foreground mb-3">
        {citas.length > 0 ? "Tus citas de hoy" : "Sin citas para hoy"}
      </h2>
      {citas.length > 0 ? (
        <div className="space-y-2">
          {citas.map((cita) => (
            <TarjetaCita key={cita.id} cita={citaParaTarjeta(cita)} compacta />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Tampoco tenés citas agendadas para hoy.</p>
      )}
    </div>
  )
}

/** Aviso ámbar reutilizado por los dos estados "no se puede calcular" (sin horario / horario inválido). */
function AvisoHorario({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
      <Settings className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="text-sm text-muted-foreground mt-1">{children}</p>
      </div>
    </div>
  )
}

export function VistaDiaProfesional({ stats }: VistaDiaProfesionalProps) {
  if (!stats) {
    return (
      <div className="bg-card border border-border/50 rounded-xl p-8 text-center text-sm text-muted-foreground">
        Cargando tu día...
      </div>
    )
  }

  const { citasHoy, citasHoyLista, horarioHoy } = stats

  // Sin horario activo para hoy: no hay contra qué medir el tiempo libre, así
  // que no se inventa ninguna cifra. Igual se muestran las citas que haya.
  if (!horarioHoy) {
    return (
      <div className="space-y-4">
        <AvisoHorario titulo="No tenés un horario cargado para hoy">
          Sin horario no se puede calcular tu tiempo libre. Se configura en{" "}
          <Link href="/dashboard/configuracion" className="text-primary hover:underline focus-visible:underline focus-visible:outline-none">
            Configuración
          </Link>
          .
        </AvisoHorario>
        <ListaCitasDelDia citas={citasHoyLista} />
      </div>
    )
  }

  const minutosLibres = minutosLibresEnFranjas(horarioHoy, citasHoyLista)

  // Una franja con la hora de fin antes (o igual) que la de inicio no se puede
  // medir: "0 minutos libres" sería una cifra inventada, así que el día se
  // lee igual que "no tenés horario cargado" — no se dibuja la línea de
  // tiempo sobre un dato que no se pudo validar.
  if (minutosLibres === null) {
    return (
      <div className="space-y-4">
        <AvisoHorario titulo="Tu horario de hoy no es válido">
          Una franja tiene la hora de fin antes o igual que la de inicio, así que
          no se puede calcular tu tiempo libre. Se corrige en{" "}
          <Link href="/dashboard/configuracion" className="text-primary hover:underline focus-visible:underline focus-visible:outline-none">
            Configuración
          </Link>
          .
        </AvisoHorario>
        <ListaCitasDelDia citas={citasHoyLista} />
      </div>
    )
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-primary/10">
          <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{tituloResumen(citasHoy)}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {minutosLibres > 0
              ? `${formatoDuracion(minutosLibres)} sin reservar hoy`
              : "Tu agenda de hoy está completa"}
          </p>
        </div>
      </div>

      <LineaDeTiempoDia franjas={horarioHoy} citas={citasHoyLista} />
    </div>
  )
}
