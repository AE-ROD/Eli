import { afterEach, describe, expect, it, vi } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { cambiarPrestacion, correrDias, leerCitasDelPaciente } from "./_datos"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("correrDias", () => {
  it("corre una fecha calendario, también entre meses y años", () => {
    expect(correrDias("2026-11-10", -365)).toBe("2025-11-10")
    expect(correrDias("2026-12-31", 1)).toBe("2027-01-01")
    expect(correrDias("2026-03-01", -1)).toBe("2026-02-28")
  })
})

describe("leerCitasDelPaciente", () => {
  it("las pide a la agenda por paciente y rango de días, no al detalle (que trae sólo 20)", async () => {
    const citas = [{ id: "c1", title: "Control", startTime: "2026-11-01T13:00:00.000Z", status: "completada" }]
    const fetchFalso = simularRespuesta(json(citas))
    const resultado = await leerCitasDelPaciente("pac 1", "2025-11-10", "2026-11-10")
    const url = new URL(String(fetchFalso.mock.calls[0][0]), "http://x")
    expect(url.pathname).toBe("/api/citas")
    expect(Object.fromEntries(url.searchParams)).toEqual({ customerId: "pac 1", desde: "2025-11-10", hasta: "2026-11-10" })
    expect(resultado).toEqual({ ok: true, datos: citas })
  })
})

describe("cambiarPrestacion", () => {
  it("manda sólo lo que cambia, por PATCH", async () => {
    const fetchFalso = simularRespuesta(json({ plan: null }))
    await cambiarPrestacion("p1", "pr1", { memberId: null })
    const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/clientes/p1/plan/prestaciones/pr1")
    expect(opciones.method).toBe("PATCH")
    expect(JSON.parse(String(opciones.body))).toEqual({ memberId: null })
  })
})
