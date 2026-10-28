"use client"

import { Tarjeta } from "@/components/comunes/tarjeta"
import { Aviso } from "@/components/panel/aviso"
import type { FilaOmitida, ResumenDeImportacion as Resumen } from "../../_datos"

/** `1 cliente`, `12 clientes`. */
const clientes = (cantidad: number) => (cantidad === 1 ? "1 cliente" : `${cantidad.toLocaleString("es-CL")} clientes`)

function ListaDeOmitidas({ titulo, filas }: { titulo: string; filas: FilaOmitida[] }) {
  if (filas.length === 0) return null
  return (
    <details className="rounded-boton bg-superficie p-4">
      <summary className="cursor-pointer font-medium text-navy anillo-foco">
        {titulo}: {filas.length.toLocaleString("es-CL")}
      </summary>
      <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto text-sm text-texto-2">
        {filas.map(({ fila, motivo }) => (
          <li key={`${fila}-${motivo}`}>
            <span className="font-medium text-navy">Fila {fila}:</span> {motivo}
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * Lo que pasó con cada fila: cuántos clientes se crearon y, de las que no, el
 * número de fila (como en la planilla, con la cabecera en la 1) y el motivo.
 */
export function ResumenDeImportacion({ resumen }: { resumen: Resumen }) {
  return (
    <Tarjeta como="section" className="space-y-4 p-5 sm:p-6" aria-labelledby="titulo-resumen">
      <h2 id="titulo-resumen" className="font-medium text-navy">
        Resultado de la importación
      </h2>
      <Aviso tono={resumen.creados > 0 ? "listo" : "info"} rol="status">
        {resumen.creados > 0 ? `Se crearon ${clientes(resumen.creados)}.` : "No se creó ningún cliente."}
      </Aviso>
      <dl className="grid grid-cols-3 gap-3 text-center">
        {[
          ["Creados", resumen.creados],
          ["Omitidos por duplicado", resumen.duplicados.length],
          ["Con errores", resumen.errores.length],
        ].map(([texto, cantidad]) => (
          <div key={texto} className="rounded-boton bg-superficie p-3">
            <dt className="text-xs text-texto-2">{texto}</dt>
            <dd className="mt-1 text-xl font-medium text-navy">{cantidad.toLocaleString("es-CL")}</dd>
          </div>
        ))}
      </dl>
      <ListaDeOmitidas titulo="Omitidos por duplicado" filas={resumen.duplicados} />
      <ListaDeOmitidas titulo="Con errores" filas={resumen.errores} />
    </Tarjeta>
  )
}
