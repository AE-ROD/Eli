"use client"

import { useId } from "react"
import type { LucideIcon } from "lucide-react"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import type { ColorDeModulo } from "@/lib/modulos"
import { cn } from "@/lib/utils"

export interface OpcionDeGrupo<Valor extends string | number> {
  valor: Valor
  texto: string
  /** Sólo en `filas`: el ícono va en un cuadro de su pastel, que pasa a fuerte al elegirla. */
  icono?: { figura: LucideIcon; color: ColorDeModulo }
}

interface PropsDeGrupoDeOpciones<Valor extends string | number> {
  /** El nombre del grupo, que el lector de pantalla dice al entrar. */
  leyenda: string
  opciones: readonly OpcionDeGrupo<Valor>[]
  /** La elegida, o `""` mientras no hay ninguna. */
  elegida: Valor | ""
  alElegir: (valor: Valor) => void
  error?: string
  /**
   * `filas` (por defecto): una debajo de la otra, con ícono y la marca de
   * elegida. `segmentos`: lado a lado, sólo texto, la elegida en navy; para
   * opciones cortas.
   */
  forma?: "filas" | "segmentos"
}

/**
 * El radio no se ve, así que el anillo del foco lo dibuja la opción entera
 * cuando el radio de adentro lo tiene. Es el de `anillo-foco`, con las mismas
 * variables: contorno de 2px separado 2px y el halo del módulo.
 */
const ANILLO_DE_LA_OPCION =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo) has-focus-visible:shadow-[0_0_0_6px_var(--halo)]"

const OPCION = cn(
  "relative cursor-pointer rounded-campo squircle text-navy transition-[border-color,background-color,color] duration-150 ease-suave",
  ANILLO_DE_LA_OPCION
)

// El borde de la fila es decoración: lo que dice que es un control, con el
// contraste de 3:1, es la marca redonda. Mide siempre 1,5px para que elegirla
// no corra nada.
const FILA = "flex min-h-16 items-center gap-3 border-[1.5px] bg-tarjeta py-3 pl-3 pr-4"
const FILA_LIBRE = "border-borde hover:border-texto-2"
const FILA_ELEGIDA = "border-navy"

// Sin marca, el borde es lo que lo hace control: el gris de los campos, no el decorativo.
const SEGMENTO = "grid h-12 place-items-center border px-2 text-center text-sm font-medium"
const SEGMENTO_LIBRE = "border-texto-2 bg-tarjeta hover:border-navy"
const SEGMENTO_ELEGIDO = "border-navy bg-navy text-white"

/**
 * Elegir una entre pocas opciones, todas a la vista. Son radios nativos: el
 * lector de pantalla dice cuál está elegida y cuántas hay, y las flechas pasan
 * de una a otra sin código extra. Cada opción entera es la etiqueta de su
 * radio, así que se elige tocándola en cualquier lado.
 */
export function GrupoDeOpciones<Valor extends string | number>({
  leyenda,
  opciones,
  elegida,
  alElegir,
  error,
  forma = "filas",
}: PropsDeGrupoDeOpciones<Valor>) {
  const nombre = useId()
  const idDeLaLeyenda = `${nombre}-leyenda`
  const idDelError = `${nombre}-error`
  const enFilas = forma === "filas"

  return (
    // `radiogroup` y no el `group` de siempre: es el rol que admite
    // `aria-invalid`, que en un radio suelto no vale. Con el rol cambiado, el
    // nombre del grupo se ata a la leyenda a mano.
    <fieldset
      role="radiogroup"
      aria-labelledby={idDeLaLeyenda}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? idDelError : undefined}
      className="min-w-0"
    >
      <legend id={idDeLaLeyenda} className={cn(CLASES_DE_ETIQUETA, "mb-2")}>
        {leyenda}
      </legend>
      <div className={enFilas ? "flex flex-col gap-2" : "grid grid-cols-3 gap-2"}>
        {opciones.map((opcion) => {
          const esLaElegida = elegida === opcion.valor
          return (
            <label
              key={opcion.valor}
              className={cn(
                OPCION,
                enFilas ? FILA : SEGMENTO,
                enFilas && (esLaElegida ? FILA_ELEGIDA : FILA_LIBRE),
                !enFilas && (esLaElegida ? SEGMENTO_ELEGIDO : SEGMENTO_LIBRE)
              )}
            >
              <input
                type="radio"
                name={nombre}
                value={opcion.valor}
                checked={esLaElegida}
                onChange={() => alElegir(opcion.valor)}
                // También en cada opción: no todos los lectores leen la descripción del grupo al entrar.
                aria-describedby={error ? idDelError : undefined}
                className="sr-only"
              />
              {enFilas && opcion.icono && (
                <CuadroDeIcono icono={opcion.icono.figura} color={opcion.icono.color} activo={esLaElegida} />
              )}
              {enFilas ? <span className="min-w-0 flex-1 font-medium">{opcion.texto}</span> : opcion.texto}
              {enFilas && <MarcaDeElegida elegida={esLaElegida} />}
            </label>
          )
        })}
      </div>
      {error && (
        <div className="mt-2">
          <ErrorDeCampo id={idDelError}>{error}</ErrorDeCampo>
        </div>
      )}
    </fieldset>
  )
}

/** El círculo de la derecha de cada fila: vacío, o con el punto navy si es la elegida. */
function MarcaDeElegida({ elegida }: { elegida: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] bg-tarjeta transition-colors duration-150 ease-suave",
        elegida ? "border-navy" : "border-texto-2"
      )}
    >
      <span
        className={cn(
          "size-2.5 rounded-full bg-navy transition-transform duration-150 ease-suave",
          elegida ? "scale-100" : "scale-0"
        )}
      />
    </span>
  )
}
