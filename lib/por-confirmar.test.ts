import { describe, expect, it } from "vitest"
import { conLlegada, estaPorConfirmar, sigueSinConfirmar } from "./por-confirmar"

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

describe("sigueSinConfirmar y conLlegada", () => {
  const porConfirmar = { status: "pendiente", confirmacionPorFaltas: true }

  it("por confirmar mientras el cliente no llegó; con atención viva, ya no", () => {
    expect(sigueSinConfirmar(porConfirmar)).toBe(true)
    expect(sigueSinConfirmar({ ...porConfirmar, conAtencion: false })).toBe(true)
    expect(sigueSinConfirmar({ ...porConfirmar, conAtencion: true })).toBe(false)
    expect(sigueSinConfirmar({ status: "pendiente" })).toBe(false)
  })

  it("conLlegada cambia la atención por conAtencion: una anulada no cuenta, y la atención no queda", () => {
    expect(conLlegada({ id: "c1", visit: { status: "en-espera" } })).toEqual({ id: "c1", conAtencion: true })
    expect(conLlegada({ id: "c1", visit: { status: "anulada" } })).toEqual({ id: "c1", conAtencion: false })
    expect(conLlegada({ id: "c1", visit: null })).toEqual({ id: "c1", conAtencion: false })
  })
})
