"use client"

import { motion } from "framer-motion"
import { TarjetaCita, type CitaEnTarjeta } from "@/components/panel/tarjeta-cita"
import { formatearHora, duracionEnMinutos } from "@/lib/fechas"
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

/**
 * Única forma de mapear una cita de las cifras del panel a `TarjetaCita`: la
 * usan esta línea de tiempo, `vista-dia-profesional.tsx` y `citas-de-hoy.tsx`.
 */
export function citaParaTarjeta(cita: CitaDelDia): CitaEnTarjeta {
  return {
    id: cita.id,
    nombreCliente: cita.customer?.name ?? "Sin cliente",
    servicio: cita.title,
    horaInicio: formatearHora(cita.startTime),
    horaFin: formatearHora(cita.endTime),
    duracion: duracionEnMinutos(cita.startTime, cita.endTime),
    // El endpoint no restringe el string a la unión de TarjetaCita; el estado
    // real siempre es uno de esos valores (columna `status` de Appointment).
    estado: cita.status as CitaEnTarjeta["estado"],
  }
}

/**
 * Trama tenue para los huecos: a propósito distinta al borde de color de una
 * cita, para que "ocupado" y "libre" se distingan de un vistazo y no sólo por
 * el color.
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
