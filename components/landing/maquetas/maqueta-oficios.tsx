import { Avatar, Chip, MarcoDeMaqueta } from "@/components/landing/maquetas/maqueta-piezas"
import { formatearPesos } from "@/lib/precios"
import { cn } from "@/lib/utils"

/** El color lo hace una profesional y el corte otra; quien trabaja solo hace los dos. */
const COLOR = 22000
const CORTE = 15000
const TOTAL = COLOR + CORTE

/**
 * Una línea por servicio, como en el tablero, con o sin equipo: lo que cambia
 * es quién la atiende (cada línea lleva su profesional y su comisión).
 */
const LINEAS = [
  { servicio: "Color", monto: COLOR, profesional: "Lucía Pérez", iniciales: "LP", tono: "ciruela" },
  { servicio: "Corte", monto: CORTE, profesional: "Carla", iniciales: "C", tono: "frambuesa" },
] as const

/**
 * La visita de hoy de una clienta de un salón, con o sin equipo: siempre dos
 * líneas, color y corte, cada una con su precio. Con equipo, cada una con su
 * profesional; quien trabaja solo las atiende las dos. Las dos suman lo
 * mismo. Al cambiar, sólo cambia quién atiende, y los datos son de ejemplo.
 */
export function MaquetaVisita({ conEquipo, className }: { conEquipo: boolean; className?: string }) {
  return (
    <MarcoDeMaqueta
      etiqueta={
        conEquipo
          ? `Maqueta: la visita de María González, en atención, con color por Lucía Pérez (${formatearPesos(COLOR)}) y corte por Carla (${formatearPesos(CORTE)}); total ${formatearPesos(TOTAL)}`
          : `Maqueta: la visita de María González, en atención, con color (${formatearPesos(COLOR)}) y corte (${formatearPesos(CORTE)}), los dos atendidos por ti; total ${formatearPesos(TOTAL)}`
      }
      className={cn("px-5 pb-5 pt-[22px] md:px-6", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar tono="frambuesa" tamano="lg">
            MG
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold tracking-[-0.02em]">María González</p>
            <p className="mt-0.5 text-[12.5px] text-texto-2">Visita de hoy · 10:30</p>
          </div>
        </div>
        <Chip tono="pistacho">En atención</Chip>
      </div>

      <ul className="mt-4 flex flex-col gap-2 border-t border-borde-suave pt-3.5">
        {LINEAS.map((linea) => (
          <li key={linea.servicio} className="flex items-center gap-3">
            <Avatar
              tono={conEquipo ? linea.tono : "pistacho"}
              className="transition-colors duration-400 ease-suave"
            >
              {conEquipo ? linea.iniciales : "Tú"}
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold">{linea.servicio}</p>
              <p className="mt-px text-[12.5px] text-texto-2">{conEquipo ? linea.profesional : "Atiendes tú"}</p>
            </div>
            <span className="text-[14.5px] font-semibold">{formatearPesos(linea.monto)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t border-borde-suave pt-3.5">
        <span className="text-[13.5px] font-semibold text-texto-2">Total de la visita</span>
        <span className="text-2xl font-semibold tracking-[-0.04em]">{formatearPesos(TOTAL)}</span>
      </div>
    </MarcoDeMaqueta>
  )
}
