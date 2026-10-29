import Image from "next/image"
import { useId } from "react"
import type { ReactNode } from "react"
import { CalendarCheck, CalendarClock, Clock, Instagram, MapPin, MessageCircle, Navigation, Percent, Wallet } from "lucide-react"
import { Boton, clasesDeBoton } from "@/components/comunes/boton"
import { CLASES_DEL_LOCAL } from "@/components/comunes/colores-del-local"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { estadoDeAtencion, textoDeEstado } from "@/lib/abierto-ahora"
import { formatearMonto } from "@/lib/dinero"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { plazoParaQuienReserva } from "@/lib/gestion-de-cita"
import { CATEGORIA_SIN_NOMBRE, horarioParaMostrar, iniciales, serviciosPorCategoria } from "@/lib/pagina-del-negocio"
import { cn } from "@/lib/utils"
import type { PaginaDelNegocio, ProfesionalPublico } from "./datos-de-la-pagina"

/** El ancla del flujo de reserva, que vive más abajo en la misma página. */
export const ANCLA_DE_RESERVA = "reservar"

/** "Cómo llegar" baja a la ubicación, donde se elige Google Maps o Waze. */
const ANCLA_DE_UBICACION = "ubicacion"

const TITULO_DE_SECCION = "font-serif text-2xl leading-tight font-medium tracking-[-0.5px] text-balance text-navy"

/** Los enlaces que salen de Eli (WhatsApp, mapas, Instagram) abren aparte y no le pasan quién los abrió. */
const AFUERA = { target: "_blank", rel: "noopener noreferrer" } as const

interface PropsDeMiniPagina {
  pagina: PaginaDelNegocio
  /** El instante con que se calcula "Abierto ahora". Lo pasa la página: así esto queda puro. */
  ahora: Date
}

/**
 * La mini página del negocio, arriba del flujo de reserva: cabecera con su
 * color (o su portada), cómo contactarlo y llegar, su equipo, sus servicios
 * por categoría, su horario y sus medios de pago. Cada bloque aparece sólo si
 * hay datos: un negocio recién creado ve su nombre, sus servicios de ejemplo
 * y el botón para reservar.
 */
export function MiniPagina({ pagina, ahora }: PropsDeMiniPagina) {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Cabecera pagina={pagina} ahora={ahora} />
      {pagina.equipo.length > 0 && <Equipo equipo={pagina.equipo} color={pagina.color.clave} />}
      {pagina.servicios.length > 0 && <Servicios servicios={pagina.servicios} />}
      <Datos pagina={pagina} />
    </div>
  )
}

function Cabecera({ pagina, ahora }: PropsDeMiniPagina) {
  const idDelTitulo = useId()
  const estado = estadoDeAtencion(pagina.horario, ahora, pagina.zona)
  const clasesDelColor = CLASES_DEL_LOCAL[pagina.color.clave]

  return (
    <Tarjeta como="section" aria-labelledby={idDelTitulo} className="overflow-hidden">
      <div className={cn("relative h-28 sm:h-40", clasesDelColor)}>
        {pagina.portada && (
          <Image src={pagina.portada} alt="" fill priority sizes="(min-width: 832px) 832px, 100vw" className="object-cover" />
        )}
      </div>

      <div className="px-5 pb-6 sm:px-8 sm:pb-8">
        <div
          className={cn(
            "relative -mt-10 grid size-20 place-items-center overflow-hidden rounded-full text-2xl font-medium ring-4 ring-tarjeta select-none",
            clasesDelColor
          )}
        >
          {pagina.logo ? (
            <Image src={pagina.logo} alt={`Logo de ${pagina.nombre}`} fill sizes="80px" className="object-cover" />
          ) : (
            <span aria-hidden="true">{iniciales(pagina.nombre)}</span>
          )}
        </div>

        <h1 id={idDelTitulo} className="mt-4 font-serif text-[32px] leading-[1.1] font-medium tracking-[-1px] text-balance break-words text-navy md:text-[40px]">
          {pagina.nombre}
        </h1>
        {pagina.comuna && (
          <p className="mt-2 flex items-center gap-1.5 text-texto-2">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            {pagina.comuna}
          </p>
        )}
        {estado && (
          <p
            className={cn(
              "mt-3 inline-flex min-h-8 items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-navy",
              estado.abierto ? "bg-lima-suave" : "bg-superficie"
            )}
          >
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", estado.abierto ? "bg-navy" : "bg-texto-2")} />
            {textoDeEstado(estado)}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Boton href={`#${ANCLA_DE_RESERVA}`} icono={<CalendarCheck />}>
            Reservar
          </Boton>
          {pagina.whatsapp && (
            <Boton href={pagina.whatsapp} variante="secundario" icono={<MessageCircle />} {...AFUERA}>
              WhatsApp
            </Boton>
          )}
          {pagina.instagram && (
            <Boton
              href={pagina.instagram.enlace}
              variante="secundario"
              icono={<Instagram />}
              aria-label={`Instagram: @${pagina.instagram.usuario}`}
              {...AFUERA}
            >
              Instagram
            </Boton>
          )}
          {pagina.mapas && (
            <Boton href={`#${ANCLA_DE_UBICACION}`} variante="secundario" icono={<Navigation />}>
              Cómo llegar
            </Boton>
          )}
        </div>

        {/* El plazo para cancelar o cambiar, dicho antes de reservar (#83). */}
        <p className="mt-4 flex items-start gap-2 text-sm text-texto-2">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {plazoParaQuienReserva(pagina.plazoDeCambiosHoras)}
        </p>
        {/* Hora valle (#89c): sólo que existe; los precios se ven al elegir la hora. */}
        {pagina.horaValle && (
          <p className="mt-2 flex items-start gap-2 text-sm text-texto-2">
            <Percent className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Precios más bajos en horas valle: los verás al elegir la hora.
          </p>
        )}
      </div>
    </Tarjeta>
  )
}

function EnlacesDeMapa({ mapas }: { mapas: NonNullable<PaginaDelNegocio["mapas"]> }) {
  return (
    <>
      <Boton href={mapas.googleMaps} variante="secundario" icono={<Navigation />} aria-label="Cómo llegar con Google Maps" {...AFUERA}>
        Google Maps
      </Boton>
      <Boton href={mapas.waze} variante="secundario" icono={<Navigation />} aria-label="Cómo llegar con Waze" {...AFUERA}>
        Waze
      </Boton>
    </>
  )
}

interface PropsDeBloque {
  titulo: string
  children: ReactNode
  className?: string
  id?: string
}

function Bloque({ titulo, children, className, id }: PropsDeBloque) {
  const idDelTitulo = useId()
  return (
    <Tarjeta como="section" aria-labelledby={idDelTitulo} className={cn("p-6 sm:p-8", className)}>
      {id && <span id={id} className="block scroll-mt-6" aria-hidden="true" />}
      <h2 id={idDelTitulo} className={TITULO_DE_SECCION}>
        {titulo}
      </h2>
      {children}
    </Tarjeta>
  )
}

function Equipo({ equipo, color }: { equipo: ProfesionalPublico[]; color: PaginaDelNegocio["color"]["clave"] }) {
  return (
    <Bloque titulo="Equipo">
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {equipo.map((profesional) => {
          const primerNombre = profesional.nombre.trim().split(/\s+/)[0] || profesional.nombre
          return (
            <li key={profesional.id} className="flex flex-col gap-4 rounded-[24px] bg-superficie p-4 squircle">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-full text-lg font-medium select-none",
                    CLASES_DEL_LOCAL[color]
                  )}
                >
                  {profesional.foto ? (
                    <Image src={profesional.foto} alt="" fill sizes="56px" className="object-cover" />
                  ) : (
                    <span aria-hidden="true">{iniciales(profesional.nombre)}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium break-words text-navy">{profesional.nombre}</span>
                  {profesional.especialidad && (
                    <span className="block text-sm break-words text-texto-2">{profesional.especialidad}</span>
                  )}
                </span>
              </div>
              {/*
                Un `<a>` común y no `Link`: carga la página con el profesional en
                la dirección, así el flujo de reserva nace con él elegido.
              */}
              <a
                href={`?profesional=${encodeURIComponent(profesional.id)}#${ANCLA_DE_RESERVA}`}
                aria-label={`Reservar con ${profesional.nombre}`}
                className={clasesDeBoton({ variante: "secundario", tamano: "sm", className: "w-full bg-tarjeta" })}
              >
                <span className="truncate">Reservar con {primerNombre}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </Bloque>
  )
}

function Servicios({ servicios }: { servicios: PaginaDelNegocio["servicios"] }) {
  const grupos = serviciosPorCategoria(servicios)
  // Si nadie cargó categorías, un solo título "Otros" no ayuda a leer.
  const conTitulos = !(grupos.length === 1 && grupos[0].categoria === CATEGORIA_SIN_NOMBRE)

  return (
    <Bloque titulo="Servicios">
      <div className="mt-5 flex flex-col gap-6">
        {grupos.map((grupo) => (
          <div key={grupo.categoria}>
            {conTitulos && <h3 className="antetitulo mb-2">{grupo.categoria}</h3>}
            <ul className="divide-y divide-borde">
              {grupo.servicios.map((servicio) => (
                <li key={servicio.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium break-words text-navy">{servicio.name}</p>
                    {servicio.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-pretty text-texto-2">{servicio.description}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {servicio.price != null && (
                      <p className="font-medium text-navy tabular-nums">{formatearMonto(servicio.price)}</p>
                    )}
                    <p className="flex items-center justify-end gap-1 text-sm text-texto-2">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {formatearDuracionDeServicio(servicio.duration)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Bloque>
  )
}

function Datos({ pagina }: { pagina: PaginaDelNegocio }) {
  const hayUbicacion = !!(pagina.direccion || pagina.comuna)
  const hayHorario = pagina.horario.length > 0
  const hayMedios = pagina.medios.length > 0
  if (!hayUbicacion && !hayHorario && !hayMedios) return null

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      {hayHorario && (
        <Bloque titulo="Horario" className="md:row-span-2">
          <dl className="mt-5 divide-y divide-borde">
            {horarioParaMostrar(pagina.horario).map((dia) => (
              <div key={dia.dayOfWeek} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <dt className="font-medium text-navy">{dia.dia}</dt>
                <dd className="text-right tabular-nums">
                  {dia.franjas.length === 0 ? (
                    <span className="text-texto-2">Cerrado</span>
                  ) : (
                    dia.franjas.map((franja) => (
                      <span key={franja} className="block text-navy">
                        {franja}
                      </span>
                    ))
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Bloque>
      )}

      {hayUbicacion && (
        <Bloque titulo="Ubicación" id={ANCLA_DE_UBICACION}>
          <p className="mt-4 flex items-start gap-2 text-navy">
            <MapPin className="mt-1 size-4 shrink-0 text-texto-2" aria-hidden="true" />
            <span className="break-words">{[pagina.direccion, pagina.comuna].filter(Boolean).join(", ")}</span>
          </p>
          {pagina.mapas && (
            <div className="mt-4 flex flex-wrap gap-2">
              <EnlacesDeMapa mapas={pagina.mapas} />
            </div>
          )}
        </Bloque>
      )}

      {hayMedios && (
        <Bloque titulo="Medios de pago">
          <ul className="mt-4 flex flex-wrap gap-2">
            {pagina.medios.map((medio) => (
              <li key={medio.id} className="inline-flex h-9 items-center gap-2 rounded-full bg-superficie px-3.5 text-sm font-medium text-navy">
                <Wallet className="size-4 text-texto-2" aria-hidden="true" />
                {medio.nombre}
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </div>
  )
}
