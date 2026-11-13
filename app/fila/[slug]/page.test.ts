import { beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase } from "@/pruebas/datos"

/**
 * `/fila/[slug]`, la página pública para anotarse en la fila virtual: con la
 * fila apagada, un negocio que no existe o una clínica dental (que no tiene
 * fila virtual, aunque quede encendida de antes), el mismo 404 que el endpoint.
 */

const { notFound } = vi.hoisted(() => ({
  // Como el de Next: corta la página ahí.
  notFound: vi.fn(() => {
    throw new Error("notFound")
  }),
}))
vi.mock("next/navigation", () => ({ notFound }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

// Sólo importa qué se decide, no cómo se dibuja.
vi.mock("./_componentes/anotarse-en-la-fila", () => ({ AnotarseEnLaFila: () => null }))
vi.mock("./_componentes/marco-de-fila", () => ({ MarcoDeFila: () => null }))

function escenario(negocio: Record<string, unknown> = {}) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((b) => ({ ...b, filaVirtualActiva: true, ...(b.id === NEGOCIO ? negocio : {}) })),
  })
}

async function abrir(slug = "salon-uno") {
  const { default: PaginaDeLaFila } = await import("./page")
  try {
    await PaginaDeLaFila({ params: Promise.resolve({ slug }) })
    return "se ve"
  } catch (error) {
    return (error as Error).message
  }
}

beforeEach(() => {
  notFound.mockClear()
})

describe("/fila/[slug]", () => {
  it("con la fila encendida, un salón la muestra", async () => {
    escenario()
    expect(await abrir()).toBe("se ve")
  })

  it("apagada o con un slug que no existe: 404", async () => {
    escenario({ filaVirtualActiva: false })
    expect(await abrir()).toBe("notFound")
    expect(await abrir("no-existe")).toBe("notFound")
  })

  it("una clínica dental: 404, aunque la fila siga encendida de antes", async () => {
    escenario({ type: "odontologia" })
    expect(await abrir()).toBe("notFound")
    expect(notFound).toHaveBeenCalled()
  })
})
