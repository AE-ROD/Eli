import { describe, expect, it } from "vitest"
import { estaPorConfirmar } from "./por-confirmar"

describe("estaPorConfirmar", () => {
  it("sólo una reserva con la marca de faltas que sigue pendiente", () => {
    expect(estaPorConfirmar({ status: "pendiente", confirmacionPorFaltas: true })).toBe(true)
  })

  it("una pendiente sin la marca es una reserva pública normal", () => {
    expect(estaPorConfirmar({ status: "pendiente", confirmacionPorFaltas: false })).toBe(false)
  })

  it.each(["confirmada", "cancelada", "en-progreso", "completada", "no-asistio"])(
    "con la marca pero ya %s, ya no está por confirmar",
    (status) => {
      expect(estaPorConfirmar({ status, confirmacionPorFaltas: true })).toBe(false)
    }
  )
})
