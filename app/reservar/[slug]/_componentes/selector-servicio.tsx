"use client"

import { useEffect, useId, useRef, useState } from "react"
import type { Ref } from "react"
import { Check, Clock, Search, X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { formatearMonto } from "@/lib/dinero"
import { formatearDuracionDeServicio } from "@/lib/fechas"
import { SIN_FILTRO, vistaDelCatalogo, type FiltroDeServicios } from "@/lib/servicios-por-categoria"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { frasesDelCatalogo, type FrasesDelCatalogo } from "../_frases"

export interface ServicioPublico {
  id: string
  name: string
  description: string | null
  duration: number
  price: number | null
  /**
   * Texto libre y opcional (`Service.category`): con él el selector ordena los
   * servicios cuando son muchos. La página pública siempre lo manda; el panel
   * (la cita nueva de la Agenda) usa este mismo selector con un catálogo que no
   * la trae, y se ve la grilla de siempre.
   */
  category?: string | null
  /** Clínica dental: urgencia, sólo con horas de hoy. Sólo viene en una clínica. */
  esUrgencia?: boolean
}

interface PropsDeSelectorServicio {
  servicios: ServicioPublico[]
  /** Los elegidos, en el orden en que se eligieron: es el orden en que se hacen. */
  seleccionados: ServicioPublico[]
  /** Elige uno que no estaba o quita uno que estaba. */
  onAlternar: (servicio: ServicioPublico) => void
  /** Cuántos se pueden elegir (#89a). Con el tope lleno, los demás quedan deshabilitados. */
  tope: number
  /**
   * Los que no se pueden sumar a los ya elegidos: nadie del equipo hace la
   * combinación (`serviciosQueNoSePuedenSumar`). Quedan deshabilitados, con
   * `motivoSinCombinacion` a la vista en la tarjeta.
   */
  sinCombinacion?: ReadonlySet<string>
  /** Por qué no se pueden sumar: "Nadie del equipo lo hace junto con lo que elegiste." */
  motivoSinCombinacion?: string
  /**
   * Las frases de la barra de categorías y la búsqueda con las palabras del
   * rubro: "Buscar servicio" / "Buscar motivo", "Todos", "Elegiste:".
   * (`frasesDelFormulario(rubro).paso1.catalogo`). Sin ellas, las de siempre.
   */
  frases?: FrasesDelCatalogo
}

/** Las frases de siempre ("servicio"), para quien no pasa las del rubro. */
const FRASES_DE_SIEMPRE = frasesDelCatalogo(vocabularioDe(null).palabras.servicioDeLaReserva)

/** A dónde va el foco cuando lo que se tocó desaparece (ver el efecto de `focoPendiente`). */
type DestinoDeFoco = { tipo: "elegido"; id: string } | { tipo: "busqueda" } | { tipo: "todos" }

/**
 * Los servicios del negocio, uno por tarjeta, y se pueden elegir varios
 * (hasta `tope`, #89a). Con más de uno, el círculo lleva el número de orden:
 * así se lee en qué orden se harán. El elegido se marca con el
 * azul de la Agenda, un borde navy de 2px y un tilde: el pastel solo no llega
 * al contraste de 3:1 contra el blanco, el borde sí.
 *
 * Los bordes son `inset-ring` y no `border` para que el más grueso del
 * elegido no corra el contenido, y porque `anillo-foco` los conserva al
 * enfocar. El de reposo es del gris de texto secundario, como el de los
 * campos: el gris de los bordes decorativos no se distingue sobre blanco.
 *
 * Una lista larga se ordena por categoría (`lib/servicios-por-categoria.ts`,
 * la misma regla de la mini página). Con 8 servicios o menos, o con una sola
 * categoría, es la grilla de siempre. Con más de 8 y al menos 2 categorías, los
 * servicios van bajo el título de su categoría, con una barra de filtros
 * ("Todos" y una por categoría, con su cantidad; en el teléfono se desplaza de
 * costado). Con más de 12, además, una caja de búsqueda por nombre y
 * descripción. Lo ya elegido nunca desaparece al filtrar: la franja "Elegiste:"
 * lo mantiene a la vista, con un botón para quitar cada uno. El tope y los que
 * no se pueden sumar funcionan igual en los dos modos.
 */
export function SelectorServicio({
  servicios,
  seleccionados,
  onAlternar,
  tope,
  sinCombinacion,
  motivoSinCombinacion = "Nadie del equipo lo hace junto con lo que elegiste.",
  frases = FRASES_DE_SIEMPRE,
}: PropsDeSelectorServicio) {
  const lleno = seleccionados.length >= tope
  const tarjetas = { seleccionados, onAlternar, lleno, sinCombinacion, motivoSinCombinacion }

  const [filtro, setFiltro] = useState<FiltroDeServicios>(SIN_FILTRO)
  const vista = vistaDelCatalogo(servicios, filtro)
  // Si la lista cambia (se eligió a otro profesional, que hace otros servicios) y el
  // filtro ya no vale (su categoría no está, o ya no hay búsqueda), vuelve a "todos".
  // Se ajusta al renderizar; sin cambios, `vista.filtro` es el mismo objeto.
  if (vista.filtro !== filtro) setFiltro(vista.filtro)

  const idDeLaFranja = useId()
  const idDeLosTitulos = useId()
  const cajaDeBusqueda = useRef<HTMLInputElement>(null)
  const botonTodos = useRef<HTMLButtonElement>(null)
  const botonesDeElegidos = useRef(new Map<string, HTMLButtonElement>())
  const focoPendiente = useRef<DestinoDeFoco | null>(null)

  /*
   * Quitar un elegido de la franja, o "Quitar filtros", hace desaparecer el
   * botón tocado, y el foco caía al <body>: con teclado había que volver a
   * recorrer la página. Va al elegido de al lado, a la caja de búsqueda o a
   * "Todos". Corre tras cada pintura, pero sólo hace algo si el gesto lo pidió.
   */
  useEffect(() => {
    const destino = focoPendiente.current
    if (!destino) return
    focoPendiente.current = null
    if (destino.tipo === "elegido") botonesDeElegidos.current.get(destino.id)?.focus()
    else if (destino.tipo === "busqueda") cajaDeBusqueda.current?.focus()
    else botonTodos.current?.focus()
  })

  // Sin agrupar: la grilla de siempre, tal cual.
  if (!vista.agrupado) return <ListaDeTarjetas servicios={servicios} {...tarjetas} />

  const elegirCategoria = (clave: string | null) =>
    setFiltro({ ...filtro, categoria: clave === filtro.categoria ? null : clave })
  const quitarElegido = (servicio: ServicioPublico, indice: number) => {
    const vecino = seleccionados[indice + 1] ?? seleccionados[indice - 1]
    focoPendiente.current = vecino ? { tipo: "elegido", id: vecino.id } : { tipo: "todos" }
    onAlternar(servicio)
  }
  const quitarFiltros = () => {
    focoPendiente.current = { tipo: vista.conBuscador ? "busqueda" : "todos" }
    setFiltro(SIN_FILTRO)
  }

  const sinResultados = vista.resultados.length === 0

  return (
    <div>
      {vista.conBuscador && (
        <CampoFormulario
          ref={cajaDeBusqueda}
          type="search"
          etiqueta={frases.buscar}
          icono={<Search aria-hidden="true" className="size-4" strokeWidth={1.75} />}
          value={filtro.texto}
          onChange={(evento) => setFiltro({ ...filtro, texto: evento.target.value })}
          autoComplete="off"
          enterKeyHint="search"
        />
      )}

      {/*
        La barra de filtros: en el teléfono se desplaza de costado (sin ensanchar la
        página); desde `sm`, los botones pasan a la línea de abajo. El relleno de 8px
        deja lugar al anillo de foco, que `overflow` recortaría.
      */}
      <div
        role="group"
        aria-label={frases.filtrarPorCategoria}
        className={cn(
          "-mx-2 flex gap-2 overflow-x-auto px-2 py-2 sm:flex-wrap sm:overflow-visible",
          vista.conBuscador ? "mt-1" : "-mt-2"
        )}
      >
        <BotonDeFiltro
          ref={botonTodos}
          nombre={frases.todos}
          cantidad={vista.cantidadTotal}
          activo={filtro.categoria === null}
          onClick={() => elegirCategoria(null)}
        />
        {vista.categorias.map((categoria) => (
          <BotonDeFiltro
            key={categoria.clave}
            nombre={categoria.categoria}
            cantidad={categoria.cantidad}
            activo={filtro.categoria === categoria.clave}
            onClick={() => elegirCategoria(categoria.clave)}
          />
        ))}
      </div>

      {/* Siempre en la página: así el lector de pantalla anuncia cuántos resultados hay. */}
      {vista.conBuscador && (
        <div aria-live="polite">
          {vista.conBusqueda &&
            (sinResultados ? (
              <div className="mt-4 flex flex-col items-center gap-4 rounded-boton-lg bg-superficie px-4 py-8 text-center squircle">
                <p className="text-pretty text-navy">{frases.sinResultados}</p>
                <Boton variante="secundario" onClick={quitarFiltros}>
                  {frases.quitarFiltros}
                </Boton>
              </div>
            ) : (
              <p className="mt-2 text-sm text-texto-2">{frases.resultados(vista.resultados.length)}</p>
            ))}
        </div>
      )}

      {/* Lo elegido, a la vista aunque el filtro lo esconda de la lista de abajo. */}
      {seleccionados.length > 0 && (
        <div className="mt-4 rounded-boton-lg bg-azul-suave px-4 py-3 squircle">
          <p id={idDeLaFranja} className="text-sm font-medium text-navy">
            {frases.elegiste}
          </p>
          <ul aria-labelledby={idDeLaFranja} className="mt-2 flex flex-wrap gap-2">
            {seleccionados.map((elegido, indice) => (
              <li key={elegido.id} className="flex min-w-0 max-w-full">
                <button
                  ref={(boton) => {
                    if (boton) botonesDeElegidos.current.set(elegido.id, boton)
                    else botonesDeElegidos.current.delete(elegido.id)
                  }}
                  type="button"
                  aria-label={frases.quitar(elegido.name)}
                  onClick={() => quitarElegido(elegido, indice)}
                  className={cn(
                    "inline-flex min-h-11 max-w-full items-center gap-2 rounded-campo bg-tarjeta py-1.5 pr-3 pl-4 text-left text-sm font-medium text-navy squircle anillo-foco",
                    "transition-colors duration-150 ease-suave inset-ring-1 inset-ring-navy hover:bg-crema"
                  )}
                >
                  <span className="min-w-0 break-words">{elegido.name}</span>
                  <X aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!sinResultados && (
        <div className="mt-5 space-y-6">
          {vista.grupos.map((grupo, indice) => {
            const idDelTitulo = `${idDeLosTitulos}-${indice}`
            return (
              <div key={grupo.clave}>
                <h3 id={idDelTitulo} className="antetitulo">
                  {grupo.categoria} <span className="tabular-nums">({grupo.servicios.length})</span>
                </h3>
                <ListaDeTarjetas className="mt-3" aria-labelledby={idDelTitulo} servicios={grupo.servicios} {...tarjetas} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Un botón de la barra de filtros: el nombre de la categoría y cuántos
 * servicios tiene. Dice si está activo con `aria-pressed`, como los de "¿Con
 * quién?". Mide 44px de alto para el pulgar.
 */
function BotonDeFiltro({
  nombre,
  cantidad,
  activo,
  onClick,
  ref,
}: {
  nombre: string
  cantidad: number
  activo: boolean
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 max-w-full shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-left text-sm font-medium break-words whitespace-nowrap text-navy anillo-foco sm:whitespace-normal",
        "transition-[background-color,box-shadow] duration-150 ease-suave",
        activo ? "bg-azul-suave inset-ring-2 inset-ring-navy" : "bg-tarjeta inset-ring-1 inset-ring-texto-2 hover:bg-crema hover:inset-ring-navy"
      )}
    >
      {nombre}{" "}
      <span className={cn("font-normal tabular-nums", activo ? "text-navy" : "text-texto-2")}>{cantidad}</span>
    </button>
  )
}

/** Las tarjetas de una lista de servicios: la grilla de siempre, sola o bajo el título de una categoría. */
function ListaDeTarjetas({
  servicios,
  seleccionados,
  onAlternar,
  lleno,
  sinCombinacion,
  motivoSinCombinacion,
  className,
  "aria-labelledby": idDelTitulo,
}: {
  servicios: ServicioPublico[]
  seleccionados: ServicioPublico[]
  onAlternar: (servicio: ServicioPublico) => void
  lleno: boolean
  sinCombinacion?: ReadonlySet<string>
  motivoSinCombinacion: string
  className?: string
  "aria-labelledby"?: string
}) {
  return (
    <ul aria-labelledby={idDelTitulo} className={cn("grid gap-3 md:grid-cols-2", className)}>
      {servicios.map((servicio) => {
        const posicion = seleccionados.findIndex((elegido) => elegido.id === servicio.id)
        const elegido = posicion >= 0
        // Sin combinación se dice por qué en la tarjeta; con el tope lleno, ya lo dice el texto de arriba.
        const noSeSuma = !elegido && (sinCombinacion?.has(servicio.id) ?? false)
        const bloqueado = !elegido && (lleno || noSeSuma)
        // El gris secundario da 4,3:1 sobre el azul suave del elegido: ahí el texto chico pasa a navy al 75%.
        const textoSecundario = elegido ? "text-navy/75" : "text-texto-2"
        return (
          // `min-w-0`: en el teléfono la lista es una sola columna sin plantilla; sin esto,
          // un nombre largo y sin espacios ensancha la tarjeta y la saca de la pantalla.
          <li key={servicio.id} className="flex min-w-0">
            <button
              type="button"
              aria-pressed={elegido}
              disabled={bloqueado}
              onClick={() => onAlternar(servicio)}
              className={cn(
                "flex w-full flex-col rounded-boton-lg p-4 text-left text-navy squircle anillo-foco sm:p-5",
                "transition-[background-color,box-shadow] duration-150 ease-suave",
                elegido
                  ? "bg-azul-suave inset-ring-2 inset-ring-navy"
                  : noSeSuma
                    ? // Sin opacidad: el motivo de abajo se tiene que poder leer.
                      "cursor-not-allowed bg-superficie inset-ring-1 inset-ring-borde"
                    : bloqueado
                    ? "cursor-not-allowed bg-tarjeta opacity-60 inset-ring-1 inset-ring-texto-2"
                    : "bg-tarjeta inset-ring-1 inset-ring-texto-2 hover:bg-crema hover:inset-ring-navy"
              )}
            >
              <span className="flex w-full items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-medium break-words">{servicio.name}</span>
                  {/* Sin `block`: le ganaría al `display` de `line-clamp` y el texto no se cortaría. */}
                  {servicio.description && (
                    <span className={cn("mt-1 line-clamp-2 text-sm", textoSecundario)}>{servicio.description}</span>
                  )}
                </span>
                {/* Un círculo vacío que se llena: se lee como una elección entre varias. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ease-suave",
                    elegido ? "bg-azul text-navy" : "inset-ring-[1.5px] inset-ring-texto-2"
                  )}
                >
                  {elegido &&
                    (seleccionados.length > 1 ? (
                      <span className="text-xs font-semibold tabular-nums">{posicion + 1}</span>
                    ) : (
                      <Check className="size-3.5" strokeWidth={2.5} />
                    ))}
                </span>
              </span>
              <span className="mt-auto flex w-full items-center gap-4 pt-4 text-sm">
                <span className={cn("flex items-center gap-1.5", textoSecundario)}>
                  <Clock aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  {formatearDuracionDeServicio(servicio.duration)}
                </span>
                {/* Clínica dental: la urgencia sólo tiene horas de hoy, y se dice antes de elegirla. */}
                {servicio.esUrgencia && (
                  <span className="rounded-sm bg-naranja-suave px-1.5 py-0.5 text-xs font-medium text-navy">Horas de hoy</span>
                )}
                {servicio.price != null && (
                  <span className="ml-auto font-medium tabular-nums">{formatearMonto(servicio.price)}</span>
                )}
              </span>
              {noSeSuma && (
                // Dentro del botón: el lector de pantalla lo lee junto con el nombre, aunque esté deshabilitado.
                <span className="mt-2 block text-sm font-medium text-navy">{motivoSinCombinacion}</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
