"use client"

import { Check, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { FRASES_DE_LAS_SEDES } from "../_frases-de-sedes"
import { direccionConComuna, sedeSePuedeElegir, type SedeParaElegir } from "./reglas-de-la-sede"

interface PropsDeSelectorDeSede {
  sedes: SedeParaElegir[]
  /** El id de la sede elegida, o `null` si todavía no se eligió ninguna. */
  elegida: string | null
  onElegir: (sedeId: string) => void
}

/*
 * Lo elegido, como "¿Con quién?" y la primera vez: el azul suave con borde navy
 * de 2px. El color nunca va solo: `aria-pressed` dice cuál está elegida, la
 * elegida va en negrita y lleva un tilde.
 */
const ELEGIDA = "bg-azul-suave inset-ring-2 inset-ring-navy"
const EN_REPOSO = "bg-tarjeta inset-ring-1 inset-ring-texto-2 hover:bg-azul-suave hover:inset-ring-navy"
const SIN_HORARIO = "cursor-not-allowed bg-superficie inset-ring-1 inset-ring-borde"

/**
 * "¿Dónde?": una tarjeta por sede con su nombre, su dirección y los días y
 * horas en que se atiende. Son botones que dicen cuál está elegido
 * (`aria-pressed`), como el resto del formulario; cada uno mide al menos 44px
 * de alto. Una sede sin ningún día cargado no se puede elegir (no tendría
 * horas que ofrecer) y lo dice.
 */
export function SelectorDeSede({ sedes, elegida, onElegir }: PropsDeSelectorDeSede) {
  return (
    <div role="group" aria-label={FRASES_DE_LAS_SEDES.grupo} className="grid gap-3 @[32rem]:grid-cols-2">
      {sedes.map((sede) => {
        const activa = sede.id === elegida
        const sePuede = sedeSePuedeElegir(sede)
        return (
          <button
            key={sede.id}
            type="button"
            aria-pressed={activa}
            disabled={!sePuede}
            onClick={() => onElegir(sede.id)}
            className={cn(
              "flex min-h-11 min-w-0 flex-col gap-2.5 rounded-campo p-4 text-left text-sm text-navy squircle anillo-foco",
              "transition-[background-color,box-shadow] duration-150 ease-suave",
              !sePuede ? SIN_HORARIO : activa ? ELEGIDA : EN_REPOSO
            )}
          >
            <span className="flex min-w-0 items-start gap-2.5">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-texto-2" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className={cn("block break-words", activa ? "font-semibold" : "font-medium")}>{sede.nombre}</span>
                <span className="block break-words font-normal text-texto-2">{direccionConComuna(sede)}</span>
              </span>
              {activa && <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />}
            </span>
            {sePuede ? (
              <span className="block pl-[26px] font-normal text-texto-2">
                {sede.horario.map((linea) => (
                  <span key={linea} className="block break-words tabular-nums">
                    {linea}
                  </span>
                ))}
              </span>
            ) : (
              <span className="block pl-[26px] font-normal text-texto-2">{FRASES_DE_LAS_SEDES.sinHorario}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
