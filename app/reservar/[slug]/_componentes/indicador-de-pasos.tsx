import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/** Los pasos de la reserva, en orden: el número de cada uno es su lugar más uno. */
export const PASOS_DE_RESERVA = ["Servicio", "Día y hora", "Tus datos"] as const

type EstadoDelPaso = "hecho" | "actual" | "pendiente"

/*
 * Lo hecho en navy, el paso de ahora en el azul de la Agenda y lo que falta
 * en gris. El color nunca va solo: el paso hecho cambia el número por un
 * tilde y el de ahora lleva su nombre en negrita.
 */
const BARRA: Record<EstadoDelPaso, string> = {
  hecho: "bg-navy",
  actual: "bg-azul",
  pendiente: "bg-borde",
}

const NUMERO: Record<EstadoDelPaso, string> = {
  hecho: "bg-navy text-white",
  actual: "bg-azul text-navy",
  pendiente: "bg-superficie text-texto-2",
}

const NOMBRE: Record<EstadoDelPaso, string> = {
  hecho: "text-navy",
  actual: "font-medium text-navy",
  pendiente: "text-texto-2",
}

function estadoDelPaso(numero: number, pasoActual: number): EstadoDelPaso {
  if (numero < pasoActual) return "hecho"
  return numero === pasoActual ? "actual" : "pendiente"
}

interface PropsDeIndicadorDePasos {
  /** El paso en el que está la clienta: 1, 2 o 3. */
  paso: number
}

/**
 * Dónde está la clienta dentro de la reserva: una barra por paso, con su
 * número y su nombre debajo. Sólo informa; para volver está el botón "Atrás".
 *
 * El lector de pantalla lo lee como una lista de tres pasos con el actual
 * marcado (`aria-current="step"`) y los hechos con "listo".
 */
export function IndicadorDePasos({ paso }: PropsDeIndicadorDePasos) {
  return (
    <ol aria-label="Pasos de la reserva" className="grid grid-cols-3 gap-2 sm:gap-3">
      {PASOS_DE_RESERVA.map((nombre, indice) => {
        const numero = indice + 1
        const estado = estadoDelPaso(numero, paso)
        return (
          <li
            key={nombre}
            aria-current={estado === "actual" ? "step" : undefined}
            className="flex min-w-0 flex-col gap-2.5"
          >
            <span
              aria-hidden="true"
              className={cn("h-1.5 rounded-full transition-colors duration-300 ease-suave", BARRA[estado])}
            />
            <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-300 ease-suave",
                  NUMERO[estado]
                )}
              >
                {estado === "hecho" ? <Check className="size-3.5" strokeWidth={2.5} /> : numero}
              </span>
              <span className={cn("min-w-0 text-[13px] leading-tight sm:text-sm", NOMBRE[estado])}>
                <span className="sr-only">Paso {numero}: </span>
                {nombre}
                {estado === "hecho" && <span className="sr-only">, listo</span>}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
