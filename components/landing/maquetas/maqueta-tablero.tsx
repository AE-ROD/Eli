"use client"

import { useEffect, useId, useState } from "react"
import { motion } from "framer-motion"
import { Plus } from "lucide-react"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { useCoincideMedia } from "@/components/movimiento/usar-coincide-media"
import { cn } from "@/lib/utils"

interface PropsDeMaqueta {
  /** Su paso está a la vista: corre la animación. Al dejar de estarlo, vuelve al principio. */
  activa: boolean
}

interface TarjetaDelTablero {
  nombre: string
  servicio: string
  detalle: string
  sinReserva?: boolean
}

type IdDeColumna = "reservas" | "espera" | "atencion" | "cobrar" | "finalizado"

interface Columna {
  id: IdDeColumna
  titulo: string
  tarjetas: TarjetaDelTablero[]
  /** Sólo cuando la maqueta tiene lugar para las cinco columnas. */
  soloAncha?: boolean
}

const COLUMNAS: Columna[] = [
  {
    id: "reservas",
    titulo: "Reservas de hoy",
    soloAncha: true,
    tarjetas: [
      { nombre: "Sofía Rojas", servicio: "Manicura", detalle: "16:00" },
      { nombre: "Camila Torres", servicio: "Corte", detalle: "17:30" },
    ],
  },
  { id: "espera", titulo: "En espera", tarjetas: [{ nombre: "Martina L.", servicio: "Peinado", detalle: "Reserva" }] },
  { id: "atencion", titulo: "En atención", tarjetas: [{ nombre: "María G.", servicio: "Color · Lucía", detalle: "Corte · Carla" }] },
  { id: "cobrar", titulo: "Por cobrar", tarjetas: [{ nombre: "Laura Paz", servicio: "Pedicura · Ana", detalle: "$15.000" }] },
  {
    id: "finalizado",
    titulo: "Finalizado",
    soloAncha: true,
    tarjetas: [
      { nombre: "Josefa C.", servicio: "Corte · Carla", detalle: "Cobrado" },
      { nombre: "Daniela S.", servicio: "Manicura · Ana", detalle: "Cobrado" },
    ],
  },
]

/** Llegó sin reserva, se anotó en el momento y es la que pasa a atenderse. */
const PAULA: TarjetaDelTablero = { nombre: "Paula", servicio: "Corte", detalle: "Sin reserva", sinReserva: true }

/** Cuándo pasa Paula a En atención, con la maqueta a la vista. */
const RETRASO_DEL_PASE = 1300

/**
 * El tablero del día en columnas. Paula, que llegó sin reserva, pasa de En
 * espera a En atención. Con poco lugar se ven las tres columnas del medio, y
 * desde 576px de ancho (de la escena, no de la pantalla) las cinco.
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
      className="w-full rounded-[24px] bg-tarjeta p-3 text-left text-navy shadow-md ring-1 ring-borde @xs:p-3.5"
    >
      <div aria-hidden="true">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Hoy · lunes 12</span>
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-navy px-2.5 text-xs font-medium text-white">
            <Plus className="size-3" strokeWidth={2} />
            Anotar visita
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 @xs:gap-1.5 @xl:grid-cols-5">
          {COLUMNAS.map((columna) => {
            const conPaula =
              (columna.id === "espera" && !enAtencion) || (columna.id === "atencion" && enAtencion)
            return (
              <div
                key={columna.id}
                className={cn(
                  "min-h-[188px] min-w-0 rounded-campo bg-superficie px-1 pb-2.5 pt-2 @xs:px-1.5",
                  columna.soloAncha && "hidden @xl:block"
                )}
              >
                <div className="flex justify-between gap-1 px-0.5 text-[10.5px] font-semibold text-texto-2">
                  <span className="truncate">{columna.titulo}</span>
                  {/* En la escena angosta el título necesita todo el ancho. */}
                  <span className="hidden @xs:inline">{columna.tarjetas.length + (conPaula ? 1 : 0)}</span>
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
    <div
      className={cn(
        "mt-1.5 rounded-[10px] bg-tarjeta px-2 py-[7px] text-[11px] leading-[1.3] shadow-sm ring-1 ring-borde/60",
        tarjeta.sinReserva && "border-l-[3px] border-l-naranja"
      )}
    >
      <p className="truncate font-semibold">{tarjeta.nombre}</p>
      <p className="truncate text-[10.5px] text-texto-2">{tarjeta.servicio}</p>
      <p className="truncate text-[10.5px] text-texto-2">{tarjeta.detalle}</p>
    </div>
  )
}
