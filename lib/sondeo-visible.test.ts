import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { iniciarSondeoVisible, type DocumentoConVisibilidad } from "./sondeo-visible"

/** Un documento mínimo: el estado de visibilidad y los oyentes de `visibilitychange`. */
function documentoFalso(estadoInicial = "visible") {
  const oyentes = new Set<() => void>()
  const documento = {
    visibilityState: estadoInicial,
    addEventListener: vi.fn((_tipo: "visibilitychange", escucha: () => void) => void oyentes.add(escucha)),
    removeEventListener: vi.fn((_tipo: "visibilitychange", escucha: () => void) => void oyentes.delete(escucha)),
  }
  return {
    documento: documento as DocumentoConVisibilidad & typeof documento,
    oyentes,
    /** Lo que hace el navegador al esconder o mostrar la pestaña. */
    cambiarA(estado: "visible" | "hidden") {
      documento.visibilityState = estado
      for (const escucha of [...oyentes]) escucha()
    },
  }
}

describe("iniciarSondeoVisible", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("no llama nada al arrancar: la primera carga es de quien lo usa", () => {
    const { documento } = documentoFalso()
    const alTocar = vi.fn()

    iniciarSondeoVisible({ alTocar, cadaMs: 15_000, documento })

    expect(alTocar).not.toHaveBeenCalled()
  })

  it("con la pestaña a la vista llama en cada período", () => {
    const { documento } = documentoFalso()
    const alTocar = vi.fn()
    iniciarSondeoVisible({ alTocar, cadaMs: 15_000, documento })

    vi.advanceTimersByTime(14_999)
    expect(alTocar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(alTocar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_000)
    expect(alTocar).toHaveBeenCalledTimes(3)
  })

  it("con la pestaña oculta el reloj da vueltas y no llama", () => {
    const { documento } = documentoFalso("hidden")
    const alTocar = vi.fn()
    iniciarSondeoVisible({ alTocar, cadaMs: 15_000, documento })

    vi.advanceTimersByTime(10 * 60_000)

    expect(alTocar).not.toHaveBeenCalled()
  })

  it("al esconder la pestaña deja de llamar, y al volver llama en el acto", () => {
    const { documento, cambiarA } = documentoFalso()
    const alTocar = vi.fn()
    iniciarSondeoVisible({ alTocar, cadaMs: 15_000, documento })
    vi.advanceTimersByTime(15_000)
    expect(alTocar).toHaveBeenCalledTimes(1)

    cambiarA("hidden")
    expect(alTocar).toHaveBeenCalledTimes(1) // esconderla no pide nada
    vi.advanceTimersByTime(60_000)
    expect(alTocar).toHaveBeenCalledTimes(1)

    cambiarA("visible")
    expect(alTocar).toHaveBeenCalledTimes(2) // al volver, sin esperar al reloj
    vi.advanceTimersByTime(15_000)
    expect(alTocar).toHaveBeenCalledTimes(3)
  })

  it("al detenerlo suelta el reloj y el oyente: ya no llama", () => {
    const { documento, oyentes, cambiarA } = documentoFalso()
    const alTocar = vi.fn()
    const detener = iniciarSondeoVisible({ alTocar, cadaMs: 15_000, documento })
    expect(oyentes.size).toBe(1)

    detener()

    expect(oyentes.size).toBe(0)
    expect(documento.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function))
    vi.advanceTimersByTime(60_000)
    cambiarA("hidden")
    cambiarA("visible")
    expect(alTocar).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
