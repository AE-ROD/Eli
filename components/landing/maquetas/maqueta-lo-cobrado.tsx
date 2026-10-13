"use client"

import { RotateCcw } from "lucide-react"
import { Insignia } from "@/components/comunes/insignia"
import type { ColorDeModulo } from "@/lib/modulos"
import {
  Avatar,
  Barra,
  CabeceraDeMaqueta,
  Columna,
  Entra,
  MarcoDeMaqueta,
  PieDeMaqueta,
  Segmentos,
} from "./maqueta-piezas"

/*
 * Las cuatro maquetas de la sección de reportes, una por ítem: la semana, los
 * turnos, cada profesional y las anuladas. Los montos son de ejemplo pero
 * cuadran entre sí: la semana, los turnos y los profesionales suman $412.000.
 */

const SEMANA = [
  { dia: "L", miles: 48 },
  { dia: "M", miles: 52 },
  { dia: "M", miles: 44 },
  { dia: "J", miles: 61 },
  { dia: "V", miles: 78 },
  { dia: "S", miles: 92 },
  { dia: "D", miles: 37 },
] as const

const DIA_MAS_ALTO = Math.max(...SEMANA.map((dia) => dia.miles))

export function MaquetaSemana() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: lo cobrado en la semana, $412.000, con una barra por día">
      <Segmentos opciones={["Día", "Semana", "Rango"]} elegida="Semana" />
      <div className="mt-3.5 flex items-end justify-between gap-2.5">
        <span>
          <span className="block text-xs text-texto-2">Del 5 al 11 de octubre</span>
          <span className="text-2xl font-semibold tracking-[-0.5px]">$412.000</span>
        </span>
        <span className="text-xs text-texto-2">Lo cobrado</span>
      </div>
      <div className="mt-3 flex h-[120px] items-end gap-2">
        {SEMANA.map((dia, indice) => (
          // `min-w-0`: el monto puede ser más ancho que su columna y desbordarla
          // a los lados, pero no ensancharla (en un teléfono, siete columnas no entran).
          <div key={`${dia.dia}-${indice}`} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
            {/* Sólo el día más alto lleva su monto; los demás guardan el alto para que las barras arranquen parejas. */}
            {dia.miles === DIA_MAS_ALTO ? (
              <span className="h-[11px] text-[10.5px] leading-none font-semibold whitespace-nowrap">${dia.miles}.000</span>
            ) : (
              <span className="h-[11px]" />
            )}
            <Columna fraccion={dia.miles / DIA_MAS_ALTO} retraso={0.2 + indice * 0.06} />
            <span className="text-[11px] leading-none text-texto-2">{dia.dia}</span>
          </div>
        ))}
      </div>
    </MarcoDeMaqueta>
  )
}

const TURNOS = [
  { nombre: "Mañana", rango: "antes de las 12", monto: "$96.000", fraccion: 96 / 184 },
  { nombre: "Tarde", rango: "de 12 a 18", monto: "$184.000", fraccion: 1 },
  { nombre: "Noche", rango: "desde las 18", monto: "$132.000", fraccion: 132 / 184 },
] as const

export function MaquetaTurnos() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: lo cobrado por turno: mañana $96.000, tarde $184.000 y noche $132.000">
      <CabeceraDeMaqueta titulo="Por turno">
        <span className="text-xs text-texto-2">Del 5 al 11 de octubre</span>
      </CabeceraDeMaqueta>
      {TURNOS.map((turno) => (
        <div key={turno.nombre} className="mt-3.5">
          <div className="flex items-center justify-between gap-2.5">
            <span>
              <span className="font-semibold">{turno.nombre}</span>{" "}
              <span className="text-xs text-texto-2">{turno.rango}</span>
            </span>
            <span className="font-semibold">{turno.monto}</span>
          </div>
          <Barra fraccion={turno.fraccion} className="mt-[7px] h-2.5" />
        </div>
      ))}
    </MarcoDeMaqueta>
  )
}

const POR_PROFESIONAL: readonly {
  iniciales: string
  nombre: string
  monto: string
  fraccion: number
  color: ColorDeModulo
}[] = [
  { iniciales: "LP", nombre: "Lucía Pérez", monto: "$168.000", fraccion: 1, color: "lila" },
  { iniciales: "C", nombre: "Carla", monto: "$142.000", fraccion: 142 / 168, color: "turquesa" },
  { iniciales: "A", nombre: "Ana", monto: "$102.000", fraccion: 102 / 168, color: "azul" },
]

export function MaquetaPorProfesional() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: lo cobrado por profesional: Lucía Pérez, Carla y Ana">
      <Segmentos opciones={["Profesional", "Servicio", "Medio de pago"]} elegida="Profesional" />
      {POR_PROFESIONAL.map((profesional) => (
        <div key={profesional.nombre} className="mt-3.5 flex items-center gap-2.5">
          <Avatar color={profesional.color} tamano="sm">
            {profesional.iniciales}
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2.5">
              <span className="font-medium">{profesional.nombre}</span>
              <span className="font-semibold">{profesional.monto}</span>
            </span>
            <Barra fraccion={profesional.fraccion} className="mt-1.5" />
          </span>
        </div>
      ))}
    </MarcoDeMaqueta>
  )
}

export function MaquetaAnuladas() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: un cobro anulado con quién lo anuló, cuándo y por qué">
      <CabeceraDeMaqueta titulo="Anuladas">
        <Insignia>1 esta semana</Insignia>
      </CabeceraDeMaqueta>
      <Entra retraso={0.15} className="mt-3 rounded-[14px] bg-superficie p-3">
        <div className="flex items-center justify-between gap-2.5">
          <span className="font-semibold">Cobro de Laura Paz</span>
          <span className="font-semibold text-texto-2 line-through">$15.000</span>
        </div>
        <p className="text-xs text-texto-2">Pedicura · Efectivo</p>
        <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-texto-2">Quién</dt>
          <dd>Andrea, encargada</dd>
          <dt className="text-texto-2">Cuándo</dt>
          <dd>Sáb 10 oct · 18:42</dd>
          <dt className="text-texto-2">Por qué</dt>
          <dd>El mismo pago se registró dos veces.</dd>
        </dl>
      </Entra>
      <PieDeMaqueta icono={<RotateCcw />}>Lo cobrado no se reescribe: el registro queda.</PieDeMaqueta>
    </MarcoDeMaqueta>
  )
}
