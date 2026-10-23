"use client"

import { useId } from "react"
import { ArrowRight, Check, ListChecks } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Insignia } from "@/components/comunes/insignia"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { PASOS_DE_INICIO, cuantosHechos, type PasosHechos } from "@/lib/lista-de-inicio"
import { cn } from "@/lib/utils"

/**
 * "Deja tu negocio listo": los cuatro pasos de la puesta en marcha, cada uno
 * marcado solo con lo que el negocio ya hizo. Sólo la ve el dueño, y la
 * pantalla la saca cuando están los cuatro o cuando terminó la prueba
 * (`mostrarListaDeInicio`).
 *
 * Lo hecho se dice en palabras ("Listo") y no sólo con el color o el tilde.
 */
export function ListaDeInicio({ pasos }: { pasos: PasosHechos }) {
  const idDelTitulo = useId()
  const hechos = cuantosHechos(pasos)
  const total = PASOS_DE_INICIO.length

  return (
    <Tarjeta como="section" aria-labelledby={idDelTitulo} className="rounded-panel p-5 sm:p-6">
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Deja tu negocio listo"
        subtitulo="Cuatro pasos para que tus clientes empiecen a reservar solos."
        icono={{ figura: ListChecks }}
      />

      <div className="mt-5 flex items-center gap-3">
        {/*
          La barra se llena con `scaleX` y no con el ancho: se anima sólo
          transform. Con movimiento reducido, globals.css apaga la transición.
        */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={hechos}
          aria-valuetext={`${hechos} de ${total} pasos listos`}
          aria-label="Avance de la puesta en marcha"
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-borde"
        >
          <div
            className="h-full origin-left rounded-full bg-azul transition-transform duration-500 ease-in-out"
            style={{ transform: `scaleX(${hechos / total})` }}
          />
        </div>
        <p aria-hidden="true" className="shrink-0 text-sm font-medium text-navy tabular-nums">
          {hechos} de {total}
        </p>
      </div>

      <ol className="mt-5 divide-y divide-borde">
        {PASOS_DE_INICIO.map((paso, indice) => {
          const hecho = pasos[paso.id]
          return (
            <li key={paso.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-1 last:pb-0">
              <div className="flex min-w-48 flex-1 items-start gap-3">
                {hecho ? (
                  <CuadroDeIcono icono={Check} color="lima" tamano="sm" activo />
                ) : (
                  <span
                    aria-hidden="true"
                    className="inline-grid size-8 shrink-0 place-items-center rounded-[10px] bg-superficie text-sm font-medium text-navy squircle"
                  >
                    {indice + 1}
                  </span>
                )}
                <div className="min-w-0 pt-1">
                  <p className={cn("font-medium text-navy", hecho && "text-texto-2")}>{paso.titulo}</p>
                  {!hecho && <p className="mt-0.5 text-sm text-pretty text-texto-2">{paso.texto}</p>}
                </div>
              </div>
              {hecho ? (
                <Insignia tono="lima">Listo</Insignia>
              ) : (
                <Boton href={paso.accion.href} variante="secundario" tamano="sm" icono={<ArrowRight />}>
                  {paso.accion.texto}
                  <span className="sr-only">: {paso.titulo}</span>
                </Boton>
              )}
            </li>
          )
        })}
      </ol>
    </Tarjeta>
  )
}
