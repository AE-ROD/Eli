"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { tonoDeLaGuia, type GrupoDeTono, type TonoVita } from "@/lib/protesis";
import { cn } from "@/lib/utils";
import {
  TECLAS_DEL_TONO,
  nombreDelGrupoDeTonos,
  tonoVecino,
  tonosPorGrupo,
  type TeclaDelTono,
} from "../_protesis";

/** Lo que se dice siempre que se muestran los colores: son aproximados. */
export const AVISO_DE_LOS_COLORES =
  "Los colores son de referencia: el tono se confirma con la guía VITA física.";

/**
 * Un diente chico (la corona de un incisivo) pintado con el color aproximado
 * del tono. El borde va en el gris del texto secundario: más de 3:1 sobre
 * blanco, crema y los suaves, para que se vea aunque el tono sea casi blanco.
 * Decorativo: el tono siempre va con su etiqueta en texto. Nunca la foto de
 * la guía.
 */
export function DienteDeTono({
  color,
  className,
}: {
  color: string | null;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 32"
      className={cn("block h-8 w-6 shrink-0", className)}
    >
      <path
        d="M6.2 2.2C9.8.9 14.2.9 17.8 2.2c1.9.7 2.9 2.4 2.8 4.4l-.6 16.2c-.2 4.9-3.6 7.9-8 7.9s-7.8-3-8-7.9L3.4 6.6c-.1-2 .9-3.7 2.8-4.4Z"
        fill={color ?? "#FFFFFF"}
        stroke="#5F6D77"
        strokeWidth="1.4"
        strokeDasharray={color ? undefined : "2.4 2"}
      />
      {color && (
        <path
          d="M8.4 6.5c2.2-.8 5-.8 7.2 0"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.7"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** El tono para leer: el diente y la etiqueta con su grupo ("A3,5 · A rojizo-marrón"), o "Sin tono elegido". */
export function TonoParaLeer({
  tono,
}: {
  tono: { etiqueta: string; grupo: GrupoDeTono; color: string } | null;
}) {
  if (!tono) {
    return (
      <span className="inline-flex items-center gap-2">
        <DienteDeTono color={null} className="h-6 w-[18px]" />
        <span className="text-texto-2">Sin tono elegido</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <DienteDeTono color={tono.color} className="h-6 w-[18px]" />
      <span>
        <span className="font-semibold">{tono.etiqueta}</span>
        <span className="text-texto-2">
          {" "}
          · {nombreDelGrupoDeTonos(tono.grupo)}
        </span>
      </span>
    </span>
  );
}

interface PropsDeSelectorDeTono {
  valor: TonoVita | null;
  alCambiar: (tono: TonoVita | null) => void;
  /** El id del texto que nombra el grupo (un título o una etiqueta de quien lo usa). */
  idDelNombre: string;
  deshabilitado?: boolean;
  className?: string;
}

/**
 * El tono de la guía VITA classical (`TONOS_VITA`): las 19 muestras en el
 * orden de la guía, agrupadas (Blanqueamiento, A, B, C, D), cada una como un
 * diente chico en su color aproximado con la etiqueta debajo.
 *
 * Es un grupo de radios: Tab entra por el elegido (o el primero), las
 * flechas recorren la guía y eligen al pasar (como un radio), Inicio y Fin
 * van a las puntas. "Quitar el tono" lo deja sin elegir.
 */
export function SelectorDeTono({
  valor,
  alCambiar,
  idDelNombre,
  deshabilitado = false,
  className,
}: PropsDeSelectorDeTono) {
  const id = useId();
  const botones = useRef(new Map<TonoVita, HTMLButtonElement>());
  const grupos = tonosPorGrupo();
  const primero = grupos[0].tonos[0].id;
  const elegido = tonoDeLaGuia(valor);

  const alTeclear = (
    evento: KeyboardEvent<HTMLButtonElement>,
    tono: TonoVita,
  ) => {
    if (!(TECLAS_DEL_TONO as readonly string[]).includes(evento.key)) return;
    evento.preventDefault();
    const destino = tonoVecino(tono, evento.key as TeclaDelTono);
    alCambiar(destino);
    botones.current.get(destino)?.focus();
  };

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-labelledby={idDelNombre}
        aria-describedby={`${id}-aviso`}
        aria-disabled={deshabilitado || undefined}
        className="flex flex-wrap gap-x-5 gap-y-3"
      >
        {grupos.map((grupo) => (
          <div key={grupo.grupo} className="min-w-0">
            <span
              id={`${id}-${grupo.grupo}`}
              className="block text-xs font-semibold text-texto-2"
            >
              {grupo.nombre}
            </span>
            <div className="mt-1 flex gap-1">
              {grupo.tonos.map((tono) => {
                const marcado = valor === tono.id;
                return (
                  <button
                    key={tono.id}
                    ref={(nodo) => {
                      if (nodo) botones.current.set(tono.id, nodo);
                      else botones.current.delete(tono.id);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    aria-describedby={`${id}-${grupo.grupo}`}
                    tabIndex={
                      marcado || (!valor && tono.id === primero) ? 0 : -1
                    }
                    disabled={deshabilitado}
                    onClick={() => alCambiar(tono.id)}
                    onKeyDown={(evento) => alTeclear(evento, tono.id)}
                    className={cn(
                      "flex w-11 flex-col items-center gap-1 rounded-[14px] border-[1.5px] pt-1.5 pb-1 text-navy squircle anillo-foco transition-colors duration-150 ease-suave disabled:cursor-not-allowed disabled:opacity-60",
                      marcado
                        ? "border-navy bg-lila-suave"
                        : "border-transparent enabled:hover:bg-superficie",
                    )}
                  >
                    <DienteDeTono color={tono.color} />
                    <span
                      className={cn(
                        "text-[12px] leading-none whitespace-nowrap tabular-nums",
                        marcado ? "font-bold" : "font-medium",
                      )}
                    >
                      {tono.etiqueta}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>
          {elegido ? (
            <>
              <span className="text-texto-2">Tono elegido: </span>
              <span className="font-semibold">{elegido.etiqueta}</span>
              <span className="text-texto-2">
                {" "}
                · {nombreDelGrupoDeTonos(elegido.grupo)}
              </span>
            </>
          ) : (
            <span className="text-texto-2">Sin tono elegido</span>
          )}
        </span>
        {elegido && !deshabilitado && (
          <button
            type="button"
            onClick={() => {
              alCambiar(null);
              botones.current.get(primero)?.focus();
            }}
            className="relative rounded-[8px] text-sm font-medium text-navy underline underline-offset-2 anillo-foco after:absolute after:-inset-x-1 after:-inset-y-3"
          >
            Quitar el tono
          </button>
        )}
      </div>
      <p id={`${id}-aviso`} className="mt-1 text-[13px] text-texto-2">
        {AVISO_DE_LOS_COLORES}
      </p>
    </div>
  );
}
