const FORMULAS_ROTAS = new Set(["#REF!", "#ERROR!", "#VALUE!", "#N/A", "#DIV/0!"])

function textoLimpio(valor: string) {
  return valor.trim()
}

export function parsearFechaChilena(s: string): Date | null {
  const valor = textoLimpio(s)
  if (!valor || FORMULAS_ROTAS.has(valor.toUpperCase())) return null

  const match = valor.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (!match) return null

  const dia = Number(match[1])
  const mes = Number(match[2])
  const anio = Number(match[3])
  const fecha = new Date(anio, mes - 1, dia)

  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) {
    return null
  }

  return fecha
}

export function parsearMontoCLP(s: string): number | null {
  const valor = textoLimpio(s)
  if (!valor || FORMULAS_ROTAS.has(valor.toUpperCase())) return null
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(valor)) return null

  const monto = Number(valor.replace(/\./g, ""))
  return Number.isFinite(monto) ? monto : null
}

export function normalizarNombre(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}
