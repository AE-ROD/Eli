import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import * as XLSX from "xlsx"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type FormatoExportacion = "xlsx" | "csv"

function fechaArchivo() {
  return new Date().toISOString().split("T")[0]
}

function normalizarFormato(formato: string | null): FormatoExportacion {
  return formato === "csv" ? "csv" : "xlsx"
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const businessId = session.user.businessId as string

  const { searchParams } = new URL(request.url)
  const formato = normalizarFormato(searchParams.get("formato"))

  const patients = await prisma.patient.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: {
      appointments: {
        where: { status: { not: "cancelada" } },
        select: { startTime: true, isWalkIn: true },
        orderBy: { startTime: "desc" },
      },
    },
  })

  const filas = patients.map((p) => ({
    Nombre: p.name,
    Apellido: p.lastName ?? "",
    Teléfono: p.phone ?? "",
    Email: p.email ?? "",
    Etiquetas: p.tags.join(", "),
    Notas: p.notes ?? "",
    "Registrado el": p.createdAt.toISOString().split("T")[0],
    "Última visita": p.appointments[0]?.startTime.toISOString().split("T")[0] ?? "Sin visitas",
    "Total visitas": p.appointments.length,
    "Walk-ins": p.appointments.filter((a) => a.isWalkIn).length,
  }))

  const hoja = XLSX.utils.json_to_sheet(filas)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, "Clientes")

  const extension = formato === "csv" ? "csv" : "xlsx"
  const nombreArchivo = `clientes-eli-${fechaArchivo()}.${extension}`
  const contenido = XLSX.write(libro, {
    bookType: formato,
    type: formato === "csv" ? "string" : "buffer",
  })

  return new NextResponse(contenido, {
    headers: {
      "Content-Type":
        formato === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      "Cache-Control": "no-store",
    },
  })
}
