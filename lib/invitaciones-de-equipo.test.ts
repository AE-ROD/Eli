import { describe, it, expect, vi } from "vitest"
import { hashDeToken } from "./tokens"
import { DIAS_DE_VIGENCIA, claveDeReenvio, enlaceNuevo, estaVencida, vencimientoDesde } from "./invitaciones-de-equipo"

// Hoisted por vitest: el módulo no llega a conectarse a la base ni a Resend.
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/email", () => ({ enviarInvitacionTrabajador: vi.fn() }))


const ahora = new Date("2026-10-26T15:00:00.000Z")

describe("vencimientoDesde", () => {
  it("vence a los siete días justos, como dice el correo", () => {
    expect(DIAS_DE_VIGENCIA).toBe(7)
    expect(vencimientoDesde(ahora).toISOString()).toBe("2026-11-02T15:00:00.000Z")
  })
})

describe("estaVencida", () => {
  it("vencida desde el instante en que vence: el mismo criterio que aceptar (expiresAt > ahora)", () => {
    expect(estaVencida({ expiresAt: new Date(ahora.getTime() - 1) }, ahora)).toBe(true)
    expect(estaVencida({ expiresAt: ahora }, ahora)).toBe(true)
    expect(estaVencida({ expiresAt: new Date(ahora.getTime() + 1) }, ahora)).toBe(false)
  })
})

describe("enlaceNuevo", () => {
  it("un token que sólo viaja en el correo, su hash para la base y el vencimiento", () => {
    const enlace = enlaceNuevo(ahora)

    expect(enlace.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(enlace.tokenHash).toBe(hashDeToken(enlace.token))
    expect(enlace.expiresAt).toEqual(vencimientoDesde(ahora))
  })

  it("cada uno es distinto: reenviar deja sin efecto el enlace anterior", () => {
    expect(enlaceNuevo(ahora).token).not.toBe(enlaceNuevo(ahora).token)
  })
})

describe("claveDeReenvio", () => {
  it("por negocio y por casilla, sin mayúsculas ni espacios", () => {
    expect(claveDeReenvio("negocio-1", " Ana@X.com ")).toBe("negocio-1:ana@x.com")
    expect(claveDeReenvio("negocio-2", "ana@x.com")).not.toBe(claveDeReenvio("negocio-1", "ana@x.com"))
  })
})
