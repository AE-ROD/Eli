import { describe, test, expect, vi } from "vitest"
import { parsearRegistro } from "@/lib/import/parsers/registro"
import type { PrismaClient } from "@prisma/client"

function makePrisma(miembros: { id: string; user: { name: string } }[]) {
  return {
    businessMember: {
      findMany: vi.fn().mockResolvedValue(miembros),
    },
  } as unknown as PrismaClient
}

describe("parsearRegistro", () => {
  test("fila válida con especialista que hace match", async () => {
    const prisma = makePrisma([{ id: "m1", user: { name: "Ana López" } }])
    const filas = [{
      fecha: "15-01-2024",
      especialista: "Ana López",
      servicio: "Manicure",
      precio: "15.000",
      metodoPago: "EFECTIVO",
      propina: "1.000",
    }]
    const res = await parsearRegistro(filas, "biz-1", prisma)
    expect(res.ok).toHaveLength(1)
    expect(res.ok[0].data.memberId).toBe("m1")
    expect(res.ok[0].data.price).toBe(15000)
    expect(res.ok[0].data.tipAmount).toBe(1000)
    expect(res.ok[0].data.paymentMethod).toBe("EFECTIVO")
  })

  test("especialista sin match va a sinMatch", async () => {
    const prisma = makePrisma([{ id: "m1", user: { name: "Ana López" } }])
    const filas = [{
      fecha: "15-01-2024",
      especialista: "Desconocida X",
      servicio: "Pedicure",
      precio: "12.000",
      metodoPago: "EFECTIVO",
    }]
    const res = await parsearRegistro(filas, "biz-1", prisma)
    expect(res.sinMatch).toHaveLength(1)
    expect(res.sinMatch[0].campo).toBe("especialista")
    expect(res.sinMatch[0].valor).toBe("Desconocida X")
  })

  test("pago dividido construye paymentBreakdown", async () => {
    const prisma = makePrisma([{ id: "m1", user: { name: "Ana López" } }])
    const filas = [{
      fecha: "15-01-2024",
      especialista: "Ana López",
      servicio: "Manicure",
      precio: "20.000",
      metodoPago: "DIVIDIDO",
      monto2: "8.000",
      metodoPago2: "DEBITO",
    }]
    const res = await parsearRegistro(filas, "biz-1", prisma)
    expect(res.ok).toHaveLength(1)
    expect(res.ok[0].data.paymentBreakdown).toHaveLength(2)
    expect(res.ok[0].data.paymentBreakdown![1].amount).toBe(8000)
    expect(res.ok[0].data.paymentBreakdown![0].amount).toBe(12000)
  })

  test("VACANTE en especialista no genera sinMatch", async () => {
    const prisma = makePrisma([])
    const filas = [{
      fecha: "15-01-2024",
      especialista: "VACANTE",
      servicio: "Cortesía",
      precio: "0",
      metodoPago: "CORTESÍA",
    }]
    const res = await parsearRegistro(filas, "biz-1", prisma)
    expect(res.ok).toHaveLength(1)
    expect(res.ok[0].data.memberId).toBeUndefined()
  })

  test("fecha inválida devuelve error", async () => {
    const prisma = makePrisma([])
    const filas = [{ fecha: "no-es-fecha", especialista: "", servicio: "Test", precio: "1.000", metodoPago: "" }]
    const res = await parsearRegistro(filas, "biz-1", prisma)
    expect(res.errores).toHaveLength(1)
  })
})
