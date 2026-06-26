import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { FilaSinMatch } from "@/lib/import/tipos"
import type { FilaParser } from "@/lib/import/parsers/_helpers"
import { parsearBitacoraEventos } from "@/lib/import/parsers/bitacoraEventos"
import { parsearCajaChica } from "@/lib/import/parsers/cajaChica"
import { parsearClientes } from "@/lib/import/parsers/clientes"
import { parsearDatosPersonal } from "@/lib/import/parsers/datosPersonal"
import { parsearEmpleadas } from "@/lib/import/parsers/empleadas"
import { parsearListaNegra } from "@/lib/import/parsers/listaNegra"
import { parsearPrecios } from "@/lib/import/parsers/precios"
import { parsearRegistro } from "@/lib/import/parsers/registro"
import { parsearTotales } from "@/lib/import/parsers/totales"
import { persistirImport } from "../_lib/persistir"

const parsers = {
  precios: parsearPrecios,
  listaNegra: parsearListaNegra,
  clientes: parsearClientes,
  cajaChica: parsearCajaChica,
  bitacoraEventos: parsearBitacoraEventos,
  totales: parsearTotales,
  empleadas: parsearEmpleadas,
  datosPersonal: parsearDatosPersonal,
  registro: parsearRegistro,
}

export type TipoImport = keyof typeof parsers

interface ConfirmPayload {
  importId: string
  tipo: TipoImport
  filas: FilaParser[]
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

function esTipoImport(tipo: string): tipo is TipoImport {
  return tipo in parsers
}

function parsePayload(body: unknown): ConfirmPayload | null {
  if (!esObjeto(body)) return null
  const importId = typeof body.importId === "string" ? body.importId : ""
  const tipo = typeof body.tipo === "string" ? body.tipo : ""
  const filas = Array.isArray(body.filas) && body.filas.every(esObjeto) ? body.filas : null

  if (!importId || !esTipoImport(tipo) || !filas) return null
  return { importId, tipo, filas }
}

function serializarSinMatch(sinMatch: FilaSinMatch[]) {
  return sinMatch.map((fila) => ({
    indice: fila.indice,
    mensaje: `Sin match para ${fila.campo}: ${fila.valor}`,
  }))
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = session.user.businessId as string

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }

  const payload = parsePayload(body)
  if (!payload) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  const resultado = await parsers[payload.tipo](payload.filas, businessId, prisma)
  const rowsOk = resultado.ok.length
  const rowsErrored = resultado.errores.length + resultado.sinMatch.length
  const errores = [
    ...resultado.errores.map((fila) => ({ indice: fila.indice, mensaje: fila.mensaje })),
    ...serializarSinMatch(resultado.sinMatch),
  ]

  await prisma.$transaction(async (tx) => {
    await persistirImport(
      payload.tipo,
      resultado.ok.map((fila) => fila.data),
      businessId,
      tx
    )

    await tx.dataImport.updateMany({
      where: { id: payload.importId, businessId },
      data: { rowsImported: rowsOk, rowsSkipped: rowsErrored },
    })
  })

  return NextResponse.json({ rowsOk, rowsErrored, errores })
}
