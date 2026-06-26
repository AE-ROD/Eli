import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"
import { parsearBitacoraEventos } from "@/lib/import/parsers/bitacoraEventos"
import { parsearCajaChica } from "@/lib/import/parsers/cajaChica"
import { parsearClientes } from "@/lib/import/parsers/clientes"
import { parsearDatosPersonal } from "@/lib/import/parsers/datosPersonal"
import { parsearEmpleadas } from "@/lib/import/parsers/empleadas"
import { parsearListaNegra } from "@/lib/import/parsers/listaNegra"
import { parsearPrecios } from "@/lib/import/parsers/precios"
import { parsearRegistro } from "@/lib/import/parsers/registro"
import { parsearTotales } from "@/lib/import/parsers/totales"
import type { TipoImport } from "../confirm/route"

const PARSERS: Record<TipoImport, (filas: Record<string, unknown>[], businessId: string, prisma_: typeof prisma) => Promise<{ ok: { indice: number; data: unknown }[]; errores: { indice: number; mensaje: string }[]; sinMatch: { indice: number; campo: string; valor: string }[] }>> = {
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

const TIPOS_VALIDOS = new Set<string>(Object.keys(PARSERS))

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = session.user.businessId as string
  const memberId = (session.user as { memberId?: string | null }).memberId

  if (!memberId) {
    return NextResponse.json({ error: "Usuario sin perfil de negocio" }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const tipoRaw = formData.get("tipo") as string | null

  if (!file) {
    return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
  }

  if (!tipoRaw || !TIPOS_VALIDOS.has(tipoRaw)) {
    return NextResponse.json({ error: "Tipo de importación inválido" }, { status: 400 })
  }

  const tipo = tipoRaw as TipoImport

  const extension = file.name.split(".").pop()?.toLowerCase()
  if (!["xlsx", "xls", "csv"].includes(extension ?? "")) {
    return NextResponse.json({ error: "Formato no soportado. Usa .xlsx, .xls o .csv" }, { status: 400 })
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "El archivo no puede superar 5 MB" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo" }, { status: 400 })
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 })
  }

  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  })

  if (rawRows.length === 0) {
    return NextResponse.json({ error: "El archivo no contiene filas de datos" }, { status: 400 })
  }

  const resultado = await PARSERS[tipo](rawRows, businessId, prisma)

  const importRecord = await prisma.dataImport.create({
    data: {
      businessId,
      createdById: memberId,
      fileName: file.name,
      rowsTotal: rawRows.length,
    },
    select: { id: true },
  })

  return NextResponse.json({
    importId: importRecord.id,
    tipo,
    rowsTotal: rawRows.length,
    ok: resultado.ok,
    errores: resultado.errores,
    sinMatch: resultado.sinMatch,
  })
}
