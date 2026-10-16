import { cn } from "@/lib/utils"

interface PropsDeIndicadorDePasos {
  /** Empieza en 1. */
  actual: number
  total: number
}

/**
 * En qué paso va el formulario, en rayas: hechas y actual en navy, las que
 * faltan en gris. Es sólo la imagen; "Paso 1 de 2" lo dice el antetítulo, que
 * el lector de pantalla sí lee.
 */
export function IndicadorDePasos({ actual, total }: PropsDeIndicadorDePasos) {
  return (
    <div aria-hidden="true" className="flex gap-1.5">
      {Array.from({ length: total }, (_, indice) => (
        <span key={indice} className={cn("h-1.5 w-10 rounded-full", indice < actual ? "bg-navy" : "bg-borde")} />
      ))}
    </div>
  )
}
