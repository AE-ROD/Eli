import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

interface ColumnMapping {
  nombre?: string
  apellido?: string
  telefono?: string
  email?: string
  notas?: string
}

interface ConfirmPayload {
  fileName: string
  mapeo: ColumnMapping
  file: string // base64-encoded file
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId || !session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = session.user.businessId as string

  const member = await prisma.businessMember.findFirst({
    where: { userId: session.user.id, businessId },
    select: { id: true },
  })
  if (!member) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let body: ConfirmPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }

  const { fileName, mapeo, file: fileBase64 } = body

  if (!fileBase64 || !mapeo) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 })
  }

  const buffer = Buffer.from(fileBase64, "base64")
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
  } catch {
    return NextResponse.json({ error: "No se pudo procesar el archivo" }, { status: 400 })
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  })

  let importados = 0
  let omitidos = 0
  const errores: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const nombre = String(row[mapeo.nombre ?? ""] ?? "").trim()

    if (!nombre) {
      omitidos++
      continue
    }

    const apellido = mapeo.apellido ? String(row[mapeo.apellido] ?? "").trim() : undefined
    const telefono = mapeo.telefono ? String(row[mapeo.telefono] ?? "").trim() : undefined
    const email = mapeo.email ? String(row[mapeo.email] ?? "").trim() || undefined : undefined
    const notas = mapeo.notas ? String(row[mapeo.notas] ?? "").trim() || undefined : undefined

    try {
      if (email) {
        await prisma.patient.upsert({
          where: { businessId_email: { businessId, email } },
          update: {
            name: nombre,
            lastName: apellido || undefined,
            phone: telefono || undefined,
            notes: notas || undefined,
          },
          create: {
            businessId,
            name: nombre,
            lastName: apellido || undefined,
            phone: telefono || undefined,
            email,
            notes: notas || undefined,
          },
        })
      } else {
        await prisma.patient.create({
          data: {
            businessId,
            name: nombre,
            lastName: apellido || undefined,
            phone: telefono || undefined,
            notes: notas || undefined,
          },
        })
      }
      importados++
    } catch (err: unknown) {
      // skip duplicate without email (no unique constraint to upsert on)
      if ((err as { code?: string }).code === "P2002") {
        omitidos++
      } else {
        errores.push(`Fila ${i + 2}: ${nombre}`)
        omitidos++
      }
    }
  }

  await prisma.dataImport.create({
    data: {
      businessId,
      createdById: member.id,
      fileName: fileName ?? "importación",
      rowsTotal: rows.length,
      rowsImported: importados,
      rowsSkipped: omitidos,
    },
  })

  return NextResponse.json({ importados, omitidos, errores })
}
