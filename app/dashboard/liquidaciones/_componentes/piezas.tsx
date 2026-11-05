import { Insignia } from "@/components/comunes/insignia"
import { formatearMonto } from "@/lib/dinero"
import type { EstadoDeLiquidacion } from "@/lib/liquidacion"

/**
 * Piezas chicas que comparten Liquidaciones, el comprobante y Mi plata. Sin
 * "use client": se dibujan igual en el servidor y en el navegador.
 */

/** Un monto guardado en centavos, para leer: `$8.000`, `-$500`. */
export const pesos = (centavos: number) => formatearMonto(centavos / 100)

/** Un % guardado (33.33) como se lee: `33,33 %`. */
export const porcentaje = (valor: number) => `${String(valor).replace(".", ",")} %`

const TONO_DE_ESTADO = { cerrada: "naranja", pagada: "lima", anulada: "gris" } as const
const TEXTO_DE_ESTADO: Record<EstadoDeLiquidacion, string> = {
  cerrada: "Por pagar",
  pagada: "Pagada",
  anulada: "Anulada",
}

/** En qué está una liquidación: con texto además del color. */
export function InsigniaDeEstado({ estado }: { estado: EstadoDeLiquidacion }) {
  return <Insignia tono={TONO_DE_ESTADO[estado] ?? "gris"}>{TEXTO_DE_ESTADO[estado] ?? estado}</Insignia>
}

/**
 * Una fila de totales: el concepto a la izquierda y el monto a la derecha.
 * `tachado`: un monto que ya no vale (el de una liquidación anulada), tachado
 * y con texto para el lector de pantalla, que no lee el tachado.
 */
export function FilaDeTotal({
  concepto,
  centavos,
  fuerte = false,
  tachado = false,
}: {
  concepto: string
  centavos: number
  fuerte?: boolean
  tachado?: boolean
}) {
  return (
    <div className={fuerte ? "flex justify-between gap-4 border-t border-borde pt-3 text-base font-semibold" : "flex justify-between gap-4 text-sm"}>
      <dt className={fuerte ? "" : "text-texto-2"}>{concepto}</dt>
      <dd className="tabular-nums">
        {tachado ? (
          <s className="text-texto-2">
            <span className="sr-only">Anulado: </span>
            {pesos(centavos)}
          </s>
        ) : (
          pesos(centavos)
        )}
      </dd>
    </div>
  )
}
