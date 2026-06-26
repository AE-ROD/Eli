import type { PrismaClient } from "@prisma/client"
import type { FilaError, ResultadoParseo } from "@/lib/import/tipos"
import { parsearFechaChilena, parsearMontoCLP } from "@/lib/import/normalizar"

export type FilaParser = Record<string, unknown>

const FORMULAS_ROTAS = new Set(["#REF!", "#ERROR!", "#VALUE!", "#N/A", "#DIV/0!"])

export function crearResultado<T>(): ResultadoParseo<T> {
  return { ok: [], errores: [], sinMatch: [] }
}

export function texto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor).trim()
}

export function campo(fila: FilaParser, nombres: string[]): string {
  const encontrado = Object.entries(fila).find(([key]) =>
    nombres.some((nombre) => key.toLowerCase() === nombre.toLowerCase())
  )
  return texto(encontrado?.[1])
}

export function tieneFormulaRota(fila: FilaParser): boolean {
  return Object.values(fila).some((valor) => FORMULAS_ROTAS.has(texto(valor).toUpperCase()))
}

export function agregarError(errores: FilaError[], indice: number, mensaje: string, fila: FilaParser) {
  errores.push({ indice, mensaje, fila })
}

export function fechaCampo(fila: FilaParser, nombres: string[]) {
  return parsearFechaChilena(campo(fila, nombres))
}

export function montoCampo(fila: FilaParser, nombres: string[]) {
  return parsearMontoCLP(campo(fila, nombres))
}

export function numeroPositivoCampo(fila: FilaParser, nombres: string[]): number | null {
  const valor = texto(campo(fila, nombres))
  if (!/^\d+(\.\d+)?$/.test(valor)) return null
  const numero = Number(valor)
  return Number.isFinite(numero) && numero > 0 ? numero : null
}

export async function memberIdResuelto(
  fila: FilaParser,
  businessId: string,
  prisma: PrismaClient
): Promise<{ id: string } | null> {
  const memberId = campo(fila, ["memberId"])
  if (!memberId) return null

  return prisma.businessMember.findFirst({
    where: { id: memberId, businessId },
    select: { id: true },
  })
}
