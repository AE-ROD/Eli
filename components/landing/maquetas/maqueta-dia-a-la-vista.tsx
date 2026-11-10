import type { CSSProperties } from "react"
import { Shield, SquareKanban, User, Users, type LucideIcon } from "lucide-react"
import { Chip, CuadroDeTono, MarcoDeMaqueta, SUAVE_DEL_COBRO } from "@/components/landing/maquetas/maqueta-piezas"
import type { TonoDeLanding } from "@/components/landing/tonos-de-la-landing"
import { cn } from "@/lib/utils"

/*
 * Las dos maquetas de la sección del tablero: las reservas de hoy, que
 * entran solas, y quién puede cobrar. Los datos son de ejemplo.
 */

const RESERVAS = [
  { hora: "10:30", nombre: "María González", servicio: "Color + corte" },
  { hora: "12:00", nombre: "Sofía Rojas", servicio: "Manicura" },
  { hora: "16:00", nombre: "Camila Torres", servicio: "Corte" },
] as const

/**
 * La columna "Reservas de hoy" del tablero. Las filas entran de a una, se
 * quedan y vuelven a entrar, como reservas que llegan solas: es `aparecer`,
 * de CSS, que congela el `animaciones-en-pausa` de la sección.
 */
export function MaquetaReservasDeHoy({ className }: { className?: string }) {
  return (
    <MarcoDeMaqueta
      etiqueta="Maqueta: la columna Reservas de hoy del tablero, con tres reservas que entraron desde la página de reservas"
      className={cn("px-5 pb-2 pt-5 md:px-6", className)}
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase text-texto-2">
          <CuadroDeTono tono="ciruela" className="size-[26px] rounded-[9px]">
            <SquareKanban className="size-3.5" strokeWidth={1.75} />
          </CuadroDeTono>
          Tablero
        </span>
        <span className="text-[13px] font-semibold text-texto-2">
          Reservas de hoy
          <span className="ml-1.5 inline-block min-w-[22px] rounded-full bg-ciruela px-[7px] py-0.5 text-center text-xs text-white">
            {RESERVAS.length}
          </span>
        </span>
      </div>
      {RESERVAS.map((reserva, orden) => (
        <div
          key={reserva.nombre}
          className={cn("flex animate-aparecer items-center gap-3.5 py-[13px]", orden > 0 && "border-t border-borde-suave")}
          style={{ "--retraso": `${orden * 0.5}s` } as CSSProperties}
        >
          <span className="w-[46px] shrink-0 text-[13px] font-semibold text-texto-2">{reserva.hora}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{reserva.nombre}</span>
            <span className="mt-0.5 block truncate text-[12.5px] text-texto-2">{reserva.servicio}</span>
          </span>
          <Chip tono="ciruela">Reserva</Chip>
        </div>
      ))}
    </MarcoDeMaqueta>
  )
}

const QUIEN_COBRA: readonly { rol: string; icono: LucideIcon; tono: TonoDeLanding; cobra: boolean }[] = [
  { rol: "Dueño", icono: Shield, tono: "ciruela", cobra: true },
  { rol: "Encargado", icono: Users, tono: "frambuesa", cobra: true },
  { rol: "Profesional", icono: User, tono: "anil", cobra: false },
]

/** Los tres roles y si cobran: el dueño y el encargado sí, el profesional no (`docs/PRODUCTO.md`). */
export function MaquetaQuienCobra({ className }: { className?: string }) {
  return (
    <MarcoDeMaqueta
      etiqueta="Maqueta: quién puede cobrar. El dueño y el encargado cobran; el profesional no."
      className={cn("px-5 pb-1.5 pt-[18px] md:px-[22px]", className)}
    >
      <p className="mb-1 text-[13px] font-semibold text-texto-2">Quién puede cobrar</p>
      {QUIEN_COBRA.map(({ rol, icono: Icono, tono, cobra }, orden) => (
        <div key={rol} className={cn("flex items-center gap-3 py-[11px]", orden > 0 && "border-t border-borde-suave")}>
          <CuadroDeTono tono={tono} className={cn("size-8 rounded-[11px]", tono === "anil" && SUAVE_DEL_COBRO)}>
            <Icono className="size-4" strokeWidth={1.75} />
          </CuadroDeTono>
          <span className="flex-1 text-[15px] font-semibold">{rol}</span>
          <Chip tono={cobra ? "listo" : "gris"}>{cobra ? "Cobra" : "No cobra"}</Chip>
        </div>
      ))}
    </MarcoDeMaqueta>
  )
}
