"use client"

import { Mail } from "lucide-react"
import { Insignia } from "@/components/comunes/insignia"
import { AparecerAlEntrar, CabeceraDeMaqueta, MarcoDeMaqueta, PieDeMaqueta } from "./maqueta-piezas"

/*
 * El correo de recordatorio, como le llega a quien reservó: el día antes de su
 * cita. El título, los rótulos (Servicio, Fecha, Hora) y el texto salen del
 * correo real (`enviarRecordatorio`, en `lib/email.ts`), sin el nombre del
 * negocio, que no se inventa. Los datos son de ejemplo y los mismos de la
 * reserva de `MaquetaReserva`.
 */

const DETALLE = [
  { rotulo: "Servicio", valor: "Color + corte" },
  { rotulo: "Fecha", valor: "jueves 15 de octubre" },
  { rotulo: "Hora", valor: "10:30" },
] as const

export function MaquetaRecordatorio() {
  return (
    <MarcoDeMaqueta
      etiqueta="Maqueta: el correo de recordatorio que le llega a María el día antes de su cita, con el servicio, la fecha y la hora"
      className="max-w-[360px]"
    >
      <CabeceraDeMaqueta titulo="Tu cita es mañana">
        <Insignia tono="azul">Recordatorio</Insignia>
      </CabeceraDeMaqueta>
      <p className="mt-2.5">
        Hola <strong className="font-semibold">María</strong>, te recordamos que tienes una cita mañana.
      </p>
      <AparecerAlEntrar retraso={0.2} className="mt-3 rounded-[14px] bg-superficie px-3 py-1">
        {DETALLE.map(({ rotulo, valor }) => (
          <div
            key={rotulo}
            className="flex items-center justify-between gap-2.5 border-b border-borde py-2 last:border-b-0"
          >
            <span className="text-xs text-texto-2">{rotulo}</span>
            <span className="font-medium">{valor}</span>
          </div>
        ))}
      </AparecerAlEntrar>
      <AparecerAlEntrar retraso={0.45}>
        <p className="mt-3">¡Te esperamos!</p>
      </AparecerAlEntrar>
      <PieDeMaqueta icono={<Mail />}>Lo manda Eli solo, el día antes</PieDeMaqueta>
    </MarcoDeMaqueta>
  )
}
