import { describe, it, expect, afterEach, vi } from "vitest"
import { llamadaDeCronAutorizada } from "./cron"

const pedido = (cabeceras: Record<string, string>) => ({ headers: new Headers(cabeceras) })

describe("llamadaDeCronAutorizada", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("acepta el Bearer que manda Vercel Cron y el x-cron-secret manual", () => {
    vi.stubEnv("CRON_SECRET", "secreto")
    expect(llamadaDeCronAutorizada(pedido({ authorization: "Bearer secreto" }))).toBe(true)
    expect(llamadaDeCronAutorizada(pedido({ "x-cron-secret": "secreto" }))).toBe(true)
  })

  it.each([
    ["sin cabeceras", {}],
    ["con otro secreto", { authorization: "Bearer otro" }],
    ["con el secreto sin Bearer", { authorization: "secreto" }],
    ["con un x-cron-secret distinto", { "x-cron-secret": "secretox" }],
  ])("rechaza %s", (_caso, cabeceras) => {
    vi.stubEnv("CRON_SECRET", "secreto")
    expect(llamadaDeCronAutorizada(pedido(cabeceras))).toBe(false)
  })

  it("sin CRON_SECRET, o vacío, falla cerrado aunque la cabecera venga vacía", () => {
    vi.stubEnv("CRON_SECRET", "")
    expect(llamadaDeCronAutorizada(pedido({ "x-cron-secret": "" }))).toBe(false)
    expect(llamadaDeCronAutorizada(pedido({ authorization: "Bearer " }))).toBe(false)
    expect(llamadaDeCronAutorizada(pedido({ authorization: "Bearer undefined" }))).toBe(false)
  })
})
