import type { CSSProperties, ReactNode } from "react"
import { ArrowDown, Banknote, CalendarDays, Check, ChevronDown, Clock, CreditCard, User } from "lucide-react"
import { Avatar, Chip, CuadroDeTono, TARJETA_DE_MAQUETA } from "@/components/landing/maquetas/maqueta-piezas"
import { cn } from "@/lib/utils"

/*
 * Las cuatro maquetas chicas de "Un día con Eli", una por momento: la
 * reserva, la llegada, la atención y el cobro. Van dentro de la tarjeta de su
 * paso, que ya lo dice con palabras: son decorativas y quien las usa las
 * esconde del lector de pantalla. Los datos son de ejemplo, los mismos de la
 * visita de María González de las otras secciones.
 */

/** La tarjeta blanca chica, de 232px como en el diseño (más angosta si no entra). */
function Tarjeta({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(TARJETA_DE_MAQUETA, "w-[232px] max-w-full rounded-ficha p-3.5", className)}>{children}</div>
}

function Campo({ titulo, ancho, icono }: { titulo: string; ancho: string; icono: ReactNode }) {
  return (
    <div className="mb-[11px]">
      <p className="mb-[5px] text-[11px] font-semibold text-texto-2">{titulo}</p>
      <div className="flex h-[34px] items-center justify-between rounded-[11px] border border-borde bg-crema px-2.5 text-texto-2">
        <span className={cn("h-[7px] rounded-full bg-borde", ancho)} />
        {icono}
      </div>
    </div>
  )
}

/** La página de reservas: servicio, día y hora, y sus datos. */
export function MaquetaMomentoReserva() {
  return (
    <Tarjeta className="pb-1.5">
      <Campo titulo="Servicio" ancho="w-[92px]" icono={<ChevronDown className="size-3.5" strokeWidth={1.75} />} />
      <Campo titulo="Día y hora" ancho="w-[70px]" icono={<CalendarDays className="size-3.5" strokeWidth={1.75} />} />
      <Campo titulo="Sus datos" ancho="w-[104px]" icono={<User className="size-3.5" strokeWidth={1.75} />} />
    </Tarjeta>
  )
}

/** "Llegó" pasa la reserva a En espera. El botón late en pistacho. */
export function MaquetaMomentoLlegada() {
  return (
    <Tarjeta>
      <p className="mb-2 text-[11px] font-semibold text-texto-2">Reservas de hoy</p>
      <div className="flex items-center gap-[9px]">
        <Avatar tono="ciruela" tamano="sm" className="size-[30px]">
          MG
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">María González</p>
          <p className="text-[11px] text-texto-2">10:30</p>
        </div>
        <span
          className="animate-latido rounded-[10px] bg-pistacho px-[11px] py-1.5 text-xs font-semibold text-navy"
          style={{ "--duracion": "2.6s", "--latido": "color-mix(in srgb, var(--color-pistacho) 65%, transparent)" } as CSSProperties}
        >
          Llegó
        </span>
      </div>
      <div className="my-[9px] mb-[7px] flex justify-center">
        <CuadroDeTono tono="pistacho" className="size-6 rounded-full">
          <ArrowDown className="size-3.5" strokeWidth={1.75} />
        </CuadroDeTono>
      </div>
      <p className="mb-[7px] flex items-center gap-[5px] text-[11px] font-semibold text-texto-2">
        <Clock className="size-3" strokeWidth={1.75} />
        En espera
      </p>
      <div className="flex items-center gap-[9px] rounded-[12px] border-[1.5px] border-dashed border-frambuesa/45 bg-frambuesa-suave/40 px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">María González</span>
        <Chip tono="frambuesa" className="px-2 py-[3px] text-[10.5px]">
          En espera
        </Chip>
      </div>
    </Tarjeta>
  )
}

/** Cada servicio de la visita, con su profesional; después, a cobrar. */
export function MaquetaMomentoAtencion() {
  return (
    <Tarjeta>
      <div className="mb-2 flex items-center gap-2.5 rounded-[12px] bg-ciruela-suave/55 px-2.5 py-2">
        <Avatar tono="ciruela" tamano="sm" className="size-[30px] bg-tarjeta">
          LP
        </Avatar>
        <p className="text-[13px] font-semibold">Color · Lucía</p>
      </div>
      <div className="flex items-center gap-2.5 rounded-[12px] bg-frambuesa-suave/60 px-2.5 py-2">
        <Avatar tono="frambuesa" tamano="sm" className="size-[30px] bg-tarjeta">
          C
        </Avatar>
        <p className="text-[13px] font-semibold">Corte · Carla</p>
      </div>
      <div className="mt-3 flex justify-center">
        <Chip tono="pistacho" className="px-3 py-1.5">
          <CreditCard className="size-[13px]" strokeWidth={1.75} />
          Por cobrar
        </Chip>
      </div>
    </Tarjeta>
  )
}

/** El pago dividido entre efectivo y débito, y la visita finalizada. */
export function MaquetaMomentoCobro() {
  return (
    <Tarjeta>
      <div className="flex items-center gap-2.5 py-[7px]">
        <CuadroDeTono tono="pistacho">
          <Banknote className="size-[15px]" strokeWidth={1.75} />
        </CuadroDeTono>
        <span className="flex-1 text-[13px] font-semibold">Efectivo</span>
        <span className="text-[13px] font-semibold">$20.000</span>
      </div>
      <div className="flex items-center gap-2.5 border-t border-borde-suave py-[7px]">
        <CuadroDeTono tono="ciruela">
          <CreditCard className="size-[15px]" strokeWidth={1.75} />
        </CuadroDeTono>
        <span className="flex-1 text-[13px] font-semibold">Débito</span>
        <span className="text-[13px] font-semibold">$17.000</span>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-borde-suave pt-[11px]">
        <Chip tono="listo" className="px-3 py-1.5">
          <Check className="size-[13px]" strokeWidth={1.75} />
          Finalizado
        </Chip>
        <span className="text-[15px] font-semibold tracking-[-0.02em]">$37.000</span>
      </div>
    </Tarjeta>
  )
}
