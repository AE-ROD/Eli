"use client"

import { useEffect, useReducer, useRef } from "react"
import { motion } from "framer-motion"
import { ArrowUpRight, CalendarDays, Check, RotateCcw } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { EncabezadoDeLanding, SeccionDeLanding } from "@/components/landing/seccion-de-landing"
import { DIAS_DE_PRUEBA, formatearPesos } from "@/lib/precios"
import { CURVA } from "@/components/movimiento/tiempos"
import { cn } from "@/lib/utils"
import {
  DIAS_DE_EJEMPLO,
  ESTADO_INICIAL,
  HORAS_DE_EJEMPLO,
  SERVICIOS_DE_EJEMPLO,
  avanzarLaDemo,
  diaPorId,
  numeroDelPaso,
  servicioPorId,
} from "./demo-de-reserva"

const TITULO_DEL_PASO = {
  1: "1 · Elige un servicio",
  2: "2 · Elige día y hora",
  3: "¡Listo, quedó reservada!",
} as const

/** Un botón de la demo: borde, blanco y, elegido, burdeos. Nunca menos de 44px de alto. */
const OPCION =
  "cursor-pointer rounded-[14px] border border-borde bg-tarjeta text-navy anillo-foco transition-colors duration-150 hover:border-ciruela hover:bg-ciruela-suave"

/**
 * "Reserva como lo haría tu clienta": sólo en el teléfono, debajo de "¿Qué
 * quieres resolver primero?". Un teléfono de maqueta con la página de
 * reservas de un salón de ejemplo, en tres toques: el servicio, la hora y
 * "¡Listo!". Es una demo: todo pasa en el navegador (`demo-de-reserva.ts`),
 * no llama a ninguna API ni guarda nada. En la reserva real la clienta
 * también deja su nombre y su correo; aquí se salta, y lo dice.
 *
 * Al cambiar de paso el foco va al título del paso nuevo (que el teclado y
 * el lector de pantalla no se queden en un botón que ya no está), y una
 * región viva lo anuncia. Con movimiento reducido no hay entrada animada.
 */
export function PruebaReservar() {
  const [estado, despachar] = useReducer(avanzarLaDemo, ESTADO_INICIAL)
  const paso = numeroDelPaso(estado)
  const titulo = useRef<HTMLHeadingElement>(null)
  const primerPaso = useRef(true)

  useEffect(() => {
    // El primer render no mueve el foco: la persona todavía no tocó nada.
    if (primerPaso.current) {
      primerPaso.current = false
      return
    }
    titulo.current?.focus({ preventScroll: true })
  }, [paso])

  const servicio = estado.paso !== "servicio" ? servicioPorId(estado.servicio) : undefined
  const dia = estado.paso !== "servicio" ? diaPorId(estado.dia) : undefined

  return (
    <SeccionDeLanding
      id="prueba-reservar"
      etiquetadaPor="prueba-reservar-titulo"
      className="bg-linear-to-b from-[#EDE1CC] to-[#E0CDB0] md:hidden"
    >
      <EncabezadoDeLanding
        id="prueba-reservar-titulo"
        antetitulo="Pruébalo"
        titulo={
          <>
            Reserva como lo haría <span className="resaltado">tu clienta.</span>
          </>
        }
        subtitulo="Tres toques. Así se ve tu página de reservas."
      />

      <div className="mt-7 overflow-hidden rounded-[28px] border border-borde-suave bg-tarjeta text-navy shadow-maqueta squircle">
        <div className="flex items-center gap-2.5 border-b border-borde-suave px-4 py-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-ciruela text-[13px] font-semibold text-white"
          >
            SA
          </span>
          <p className="min-w-0 text-[14.5px] font-semibold leading-tight">
            Salón Aurora
            <span className="block text-xs font-normal text-texto-2">Reserva en línea · datos de ejemplo</span>
          </p>
        </div>

        <div aria-hidden="true" className="flex gap-[5px] px-4 pt-3">
          {[1, 2, 3].map((numero) => (
            <span
              key={numero}
              className={cn(
                "h-[5px] flex-1 rounded-full transition-colors duration-300",
                numero <= paso ? "bg-frambuesa" : "bg-pistacho-suave"
              )}
            />
          ))}
        </div>

        <p className="sr-only" aria-live="polite">
          Paso {paso} de 3
        </p>
        {/* Cada paso entra desde la derecha; con movimiento reducido, `MotionConfig` lo deja quieto. */}
        <motion.div
          key={paso}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: CURVA.suave }}
          className="px-4 pb-4 pt-2.5"
        >
          <h3
            ref={titulo}
            tabIndex={-1}
            className={cn(
              "text-[17px] font-semibold tracking-[-0.02em] outline-none",
              paso === 3 ? "mt-1 text-center" : "mb-2.5 mt-0.5"
            )}
          >
            {paso === 3 && (
              <motion.span
                aria-hidden="true"
                initial={{ scale: 0.3 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 16 }}
                className="mx-auto mb-2.5 grid size-[60px] place-items-center rounded-full bg-ciruela text-white"
              >
                <Check className="size-[30px]" strokeWidth={2.25} />
              </motion.span>
            )}
            {TITULO_DEL_PASO[paso]}
          </h3>

          {estado.paso === "servicio" && (
            <ul className="flex flex-col gap-2">
              {SERVICIOS_DE_EJEMPLO.map((opcion) => (
                <li key={opcion.id}>
                  <button
                    type="button"
                    onClick={() => despachar({ tipo: "elegir-servicio", servicio: opcion.id })}
                    className={cn(OPCION, "flex min-h-[58px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left")}
                  >
                    <span>
                      <span className="block text-[15px] font-semibold">{opcion.nombre}</span>
                      <span className="block text-[12.5px] text-texto-2">{opcion.duracion}</span>
                    </span>
                    <span className="text-[15px] font-semibold tabular-nums">{formatearPesos(opcion.precio)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {estado.paso === "hora" && servicio && (
            <>
              <div className="mb-2.5 flex items-center justify-between gap-2 rounded-[12px] bg-crema px-3 py-2.5 text-sm font-semibold">
                <span>{servicio.nombre}</span>
                <span className="tabular-nums">{formatearPesos(servicio.precio)}</span>
              </div>
              <div role="group" aria-label="Día" className="flex gap-1.5">
                {DIAS_DE_EJEMPLO.map((opcion) => {
                  const elegido = opcion.id === estado.dia
                  return (
                    <button
                      key={opcion.id}
                      type="button"
                      aria-pressed={elegido}
                      aria-label={opcion.largo}
                      onClick={() => despachar({ tipo: "elegir-dia", dia: opcion.id })}
                      className={cn(
                        OPCION,
                        "h-[52px] flex-1 text-center text-[12.5px] leading-tight",
                        elegido ? "border-ciruela bg-ciruela text-white/80 hover:bg-ciruela" : "text-texto-2"
                      )}
                    >
                      {opcion.corto}
                      <span className={cn("block text-base font-semibold", elegido ? "text-white" : "text-navy")}>
                        {opcion.numero}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div role="group" aria-label="Hora" className="mt-2 grid grid-cols-3 gap-1.5">
                {HORAS_DE_EJEMPLO.map((hora) => (
                  <button
                    key={hora}
                    type="button"
                    onClick={() => despachar({ tipo: "elegir-hora", hora })}
                    className={cn(OPCION, "h-11 text-sm font-semibold tabular-nums")}
                  >
                    {hora}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[12.5px] leading-snug text-texto-2">
                En la página real, después deja su nombre y su correo.
              </p>
            </>
          )}

          {estado.paso === "listo" && servicio && dia && (
            <div className="text-center">
              <p className="mt-3 rounded-[16px] bg-crema px-3.5 py-3 text-left text-sm leading-normal">
                <span className="font-semibold">{servicio.nombre}</span> · {formatearPesos(servicio.precio)}
                <br />
                <span className="first-letter:uppercase">{dia.largo}</span>, {estado.hora}
                <br />
                <span className="text-[12.5px] text-texto-2">
                  El día antes le llega un recordatorio, si dejó su correo.
                </span>
              </p>
              <p className="mt-2.5 flex items-start gap-2.5 rounded-[14px] bg-ciruela-suave px-3 py-2.5 text-left text-[13px] leading-snug">
                <CalendarDays aria-hidden="true" className="mt-px size-[18px] shrink-0 text-ciruela" strokeWidth={1.75} />
                <span>
                  <span className="font-semibold">Y en tu agenda ya aparece,</span> con su precio. Tú no contestaste
                  ningún mensaje.
                </span>
              </p>
              <button
                type="button"
                onClick={() => despachar({ tipo: "volver-a-probar" })}
                className="mx-auto mt-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-boton px-3 text-[13.5px] font-semibold text-ciruela underline underline-offset-[3px] anillo-foco"
              >
                <RotateCcw aria-hidden="true" className="size-3.5" strokeWidth={2} />
                Volver a probar
              </button>
            </div>
          )}
        </motion.div>
      </div>

      {paso === 3 && (
        <div className="mt-5 flex flex-col items-stretch gap-2">
          <Boton
            href="/crear-cuenta"
            variante="destacado"
            icono={<ArrowUpRight aria-hidden="true" />}
            className="w-full rounded-boton-lg"
          >
            Crear mi página de reservas gratis
          </Boton>
          <p className="text-center text-[13px] text-texto-2">
            Prueba {DIAS_DE_PRUEBA} días gratis, sin tarjeta.
          </p>
        </div>
      )}
    </SeccionDeLanding>
  )
}
