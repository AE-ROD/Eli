"use client"

import { useEffect, useId, useState } from "react"
import { motion } from "framer-motion"
import { UserPlus } from "lucide-react"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { useCoincideMedia } from "@/components/movimiento/usar-coincide-media"
import { TARJETA_DE_MAQUETA } from "@/components/landing/maquetas/maqueta-piezas"
import { cn } from "@/lib/utils"

interface PropsDeMaqueta {
  /** Su paso está a la vista: corre la animación. Al dejar de estarlo, vuelve al principio. */
  activa: boolean
}

/** Lo que dice el pie de una tarjeta: una hora, de dónde vino, un monto o que ya se cobró. */
type PieDeTarjeta = { texto: string; tono: "hora" | "reserva" | "sin-reserva" | "monto" | "cobrado" }

const COLOR_DEL_PIE: Record<PieDeTarjeta["tono"], string> = {
  hora: "font-medium text-texto-2",
  reserva: "font-semibold text-ciruela",
  "sin-reserva": "font-semibold text-frambuesa-texto",
  monto: "font-bold text-navy",
  cobrado: "font-semibold text-pistacho-texto",
}

interface TarjetaDelTablero {
  nombre: string
  /** Un servicio por renglón. */
  servicios: readonly string[]
  pie?: PieDeTarjeta
}

type IdDeColumna = "reservas" | "espera" | "atencion" | "cobrar" | "finalizado"

interface Columna {
  id: IdDeColumna
  titulo: string
  /** El fondo del contador, escrito entero. */
  contador: string
  tarjetas: readonly TarjetaDelTablero[]
  /** Sólo cuando la maqueta tiene lugar para las cinco columnas. */
  soloAncha?: boolean
}

const COLUMNAS: readonly Columna[] = [
  {
    id: "reservas",
    titulo: "Reservas de hoy",
    contador: "bg-ciruela",
    soloAncha: true,
    tarjetas: [
      { nombre: "Sofía Rojas", servicios: ["Manicura"], pie: { texto: "16:00", tono: "hora" } },
      { nombre: "Camila Torres", servicios: ["Corte"], pie: { texto: "17:30", tono: "hora" } },
    ],
  },
  {
    id: "espera",
    titulo: "En espera",
    contador: "bg-texto-2",
    tarjetas: [{ nombre: "Martina L.", servicios: ["Peinado"], pie: { texto: "Reserva", tono: "reserva" } }],
  },
  {
    id: "atencion",
    titulo: "En atención",
    contador: "bg-frambuesa-texto",
    tarjetas: [{ nombre: "María G.", servicios: ["Color · Lucía", "Corte · Carla"] }],
  },
  {
    id: "cobrar",
    titulo: "Por cobrar",
    contador: "bg-navy",
    tarjetas: [{ nombre: "Laura Paz", servicios: ["Pedicura · Ana"], pie: { texto: "$15.000", tono: "monto" } }],
  },
  {
    id: "finalizado",
    titulo: "Finalizado",
    contador: "bg-pistacho-texto",
    soloAncha: true,
    tarjetas: [
      { nombre: "Josefa C.", servicios: ["Corte · Carla"], pie: { texto: "Cobrado", tono: "cobrado" } },
      { nombre: "Daniela S.", servicios: ["Manicura · Ana"], pie: { texto: "Cobrado", tono: "cobrado" } },
    ],
  },
]

/**
 * Llegó sin reserva, se anotó en el momento y es la que pasa a atenderse. Va
 * con quién la atiende, como todo lo que está en atención.
 */
const PAULA: TarjetaDelTablero = {
  nombre: "Paula",
  servicios: ["Corte · Carla"],
  pie: { texto: "Sin reserva", tono: "sin-reserva" },
}

/** Cuándo pasa Paula a En atención, con la maqueta a la vista. */
const RETRASO_DEL_PASE = 1300

/**
 * El tablero del día en columnas. Paula, que llegó sin reserva, pasa de En
 * espera a En atención. Con poco lugar se ven las tres columnas del medio, y
 * desde 576px de ancho (del contenedor, no de la pantalla) las cinco.
 */
export function MaquetaTablero({ activa }: PropsDeMaqueta) {
  const idDePaula = useId()
  // Decide dónde se pinta Paula, así que tiene que valer lo mismo que en el
  // servidor mientras se hidrata: `useReducedMotion` ya lee la preferencia en
  // el primer render del cliente y los contadores no coincidían (error #418).
  const reducido = useCoincideMedia("(prefers-reduced-motion: reduce)")
  const [pasoPaula, setPasoPaula] = useState(false)

  // A la vista, Paula pasa al rato; cuando la maqueta se va, vuelve a esperar
  // (ya invisible, después del fundido) para la próxima vez.
  useEffect(() => {
    const espera = window.setTimeout(() => setPasoPaula(activa), activa ? RETRASO_DEL_PASE : DURACION.fundido * 1000)
    return () => window.clearTimeout(espera)
  }, [activa])

  // Con movimiento reducido no hay pase: la maqueta muestra cómo queda.
  const enAtencion = reducido ? true : pasoPaula

  return (
    <div
      role="img"
      aria-label="Maqueta: el tablero del día con las columnas Reservas de hoy, En espera, En atención, Por cobrar y Finalizado"
      className={cn(TARJETA_DE_MAQUETA, "w-full max-w-[650px] p-3 @sm:p-[18px]")}
    >
      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-semibold tracking-[-0.02em] @sm:text-lg">Hoy · lunes 12</span>
          {/* El botón del tablero, con su nombre de verdad. */}
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[12px] bg-ciruela px-3 py-2 text-xs font-semibold text-white @sm:px-3.5">
            <UserPlus className="size-3.5" strokeWidth={2} />
            Anotar sin reserva
          </span>
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-1.5 @sm:gap-2 @xl:grid-cols-5">
          {COLUMNAS.map((columna) => {
            const conPaula = (columna.id === "espera" && !enAtencion) || (columna.id === "atencion" && enAtencion)
            return (
              <div
                key={columna.id}
                className={cn(
                  "min-h-[196px] min-w-0 rounded-[14px] border border-borde-suave bg-crema px-1.5 py-2.5 @sm:px-2",
                  columna.soloAncha && "hidden @xl:block"
                )}
              >
                <div className="flex min-h-[30px] items-start justify-between gap-1">
                  <span className="text-[11px] font-bold leading-tight @sm:text-xs">{columna.titulo}</span>
                  <span
                    className={cn(
                      "grid h-5 min-w-5 shrink-0 place-items-center rounded-[10px] px-1 text-[11px] font-bold text-white",
                      columna.contador
                    )}
                  >
                    {columna.tarjetas.length + (conPaula ? 1 : 0)}
                  </span>
                </div>
                {columna.tarjetas.map((tarjeta) => (
                  <TarjetaDeMaqueta key={tarjeta.nombre} tarjeta={tarjeta} />
                ))}
                {conPaula && (
                  <motion.div
                    layoutId={idDePaula}
                    transition={{ layout: { duration: 0.9, ease: CURVA.suave } }}
                    className="relative z-10"
                  >
                    <TarjetaDeMaqueta tarjeta={PAULA} />
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TarjetaDeMaqueta({ tarjeta }: { tarjeta: TarjetaDelTablero }) {
  return (
    <div className="mt-[7px] rounded-[11px] border border-borde bg-tarjeta px-2 py-2 @sm:px-[9px]">
      <p className="break-words text-xs font-semibold leading-tight">{tarjeta.nombre}</p>
      {tarjeta.servicios.map((servicio) => (
        // Sin cortar con "…": en el teléfono la columna mide ~53px y "Pedicura · Ana" se perdía. Baja de renglón.
        <p key={servicio} className="break-words text-[11px] leading-[1.35] text-texto-2">
          {servicio}
        </p>
      ))}
      {tarjeta.pie && (
        <p className={cn("mt-[3px] break-words text-[11px]", COLOR_DEL_PIE[tarjeta.pie.tono])}>{tarjeta.pie.texto}</p>
      )}
    </div>
  )
}
