import type { CSSProperties } from "react"
import { Check, ChevronDown, RotateCcw } from "lucide-react"
import { Avatar, Chip, CuadroDeTono, MarcoDeMaqueta } from "@/components/landing/maquetas/maqueta-piezas"
import type { TonoDeLanding } from "@/components/landing/tonos-de-la-landing"
import { MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import { PERIODOS } from "@/lib/periodos"
import { formatearPesos } from "@/lib/precios"
import { cn } from "@/lib/utils"

/*
 * Las cuatro maquetas de la sección de reportes, fieles a lo que Reportes
 * hace (`app/dashboard/reportes`, `lib/reportes.ts`): el período (hoy, ayer,
 * esta semana, este mes o un rango), el turno como filtro (no hay un gráfico
 * por turno ni por día), los desgloses por profesional, por servicio y por
 * medio de pago, y las anuladas. Los montos son de ejemplo pero cuadran entre
 * sí: los profesionales y los medios suman lo cobrado de la semana, y el
 * turno de la tarde es una parte. En cada gráfico la barra más larga es la
 * del monto mayor (los largos salen de los montos, no se escriben a mano).
 *
 * Las barras crecen, se quedan y se recogen sin fin (`crecer-barra`, de CSS):
 * las congela el `animaciones-en-pausa` de la sección.
 */

const PROFESIONALES: readonly { nombre: string; iniciales: string; monto: number; tono: TonoDeLanding; barra: string }[] = [
  { nombre: "Lucía Pérez", iniciales: "LP", monto: 168000, tono: "ciruela", barra: "bg-ciruela" },
  { nombre: "Carla", iniciales: "C", monto: 142000, tono: "frambuesa", barra: "bg-frambuesa" },
  { nombre: "Ana", iniciales: "A", monto: 102000, tono: "pistacho", barra: "bg-pistacho-oscuro" },
]

/** Lo que entró por cada medio, con los nombres del catálogo (`lib/medios-de-pago.ts`). */
const nombreDelMedio = (id: (typeof MEDIOS_DE_PAGO)[number]["id"]) =>
  MEDIOS_DE_PAGO.find((medio) => medio.id === id)?.nombre ?? id
const MEDIOS = [
  { nombre: nombreDelMedio("tarjeta-debito"), monto: 186000 },
  { nombre: nombreDelMedio("efectivo"), monto: 124000 },
  { nombre: nombreDelMedio("transferencia"), monto: 102000 },
] as const

const sumar = (montos: readonly { monto: number }[]) => montos.reduce((suma, { monto }) => suma + monto, 0)
const mayor = (montos: readonly { monto: number }[]) => Math.max(...montos.map(({ monto }) => monto))

/** Lo cobrado en la semana de ejemplo: lo mismo por profesional que por medio. */
const LO_COBRADO = sumar(PROFESIONALES)
const ATENCIONES = 20
/** Como el resumen de Reportes: lo cobrado entre las atenciones, redondeado. */
const TICKET_PROMEDIO = Math.round(LO_COBRADO / ATENCIONES)

/** El turno elegido en el filtro y lo cobrado en él: una parte de la semana. */
const TURNO = { nombre: "Tarde", horario: "de 12 a 18", monto: 184000, atenciones: 9 }

const PERIODO = "Del 5 al 11 de octubre"
const PERIODO_ELEGIDO = "semana"

/** El largo de una barra: su monto contra el mayor del gráfico. */
function largo(monto: number, maximo: number): string {
  return `${(monto / maximo) * 100}%`
}

/** Una cifra chica del resumen: su título arriba y el valor. */
function Cifra({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-superficie px-3 py-2.5">
      <p className="text-xs text-texto-2">{titulo}</p>
      <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.02em] tabular-nums">{valor}</p>
    </div>
  )
}

/**
 * El período del reporte (los mismos de Reportes: `lib/periodos.ts`), con
 * "Esta semana" elegido, y su resumen: lo cobrado, las atenciones y el
 * ticket promedio.
 */
export function MaquetaPeriodo({ className }: { className?: string }) {
  const elegido = PERIODOS.find((periodo) => periodo.id === PERIODO_ELEGIDO)?.nombre ?? ""
  return (
    <MarcoDeMaqueta
      etiqueta={`Maqueta: el reporte de ${elegido.toLowerCase()}, ${PERIODO.toLowerCase()}: ${formatearPesos(LO_COBRADO)} de ingresos en ${ATENCIONES} atenciones, ticket promedio de ${formatearPesos(TICKET_PROMEDIO)}`}
      className={cn("px-5 py-5 md:px-[22px]", className)}
    >
      {/* Como en Reportes, las opciones se acomodan en varias filas si no caben. */}
      <div className="flex flex-wrap gap-1.5">
        {PERIODOS.map((periodo) => (
          <span
            key={periodo.id}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs",
              periodo.id === PERIODO_ELEGIDO ? "bg-navy font-semibold text-white" : "bg-superficie font-medium text-texto-2"
            )}
          >
            {periodo.nombre}
          </span>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-texto-2">{PERIODO}</p>
      <p className="text-[12.5px] text-texto-2">Ingresos</p>
      <p className="mt-0.5 text-[34px] font-semibold leading-[1.1] tracking-[-0.04em] tabular-nums">
        {formatearPesos(LO_COBRADO)}
      </p>
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <Cifra titulo="Atenciones" valor={String(ATENCIONES)} />
        <Cifra titulo="Ticket promedio" valor={formatearPesos(TICKET_PROMEDIO)} />
      </div>
    </MarcoDeMaqueta>
  )
}

/**
 * El turno es un filtro, no un gráfico: se elige "Tarde" y el resumen muestra
 * lo cobrado en ese turno. "Turno: Tarde → $184.000".
 */
export function MaquetaTurno({ className }: { className?: string }) {
  return (
    <MarcoDeMaqueta
      etiqueta={`Maqueta: el filtro de turno en ${TURNO.nombre.toLowerCase()} (${TURNO.horario}): ${formatearPesos(TURNO.monto)} de ingresos en ${TURNO.atenciones} atenciones, ${PERIODO.toLowerCase()}`}
      className={cn("px-5 py-[18px] md:px-[22px]", className)}
    >
      <p className="text-[12.5px] font-semibold text-texto-2">Turno</p>
      <div className="mt-1.5 flex items-center justify-between gap-2 rounded-[12px] border-[1.5px] border-navy bg-tarjeta px-3 py-2">
        <span className="text-sm font-semibold">
          {TURNO.nombre} <span className="ml-1 text-xs font-normal text-texto-2">{TURNO.horario}</span>
        </span>
        <ChevronDown className="size-4 shrink-0" strokeWidth={1.75} />
      </div>
      <div className="mt-3.5 rounded-[14px] bg-superficie px-3.5 py-3">
        <p className="text-[12.5px] text-texto-2">Ingresos · {PERIODO.toLowerCase()}</p>
        <p className="mt-0.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.035em] tabular-nums">
          {formatearPesos(TURNO.monto)}
        </p>
        <p className="mt-0.5 text-xs text-texto-2">{TURNO.atenciones} atenciones en la tarde</p>
      </div>
    </MarcoDeMaqueta>
  )
}

/** Dos de los tres desgloses del resumen: por profesional y por medio de pago. */
export function MaquetaPorProfesional({ className }: { className?: string }) {
  const maximo = mayor(PROFESIONALES)
  return (
    <MarcoDeMaqueta
      etiqueta={`Maqueta: lo cobrado ${PERIODO.toLowerCase()}, por profesional: ${PROFESIONALES.map((p) => `${p.nombre}, ${formatearPesos(p.monto)}`).join("; ")}; y por medio de pago: ${MEDIOS.map((m) => `${m.nombre.toLowerCase()}, ${formatearPesos(m.monto)}`).join("; ")}`}
      className={cn("px-5 py-3.5", className)}
    >
      <p className="text-[12.5px] font-semibold text-texto-2">Por profesional</p>
      <div className="mt-2 flex flex-col gap-[9px]">
        {PROFESIONALES.map(({ nombre, iniciales, monto, tono, barra }, orden) => (
          <div key={nombre} className="flex items-center gap-2.5">
            <Avatar tono={tono} tamano="sm">
              {iniciales}
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2 text-[13px] font-semibold">
                <span className="truncate">{nombre}</span>
                <span className="tabular-nums">{formatearPesos(monto)}</span>
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
      <p className="mt-3.5 border-t border-borde-suave pt-3 text-[12.5px] font-semibold text-texto-2">Por medio de pago</p>
      <ul className="mt-1.5">
        {MEDIOS.map(({ nombre, monto }) => (
          <li key={nombre} className="flex justify-between gap-2 py-[3px] text-[13px]">
            <span className="min-w-0 truncate font-medium">{nombre}</span>
            <span className="font-semibold tabular-nums">{formatearPesos(monto)}</span>
          </li>
        ))}
      </ul>
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
