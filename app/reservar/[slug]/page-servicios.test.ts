import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/*
 * Lo que la página le pasa al formulario de reserva: los servicios activos del
 * negocio del `slug`, con la categoría de cada uno (el primer paso los ordena
 * con ella). Se lee el árbol de elementos que arma la página, sin pintarlo.
 */

const { leerPagina, buscarNegocio } = vi.hoisted(() => ({ leerPagina: vi.fn(), buscarNegocio: vi.fn() }))
vi.mock("./_pagina/datos-de-la-pagina", () => ({ leerPaginaDelNegocio: leerPagina }))
vi.mock("@/lib/prisma", () => ({ prisma: { business: { findUnique: buscarNegocio } } }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  useSearchParams: () => new URLSearchParams(""),
}))

const pagina = {
  nombre: "Casa Ana",
  slug: "casa-ana",
  rubro: "salon",
  comuna: null,
  direccion: null,
  equipo: [],
  horario: [],
  plazoDeCambiosHoras: 24,
}

const servicio = (id: string, category: string | null, esUrgencia = false) => ({
  id,
  name: `Servicio ${id}`,
  description: null,
  duration: 30,
  price: 10000,
  category,
  esUrgencia,
})

/** El primer elemento de ese tipo en el árbol que armó la página (sin renderizar los componentes). */
function buscar(nodo: ReactNode, tipo: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const encontrado = buscar(hijo, tipo)
      if (encontrado) return encontrado
    }
    return null
  }
  if (!isValidElement<{ children?: ReactNode }>(nodo)) return null
  if (nodo.type === tipo) return nodo as unknown as { props: Record<string, unknown> }
  // La reserva va como prop de la mini página (`reserva`), no como hija.
  return buscar((nodo.props as { reserva?: ReactNode }).reserva, tipo) ?? buscar(nodo.props.children, tipo)
}

async function formularioDe(negocio: { type: string; services: ReturnType<typeof servicio>[] } | null) {
  buscarNegocio.mockResolvedValueOnce(
    negocio && { name: "Casa Ana", slug: "casa-ana", timezone: "America/Santiago", listaDeEsperaActiva: false, ...negocio }
  )
  leerPagina.mockResolvedValueOnce(negocio && pagina)
  const { default: PaginaReserva } = await import("./page")
  const { FormularioReserva } = await import("./_componentes/formulario-reserva")
  const arbol = await PaginaReserva({ params: Promise.resolve({ slug: "casa-ana" }) })
  return buscar(arbol as ReactNode, FormularioReserva)
}

beforeEach(() => {
  leerPagina.mockReset()
  buscarNegocio.mockReset()
})

describe("la página le pasa los servicios al formulario de reserva", () => {
  it("el negocio sale del slug y sólo se leen los servicios activos, con su categoría", async () => {
    await formularioDe({ type: "salon", services: [servicio("a", "Color")] })

    const consulta = buscarNegocio.mock.calls[0][0]
    expect(consulta.where).toEqual({ slug: "casa-ana" })
    expect(consulta.select.services.where).toEqual({ active: true })
    expect(consulta.select.services.select.category).toBe(true)
  })

  it("cada servicio llega con su categoría, o sin ella (null)", async () => {
    const formulario = await formularioDe({
      type: "salon",
      services: [servicio("a", "Color"), servicio("b", null), servicio("c", "Corte")],
    })

    const servicios = formulario?.props.servicios as { id: string; category: string | null }[]
    expect(servicios.map((s) => [s.id, s.category])).toEqual([
      ["a", "Color"],
      ["b", null],
      ["c", "Corte"],
    ])
  })

  it("una clínica dental suma si cada servicio es urgencia y conserva la categoría", async () => {
    const formulario = await formularioDe({ type: "odontologia", services: [servicio("a", "Control", true)] })

    expect(formulario?.props.servicios).toEqual([
      { id: "a", name: "Servicio a", description: null, duration: 30, price: 10000, category: "Control", esUrgencia: true },
    ])
  })

  it("en otro rubro no sale la bandera de urgencia", async () => {
    const formulario = await formularioDe({ type: "salon", services: [servicio("a", "Color", true)] })

    expect(formulario?.props.servicios).toEqual([
      { id: "a", name: "Servicio a", description: null, duration: 30, price: 10000, category: "Color" },
    ])
  })

  it("un negocio que no existe es un 404", async () => {
    await expect(formularioDe(null)).rejects.toThrow("NEXT_NOT_FOUND")
  })
})
