import type { PrismaClient } from "@prisma/client"
import type { ResultadoParseo } from "@/lib/import/tipos"
import { matchEspecialista } from "@/lib/import/matchEspecialista"
import { normalizarNombre } from "@/lib/import/normalizar"
import { agregarError, campo, crearResultado, fechaCampo, memberIdResuelto, montoCampo, type FilaParser } from "./_helpers"

export interface PagoImportado {
  title: string
  memberId?: string
  price: number
  paymentMethod: string
  paymentBreakdown?: { method: string; amount: number }[]
  tipAmount: number
}

export async function parsearRegistro(
  filas: FilaParser[],
  businessId: string,
  prisma: PrismaClient
): Promise<ResultadoParseo<PagoImportado>> {
  const resultado = crearResultado<PagoImportado>()

  for (const [i, fila] of filas.entries()) {
    const indice = i + 2
    const especialista = campo(fila, ["especialista", "trabajadora", "staff"])
    const title = campo(fila, ["servicio", "title"])
    const price = montoCampo(fila, ["precio", "monto"])
    const paymentMethod = campo(fila, ["metodoPago", "métodoPago", "metodo pago", "método pago"]) || "SIN INFORMAR"
    const tipAmount = montoCampo(fila, ["propina"]) ?? 0
    const fechaTexto = campo(fila, ["fecha"])
    const fecha = fechaTexto ? fechaCampo(fila, ["fecha"]) : new Date()
    const miembroResuelto = await memberIdResuelto(fila, businessId, prisma)

    if (!fecha) {
      agregarError(resultado.errores, indice, "Fecha inválida", fila)
      continue
    }
    if (!title) {
      agregarError(resultado.errores, indice, "Falta servicio", fila)
      continue
    }
    if (price === null) {
      agregarError(resultado.errores, indice, "Precio inválido", fila)
      continue
    }
    const especialistaOpcional = ["VACANTE", "SIN ESPECIALISTA"].includes(especialista.toUpperCase())
    if (!especialista && !miembroResuelto) {
      agregarError(resultado.errores, indice, "Falta especialista", fila)
      continue
    }

    const miembro = miembroResuelto ?? (especialistaOpcional
      ? null
      : await matchEspecialista(normalizarNombre(especialista), businessId, prisma))
    if (!especialistaOpcional && !miembro) {
      resultado.sinMatch.push({ indice, campo: "especialista", valor: especialista, fila })
      continue
    }

    const metodoPago2 = campo(fila, ["metodoPago2", "métodoPago2", "metodo pago 2", "método pago 2"])
    const monto2 = montoCampo(fila, ["monto2", "monto 2"])
    const paymentBreakdown =
      paymentMethod.toUpperCase() === "DIVIDIDO" && metodoPago2 && monto2 !== null
        ? [
            { method: paymentMethod, amount: price - monto2 },
            { method: metodoPago2, amount: monto2 },
          ]
        : undefined

    resultado.ok.push({
      indice,
      data: {
        title,
        ...(miembro ? { memberId: miembro.id } : {}),
        price,
        paymentMethod,
        ...(paymentBreakdown ? { paymentBreakdown } : {}),
        tipAmount,
      },
    })
  }

  return resultado
}
