import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import * as XLSX from "xlsx"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })
  }

  const extension = file.name.split(".").pop()?.toLowerCase()
  if (!["xlsx", "xls", "csv"].includes(extension ?? "")) {
    return NextResponse.json(
      { error: "Formato no soportado. Usa .xlsx, .xls o .csv" },
      { status: 400 }
    )
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

  const sheet = workbook.Sheets[sheetName]
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  })

  if (rawRows.length === 0) {
    return NextResponse.json({ error: "El archivo no contiene filas de datos" }, { status: 400 })
  }

  const columnas = Object.keys(rawRows[0])

  // Auto-detect column mapping by comparing normalized header names
  const normalizar = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "")

  const candidatos: Record<string, string[]> = {
    nombre: ["nombre", "name", "paciente", "cliente", "nombrecompleto"],
    apellido: ["apellido", "lastname", "apellidos"],
    telefono: ["telefono", "phone", "cel", "celular", "movil", "whatsapp", "tel"],
    email: ["email", "correo", "mail", "correoe"],
    notas: ["notas", "notes", "observaciones", "comentarios"],
  }

  const mapeoSugerido: Record<string, string> = {}
  for (const col of columnas) {
    const norm = normalizar(col)
    for (const [campo, alias] of Object.entries(candidatos)) {
      if (alias.some((a) => norm.includes(a)) && !mapeoSugerido[campo]) {
        mapeoSugerido[campo] = col
      }
    }
  }

  const preview = rawRows.slice(0, 20).map((row) =>
    Object.fromEntries(
      columnas.map((col) => [col, String(row[col] ?? "")])
    )
  )

  return NextResponse.json({
    columnas,
    preview,
    totalFilas: rawRows.length,
    mapeoSugerido,
    fileName: file.name,
  })
}
