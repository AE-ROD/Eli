import { beforeEach, describe, expect, it, vi } from "vitest"

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { business: { findUnique } } }))

import { zonaHorariaDelNegocio } from "./zona-horaria-servidor"

describe("zonaHorariaDelNegocio", () => {
  beforeEach(() => {
    findUnique.mockReset()
  })

  it("lee la zona del negocio que se pide, y sólo la zona", async () => {
    findUnique.mockResolvedValue({ timezone: "America/Bogota" })

    expect(await zonaHorariaDelNegocio("neg-1")).toBe("America/Bogota")
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "neg-1" }, select: { timezone: true } })
  })

  it("una zona que el motor no conoce cae a la de por defecto", async () => {
    findUnique.mockResolvedValue({ timezone: "No/Existe" })

    expect(await zonaHorariaDelNegocio("neg-1")).toBe("America/Santiago")
  })

  it("un negocio que no está cae a la de por defecto", async () => {
    findUnique.mockResolvedValue(null)

    expect(await zonaHorariaDelNegocio("neg-2")).toBe("America/Santiago")
  })

  it("si la lectura falla, el error llega a quien pregunta", async () => {
    findUnique.mockRejectedValue(new Error("base caída"))

    await expect(zonaHorariaDelNegocio("neg-3")).rejects.toThrow("base caída")
  })
})
