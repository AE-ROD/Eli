import { describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/**
 * El rubro sale del `slug`, nunca de datos del navegador, y de cada negocio el
 * suyo: el de otro no se filtra. Un slug que no existe da `null`, y con `null`
 * la pantalla habla como siempre.
 */
describe("leerRubroDelNegocio", () => {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => ({ ...negocio, type: negocio.id === NEGOCIO ? "salon" : "odontologia" })),
  })

  it("lee el rubro del negocio del slug", async () => {
    const { leerRubroDelNegocio } = await import("./_rubro")

    expect(await leerRubroDelNegocio("salon-uno")).toBe("salon")
    expect(await leerRubroDelNegocio("salon-dos")).toBe("odontologia")
    expect(OTRO_NEGOCIO).not.toBe(NEGOCIO)
  })

  it("un slug que no existe: null", async () => {
    const { leerRubroDelNegocio } = await import("./_rubro")

    expect(await leerRubroDelNegocio("no-existe")).toBeNull()
  })
})
