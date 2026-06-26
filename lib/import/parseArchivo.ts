import * as XLSX from "xlsx"

export type FilaImportada = Record<string, unknown>

function celdaVacia(valor: unknown) {
  return valor === null || valor === undefined || String(valor).trim() === ""
}

function normalizarHeader(valor: unknown, indice: number) {
  const header = String(valor ?? "").trim()
  return header || `columna_${indice + 1}`
}

export function parseArchivo(buffer: Buffer, nombreArchivo: string): FilaImportada[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
  const hojaNombre = workbook.SheetNames[0]
  if (!hojaNombre) {
    throw new Error(`El archivo ${nombreArchivo} no contiene hojas`)
  }

  const hoja = workbook.Sheets[hojaNombre]
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    raw: true,
    defval: null,
  })

  const [headersRaw, ...datos] = filas
  if (!headersRaw) return []

  const headers = headersRaw.map(normalizarHeader)

  return datos
    .filter((fila) => fila.some((celda) => !celdaVacia(celda)))
    .map((fila) =>
      headers.reduce<FilaImportada>((acc, header, indice) => {
        acc[header] = fila[indice] ?? null
        return acc
      }, {})
    )
}
