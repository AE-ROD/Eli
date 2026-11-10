import { describe, expect, it } from "vitest"
import type { Actor } from "@/lib/permisos"
import { pasosDeBienvenida } from "./pasos-de-bienvenida"

const actor = (rol: Actor["rol"], memberId: string | null = null): Actor => ({ rol, businessId: "negocio-1", memberId })

describe("pasosDeBienvenida: sólo lo que el rol puede hacer", () => {
  it("dueña y encargado: horario, servicios y enlace", () => {
    expect(pasosDeBienvenida(actor("owner"))).toEqual(["horario", "servicios", "enlace"])
    expect(pasosDeBienvenida(actor("admin", "m-1"))).toEqual(["horario", "servicios", "enlace"])
  })

  it("el profesional: su horario y el enlace, sin servicios (no los gestiona)", () => {
    expect(pasosDeBienvenida(actor("worker", "m-2"))).toEqual(["horario", "enlace"])
  })

  it("un profesional sin membresía no tiene horario que editar: sólo el enlace", () => {
    expect(pasosDeBienvenida(actor("worker", null))).toEqual(["enlace"])
  })

  it("sin sesión, ningún paso", () => {
    expect(pasosDeBienvenida(null)).toEqual([])
  })
})
