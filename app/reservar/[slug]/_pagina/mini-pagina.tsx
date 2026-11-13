import { useId } from "react"
import type { ReactNode } from "react"
import { CalendarCheck, CalendarClock, Clock, Instagram, MapPin, MessageCircle, Navigation, Percent, Wallet } from "lucide-react"
import { Boton, clasesDeBoton } from "@/components/comunes/boton"
import { CLASES_DEL_LOCAL } from "@/components/comunes/colores-del-local"
import { ImagenConRespaldo } from "@/components/comunes/imagen-con-respaldo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { estadoDeAtencion, textoDeEstado } from "@/lib/abierto-ahora"
import { formatearMonto } from "@/lib/dinero"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { plazoParaQuienReserva } from "@/lib/gestion-de-cita"
import {
  CATEGORIA_SIN_NOMBRE,
  horarioParaMostrar,
  iniciales,
  primerNombreDelProfesional,
  serviciosPorCategoria,
  type SedeDeLaPagina,
} from "@/lib/pagina-del-negocio"
import { haceAlgunServicio, textoDeLoQueHace } from "@/lib/servicios-del-profesional"
import { cn } from "@/lib/utils"
import { frasesDeLaPagina } from "../_frases"
import { FRASES_DE_LAS_SEDES } from "../_frases-de-sedes"
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
 *
 * Plan Independiente con dos o más sedes activas (`modoDeSedes`): en vez del
 * horario y la ubicación del negocio, el bloque "Dónde atiendo", con cada sede,
 * su dirección, cómo llegar y sus días y horas, y un botón para reservar en ella.
 * Con una sola sede, o sin sedes, la página es la de siempre; con exactamente
 * una sede activa, su dirección y su comuna ya vienen en `pagina.direccion` y
 * `pagina.comuna` (`leerPaginaDelNegocio`): es la misma de la cita y los correos.
 */
export function MiniPagina({ pagina, ahora }: PropsDeMiniPagina) {
  const sedes = sedesParaMostrar(pagina)
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Cabecera pagina={pagina} ahora={ahora} />
      {sedes.length > 0 && <DondeAtiendo sedes={sedes} />}
      {pagina.equipo.length > 0 && (
        <Equipo equipo={pagina.equipo} servicios={pagina.servicios} color={pagina.color.clave} rubro={pagina.rubro} />
      )}
      {pagina.servicios.length > 0 && <Servicios servicios={pagina.servicios} rubro={pagina.rubro} />}
      <Datos pagina={pagina} conSedes={sedes.length > 0} />
    </div>
  )
}

/** Las sedes que muestra la página: sólo con dos o más sedes activas. En cualquier otro caso, ninguna. */
function sedesParaMostrar(pagina: PaginaDelNegocio): SedeDeLaPagina[] {
  return pagina.modoDeSedes === "varias" ? (pagina.sedes ?? []) : []
}

function Cabecera({ pagina, ahora }: PropsDeMiniPagina) {
  const idDelTitulo = useId()
  const estado = estadoDeAtencion(pagina.horario, ahora, pagina.zona)
  const clasesDelColor = CLASES_DEL_LOCAL[pagina.color.clave]
  // Con varias sedes, las comunas donde atiende y "Cómo llegar" a sus direcciones;
  // si no, la comuna y los mapas del negocio, como siempre.
  const sedes = sedesParaMostrar(pagina)
  const comunas = sedes.length > 0 ? [...new Set(sedes.map((sede) => sede.comuna))].join(", ") : pagina.comuna
  const hayComoLlegar = sedes.length > 0 ? sedes.some((sede) => sede.mapas !== null) : !!pagina.mapas

  return (
    // Dos capas: la portada (o el color del negocio) y, montada sobre ella, la
    // ficha con la foto, el nombre y cómo reservar o llegar.
    <section aria-labelledby={idDelTitulo}>
      <div className={cn("relative h-36 overflow-hidden rounded-tarjeta squircle sm:h-56", clasesDelColor)}>
        {pagina.portada && (
          <ImagenConRespaldo src={pagina.portada} alt="" fill priority sizes="(min-width: 832px) 832px, 100vw" className="object-cover" />
        )}
      </div>

      <Tarjeta
        className={cn(
          "relative mx-3 -mt-14 rounded-[32px] px-5 pb-5 sm:mx-7 sm:-mt-20 sm:rounded-[40px] sm:px-7 sm:pb-6",
          "shadow-[0_1px_0_var(--color-borde),0_22px_40px_-24px_rgb(7_26_49/0.3)]",
          "sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-6"
        )}
      >
        <div
          className={cn(
            "relative -mt-10 grid size-20 place-items-center overflow-hidden rounded-full text-2xl font-medium ring-4 ring-tarjeta select-none sm:-mt-16 sm:size-28 sm:self-start sm:text-4xl sm:ring-[6px]",
            clasesDelColor
          )}
        >
          {pagina.logo ? (
            // Si el logo no carga, las iniciales: el texto alternativo no debe quedar a la vista dentro del círculo.
            <ImagenConRespaldo
              src={pagina.logo}
              alt={`Logo de ${pagina.nombre}`}
              fill
              sizes="(min-width: 640px) 112px, 80px"
              className="object-cover"
              respaldo={<span aria-hidden="true">{iniciales(pagina.nombre)}</span>}
            />
          ) : (
            <span aria-hidden="true">{iniciales(pagina.nombre)}</span>
          )}
        </div>

        <div className="min-w-0 sm:py-4">
        <h1 id={idDelTitulo} className="mt-3 font-serif text-[30px] leading-[1.1] font-medium tracking-[-1px] text-balance break-words text-navy sm:mt-0 md:text-[40px]">
          {pagina.nombre}
        </h1>
        {comunas && (
          <p className="mt-2 flex items-center gap-1.5 text-texto-2">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            {comunas}
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
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:col-span-full sm:mt-2 sm:flex sm:flex-wrap">
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
          {hayComoLlegar && (
            <Boton href={`#${ANCLA_DE_UBICACION}`} variante="secundario" icono={<Navigation />}>
              Cómo llegar
            </Boton>
          )}
        </div>

        {/* El plazo para cancelar o cambiar, dicho antes de reservar (#83). */}
        <p className="mt-4 flex items-start gap-2 text-sm text-texto-2 sm:col-span-full">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {plazoParaQuienReserva(pagina.plazoDeCambiosHoras, pagina.rubro)}
        </p>
        {/* Hora valle (#89c): sólo que existe; los precios se ven al elegir la hora. */}
        {pagina.horaValle && (
          <p className="mt-2 flex items-start gap-2 text-sm text-texto-2 sm:col-span-full">
            <Percent className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Precios más bajos en horas valle: los verás al elegir la hora.
          </p>
        )}
      </Tarjeta>
    </section>
  )
}

/**
 * "Cómo llegar" en Google Maps y en Waze. Con varias sedes cada una lleva los
 * suyos, y `sede` (su nombre) los distingue para el lector de pantalla: "Cómo
 * llegar a Centro con Waze". Sin `sede`, los de siempre.
 */
function EnlacesDeMapa({ mapas, sede }: { mapas: NonNullable<PaginaDelNegocio["mapas"]>; sede?: string }) {
  return (
    <>
      <Boton
        href={mapas.googleMaps}
        variante="secundario"
        icono={<Navigation />}
        aria-label={sede ? FRASES_DE_LAS_SEDES.comoLlegar(sede, "Google Maps") : "Cómo llegar con Google Maps"}
        {...AFUERA}
      >
        Google Maps
      </Boton>
      <Boton
        href={mapas.waze}
        variante="secundario"
        icono={<Navigation />}
        aria-label={sede ? FRASES_DE_LAS_SEDES.comoLlegar(sede, "Waze") : "Cómo llegar con Waze"}
        {...AFUERA}
      >
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

/**
 * "Dónde atiendo": cada sede activa con su dirección, cómo llegar y sus días y
 * horas, y un botón que lleva al formulario con ESA sede elegida (`?sede=`, que
 * el formulario revalida contra las sedes del negocio). Es también el destino de
 * "Cómo llegar" de la cabecera. Una sede sin ningún día cargado no se puede
 * reservar todavía y no lleva botón.
 */
function DondeAtiendo({ sedes }: { sedes: SedeDeLaPagina[] }) {
  return (
    <Bloque titulo={FRASES_DE_LAS_SEDES.bloque} id={ANCLA_DE_UBICACION}>
      {/* En el teléfono, un carrusel que se desliza de lado (con el margen del bloque); desde `md`, dos columnas. */}
      <ul className="-mx-6 mt-5 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
        {sedes.map((sede) => {
          const sePuedeReservar = sede.dias.length > 0
          return (
            // `min-w-0`: igual que en Equipo, una dirección larga y sin espacios no ensancha la tarjeta.
            <li key={sede.id} className="flex min-w-0 shrink-0 basis-[80%] snap-start flex-col gap-4 rounded-[24px] bg-superficie p-4 squircle md:basis-auto">
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="font-medium break-words text-navy">{sede.nombre}</h3>
                  <p className="mt-1 flex items-start gap-2 text-sm text-navy">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden="true" />
                    <span className="break-words">{[sede.direccion, sede.comuna].filter(Boolean).join(", ")}</span>
                  </p>
                </div>
                {sePuedeReservar ? (
                  <ul className="text-sm text-texto-2 tabular-nums">
                    {sede.horario.map((linea) => (
                      <li key={linea} className="break-words">
                        {linea}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-texto-2">{FRASES_DE_LAS_SEDES.sinHorario}</p>
                )}
                {sede.mapas && (
                  <div className="flex flex-wrap gap-2">
                    <EnlacesDeMapa mapas={sede.mapas} sede={sede.nombre} />
                  </div>
                )}
              </div>
              {/*
                Un `<a>` común y no `Link`, como "Reservar con …": carga la página con
                la sede en la dirección, así el formulario nace con ella elegida. Con
                `mt-auto` los botones de una fila quedan alineados abajo. En el teléfono
                mide 44px de verdad (`max-sm:min-h-11`, sin el `::after` que estira el `sm`).
              */}
              {sePuedeReservar && (
                <a
                  href={`?sede=${encodeURIComponent(sede.id)}#${ANCLA_DE_RESERVA}`}
                  aria-label={FRASES_DE_LAS_SEDES.reservarEn(sede.nombre)}
                  className={clasesDeBoton({ variante: "primario", tamano: "sm", className: "mt-auto w-full max-sm:min-h-11 max-sm:after:inset-y-0" })}
                >
                  <span className="truncate">{FRASES_DE_LAS_SEDES.reservarAca}</span>
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </Bloque>
  )
}

function Equipo({
  equipo,
  servicios,
  color,
  rubro,
}: {
  equipo: ProfesionalPublico[]
  servicios: PaginaDelNegocio["servicios"]
  color: PaginaDelNegocio["color"]["clave"]
  rubro: PaginaDelNegocio["rubro"]
}) {
  return (
    <Bloque titulo="Equipo">
      {/* En el teléfono, una lista compacta de filas; desde `sm`, tarjetas en dos columnas. */}
      <ul className="mt-4 divide-y divide-borde sm:mt-5 sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0">
        {equipo.map((profesional) => {
          const primerNombre = primerNombreDelProfesional(profesional.nombre)
          // Quien ya no hace ninguno de los servicios que hay no se puede reservar: sin botón que no lleve a nada.
          const sePuedeReservar = haceAlgunServicio(profesional.servicioIds, servicios)
          return (
            // `min-w-0`: en el teléfono la lista es una sola columna sin plantilla y un
            // `<li>` no baja de lo que mide su palabra más larga; sin esto, un nombre
            // de servicio largo y sin espacios ensancha la tarjeta y la saca de la pantalla.
            <li
              key={profesional.id}
              className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 sm:flex-col sm:items-stretch sm:justify-start sm:gap-4 sm:rounded-[24px] sm:bg-superficie sm:p-4 sm:squircle sm:first:pt-4 sm:last:pb-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-none">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full text-base font-medium select-none sm:size-14 sm:text-lg",
                      CLASES_DEL_LOCAL[color]
                    )}
                  >
                    {profesional.foto ? (
                      <ImagenConRespaldo
                        src={profesional.foto}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                        respaldo={<span aria-hidden="true">{iniciales(profesional.nombre)}</span>}
                      />
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
                {/* Qué hace: sus servicios por nombre (con tope) o "todos". Debajo de la foto, a todo el ancho de la tarjeta. */}
                <p className="text-sm text-pretty break-words text-texto-2 max-sm:hidden">{textoDeLoQueHace(profesional.servicioIds, servicios, undefined, rubro)}</p>
              </div>
              {/*
                Un `<a>` común y no `Link`: carga la página con el profesional en
                la dirección, así el flujo de reserva nace con él elegido. Con
                `mt-auto` los botones de una fila quedan alineados abajo aunque
                la línea de "Hace:" ocupe más o menos renglones. En el teléfono el
                botón mide 44px de verdad (`max-sm:min-h-11`, y sin el `::after` que
                estira el `sm`): con el borde de 1,5px el `::after` sólo llegaba a
                ~42px, y 36px de caja no alcanzan para un dedo.
              */}
              {sePuedeReservar && (
                <a
                  href={`?profesional=${encodeURIComponent(profesional.id)}#${ANCLA_DE_RESERVA}`}
                  aria-label={`Reservar con ${profesional.nombre}`}
                  className={clasesDeBoton({ variante: "secundario", tamano: "sm", className: "bg-tarjeta max-sm:min-h-11 max-sm:shrink-0 max-sm:after:inset-y-0 sm:mt-auto sm:w-full" })}
                >
                  <span className="truncate sm:hidden" aria-hidden="true">Reservar</span>
                  <span className="hidden truncate sm:inline">Reservar con {primerNombre}</span>
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </Bloque>
  )
}

function Servicios({ servicios, rubro }: { servicios: PaginaDelNegocio["servicios"]; rubro: PaginaDelNegocio["rubro"] }) {
  const grupos = serviciosPorCategoria(servicios)
  // Si nadie cargó categorías, un solo título "Otros" no ayuda a leer.
  const conTitulos = !(grupos.length === 1 && grupos[0].categoria === CATEGORIA_SIN_NOMBRE)

  return (
    <Bloque titulo={frasesDeLaPagina(rubro).catalogo}>
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

/**
 * Horario, ubicación y medios de pago. Con varias sedes (`conSedes`), el horario y
 * la ubicación son los de cada sede, en "Dónde atiendo": juntarlos acá daría un
 * horario que mezcla lugares y una dirección que no es la de ninguna cita.
 */
function Datos({ pagina, conSedes }: { pagina: PaginaDelNegocio; conSedes: boolean }) {
  const hayUbicacion = !conSedes && !!(pagina.direccion || pagina.comuna)
  const hayHorario = !conSedes && pagina.horario.length > 0
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
