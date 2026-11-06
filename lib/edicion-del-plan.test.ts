import { describe, expect, it } from "vitest"
import {
  MENSAJE_ETAPA_APROBADA,
  camposBloqueadosEnEtapaAprobada,
  cambioPorAccion,
  edicionDeEtapaSchema,
  edicionDePrestacionSchema,
  errorAlBorrarEtapa,
  errorAlBorrarPrestacion,
  errorDePiezaYCaras,
  estadoSiguienteDePrestacion,
  nuevaPrestacionSchema,
  nuevaVersionSchema,
  reordenar,
  valorSugeridoDe,
} from "./edicion-del-plan"

const AHORA = new Date("2026-11-06T15:00:00.000Z")
const ANTES = new Date("2026-10-28T15:00:00.000Z")

describe("errorDePiezaYCaras", () => {
  it("boca completa no lleva caras", () => {
    expect(errorDePiezaYCaras(null, [])).toBeNull()
    expect(errorDePiezaYCaras(null, ["O"])).toBe("Una prestación de boca completa no lleva caras.")
  })

  it("la pieza existe y las caras son de ella, sin repetir", () => {
    expect(errorDePiezaYCaras(16, ["O", "M"])).toBeNull()
    expect(errorDePiezaYCaras(16, [])).toBeNull()
    expect(errorDePiezaYCaras(19, [])).toBe("Esa pieza no existe en el odontograma.")
    expect(errorDePiezaYCaras(36, ["P"])).toBe("Esas caras no son de la pieza 36.")
    expect(errorDePiezaYCaras(11, ["O"])).toBe("Esas caras no son de la pieza 11.")
    expect(errorDePiezaYCaras(16, ["O", "O"])).toBe("Una cara está repetida.")
    expect(errorDePiezaYCaras(16, ["X"])).toBe("Esas caras no son de la pieza 16.")
  })
})

describe("estadoSiguienteDePrestacion", () => {
  const porAgendar = { estado: "por-agendar", appointmentId: null, realizadaEn: null }
  const agendada = { estado: "agendada", appointmentId: "cita-1", realizadaEn: null }
  const realizada = { estado: "realizada", appointmentId: "cita-1", realizadaEn: ANTES }

  it("agendar exige una cita: la que viene o la que ya tenía", () => {
    expect(estadoSiguienteDePrestacion(porAgendar, { estado: "agendada", appointmentId: "cita-2" }, AHORA)).toEqual({
      ok: true,
      cambio: { estado: "agendada", appointmentId: "cita-2", realizadaEn: null },
    })
    expect(estadoSiguienteDePrestacion(porAgendar, { estado: "agendada" }, AHORA)).toEqual({
      ok: false,
      error: "Para marcarla como agendada hay que elegir la cita.",
    })
    expect(estadoSiguienteDePrestacion(agendada, { appointmentId: null }, AHORA)).toEqual({
      ok: false,
      error: "Para marcarla como agendada hay que elegir la cita.",
    })
  })

  it("una agendada cambia de cita sin cambiar de estado", () => {
    expect(estadoSiguienteDePrestacion(agendada, { appointmentId: "cita-2" }, AHORA)).toEqual({
      ok: true,
      cambio: { estado: "agendada", appointmentId: "cita-2", realizadaEn: null },
    })
  })

  it("volver a por agendar limpia la cita y la fecha de realizada", () => {
    for (const actual of [agendada, realizada]) {
      expect(estadoSiguienteDePrestacion(actual, { estado: "por-agendar" }, AHORA)).toEqual({
        ok: true,
        cambio: { estado: "por-agendar", appointmentId: null, realizadaEn: null },
      })
    }
  })

  it("una por agendar no lleva cita", () => {
    expect(estadoSiguienteDePrestacion(porAgendar, { appointmentId: "cita-1" }, AHORA)).toEqual({
      ok: false,
      error: "Una prestación por agendar no tiene cita: márcala como agendada.",
    })
    expect(estadoSiguienteDePrestacion(agendada, { estado: "por-agendar", appointmentId: "cita-1" }, AHORA).ok).toBe(false)
  })

  it("realizada fija cuándo, y conserva la cita si la tenía; sin cita también vale", () => {
    expect(estadoSiguienteDePrestacion(agendada, { estado: "realizada" }, AHORA)).toEqual({
      ok: true,
      cambio: { estado: "realizada", appointmentId: "cita-1", realizadaEn: AHORA },
    })
    expect(estadoSiguienteDePrestacion(porAgendar, { estado: "realizada" }, AHORA)).toEqual({
      ok: true,
      cambio: { estado: "realizada", appointmentId: null, realizadaEn: AHORA },
    })
  })

  it("una que ya estaba realizada no cambia su fecha", () => {
    expect(estadoSiguienteDePrestacion(realizada, { estado: "realizada" }, AHORA)).toEqual({
      ok: true,
      cambio: { estado: "realizada", appointmentId: "cita-1", realizadaEn: ANTES },
    })
  })
})

describe("cambioPorAccion", () => {
  const quien = { ahora: AHORA, nombre: "Valentina Soto" }
  const porAprobar = { estado: "por-aprobar", prestaciones: 2 }
  const aprobada = { estado: "aprobada", prestaciones: 2 }

  it("presentar sólo registra cuándo", () => {
    expect(cambioPorAccion(porAprobar, "presentar", quien)).toEqual({ ok: true, cambio: { presentadaEn: AHORA } })
  })

  it("aprobar deja cuándo y quién", () => {
    expect(cambioPorAccion(porAprobar, "aprobar", quien)).toEqual({
      ok: true,
      cambio: { estado: "aprobada", aprobadaEn: AHORA, aprobadaPorNombre: "Valentina Soto" },
    })
  })

  it("volver a por aprobar borra la aprobación y la presentación", () => {
    expect(cambioPorAccion(aprobada, "volver-a-por-aprobar", quien)).toEqual({
      ok: true,
      cambio: { estado: "por-aprobar", presentadaEn: null, aprobadaEn: null, aprobadaPorNombre: null },
    })
  })

  it("no se aprueba ni se presenta dos veces, ni una etapa vacía", () => {
    expect(cambioPorAccion(aprobada, "aprobar", quien)).toEqual({ ok: false, error: "La etapa ya está aprobada." })
    expect(cambioPorAccion(aprobada, "presentar", quien)).toEqual({ ok: false, error: "La etapa ya está aprobada." })
    expect(cambioPorAccion(porAprobar, "volver-a-por-aprobar", quien)).toEqual({ ok: false, error: "La etapa ya está por aprobar." })
    expect(cambioPorAccion({ estado: "por-aprobar", prestaciones: 0 }, "aprobar", quien).ok).toBe(false)
    expect(cambioPorAccion({ estado: "por-aprobar", prestaciones: 0 }, "presentar", quien).ok).toBe(false)
  })
})

describe("borrar", () => {
  it("una etapa: sólo por aprobar y sin nada agendado ni realizado", () => {
    expect(errorAlBorrarEtapa({ estado: "por-aprobar", prestaciones: [{ estado: "por-agendar" }] })).toBeNull()
    expect(errorAlBorrarEtapa({ estado: "por-aprobar", prestaciones: [] })).toBeNull()
    expect(errorAlBorrarEtapa({ estado: "aprobada", prestaciones: [] })).not.toBeNull()
    expect(errorAlBorrarEtapa({ estado: "por-aprobar", prestaciones: [{ estado: "agendada" }] })).not.toBeNull()
    expect(errorAlBorrarEtapa({ estado: "por-aprobar", prestaciones: [{ estado: "realizada" }] })).not.toBeNull()
  })

  it("una prestación: sólo por agendar y en una etapa por aprobar", () => {
    expect(errorAlBorrarPrestacion({ estado: "por-agendar" }, { estado: "por-aprobar" })).toBeNull()
    expect(errorAlBorrarPrestacion({ estado: "por-agendar" }, { estado: "aprobada" })).toBe(MENSAJE_ETAPA_APROBADA)
    expect(errorAlBorrarPrestacion({ estado: "agendada" }, { estado: "por-aprobar" })).not.toBeNull()
    expect(errorAlBorrarPrestacion({ estado: "realizada" }, { estado: "por-aprobar" })).not.toBeNull()
  })
})

describe("camposBloqueadosEnEtapaAprobada", () => {
  it("en una etapa aprobada sólo se cambian estado, cita y profesional", () => {
    expect(camposBloqueadosEnEtapaAprobada({ estado: "agendada", appointmentId: "c", memberId: "m", delDueño: undefined })).toEqual([])
    expect(camposBloqueadosEnEtapaAprobada({ valorCents: 100, nombre: "x", estado: "realizada" })).toEqual(["valorCents", "nombre"])
    expect(camposBloqueadosEnEtapaAprobada({ orden: 2 })).toEqual(["orden"])
  })
})

describe("reordenar", () => {
  const filas = [
    { id: "a", orden: 1 },
    { id: "b", orden: 2 },
    { id: "c", orden: 3 },
  ]

  it("mueve una fila a una posición y corre las demás; devuelve sólo las que cambian", () => {
    expect(reordenar(filas, "c", 1)).toEqual([
      { id: "c", orden: 1 },
      { id: "a", orden: 2 },
      { id: "b", orden: 3 },
    ])
    expect(reordenar(filas, "a", 2)).toEqual([
      { id: "b", orden: 1 },
      { id: "a", orden: 2 },
    ])
  })

  it("una posición más allá del final la deja al final; la misma posición no cambia nada", () => {
    expect(reordenar(filas, "a", 99)).toEqual([
      { id: "b", orden: 1 },
      { id: "c", orden: 2 },
      { id: "a", orden: 3 },
    ])
    expect(reordenar(filas, "b", 2)).toEqual([])
  })

  it("sin fila que mover, renumera de corrido (después de borrar)", () => {
    expect(
      reordenar(
        [
          { id: "a", orden: 1 },
          { id: "c", orden: 3 },
          { id: "d", orden: 4 },
        ],
        null
      )
    ).toEqual([
      { id: "c", orden: 2 },
      { id: "d", orden: 3 },
    ])
  })
})

describe("valorSugeridoDe", () => {
  it("el precio del servicio en centavos; sin precio, 0; con tope", () => {
    expect(valorSugeridoDe(48000)).toBe(4_800_000)
    expect(valorSugeridoDe(null)).toBe(0)
    expect(valorSugeridoDe(-1)).toBe(0)
    expect(valorSugeridoDe(Number.NaN)).toBe(0)
    expect(valorSugeridoDe(1e12)).toBe(2_000_000_000)
  })
})

describe("esquemas", () => {
  it("nuevaVersionSchema sólo acepta los tres orígenes", () => {
    expect(nuevaVersionSchema.parse({ desde: "copia" })).toEqual({ desde: "copia" })
    expect(nuevaVersionSchema.safeParse({ desde: "pdf" }).error?.issues[0].message).toBe(
      "Elige cómo armar el plan: desde el odontograma, copiando el vigente o vacío"
    )
  })

  it("edicionDeEtapaSchema exige algo que cambiar y una acción conocida", () => {
    expect(edicionDeEtapaSchema.safeParse({}).error?.issues[0].message).toBe("No hay nada que cambiar")
    expect(edicionDeEtapaSchema.safeParse({ accion: "enviar" }).error?.issues[0].message).toBe("Esa acción no existe para una etapa")
    expect(edicionDeEtapaSchema.parse({ nombre: "  Cirugía " })).toEqual({ nombre: "Cirugía" })
  })

  it("nuevaPrestacionSchema: pieza obligatoria (null es boca), caras válidas, nombre o servicio, un solo profesional", () => {
    expect(nuevaPrestacionSchema.parse({ pieza: null, nombre: "Destartraje" })).toEqual({ pieza: null, caras: [], nombre: "Destartraje" })
    expect(nuevaPrestacionSchema.safeParse({ nombre: "Destartraje" }).error?.issues[0].message).toBe("Elige la pieza, o boca completa")
    expect(nuevaPrestacionSchema.safeParse({ pieza: null, caras: ["O"], nombre: "x" }).error?.issues[0].message).toBe(
      "Una prestación de boca completa no lleva caras."
    )
    expect(nuevaPrestacionSchema.safeParse({ pieza: 16 }).error?.issues[0].message).toBe("Escribe qué prestación es o elige un servicio")
    expect(nuevaPrestacionSchema.safeParse({ pieza: 16, serviceId: "s", memberId: "m", delDueño: true }).success).toBe(false)
    expect(nuevaPrestacionSchema.safeParse({ pieza: 16, nombre: "x", valorCents: 10.5 }).error?.issues[0].message).toBe(
      "El valor va en centavos enteros"
    )
    expect(nuevaPrestacionSchema.safeParse({ pieza: 16, nombre: "x", valorCents: -1 }).error?.issues[0].message).toBe(
      "El valor no puede ser negativo"
    )
  })

  it("edicionDePrestacionSchema exige algo que cambiar y un estado conocido", () => {
    expect(edicionDePrestacionSchema.safeParse({}).error?.issues[0].message).toBe("No hay nada que cambiar")
    expect(edicionDePrestacionSchema.safeParse({ estado: "aprobada" }).error?.issues[0].message).toBe(
      "El estado tiene que ser por agendar, agendada o realizada"
    )
    expect(edicionDePrestacionSchema.parse({ estado: "agendada", appointmentId: "cita-1" })).toEqual({
      estado: "agendada",
      appointmentId: "cita-1",
    })
  })
})
