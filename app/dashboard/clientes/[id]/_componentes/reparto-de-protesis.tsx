import type { RepartoRespuesta } from "@/lib/edicion-de-protesis"
import { textoDePorcentaje } from "@/lib/protesis"
import { cn } from "@/lib/utils"
import { pesos } from "../_formato"

/** El color de cada parte: el pastel fuerte de un módulo, con texto navy. Nunca la única pista: cada parte va con su nombre. */
const COLOR_DE_PARTE = {
  odontologo: "bg-lila",
  clinica: "bg-azul",
  tecnico: "bg-naranja",
} as const

interface PropsDeRepartoDeProtesis {
  reparto: RepartoRespuesta
  tratante: string
  laboratorio: string | null
  /** La tratante es la dueña: su parte va a la clínica (ya viene sumada ahí). */
  tratanteEsLaDuena?: boolean
  /** Para la vista previa: "Así quedaría" en vez de "Se congeló al crear". */
  vistaPrevia?: boolean
  className?: string
}

/**
 * El reparto de una prótesis, sólo para leer: se configura en Comisiones ›
 * Reparto de prótesis (la dueña). Muestra exactamente lo que la API le da a
 * quien mira: la dueña, las tres partes con su barra; la odontóloga
 * tratante, sólo la suya (sin barra: una barra de una parte diría cuánto es
 * el resto). Nunca se calcula acá la parte de nadie.
 */
export function RepartoDeProtesis({ reparto, tratante, laboratorio, tratanteEsLaDuena = false, vistaPrevia = false, className }: PropsDeRepartoDeProtesis) {
  if (reparto.visible === "suyo") {
    return (
      <div className={cn("rounded-[20px] bg-superficie px-4 py-3 squircle", className)}>
        <p className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <span aria-hidden="true" className={cn("size-3 rounded-[4px]", COLOR_DE_PARTE.odontologo)} />
            <span className="font-semibold">Tu parte</span>
          </span>
          <span className="text-right tabular-nums">
            <span className="text-[13px] text-texto-2">{textoDePorcentaje(reparto.odontologo.pb)} · </span>
            <span className="font-semibold">{pesos(reparto.odontologo.cents)}</span>
          </span>
        </p>
        <p className="mt-1.5 text-[13px] text-texto-2">
          {vistaPrevia
            ? "Lo que te toca con este material, sobre el valor al paciente. Se congela al crear la prótesis."
            : "Sobre el valor al paciente. La regla se congeló al crear la prótesis."}
        </p>
      </div>
    )
  }

  const partes = [
    { id: "odontologo" as const, nombre: "Tratante", quien: tratante, ...reparto.odontologo },
    { id: "clinica" as const, nombre: "Clínica", quien: null, ...reparto.clinica },
    { id: "tecnico" as const, nombre: "Laboratorio", quien: laboratorio ?? "Sin laboratorio todavía", ...reparto.tecnico },
  ]

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`Reparto: ${partes.map((parte) => `${parte.nombre.toLowerCase()} ${textoDePorcentaje(parte.pb)}`).join(", ")}`}
        className="flex h-9 gap-[3px]"
      >
        {partes
          .filter((parte) => parte.pb > 0)
          .map((parte) => (
            <div
              key={parte.id}
              className={cn(
                "flex min-w-0 items-center justify-center overflow-hidden rounded-[10px] text-[13px] font-semibold text-navy tabular-nums",
                COLOR_DE_PARTE[parte.id]
              )}
              style={{ flexBasis: `${parte.pb / 100}%`, flexGrow: 0, flexShrink: 1 }}
            >
              {parte.pb >= 1200 && textoDePorcentaje(parte.pb)}
            </div>
          ))}
      </div>
      <ul className="mt-2">
        {partes.map((parte) => (
          <li key={parte.id} className="flex items-center gap-3 border-t border-borde py-2.5 first:border-t-0">
            <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-[4px]", COLOR_DE_PARTE[parte.id])} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{parte.nombre}</span>
              {parte.quien && <span className="block text-[13px] break-words text-texto-2">{parte.quien}</span>}
            </span>
            <span className="text-[13px] text-texto-2 tabular-nums">{textoDePorcentaje(parte.pb)}</span>
            <span className="min-w-20 text-right font-semibold tabular-nums">{pesos(parte.cents)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[13px] text-texto-2">
        {reparto.origen === "excepcion" ? "Con la excepción de la tratante en este material." : "Con la regla del material."}{" "}
        {tratanteEsLaDuena && "La tratante es la dueña: su parte va a la clínica. "}
        {vistaPrevia ? "Se congela al crear la prótesis." : "Se congeló al crear la prótesis."}
      </p>
    </div>
  )
}
