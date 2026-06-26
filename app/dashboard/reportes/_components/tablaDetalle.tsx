"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

export interface ColumnaTabla {
  key: string
  label: string
  align?: "left" | "right"
  formato?: (valor: unknown, fila: Record<string, unknown>) => React.ReactNode
}

interface Props {
  columnas: ColumnaTabla[]
  filas: Record<string, unknown>[]
  porPagina?: number
  titulo?: string
}

export function TablaDetalle({ columnas, filas, porPagina = 10, titulo }: Props) {
  const [pagina, setPagina] = useState(1)
  const totalPaginas = Math.max(1, Math.ceil(filas.length / porPagina))
  const inicio = (pagina - 1) * porPagina
  const filasPagina = filas.slice(inicio, inicio + porPagina)

  return (
    <div className="bg-card border border-border/50 rounded-xl p-5" data-print-area>
      {titulo && <h2 className="font-semibold text-foreground mb-4">{titulo}</h2>}

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sin datos para el período seleccionado</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  {columnas.map((col) => (
                    <th
                      key={col.key}
                      className={`py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasPagina.map((fila, i) => (
                  <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/40 transition-colors">
                    {columnas.map((col) => (
                      <td
                        key={col.key}
                        className={`py-2.5 px-3 text-foreground tabular-nums ${
                          col.align === "right" ? "text-right" : "text-left"
                        }`}
                      >
                        {col.formato ? col.formato(fila[col.key], fila) : String(fila[col.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30" data-no-print>
              <p className="text-xs text-muted-foreground">
                Página {pagina} de {totalPaginas} · {filas.length} registros
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                  className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
