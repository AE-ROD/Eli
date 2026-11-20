"use client"

import { useId } from "react"
import { Check, Sparkles, UserRound, Users, type LucideIcon } from "lucide-react"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import type { ColorDeModulo } from "@/lib/modulos"
import { nombreDePlan, PLANES, type PlanId } from "@/lib/planes"
import type { RubroId } from "@/lib/rubros"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { detalleDePlan, NOTA_DE_LA_PRUEBA } from "./detalle-de-planes"
import { ANILLO_DE_LA_OPCION, MarcaDeElegida } from "./grupo-de-opciones"

/** El ícono y el pastel de cada plan: los mismos que tiene en el modal de precios del panel. */
const ICONO_DE_PLAN: Record<PlanId, { figura: LucideIcon; color: ColorDeModulo }> = {
  independiente: { figura: UserRound, color: "azul" },
  equipo: { figura: Users, color: "turquesa" },
}

interface PropsDeElegirPlan {
  /** El elegido, o `""` mientras no hay ninguno. */
  plan: PlanId | ""
  alElegir: (plan: PlanId) => void
  /**
   * El rubro ya elegido, para escribir "tus odontólogos" y "tu clínica" con
   * sus palabras. Sin rubro, las neutras.
   */
  rubro: RubroId | ""
  /** "Elige un plan", cuando se intenta seguir sin elegir. */
  error?: string
  /** El nombre del grupo, que el lector de pantalla dice al entrar. */
  leyenda?: string
}

/** La respuesta corta de cada plan a "¿Trabajas sola/o o con equipo?". */
const RESPUESTA_DE_PLAN: Record<PlanId, string> = {
  independiente: "Sola/o",
  equipo: "Con equipo",
}

const TARJETA =
  "relative cursor-pointer rounded-campo border-[1.5px] bg-tarjeta p-4 text-navy squircle transition-[border-color] duration-150 ease-suave"

/**
 * Elegir el plan al crear la cuenta: dos tarjetas, una por plan, con lo que
 * cuesta (`lib/precios.ts`, IVA incluido y al mes), a quién le sirve y lo que
 * permite. Es obligatorio: sin plan no se avanza, y el mensaje va debajo.
 *
 * Son radios nativos, como `GrupoDeOpciones`: el lector de pantalla dice cuál
 * está elegido y cuántos hay, Tab entra al grupo y las flechas pasan de una
 * tarjeta a otra, sin código extra. Cada radio se llama como su plan y lee el
 * detalle (descripción, precio y viñetas) como descripción, no como parte del
 * nombre. El nombre del plan es la etiqueta del radio y se estira sobre la
 * tarjeta entera, así que se elige tocándola en cualquier lado sin meter la
 * lista de viñetas dentro de un `<label>`.
 *
 * Arriba de las tarjetas va la pregunta simple ("¿Trabajas sola/o o con
 * equipo?") con dos botones grandes que eligen lo mismo que los radios: quien
 * no quiere leer precios y viñetas responde y sigue. Son botones con
 * `aria-pressed`, fuera del grupo de radios, y lo que se envía es el mismo plan.
 */
export function ElegirPlan({ plan, alElegir, rubro, error, leyenda = "Tu plan" }: PropsDeElegirPlan) {
  const base = useId()
  const nombreDelGrupo = base
  const idDeLaLeyenda = `${base}-leyenda`
  const idDelError = `${base}-error`
  const idDeLaPregunta = `${base}-pregunta`
  const { palabras } = vocabularioDe(rubro)

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div role="group" aria-labelledby={idDeLaPregunta}>
        <p id={idDeLaPregunta} className={cn(CLASES_DE_ETIQUETA, "mb-2")}>
          ¿Trabajas sola/o o con equipo?
        </p>
        <div className="grid grid-cols-2 gap-3">
          {PLANES.map((id) => {
            const icono = ICONO_DE_PLAN[id]
            const esElElegido = plan === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={esElElegido}
                onClick={() => alElegir(id)}
                className={cn(
                  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-campo border-[1.5px] bg-tarjeta p-4 text-center text-navy squircle anillo-foco transition-[border-color] duration-150 ease-suave",
                  esElElegido ? "border-navy" : "border-borde hover:border-texto-2"
                )}
              >
                <CuadroDeIcono icono={icono.figura} color={icono.color} activo={esElElegido} />
                <span className="text-base font-medium">{RESPUESTA_DE_PLAN[id]}</span>
                <span className="text-xs text-texto-2">Plan {nombreDePlan(id)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/*
        `radiogroup` y no el `group` de siempre: es el rol que admite
        `aria-invalid` y `aria-required`. Con el rol cambiado, el nombre del
        grupo se ata a la leyenda a mano.
      */}
      <fieldset
        role="radiogroup"
        aria-labelledby={idDeLaLeyenda}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idDelError : undefined}
        className="min-w-0"
      >
        <legend id={idDeLaLeyenda} className={cn(CLASES_DE_ETIQUETA, "mb-2")}>
          {leyenda}
        </legend>

        <div className="flex flex-col gap-3">
          {PLANES.map((id) => {
            const detalle = detalleDePlan(id, palabras)
            const icono = ICONO_DE_PLAN[id]
            const esElElegido = plan === id
            const idDelRadio = `${base}-${id}`
            const idDelDetalle = `${idDelRadio}-detalle`

            return (
              <div
                key={id}
                className={cn(
                  TARJETA,
                  ANILLO_DE_LA_OPCION,
                  esElElegido ? "border-navy" : "border-borde hover:border-texto-2"
                )}
              >
                <input
                  type="radio"
                  id={idDelRadio}
                  name={nombreDelGrupo}
                  value={id}
                  checked={esElElegido}
                  onChange={() => alElegir(id)}
                  aria-describedby={error ? `${idDelDetalle} ${idDelError}` : idDelDetalle}
                  className="sr-only"
                />
                <div className="flex items-center gap-3">
                  <CuadroDeIcono icono={icono.figura} color={icono.color} activo={esElElegido} />
                  <label
                    htmlFor={idDelRadio}
                    className="min-w-0 flex-1 cursor-pointer text-lg font-medium after:absolute after:inset-0 after:content-['']"
                  >
                    {detalle.nombre}
                  </label>
                  <MarcaDeElegida elegida={esElElegido} />
                </div>

                <div id={idDelDetalle}>
                  <p className="mt-3 text-sm text-texto-2">{detalle.descripcion}</p>
                  <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-[1.75rem] leading-none font-medium tracking-[-0.5px] tabular-nums">
                      {detalle.precio}
                    </span>
                    <span className="text-sm">al mes</span>
                    <span className="text-xs text-texto-2">· IVA incluido</span>
                  </p>
                  <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                    {detalle.vinetas.map((vineta) => (
                      <li key={vineta} className="flex items-start gap-2">
                        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
                        <span className="min-w-0">{vineta}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="mt-2">
            <ErrorDeCampo id={idDelError}>{error}</ErrorDeCampo>
          </div>
        )}

        <p className="mt-4 flex items-start gap-2.5 rounded-campo bg-superficie px-4 py-3 text-sm font-medium squircle">
          <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          {NOTA_DE_LA_PRUEBA}
        </p>
      </fieldset>
    </div>
  )
}
