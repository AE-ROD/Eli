"use client"

import { motion } from "framer-motion"
import { TarjetaCita, type Cita } from "@/components/app/tarjetas/tarjeta-cita"
import { formatHora, duracionMinutos } from "@/lib/utils"
import {
  citasFueraDeFranjas,
  formatoDuracion,
  formatoHHMM,
  segmentosDeFranja,
  type CitaDelDia,
  type FranjaHorario,
} from "@/lib/horario-dia"

interface LineaDeTiempoDiaProps {
  franjas: FranjaHorario[]
  citas: CitaDelDia[]
}

/** Compartida con `vistaDiaProfesional.tsx`: única forma de mapear una cita del endpoint a `TarjetaCita`. */
export function citaParaTarjeta(cita: CitaDelDia): Cita {
  return {
    id: cita.id,
    pacienteNombre: cita.patient?.name ?? "Sin cliente",
    servicio: cita.title,
    horaInicio: formatHora(cita.startTime),
    horaFin: formatHora(cita.endTime),
    duracion: duracionMinutos(cita.startTime, cita.endTime),
    // El endpoint no restringe el string a la unión de TarjetaCita; el estado
    // real siempre es uno de esos valores (columna `status` de Appointment).
    estado: cita.status as Cita["estado"],
  }
}

/**
 * Trama tenue para los huecos: a propósito distinta al borde de color de una
 * cita, para que "ocupado" y "libre" se lean de un vistazo (reglas/02-codigo.md).
 */
const CLASE_HUECO =
  "border border-dashed border-border rounded-lg bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.035)_0px,rgba(0,0,0,0.035)_6px,transparent_6px,transparent_14px)] px-3 py-3"

export function LineaDeTiempoDia({ franjas, citas }: LineaDeTiempoDiaProps) {
  const fueraDeHorario = citasFueraDeFranjas(franjas, citas)

  return (
    <div className="space-y-4">
      {franjas.map((franja, indiceFranja) => {
        const segmentos = segmentosDeFranja(franja, citas)
        const franjaAnterior = franjas[indiceFranja - 1]

        return (
          <div key={`${franja.startTime}-${franja.endTime}`}>
            {franjaAnterior && (
              <p className="text-xs text-muted-foreground/70 text-center py-2">
                {franjaAnterior.endTime}–{franja.startTime} · fuera de tu horario
              </p>
            )}
            <div className="space-y-2">
              {segmentos.map((segmento) => (
                <motion.div
                  key={
                    segmento.tipo === "cita"
                      ? `cita-${segmento.cita.id}`
                      : `hueco-${segmento.inicioMin}-${segmento.finMin}`
                  }
                  className="flex items-start gap-3"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <span className="w-12 shrink-0 pt-2.5 text-xs text-muted-foreground tabular-nums text-right">
                    {formatoHHMM(segmento.inicioMin)}
                  </span>
                  <div className="flex-1 min-w-0">
                    {segmento.tipo === "cita" ? (
                      <TarjetaCita cita={citaParaTarjeta(segmento.cita)} compacta />
                    ) : (
                      <div className={CLASE_HUECO}>
                        <p className="text-xs text-muted-foreground">
                          Hueco · {formatoDuracion(segmento.finMin - segmento.inicioMin)} sin reservar
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )
      })}

      {fueraDeHorario.length > 0 && (
        <div className="pt-2 border-t border-border/50 space-y-2">
          <p className="text-xs text-muted-foreground">
            Fuera de tu horario cargado:
          </p>
          {fueraDeHorario.map((cita) => (
            <TarjetaCita key={cita.id} cita={citaParaTarjeta(cita)} compacta />
          ))}
        </div>
      )}
    </div>
  )
}
