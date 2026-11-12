import { describe, it, expect } from "vitest"
import {
  enElPanel,
  INTERVALO_DE_RELECTURA_S,
  intervaloDeRelectura,
  MARGEN_DE_RELECTURA_S,
  REVALIDAR_CADA_MS,
} from "./renovacion-de-sesion"

describe("el intervalo de relectura de la sesión", () => {
  it("es MÁS largo que el plazo de revalidación, nunca igual ni menor", () => {
    // Con cinco minutos justos el temporizador puede disparar unos
    // milisegundos antes de que la revalidación esté vencida y no renovar nada.
    expect(INTERVALO_DE_RELECTURA_S * 1000).toBeGreaterThan(REVALIDAR_CADA_MS)
    expect(MARGEN_DE_RELECTURA_S).toBeGreaterThan(0)
  })

  it("deja la ventana sin renovar en unos pocos segundos, no en minutos", () => {
    expect(INTERVALO_DE_RELECTURA_S * 1000 - REVALIDAR_CADA_MS).toBeLessThanOrEqual(30 * 1000)
  })

  it("el plazo de revalidación es de cinco minutos, como lo promete lib/auth.ts", () => {
    expect(REVALIDAR_CADA_MS).toBe(5 * 60 * 1000)
  })
})

describe("enElPanel", () => {
  it.each(["/dashboard", "/dashboard/", "/dashboard/agenda", "/dashboard/clientes/abc123"])("%s es del panel", (ruta) => {
    expect(enElPanel(ruta)).toBe(true)
  })

  it.each(["/", "/iniciar-sesion", "/reservar/salon-demo", "/dashboardx", "/dashboards/agenda", "/api/dashboard/stats", ""])(
    "%s no es del panel",
    (ruta) => {
      expect(enElPanel(ruta)).toBe(false)
    }
  )

  it("una ruta que no es texto (todavía sin resolver) no es del panel", () => {
    expect(enElPanel(null)).toBe(false)
    expect(enElPanel(undefined)).toBe(false)
  })
})

describe("intervaloDeRelectura", () => {
  it("dentro del panel relee cada INTERVALO_DE_RELECTURA_S", () => {
    expect(intervaloDeRelectura("/dashboard/tablero")).toBe(INTERVALO_DE_RELECTURA_S)
  })

  it("fuera del panel no sondea", () => {
    expect(intervaloDeRelectura("/")).toBe(0)
    expect(intervaloDeRelectura("/reservar/salon-demo")).toBe(0)
    expect(intervaloDeRelectura(null)).toBe(0)
  })
})
