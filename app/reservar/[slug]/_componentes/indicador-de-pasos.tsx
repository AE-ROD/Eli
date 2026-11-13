import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/** Los pasos de la reserva, en orden: el número de cada uno es su lugar más uno. */
export const PASOS_DE_RESERVA = ["Servicio", "Día y hora", "Tus datos"] as const

/**
 * Los mismos pasos con el nombre del primero según el rubro: "Servicio", o "Motivo" en una clínica dental (`frasesDelFormulario`).
 * Con varias sedes (plan Independiente) se suma "Dónde" al principio (`dondeAtiendo`: su nombre, de `_frases-de-sedes.ts`).
 */
export function pasosDeLaReserva(servicioDeLaReserva: string, dondeAtiendo?: string): readonly string[] {
  const pasos = [servicioDeLaReserva, PASOS_DE_RESERVA[1], PASOS_DE_RESERVA[2]]
  return dondeAtiendo ? [dondeAtiendo, ...pasos] : pasos
}

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
  /** El paso en el que está la clienta: 1, 2 o 3 (hasta 4 con varias sedes). */
  paso: number
  /** Los nombres de los pasos; sin él, los de siempre. En una clínica dental el primero es "Motivo". */
  pasos?: readonly string[]
}

/**
 * Dónde está la clienta dentro de la reserva: una barra por paso, con su
 * número y su nombre debajo. Sólo informa; para volver está el botón "Atrás".
 *
 * El lector de pantalla lo lee como una lista de tres pasos (cuatro con varias
 * sedes) con el actual marcado (`aria-current="step"`) y los hechos con "listo".
 * Con cuatro, en el teléfono cada nombre va debajo de su número: a 360px de ancho
 * una columna mide unos 70px y "Servicio" no entra al lado del círculo.
 */
export function IndicadorDePasos({ paso, pasos = PASOS_DE_RESERVA }: PropsDeIndicadorDePasos) {
  const cuatro = pasos.length > 3
  return (
    <ol aria-label="Pasos de la reserva" className={cn("grid gap-2 sm:gap-3", cuatro ? "grid-cols-4" : "grid-cols-3")}>
      {pasos.map((nombre, indice) => {
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
            <span
              className={cn(
                "flex min-w-0 gap-1.5 sm:gap-2",
                cuatro ? "flex-col items-start sm:flex-row sm:items-center" : "items-center"
              )}
            >
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
