import type { Prisma, PrismaClient } from "@prisma/client"
import type { TotalDeclaradoImportado } from "@/lib/import/parsers/totales"
import type { EmpleadaDeclaradaImportada } from "@/lib/import/parsers/empleadas"

type Db = PrismaClient | Prisma.TransactionClient

export interface Discrepancia {
  etiqueta: string
  declarado: number
  real: number
  diferencia: number
}

const MESES_ES: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
}

function parsearPeriodo(s: string): { desde: Date; hasta: Date } | null {
  const str = s.trim().toLowerCase()

  // "enero 2024", "febrero 2023", etc.
  const matchNombre = str.match(/^([a-záéíóú]+)\s+(\d{4})$/)
  if (matchNombre) {
    const mes = MESES_ES[matchNombre[1]]
    if (mes !== undefined) {
      const anio = parseInt(matchNombre[2], 10)
      const desde = new Date(anio, mes, 1)
      const hasta = new Date(anio, mes + 1, 0, 23, 59, 59, 999)
      return { desde, hasta }
    }
  }

  // "2024-01", "2024-1"
  const matchISO = str.match(/^(\d{4})-(\d{1,2})$/)
  if (matchISO) {
    const anio = parseInt(matchISO[1], 10)
    const mes = parseInt(matchISO[2], 10) - 1
    const desde = new Date(anio, mes, 1)
    const hasta = new Date(anio, mes + 1, 0, 23, 59, 59, 999)
    return { desde, hasta }
  }

  return null
}

export async function calcularDiscrepanciasTotales(
  items: TotalDeclaradoImportado[],
  businessId: string,
  prisma: Db
): Promise<Discrepancia[]> {
  const result: Discrepancia[] = []

  for (const item of items) {
    const periodo = parsearPeriodo(item.periodo)
    const metodo = item.metodoPago.toUpperCase()

    const citas = await prisma.appointment.findMany({
      where: {
        businessId,
        paymentMethod: { equals: metodo, mode: "insensitive" },
        ...(periodo && { startTime: { gte: periodo.desde, lte: periodo.hasta } }),
        price: { not: null },
      },
      select: { price: true },
    })

    const real = citas.reduce((sum, c) => sum + (c.price ?? 0), 0)
    const declarado = item.montoDeclarado

    result.push({
      etiqueta: `${item.periodo} · ${item.metodoPago}`,
      declarado,
      real,
      diferencia: declarado - real,
    })
  }

  return result
}

export async function calcularDiscrepanciasEmpleadas(
  items: EmpleadaDeclaradaImportada[],
  businessId: string,
  prisma: Db
): Promise<Discrepancia[]> {
  const result: Discrepancia[] = []

  for (const item of items) {
    const periodo = parsearPeriodo(item.periodo)

    const todos = await prisma.businessMember.findMany({
      where: { businessId },
      include: { user: { select: { name: true } } },
    })
    const nombreNorm = item.trabajadora.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    const miembro = todos.find((m) => {
      const n = m.user.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      return n === nombreNorm || n.includes(nombreNorm) || nombreNorm.includes(n)
    })

    const citas = miembro
      ? await prisma.appointment.findMany({
          where: {
            businessId,
            memberId: miembro.id,
            ...(periodo && { startTime: { gte: periodo.desde, lte: periodo.hasta } }),
            price: { not: null },
          },
          select: { price: true },
        })
      : []

    const real = citas.reduce((sum, c) => sum + (c.price ?? 0), 0)
    const declarado = item.monto

    result.push({
      etiqueta: `${item.periodo} · ${item.trabajadora}`,
      declarado,
      real,
      diferencia: declarado - real,
    })
  }

  return result
}
