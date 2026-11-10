import { describe, expect, it } from "vitest"
import { crearBloqueoDeScroll, type EstiloBloqueable } from "./bloqueo-de-scroll"

function pagina(ancho = 15, inicial: EstiloBloqueable = { overflow: "", paddingRight: "" }) {
  const estilo = { ...inicial }
  return { estilo, bloqueo: crearBloqueoDeScroll(() => estilo, () => ancho) }
}

describe("crearBloqueoDeScroll", () => {
  it("el primer diálogo bloquea y corre la página lo que ocupaba la barra; al cerrarlo vuelve lo de antes", () => {
    const { estilo, bloqueo } = pagina(15, { overflow: "auto", paddingRight: "" })
    const soltar = bloqueo.bloquear()
    expect(estilo).toEqual({ overflow: "hidden", paddingRight: "15px" })
    soltar()
    expect(estilo).toEqual({ overflow: "auto", paddingRight: "" })
  })

  it("con dos abiertos, la página se suelta recién al cerrar el último, en cualquier orden", () => {
    const { estilo, bloqueo } = pagina()
    const soltarDetalle = bloqueo.bloquear()
    const soltarConfirmacion = bloqueo.bloquear()
    soltarDetalle()
    expect(estilo.overflow).toBe("hidden")
    soltarConfirmacion()
    expect(estilo).toEqual({ overflow: "", paddingRight: "" })
  })

  it("soltar dos veces el mismo no suelta el de otro", () => {
    const { estilo, bloqueo } = pagina()
    const soltar = bloqueo.bloquear()
    bloqueo.bloquear()
    soltar()
    soltar()
    expect(estilo.overflow).toBe("hidden")
  })

  it("sin barra (teléfono, o barra superpuesta) no agrega margen", () => {
    const { estilo, bloqueo } = pagina(0)
    bloqueo.bloquear()
    expect(estilo).toEqual({ overflow: "hidden", paddingRight: "" })
  })

  it("después de soltar todo, el siguiente vuelve a guardar lo que hay en ese momento", () => {
    const { estilo, bloqueo } = pagina()
    bloqueo.bloquear()()
    estilo.overflow = "scroll"
    const soltar = bloqueo.bloquear()
    soltar()
    expect(estilo.overflow).toBe("scroll")
  })
})
