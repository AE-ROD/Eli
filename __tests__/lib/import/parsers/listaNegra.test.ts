import { describe, test, expect } from "vitest"
import { parsearListaNegra } from "@/lib/import/parsers/listaNegra"
import type { PrismaClient } from "@prisma/client"

const prismaStub = {} as unknown as PrismaClient

describe("parsearListaNegra", () => {
  test("fila válida con todos los campos", async () => {
    const filas = [{ nombre: "Juan Pérez", telefono: "+56912345678", email: "juan@example.com", motivo: "Reclamo SERNAC" }]
    const res = await parsearListaNegra(filas, "biz-1", prismaStub)
    expect(res.ok).toHaveLength(1)
    expect(res.ok[0].data.tags).toEqual(["no-agendar"])
    expect(res.ok[0].data.notes).toBe("Reclamo SERNAC")
    expect(res.ok[0].data.phone).toBe("+56912345678")
  })

  test("fila sin nombre devuelve error", async () => {
    const filas = [{ nombre: "", telefono: "+56912345678", motivo: "Mala reseña" }]
    const res = await parsearListaNegra(filas, "biz-1", prismaStub)
    expect(res.errores).toHaveLength(1)
    expect(res.ok).toHaveLength(0)
  })

  test("sin motivo usa texto por defecto", async () => {
    const filas = [{ nombre: "María García", telefono: "", email: "", motivo: "" }]
    const res = await parsearListaNegra(filas, "biz-1", prismaStub)
    expect(res.ok).toHaveLength(1)
    expect(res.ok[0].data.notes).toBe("Sin motivo registrado")
    expect(res.ok[0].data.phone).toBeUndefined()
  })
})
