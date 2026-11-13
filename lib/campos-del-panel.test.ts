import { describe, expect, it } from "vitest"
import { MENSAJE_URGENCIA_SOLO_EN_CLINICA, urgenciaDeServicio } from "./campos-del-panel"

describe("urgenciaDeServicio", () => {
  it("acepta sí o no", () => {
    expect(urgenciaDeServicio().parse(true)).toBe(true)
    expect(urgenciaDeServicio().parse(false)).toBe(false)
  })

  it.each([["texto", "true"], ["número", 1], ["nulo", null], ["lista", [true]], ["objeto", {}]])(
    "rechaza %s con un mensaje en español",
    (_que, valor) => {
      const resultado = urgenciaDeServicio().safeParse(valor)
      expect(resultado.success).toBe(false)
      if (!resultado.success) expect(resultado.error.issues[0].message).toBe("Urgencia tiene que ser sí o no")
    }
  )
})

describe("MENSAJE_URGENCIA_SOLO_EN_CLINICA", () => {
  it("dice que es de la clínica dental", () => {
    expect(MENSAJE_URGENCIA_SOLO_EN_CLINICA).toContain("clínica dental")
  })
})
