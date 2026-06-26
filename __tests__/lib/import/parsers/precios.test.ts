import { describe, test, expect } from "vitest"
import { parsearPrecios } from "@/lib/import/parsers/precios"
import type { PrismaClient } from "@prisma/client"

const prismaStub = {} as unknown as PrismaClient

describe("parsearPrecios", () => {
  test("fila válida se parsea correctamente", async () => {
    const filas = [{ nombre: "Manicure", precio: "15.000", duracion: "45" }]
    const res = await parsearPrecios(filas, "biz-1", prismaStub)
    expect(res.ok).toHaveLength(1)
    expect(res.ok[0].data).toEqual({ name: "Manicure", price: 15000, duration: 45 })
    expect(res.errores).toHaveLength(0)
  })

  test("precio con fórmula rota devuelve error sin lanzar excepción", async () => {
    const filas = [{ nombre: "Pedicure", precio: "#REF!", duracion: "60" }]
    const res = await parsearPrecios(filas, "biz-1", prismaStub)
    expect(res.errores).toHaveLength(1)
    expect(res.ok).toHaveLength(0)
  })

  test("duración cero o negativa devuelve error", async () => {
    const filas = [{ nombre: "Depilación", precio: "20.000", duracion: "0" }]
    const res = await parsearPrecios(filas, "biz-1", prismaStub)
    expect(res.errores).toHaveLength(1)
  })

  test("nombre vacío devuelve error", async () => {
    const filas = [{ nombre: "", precio: "10.000", duracion: "30" }]
    const res = await parsearPrecios(filas, "biz-1", prismaStub)
    expect(res.errores).toHaveLength(1)
  })

  test("múltiples filas — mezcla de ok y errores", async () => {
    const filas = [
      { nombre: "Manicure", precio: "15.000", duracion: "45" },
      { nombre: "", precio: "10.000", duracion: "30" },
      { nombre: "Cejas", precio: "8.000", duracion: "20" },
    ]
    const res = await parsearPrecios(filas, "biz-1", prismaStub)
    expect(res.ok).toHaveLength(2)
    expect(res.errores).toHaveLength(1)
  })
})
