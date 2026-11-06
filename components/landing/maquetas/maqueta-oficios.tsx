import { Avatar, Chip, MarcoDeMaqueta } from "@/components/landing/maquetas/maqueta-piezas"
import { formatearPesos } from "@/lib/precios"
import { cn } from "@/lib/utils"

/** El color lo hace una profesional y el corte otra; quien trabaja solo hace los dos. */
const COLOR = 22000
const CORTE = 15000
const TOTAL = COLOR + CORTE

/**
 * La visita de hoy de una clienta de un salón, con o sin equipo. Con equipo,
 * cada servicio lleva su profesional y su precio; quien trabaja solo la
 * atiende entera. Las dos suman lo mismo. El cambio de una a otra se funde
 * (la fila del corte se pliega), y los datos son de ejemplo.
 */
export function MaquetaVisita({ conEquipo, className }: { conEquipo: boolean; className?: string }) {
  return (
    <MarcoDeMaqueta
      etiqueta={
        conEquipo
          ? `Maqueta: la visita de María González, en atención, con color por Lucía Pérez (${formatearPesos(COLOR)}) y corte por Carla (${formatearPesos(CORTE)}); total ${formatearPesos(TOTAL)}`
          : `Maqueta: la visita de María González, en atención, con color + corte atendido por ti; total ${formatearPesos(TOTAL)}`
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

      <div className="mt-4 border-t border-borde-suave pt-3.5">
        <div className="flex items-center gap-3">
          <Avatar
            tono={conEquipo ? "ciruela" : "pistacho"}
            className="transition-colors duration-400 ease-suave"
          >
            {conEquipo ? "LP" : "Tú"}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold">{conEquipo ? "Color" : "Color + corte"}</p>
            <p className="mt-px text-[12.5px] text-texto-2">{conEquipo ? "Lucía Pérez" : "Atiendes tú"}</p>
          </div>
          <span className="text-[14.5px] font-semibold">{formatearPesos(conEquipo ? COLOR : TOTAL)}</span>
        </div>
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-500 ease-suave",
            conEquipo ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div className="flex items-center gap-3 pt-2">
              <Avatar tono="frambuesa">C</Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold">Corte</p>
                <p className="mt-px text-[12.5px] text-texto-2">Carla</p>
              </div>
              <span className="text-[14.5px] font-semibold">{formatearPesos(CORTE)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-borde-suave pt-3.5">
        <span className="text-[13.5px] font-semibold text-texto-2">Total de la visita</span>
        <span className="text-2xl font-semibold tracking-[-0.04em]">{formatearPesos(TOTAL)}</span>
      </div>
    </MarcoDeMaqueta>
  )
}
