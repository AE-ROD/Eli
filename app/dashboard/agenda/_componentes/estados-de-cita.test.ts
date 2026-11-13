import { describe, it, expect } from "vitest"
import { vocabularioDe } from "@/lib/vocabulario"
import { estiloDeEstado } from "./estados-de-cita"

const ESTADOS = ["pendiente", "confirmada", "en-progreso", "completada", "cancelada", "no-asistio"]

describe("estiloDeEstado", () => {
  it("sin rubro, las palabras de siempre", () => {
    expect(ESTADOS.map((estado) => estiloDeEstado(estado).texto)).toEqual([
      "Pendiente",
      "Confirmada",
      "En progreso",
      "Completada",
      "Cancelada",
      "No vino",
    ])
  })

  it("un salón dice \"No vino\" y los estados concuerdan con la hora", () => {
    const { palabras } = vocabularioDe("salon")
    expect(ESTADOS.map((estado) => estiloDeEstado(estado, false, palabras).texto)).toEqual([
      "Pendiente",
      "Confirmada",
      "En progreso",
      "Completada",
      "Cancelada",
      "No vino",
    ])
  })

  it("una clínica dental dice \"No asistió\"; los nombres guardados no cambian", () => {
    const { palabras } = vocabularioDe("odontologia")
    expect(estiloDeEstado("no-asistio", false, palabras).texto).toBe("No asistió")
    expect(estiloDeEstado("no-asistio", false, palabras).insignia).toBe(estiloDeEstado("no-asistio").insignia)
    expect(estiloDeEstado("confirmada", false, palabras).texto).toBe("Confirmada")
  })

  it("los participios siguen el género de la reserva", () => {
    const { palabras } = vocabularioDe(null)
    const turno = { ...palabras, cita: { singular: "turno", plural: "turnos", genero: "m" as const } }
    expect(["confirmada", "completada", "cancelada"].map((estado) => estiloDeEstado(estado, false, turno).texto)).toEqual([
      "Confirmado",
      "Completado",
      "Cancelado",
    ])
    expect(estiloDeEstado("pendiente", false, turno).texto).toBe("Pendiente")
  })

  it("por confirmar manda sobre el estado, en cualquier rubro", () => {
    const { palabras } = vocabularioDe("odontologia")
    expect(estiloDeEstado("pendiente", true).texto).toBe("Por confirmar")
    expect(estiloDeEstado("pendiente", true, palabras).texto).toBe("Por confirmar")
  })

  it("un estado desconocido se pinta como pendiente", () => {
    const pendiente = estiloDeEstado("pendiente")
    expect(estiloDeEstado("algo-raro")).toEqual(pendiente)
    expect(estiloDeEstado("constructor")).toEqual(pendiente)
    expect(estiloDeEstado("")).toEqual(pendiente)
  })

  it("cada estado conserva sus clases", () => {
    expect(estiloDeEstado("cancelada")).toMatchObject({ insignia: "bg-error/8 text-error", bloque: "bg-error/6 border-l-error text-error" })
    expect(estiloDeEstado("completada").insignia).toBe("bg-lima-suave text-navy")
    expect(estiloDeEstado("no-asistio").bloque).toBe("bg-navy/6 border-l-navy text-navy")
  })
})
