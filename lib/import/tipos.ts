export interface FilaOk<T> {
  indice: number
  data: T
}

export interface FilaError {
  indice: number
  mensaje: string
  fila: Record<string, unknown>
}

export interface FilaSinMatch {
  indice: number
  campo: string
  valor: string
  fila: Record<string, unknown>
}

export interface ResultadoParseo<T> {
  ok: FilaOk<T>[]
  errores: FilaError[]
  sinMatch: FilaSinMatch[]
}
