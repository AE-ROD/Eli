import type { Prisma, PrismaClient } from "@prisma/client"
import type { TipoImport } from "../confirm/route"
import type { BitacoraEventoImportado } from "@/lib/import/parsers/bitacoraEventos"
import type { CajaChicaImportada } from "@/lib/import/parsers/cajaChica"
import type { ClienteAgendaImportado } from "@/lib/import/parsers/clientes"
import type { DatosPersonalImportado } from "@/lib/import/parsers/datosPersonal"
import type { EmpleadaDeclaradaImportada } from "@/lib/import/parsers/empleadas"
import type { ListaNegraImportada } from "@/lib/import/parsers/listaNegra"
import type { PrecioImportado } from "@/lib/import/parsers/precios"
import type { PagoImportado } from "@/lib/import/parsers/registro"
import type { TotalDeclaradoImportado } from "@/lib/import/parsers/totales"

type Db = PrismaClient | Prisma.TransactionClient

function sumarMinutos(fecha: Date, minutos: number) {
  return new Date(fecha.getTime() + minutos * 60 * 1000)
}

function unirTags(tagsActuales: string[] | undefined, nuevas: string[]) {
  return Array.from(new Set([...(tagsActuales ?? []), ...nuevas]))
}

async function buscarPaciente(
  prisma: Db,
  businessId: string,
  datos: { phone?: string; email?: string; name?: string }
) {
  const condiciones = [
    datos.phone ? { phone: datos.phone } : null,
    datos.email ? { email: datos.email } : null,
  ].filter((condicion): condicion is { phone: string } | { email: string } => Boolean(condicion))

  if (condiciones.length > 0) {
    return prisma.patient.findFirst({
      where: { businessId, OR: condiciones },
      select: { id: true, tags: true },
    })
  }

  if (datos.name) {
    return prisma.patient.findFirst({
      where: { businessId, name: datos.name },
      select: { id: true, tags: true },
    })
  }

  return null
}

async function obtenerOCrearPaciente(
  prisma: Db,
  businessId: string,
  datos: { name: string; phone?: string; email?: string; tags?: string[]; notes?: string }
) {
  const existente = await buscarPaciente(prisma, businessId, datos)
  if (existente) {
    await prisma.patient.update({
      where: { id: existente.id },
      data: {
        name: datos.name,
        ...(datos.phone ? { phone: datos.phone } : {}),
        ...(datos.email ? { email: datos.email } : {}),
        ...(datos.notes ? { notes: datos.notes } : {}),
        tags: unirTags(existente.tags, datos.tags ?? []),
      },
    })
    return existente.id
  }

  const creado = await prisma.patient.create({
    data: {
      businessId,
      name: datos.name,
      ...(datos.phone ? { phone: datos.phone } : {}),
      ...(datos.email ? { email: datos.email } : {}),
      ...(datos.notes ? { notes: datos.notes } : {}),
      tags: datos.tags ?? [],
    },
    select: { id: true },
  })
  return creado.id
}

export async function persistirPrecios(items: PrecioImportado[], businessId: string, prisma: Db) {
  for (const item of items) {
    const existente = await prisma.service.findFirst({
      where: { businessId, name: item.name },
      select: { id: true },
    })

    if (existente) {
      await prisma.service.update({
        where: { id: existente.id },
        data: { price: item.price, duration: item.duration, active: true },
      })
    } else {
      await prisma.service.create({
        data: { businessId, name: item.name, price: item.price, duration: item.duration, active: true },
      })
    }
  }
}

export async function persistirListaNegra(items: ListaNegraImportada[], businessId: string, prisma: Db) {
  for (const item of items) {
    await obtenerOCrearPaciente(prisma, businessId, {
      name: item.name,
      phone: item.phone,
      email: item.email,
      notes: item.notes,
      tags: item.tags,
    })
  }
}

export async function persistirClientes(items: ClienteAgendaImportado[], businessId: string, prisma: Db) {
  for (const item of items) {
    const patientId = await obtenerOCrearPaciente(prisma, businessId, {
      name: item.patientName,
      phone: item.phone,
      email: item.email,
    })

    await prisma.appointment.create({
      data: {
        businessId,
        patientId,
        memberId: item.memberId,
        title: "Importación histórica",
        startTime: item.appointmentDate,
        endTime: sumarMinutos(item.appointmentDate, 60),
        status: "completada",
      },
    })
  }
}

export async function persistirCajaChica(items: CajaChicaImportada[], businessId: string, prisma: Db) {
  if (items.length === 0) return

  const miembro = await prisma.businessMember.findFirst({
    where: { businessId },
    select: { id: true },
  })
  if (!miembro) throw new Error("No hay miembro del negocio para asociar caja chica")

  for (const item of items) {
    const existente = await prisma.shiftClose.findFirst({
      where: { businessId, shiftDate: item.date, shiftPeriod: "importacion" },
      select: { id: true },
    })
    const data = {
      cashOpening: item.cashOpening,
      cashClosing: item.cashClosing,
      cashExpenses: item.expenses,
      cashDenominations: item.denominations,
    }

    if (existente) {
      await prisma.shiftClose.update({ where: { id: existente.id }, data })
    } else {
      await prisma.shiftClose.create({
        data: {
          businessId,
          closedById: miembro.id,
          shiftDate: item.date,
          shiftPeriod: "importacion",
          ...data,
        },
      })
    }
  }
}

export async function persistirDatosPersonal(items: DatosPersonalImportado[], businessId: string, prisma: Db) {
  for (const item of items) {
    if (!item.memberId) continue
    await prisma.businessMember.updateMany({
      where: { id: item.memberId, businessId },
      data: {
        emergencyContactName: item.emergencyContactName,
        emergencyContactPhone: item.emergencyContactPhone,
      },
    })
  }
}

export async function persistirBitacoraEventos(items: BitacoraEventoImportado[], businessId: string, prisma: Db) {
  for (const item of items) {
    if (item.tipo === "produccion") continue

    await obtenerOCrearPaciente(prisma, businessId, {
      name: item.patientName,
      phone: item.phone,
      tags: ["no-asiste"],
      notes: `No-show importado: ${item.date.toISOString().split("T")[0]}`,
    })
  }
}

export async function persistirRegistro(items: PagoImportado[], businessId: string, prisma: Db) {
  for (const item of items) {
    const startTime = new Date()
    await prisma.appointment.create({
      data: {
        businessId,
        title: item.title,
        memberId: item.memberId,
        startTime,
        endTime: sumarMinutos(startTime, 60),
        status: "completada",
        price: item.price,
        paymentMethod: item.paymentMethod,
        paymentBreakdown: item.paymentBreakdown,
        tipAmount: item.tipAmount,
      },
    })
  }
}

export async function persistirTotales(_items: TotalDeclaradoImportado[]) {}

export async function persistirEmpleadas(_items: EmpleadaDeclaradaImportada[]) {}

export async function persistirImport(
  tipo: TipoImport,
  items: unknown[],
  businessId: string,
  prisma: Db
) {
  switch (tipo) {
    case "precios":
      return persistirPrecios(items as PrecioImportado[], businessId, prisma)
    case "listaNegra":
      return persistirListaNegra(items as ListaNegraImportada[], businessId, prisma)
    case "clientes":
      return persistirClientes(items as ClienteAgendaImportado[], businessId, prisma)
    case "cajaChica":
      return persistirCajaChica(items as CajaChicaImportada[], businessId, prisma)
    case "bitacoraEventos":
      return persistirBitacoraEventos(items as BitacoraEventoImportado[], businessId, prisma)
    case "totales":
      return persistirTotales(items as TotalDeclaradoImportado[])
    case "empleadas":
      return persistirEmpleadas(items as EmpleadaDeclaradaImportada[])
    case "datosPersonal":
      return persistirDatosPersonal(items as DatosPersonalImportado[], businessId, prisma)
    case "registro":
      return persistirRegistro(items as PagoImportado[], businessId, prisma)
  }
}
