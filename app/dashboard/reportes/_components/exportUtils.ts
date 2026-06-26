// Utilidades de exportación client-side. Sin dependencias nuevas:
// CSV se genera a mano a partir del array de filas ya cargado en memoria,
// "PDF" se delega a window.print() con estilos @media print (ver globals.css).

export function filasACsv(filas: Record<string, unknown>[], columnas?: { key: string; label: string }[]): string {
  if (filas.length === 0) return ""

  const cols = columnas ?? Object.keys(filas[0]).map((key) => ({ key, label: key }))

  const escapar = (valor: unknown): string => {
    if (valor === null || valor === undefined) return ""
    const str = String(valor)
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const header = cols.map((c) => escapar(c.label)).join(",")
  const rows = filas.map((fila) => cols.map((c) => escapar(fila[c.key])).join(","))

  return [header, ...rows].join("\n")
}

export function descargarCsv(contenido: string, nombreArchivo: string) {
  const BOM = "﻿" // para que Excel detecte UTF-8 correctamente (acentos en es-MX)
  const blob = new Blob([BOM + contenido], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = nombreArchivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportarFilasComoCsv(
  filas: Record<string, unknown>[],
  nombreArchivo: string,
  columnas?: { key: string; label: string }[]
) {
  const csv = filasACsv(filas, columnas)
  descargarCsv(csv, nombreArchivo)
}
