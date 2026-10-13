"use client"

import { Check, Link2, Mail } from "lucide-react"
import { Insignia } from "@/components/comunes/insignia"
import type { ColorDeModulo } from "@/lib/modulos"
import { cn } from "@/lib/utils"
import {
  Avatar,
  BotonDeMaqueta,
  CabeceraDeMaqueta,
  Circulo,
  Entra,
  FilaDeMaqueta,
  MarcoDeMaqueta,
  PasosDeReserva,
  PieDeMaqueta,
  Separador,
  TextoDeFila,
} from "./maqueta-piezas"

/*
 * Las escenas del carrusel de oficios, una por historia: el salón, la
 * barbería, el spa de uñas, quien trabaja solo y quien tiene equipo.
 */

const SERVICIOS_DE_LA_VISITA: readonly {
  servicio: string
  profesional: string
  iniciales: string
  color: ColorDeModulo
  monto: string
  retraso: number
}[] = [
  { servicio: "Color", profesional: "Lucía Pérez", iniciales: "LP", color: "lila", monto: "$22.000", retraso: 0.2 },
  { servicio: "Corte", profesional: "Carla", iniciales: "C", color: "turquesa", monto: "$15.000", retraso: 0.45 },
]

export function MaquetaVisitaCompartida() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: visita de color y corte atendida por dos profesionales">
      <CabeceraDeMaqueta titulo="María González">
        <Insignia tono="naranja">En atención</Insignia>
      </CabeceraDeMaqueta>
      <p className="mt-0.5 text-xs text-texto-2">Visita de hoy · 10:30</p>
      <Separador />
      {SERVICIOS_DE_LA_VISITA.map((linea, indice) => (
        <Entra
          key={linea.servicio}
          retraso={linea.retraso}
          className={cn("flex items-center justify-between gap-2.5", indice > 0 && "mt-2.5")}
        >
          <span className="flex items-center gap-2.5">
            <Avatar color={linea.color}>{linea.iniciales}</Avatar>
            <span>
              <span className="block font-semibold">{linea.servicio}</span>
              <span className="text-xs text-texto-2">{linea.profesional}</span>
            </span>
          </span>
          <span className="font-semibold">{linea.monto}</span>
        </Entra>
      ))}
      <Separador />
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-xs text-texto-2">Total de la visita</span>
        <span className="text-lg font-semibold">$37.000</span>
      </div>
    </MarcoDeMaqueta>
  )
}

export function MaquetaFilaDeEspera() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: una reserva por llegar y dos clientes en espera, uno sin reserva">
      <p className="text-xs font-semibold text-texto-2">Reservas de hoy</p>
      <FilaDeMaqueta className="mt-2">
        <TextoDeFila titulo="Diego Muñoz" detalle="Corte + barba · 10:30" />
        <Insignia className="bg-navy text-white">Llegó</Insignia>
      </FilaDeMaqueta>
      <p className="mt-3.5 text-xs font-semibold text-texto-2">En espera</p>
      <FilaDeMaqueta className="mt-2">
        <TextoDeFila titulo="Matías Soto" detalle="Barba · llegó 10:02" />
        <Insignia>Reserva</Insignia>
      </FilaDeMaqueta>
      <Entra retraso={0.3}>
        <FilaDeMaqueta className="mt-2">
          <TextoDeFila titulo="Tomás Rivas" detalle="Corte · llegó 10:12" />
          <Insignia tono="naranja">Sin reserva</Insignia>
        </FilaDeMaqueta>
      </Entra>
    </MarcoDeMaqueta>
  )
}

const SERVICIOS_DEL_SPA = [
  { nombre: "Manicura", precio: "$12.000", elegido: false },
  { nombre: "Pedicura", precio: "$15.000", elegido: false },
  { nombre: "Uñas esculpidas", precio: "$25.000", elegido: true },
] as const

export function MaquetaElegirServicio() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: página de reservas con Uñas esculpidas elegido">
      <CabeceraDeMaqueta titulo="Elige tu servicio">
        <span className="text-xs text-texto-2">Paso 1 de 3</span>
      </CabeceraDeMaqueta>
      <PasosDeReserva hechos={1} />
      {SERVICIOS_DEL_SPA.map((servicio, indice) => (
        <div
          key={servicio.nombre}
          className={cn(
            "flex items-center justify-between gap-2.5 rounded-[12px] px-3 py-2.5 ring-inset",
            indice === 0 ? "mt-2.5" : "mt-1.5",
            servicio.elegido ? "ring-2 ring-navy" : "ring-1 ring-borde"
          )}
        >
          <span className={cn("flex items-center gap-2", servicio.elegido && "font-semibold")}>
            {servicio.elegido && (
              <Circulo tono="naranja" className="size-[18px] [&_svg]:size-3">
                <Check />
              </Circulo>
            )}
            {servicio.nombre}
          </span>
          <span className="font-semibold">{servicio.precio}</span>
        </div>
      ))}
      <BotonDeMaqueta>Continuar</BotonDeMaqueta>
      <PieDeMaqueta icono={<Mail />}>Recordatorio por correo antes de la cita</PieDeMaqueta>
    </MarcoDeMaqueta>
  )
}

const CITAS_DEL_DIA = [
  { hora: "09:30", cliente: "Sofía Rojas", servicio: "Manicura" },
  { hora: "11:00", cliente: "Camila Torres", servicio: "Corte" },
  { hora: "15:00", cliente: "Valentina Medina", servicio: "Peinado" },
  { hora: "17:30", cliente: "Josefa Castro", servicio: "Color" },
] as const

export function MaquetaDiaSolo() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: las citas del día y lo cobrado, para quien trabaja solo">
      <CabeceraDeMaqueta titulo="Tu día · lunes 12">
        <Insignia>4 citas</Insignia>
      </CabeceraDeMaqueta>
      {CITAS_DEL_DIA.map((cita) => (
        <div key={cita.hora} className="flex items-center justify-between gap-2.5 border-b border-borde py-[9px]">
          <span className="flex min-w-0 gap-2.5">
            <span className="font-semibold tabular-nums">{cita.hora}</span>
            <span className="truncate">{cita.cliente}</span>
          </span>
          <span className="text-xs text-texto-2">{cita.servicio}</span>
        </div>
      ))}
      <Entra retraso={0.2}>
        <div className="mt-3 flex items-center justify-between gap-2 rounded-[12px] bg-lima-suave px-3 py-2.5 font-semibold">
          <span>Cobrado hoy</span>
          <span>$86.000</span>
        </div>
      </Entra>
    </MarcoDeMaqueta>
  )
}

const EQUIPO: readonly { iniciales: string; nombre: string; rol: string; color: ColorDeModulo }[] = [
  { iniciales: "TÚ", nombre: "Tú", rol: "Dueño", color: "lima" },
  { iniciales: "A", nombre: "Andrea", rol: "Encargado", color: "azul" },
  { iniciales: "LP", nombre: "Lucía Pérez", rol: "Profesional", color: "lila" },
  { iniciales: "C", nombre: "Carla", rol: "Profesional", color: "turquesa" },
]

export function MaquetaEquipo() {
  return (
    <MarcoDeMaqueta etiqueta="Maqueta: equipo con sus roles e invitación por enlace">
      <CabeceraDeMaqueta titulo="Tu equipo">
        <Insignia>4 personas</Insignia>
      </CabeceraDeMaqueta>
      {EQUIPO.map((persona) => (
        <div key={persona.nombre} className="flex items-center justify-between gap-2.5 border-b border-borde py-2">
          <span className="flex items-center gap-2.5">
            <Avatar color={persona.color} tamano="sm">
              {persona.iniciales}
            </Avatar>
            <span className="font-medium">{persona.nombre}</span>
          </span>
          <Insignia>{persona.rol}</Insignia>
        </div>
      ))}
      <BotonDeMaqueta>
        <Link2 />
        Invitar con enlace
      </BotonDeMaqueta>
    </MarcoDeMaqueta>
  )
}
