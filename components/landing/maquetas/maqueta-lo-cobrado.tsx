import type { CSSProperties } from "react"
import { Check, RotateCcw } from "lucide-react"
import { Avatar, Chip, CuadroDeTono, MarcoDeMaqueta, Segmentos } from "@/components/landing/maquetas/maqueta-piezas"
import type { TonoDeLanding } from "@/components/landing/tonos-de-la-landing"
import { formatearPesos } from "@/lib/precios"
import { cn } from "@/lib/utils"

/*
 * Las cuatro maquetas de la sección de reportes: la semana, los turnos, cada
 * profesional y las anuladas. Los montos son de ejemplo pero cuadran entre
 * sí: la semana, los turnos y los profesionales suman lo mismo, y en cada
 * gráfico la barra más larga es la del monto mayor (los largos salen de los
 * montos, no se escriben a mano).
 *
 * Las barras crecen, se quedan y se recogen sin fin (`crecer-columna` y
 * `crecer-barra`, de CSS): las congela el `animaciones-en-pausa` de la
 * sección.
 */

const DIAS = [
  { dia: "L", monto: 64000 },
  { dia: "M", monto: 50000 },
  { dia: "M", monto: 73000 },
  { dia: "J", monto: 62000 },
  { dia: "V", monto: 83000 },
  { dia: "S", monto: 76000 },
  { dia: "D", monto: 4000 },
] as const

const TURNOS = [
  { turno: "Mañana", horario: "antes de las 12", monto: 96000, barra: "bg-frambuesa" },
  { turno: "Tarde", horario: "de 12 a 18", monto: 184000, barra: "bg-ciruela" },
  { turno: "Noche", horario: "desde las 18", monto: 132000, barra: "bg-pistacho-oscuro" },
] as const

const PROFESIONALES: readonly { nombre: string; iniciales: string; monto: number; tono: TonoDeLanding; barra: string }[] = [
  { nombre: "Lucía Pérez", iniciales: "LP", monto: 168000, tono: "ciruela", barra: "bg-ciruela" },
  { nombre: "Carla", iniciales: "C", monto: 142000, tono: "frambuesa", barra: "bg-frambuesa" },
  { nombre: "Ana", iniciales: "A", monto: 102000, tono: "pistacho", barra: "bg-pistacho-oscuro" },
]

const sumar = (montos: readonly { monto: number }[]) => montos.reduce((suma, { monto }) => suma + monto, 0)
const mayor = (montos: readonly { monto: number }[]) => Math.max(...montos.map(({ monto }) => monto))

/** Lo cobrado en la semana de ejemplo: lo mismo por día, por turno o por profesional. */
const LO_COBRADO = sumar(DIAS)

const PERIODO = "Del 5 al 11 de octubre"

/** El largo de una barra: su monto contra el mayor del gráfico. */
function largo(monto: number, maximo: number): string {
  return `${(monto / maximo) * 100}%`
}

/** El historial de una semana, con una columna por día y el viernes, el mejor, marcado. */
export function MaquetaSemana({ className }: { className?: string }) {
  const maximo = mayor(DIAS)
  return (
    <MarcoDeMaqueta
      etiqueta={`Maqueta: lo cobrado ${PERIODO.toLowerCase()}, ${formatearPesos(LO_COBRADO)}, con una columna por día; el viernes es el día que más entró`}
      className={cn("px-5 py-5 md:px-[22px]", className)}
    >
      <Segmentos opciones={["Día", "Semana", "Rango"]} elegida="Semana" />
      <p className="mt-3.5 text-[12.5px] text-texto-2">{PERIODO}</p>
      <p className="mt-0.5 text-[34px] font-semibold leading-[1.1] tracking-[-0.04em]">{formatearPesos(LO_COBRADO)}</p>
      <p className="text-[12.5px] text-texto-2">Lo cobrado</p>
      <div className="mt-3 flex gap-1 pt-6">
        {DIAS.map(({ dia, monto }, orden) => {
          const elMejor = monto === maximo
          return (
            <div key={orden} className="relative flex h-[130px] flex-1 flex-col items-center justify-end">
              {elMejor && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-navy px-2 py-[3px] text-[11px] font-semibold text-white"
                  style={{ bottom: `calc(${(monto / maximo) * 105}px + 30px)` }}
                >
                  {formatearPesos(monto)}
                </span>
              )}
              <div
                className={cn(
                  "w-full max-w-7 origin-bottom animate-crecer-columna rounded-t-[9px] rounded-b-[5px]",
                  elMejor ? "bg-ciruela" : "bg-ciruela-claro"
                )}
                style={{ height: `${Math.max(4, (monto / maximo) * 105)}px`, "--retraso": `${orden * 0.08}s` } as CSSProperties}
              />
              <span className={cn("mt-[7px] text-xs", elMejor ? "font-semibold text-navy" : "font-medium text-texto-2")}>
                {dia}
              </span>
            </div>
          )
        })}
      </div>
    </MarcoDeMaqueta>
  )
}

/** Lo cobrado en la semana, por turno: mañana, tarde y noche. */
export function MaquetaTurnos({ className }: { className?: string }) {
  const maximo = mayor(TURNOS)
  return (
    <MarcoDeMaqueta
      etiqueta={`Maqueta: lo cobrado por turno ${PERIODO.toLowerCase()}: ${TURNOS.map((t) => `${t.turno.toLowerCase()}, ${formatearPesos(t.monto)}`).join("; ")}`}
      className={cn("px-5 py-[18px] md:px-[22px]", className)}
    >
      <p className="mb-3 text-[12.5px] font-semibold text-texto-2">Por turno · {PERIODO}</p>
      {TURNOS.map(({ turno, horario, monto, barra }, orden) => (
        <div key={turno} className={cn(orden > 0 && "mt-3")}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">
              {turno} <span className="ml-1 text-xs font-normal text-texto-2">{horario}</span>
            </span>
            <span className="text-sm font-semibold">{formatearPesos(monto)}</span>
          </div>
          <div className="mt-1.5 h-[9px] overflow-hidden rounded-full bg-superficie">
            <div
              className={cn("h-full origin-left animate-crecer-barra rounded-full", barra)}
              style={{ width: largo(monto, maximo), "--retraso": `${orden * 0.12}s` } as CSSProperties}
            />
          </div>
        </div>
      ))}
    </MarcoDeMaqueta>
  )
}

/** Lo que generó cada profesional en la semana. */
export function MaquetaPorProfesional({ className }: { className?: string }) {
  const maximo = mayor(PROFESIONALES)
  return (
    <MarcoDeMaqueta
      etiqueta={`Maqueta: lo cobrado por profesional ${PERIODO.toLowerCase()}: ${PROFESIONALES.map((p) => `${p.nombre}, ${formatearPesos(p.monto)}`).join("; ")}`}
      className={cn("px-5 py-3.5", className)}
    >
      <Segmentos opciones={["Profesional", "Servicio", "Medio de pago"]} elegida="Profesional" />
      <div className="mt-[11px] flex flex-col gap-[9px]">
        {PROFESIONALES.map(({ nombre, iniciales, monto, tono, barra }, orden) => (
          <div key={nombre} className="flex items-center gap-2.5">
            <Avatar tono={tono} tamano="sm">
              {iniciales}
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2 text-[13px] font-semibold">
                <span className="truncate">{nombre}</span>
                <span>{formatearPesos(monto)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-superficie">
                <div
                  className={cn("h-full origin-left animate-crecer-barra rounded-full", barra)}
                  style={{ width: largo(monto, maximo), "--retraso": `${orden * 0.12}s` } as CSSProperties}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </MarcoDeMaqueta>
  )
}

/**
 * Un cobro anulado, con quién, cuándo y por qué. Lo anula la dueña: lo ya
 * cobrado lo anula sólo el dueño (`docs/PRODUCTO.md`, sección 7).
 */
export function MaquetaAnuladas({ className }: { className?: string }) {
  const filas = [
    { titulo: "Quién", valor: "Andrea, dueña" },
    { titulo: "Cuándo", valor: "Sáb 10 oct · 18:42" },
    { titulo: "Por qué", valor: "El mismo pago se registró dos veces." },
  ]
  return (
    <MarcoDeMaqueta
      etiqueta="Maqueta: un cobro anulado de $15.000, con quién lo anuló (Andrea, la dueña), cuándo y por qué"
      className={cn("px-5 py-[18px] md:px-[22px]", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
          <CuadroDeTono tono="frambuesa" className="size-[26px] rounded-[9px]">
            <RotateCcw className="size-3.5" strokeWidth={1.75} />
          </CuadroDeTono>
          Anuladas
        </span>
        <Chip tono="frambuesa" className="px-2.5 py-[3px] text-[11.5px]">
          1 esta semana
        </Chip>
      </div>
      <div className="mt-3.5 flex items-center justify-between gap-3 rounded-[14px] border border-borde-suave bg-crema px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold">Cobro de Laura Paz</span>
          <span className="mt-0.5 block text-xs text-texto-2">Pedicura · Efectivo</span>
        </span>
        <span className="text-sm font-semibold line-through decoration-frambuesa">$15.000</span>
      </div>
      <div className="mt-1.5">
        {filas.map(({ titulo, valor }, orden) => (
          <div key={titulo} className={cn("flex gap-3.5 py-[9px]", orden > 0 && "border-t border-borde-suave")}>
            <span className="w-14 shrink-0 pt-px text-xs text-texto-2">{titulo}</span>
            <span className="flex-1 text-[13.5px] font-semibold leading-[1.35]">{valor}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 flex items-center gap-[7px] text-xs font-semibold text-pistacho-texto">
        <Check className="size-3.5 shrink-0" strokeWidth={1.75} />
        Lo cobrado no se reescribe: el registro queda.
      </p>
    </MarcoDeMaqueta>
  )
}
