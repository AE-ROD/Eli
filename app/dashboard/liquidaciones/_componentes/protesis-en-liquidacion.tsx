import type { AbonoDeProtesisEnLiquidacion } from "@/lib/liquidacion"
import { fechaParaLeer } from "@/lib/periodos-de-liquidacion"
import { cn } from "@/lib/utils"
import { pesos } from "./piezas"

/**
 * La sección "Prótesis" de una liquidación (clínica dental): la parte de la
 * odontóloga de cada abono de prótesis, que se libera el día más tardío entre
 * el cobro y la entrega. Sin "use client": la usan la vista previa (en el
 * navegador) y el comprobante (en el servidor). Fuera de una clínica la lista
 * llega vacía y no se dibuja nada.
 */

/** "Abono prótesis · Removible parcial · Acrílico (45, 46)" → "Removible parcial · Acrílico (45, 46)". */
export const nombreDeLaProtesis = (detalle: string): string => detalle.replace(/^Abono prótesis · /, "")

const EXPLICACION =
  "La parte de la odontóloga de cada abono se libera al entregar la prótesis: entra el día más tardío entre el cobro y la entrega."

/** En la vista previa: una lista, como los servicios del mismo modal. */
export function ListaDeProtesis({ protesis }: { protesis: readonly AbonoDeProtesisEnLiquidacion[] }) {
  if (protesis.length === 0) return null
  return (
    <section className="space-y-2">
      <h3 className="font-medium">Prótesis ({protesis.length})</h3>
      <p className="text-sm text-texto-2">{EXPLICACION}</p>
      <ul className="divide-y divide-borde/60 text-sm">
        {protesis.map((abono) => (
          <li key={abono.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
            <span className="min-w-0">
              <span className="text-texto-2">Liberado el {fechaParaLeer(abono.fecha)} · </span>
              <span className="break-words">{nombreDeLaProtesis(abono.detalle)}</span>
              <span className="text-texto-2"> · {abono.cliente}</span>
              <span className="block text-[13px] text-texto-2">
                Cobrado el {fechaParaLeer(abono.cobradoEl)} · Entregada el {fechaParaLeer(abono.entregadaEl)}
              </span>
            </span>
            <span className="tabular-nums">
              <span className="text-texto-2">de un abono de {pesos(abono.abonoCents)} = </span>
              {pesos(abono.comisionCents)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const CELDA = "py-2 pr-3 align-top"
const CABECERA = "py-2 pr-3 text-left text-xs font-medium uppercase tracking-[0.04em] text-texto-2"

/** En el comprobante: una tabla, como la de servicios, que se desplaza de lado en el teléfono. */
export function TablaDeProtesis({ protesis }: { protesis: readonly AbonoDeProtesisEnLiquidacion[] }) {
  if (protesis.length === 0) return null
  return (
    <section aria-labelledby="titulo-protesis" className="space-y-2">
      <h3 id="titulo-protesis" className="font-medium">
        Prótesis
      </h3>
      <p className="text-sm text-texto-2">{EXPLICACION}</p>
      {/* En el teléfono la tabla se desplaza de lado: la caja se enfoca para moverla con el teclado. */}
      <div tabIndex={0} role="region" aria-label="Prótesis de la liquidación" className="overflow-x-auto rounded-[12px] anillo-foco">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-borde">
              <th className={CABECERA}>Liberado el</th>
              <th className={CABECERA}>Paciente</th>
              <th className={CABECERA}>Prótesis</th>
              <th className={CABECERA}>Cobrado el</th>
              <th className={CABECERA}>Entregada el</th>
              <th className={cn(CABECERA, "text-right")}>Abono</th>
              <th className={cn(CABECERA, "pr-0 text-right")}>Parte de la odontóloga</th>
            </tr>
          </thead>
          <tbody>
            {protesis.map((abono) => (
              <tr key={abono.id} className="border-b border-borde/60">
                <td className={cn(CELDA, "whitespace-nowrap")}>{fechaParaLeer(abono.fecha)}</td>
                <td className={CELDA}>{abono.cliente}</td>
                <td className={CELDA}>{nombreDeLaProtesis(abono.detalle)}</td>
                <td className={cn(CELDA, "whitespace-nowrap")}>{fechaParaLeer(abono.cobradoEl)}</td>
                <td className={cn(CELDA, "whitespace-nowrap")}>{fechaParaLeer(abono.entregadaEl)}</td>
                <td className={cn(CELDA, "text-right tabular-nums")}>{pesos(abono.abonoCents)}</td>
                <td className={cn(CELDA, "pr-0 text-right tabular-nums")}>{pesos(abono.comisionCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
