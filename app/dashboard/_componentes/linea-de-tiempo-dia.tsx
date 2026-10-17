"use client"

import { TarjetaCita, type CitaEnTarjeta } from "@/components/panel/tarjeta-cita"
import { formatearHora, duracionEnMinutos } from "@/lib/fechas"
import {
  citasFueraDeFranjas,
  formatearTiempoLibre,
  minutosAHora,
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
 * Trama de rayas para los huecos: a propósito distinta del gris liso de una
 * cita, para que "ocupado" y "libre" se distingan de un vistazo y no sólo por
 * el color.
 */
const CLASE_HUECO =
  "rounded-[20px] border-[1.5px] border-dashed border-borde bg-[repeating-linear-gradient(45deg,var(--color-superficie)_0px,var(--color-superficie)_6px,transparent_6px,transparent_14px)] px-3 py-3 squircle"

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
              <p className="py-2 text-center text-xs text-texto-2 tabular-nums">
                {franjaAnterior.endTime}–{franja.startTime} · fuera de tu horario
              </p>
            )}
            <ol className="space-y-2">
              {segmentos.map((segmento) => (
                <li
                  key={
                    segmento.tipo === "cita"
                      ? `cita-${segmento.cita.id}`
                      : `hueco-${segmento.inicioMin}-${segmento.finMin}`
                  }
                  className="flex items-start gap-3"
                >
                  <span className="w-11 shrink-0 pt-3 text-right text-xs text-texto-2 tabular-nums">
                    {minutosAHora(segmento.inicioMin)}
                  </span>
                  <div className="min-w-0 flex-1">
                    {segmento.tipo === "cita" ? (
                      <TarjetaCita cita={citaParaTarjeta(segmento.cita)} compacta />
                    ) : (
                      <div className={CLASE_HUECO}>
                        <p className="text-xs text-texto-2">
                          Hueco · {formatearTiempoLibre(segmento.finMin - segmento.inicioMin)} sin reservar
                        </p>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )
      })}

      {fueraDeHorario.length > 0 && (
        <div className="space-y-2 border-t border-borde pt-4">
          <p className="text-xs text-texto-2">Fuera de tu horario cargado:</p>
          <ul className="space-y-2">
            {fueraDeHorario.map((cita) => (
              <li key={cita.id}>
                <TarjetaCita cita={citaParaTarjeta(cita)} compacta />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
