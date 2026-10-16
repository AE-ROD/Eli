"use client"

import { Check, Eye, Link2, Lock } from "lucide-react"
import { Insignia } from "@/components/comunes/insignia"
import {
  Avatar,
  BotonDeMaqueta,
  CabeceraDeMaqueta,
  Circulo,
  Entra,
  FilaDeMaqueta,
  MarcoDeMaqueta,
  PieDeMaqueta,
  Separador,
  TextoDeFila,
} from "./maqueta-piezas"

/*
 * Las cuatro maquetas de la sección del tablero, una por ítem de la lista:
 * las reservas que entran solas, quien llega sin reserva, lo que ve un
 * profesional y quién cobra.
 */

const RESERVAS_DE_HOY = [
  { hora: "10:30", cliente: "María González", servicio: "Color + corte", nueva: false, retraso: 0.1 },
  { hora: "12:00", cliente: "Sofía Rojas", servicio: "Manicura", nueva: false, retraso: 0.25 },
  { hora: "16:00", cliente: "Camila Torres", servicio: "Corte", nueva: true, retraso: 0.7 },
] as const

export function MaquetaReservasDeHoy() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: columna Reservas de hoy con tres reservas que entraron solas">
      <CabeceraDeMaqueta titulo="Reservas de hoy">
        <Insignia>3</Insignia>
      </CabeceraDeMaqueta>
      {RESERVAS_DE_HOY.map((reserva) => (
        <Entra key={reserva.hora} retraso={reserva.retraso}>
          <FilaDeMaqueta className="mt-2">
            <span className="w-10 shrink-0 font-semibold tabular-nums">{reserva.hora}</span>
            <TextoDeFila titulo={reserva.cliente} detalle={reserva.servicio} />
            <Insignia tono={reserva.nueva ? "naranja" : "gris"}>{reserva.nueva ? "Nueva" : "Reserva"}</Insignia>
          </FilaDeMaqueta>
        </Entra>
      ))}
      <PieDeMaqueta icono={<Link2 />}>Entran desde tu página de reservas</PieDeMaqueta>
    </MarcoDeMaqueta>
  )
}

function CampoDeMaqueta({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-[12px] px-2.5 py-2 ring-1 ring-borde ring-inset">
      <span className="block text-xs text-texto-2">{etiqueta}</span>
      <span className="font-medium">{valor}</span>
    </div>
  )
}

export function MaquetaAnotarVisita() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: se anota a Paula, que llegó sin reserva, y entra a En espera">
      <p className="text-sm font-semibold">Anotar visita</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <CampoDeMaqueta etiqueta="Nombre" valor="Paula" />
        <CampoDeMaqueta etiqueta="Servicio" valor="Corte · $15.000" />
      </div>
      <BotonDeMaqueta>Anotar en espera</BotonDeMaqueta>
      <Separador />
      <div className="flex items-center justify-between gap-2.5">
        <span className="font-semibold">En espera</span>
        <Insignia>2</Insignia>
      </div>
      <FilaDeMaqueta className="mt-2">
        <TextoDeFila titulo="Valentina Medina" detalle="Peinado · llegó 10:58" />
        <Insignia>Reserva</Insignia>
      </FilaDeMaqueta>
      <Entra retraso={0.9}>
        <FilaDeMaqueta className="mt-2">
          <TextoDeFila titulo="Paula" detalle="Corte · llegó 11:05" />
          <Insignia tono="naranja">Sin reserva</Insignia>
        </FilaDeMaqueta>
      </Entra>
    </MarcoDeMaqueta>
  )
}

const MIS_SERVICIOS = [
  { cliente: "María González", servicio: "Corte · 11:15", precio: "$15.000", retraso: 0.15 },
  { cliente: "Paula", servicio: "Corte · 11:40", precio: "$15.000", retraso: 0.3 },
] as const

export function MaquetaVistaDeProfesional() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: la vista de Carla, profesional, con sólo sus servicios del día">
      <div className="flex items-center gap-2.5">
        <Avatar color="turquesa">C</Avatar>
        <span>
          <span className="block text-sm font-semibold">Carla</span>
          <span className="text-xs text-texto-2">Profesional</span>
        </span>
        <Insignia className="ml-auto">Mis servicios</Insignia>
      </div>
      <Separador />
      {MIS_SERVICIOS.map((servicio) => (
        <Entra key={servicio.servicio} retraso={servicio.retraso}>
          <FilaDeMaqueta className="mt-2">
            <TextoDeFila titulo={servicio.cliente} detalle={servicio.servicio} />
            <span className="font-semibold">{servicio.precio}</span>
          </FilaDeMaqueta>
        </Entra>
      ))}
      <PieDeMaqueta icono={<Eye />}>Lo de otros profesionales no aparece en su vista</PieDeMaqueta>
    </MarcoDeMaqueta>
  )
}

const QUIEN_COBRA = [
  { rol: "Dueño", cobra: true },
  { rol: "Encargado", cobra: true },
  { rol: "Profesional", cobra: false },
] as const

export function MaquetaQuienCobra() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: visita por cobrar; cobran el dueño y el encargado, el profesional no">
      <CabeceraDeMaqueta titulo="Por cobrar · María G.">
        <span className="font-semibold">$37.000</span>
      </CabeceraDeMaqueta>
      <p className="mt-0.5 text-xs text-texto-2">Color · Lucía Pérez — Corte · Carla</p>
      <BotonDeMaqueta>Cobrar</BotonDeMaqueta>
      <Separador />
      <p className="text-xs font-semibold">Quién puede cobrar</p>
      {QUIEN_COBRA.map(({ rol, cobra }) => (
        <div key={rol} className="flex items-center justify-between gap-2.5 border-b border-borde py-2">
          <span className="font-medium">{rol}</span>
          <span className="flex items-center gap-1.5 text-xs text-texto-2">
            {cobra ? "Cobra" : "No cobra"}
            <Circulo tono={cobra ? "lima" : "gris"}>{cobra ? <Check /> : <Lock />}</Circulo>
          </span>
        </div>
      ))}
    </MarcoDeMaqueta>
  )
}
