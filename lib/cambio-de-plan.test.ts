import { describe, it, expect } from "vitest"
import {
  MENSAJE_FALTA_LA_SEDE_QUE_SE_QUEDA,
  MENSAJE_SEDE_QUE_SE_QUEDA_NO_VALE,
  decidirCambioDePlan,
  type DatosDelCambioDePlan,
} from "./cambio-de-plan"

const sede = (id: string, nombre: string, extra: { activo?: boolean; horasFuturas?: number } = {}) => ({
  id,
  nombre,
  activo: extra.activo ?? true,
  horasFuturas: extra.horasFuturas ?? 0,
})

const aEquipo = (extra: Partial<DatosDelCambioDePlan> = {}): DatosDelCambioDePlan => ({
  planActual: "independiente",
  planPedido: "equipo",
  sedes: [sede("a", "Centro"), sede("b", "Providencia")],
  integrantes: 0,
  invitacionesPendientes: 0,
  ...extra,
})

const aIndependiente = (extra: Partial<DatosDelCambioDePlan> = {}): DatosDelCambioDePlan => ({
  planActual: "equipo",
  planPedido: "independiente",
  sedes: [],
  integrantes: 0,
  invitacionesPendientes: 0,
  ...extra,
})

describe("decidirCambioDePlan: el mismo plan", () => {
  it("no hace nada, tenga lo que tenga", () => {
    expect(decidirCambioDePlan(aEquipo({ planActual: "equipo" }))).toEqual({ tipo: "sin-cambios" })
    expect(decidirCambioDePlan(aIndependiente({ planActual: "independiente", integrantes: 3 }))).toEqual({ tipo: "sin-cambios" })
  })
})

describe("decidirCambioDePlan: Independiente a Equipo", () => {
  it("sin sedes activas pasa directo, y no hace falta decir cuál se queda (ni se mira)", () => {
    expect(decidirCambioDePlan(aEquipo({ sedes: [] }))).toEqual({ tipo: "a-equipo", sedeQueSeQueda: null, sedesADesactivar: [] })
    expect(decidirCambioDePlan(aEquipo({ sedes: [sede("a", "Centro", { activo: false, horasFuturas: 4 })], sedeQueSeQueda: "x" }))).toEqual({
      tipo: "a-equipo",
      sedeQueSeQueda: null,
      sedesADesactivar: [],
    })
  })

  it("con sedes activas exige la sede que se queda: 400 si falta", () => {
    for (const falta of [undefined, null, ""]) {
      expect(decidirCambioDePlan(aEquipo({ sedeQueSeQueda: falta }))).toEqual({
        tipo: "rechazado",
        status: 400,
        error: MENSAJE_FALTA_LA_SEDE_QUE_SE_QUEDA,
      })
    }
  })

  it("y tiene que ser una de las ACTIVAS del negocio: una inactiva, una que no existe o la de otro negocio dan 400", () => {
    const sedes = [sede("a", "Centro"), sede("b", "Providencia", { activo: false })]
    for (const pedida of ["b", "no-existe", "sede-de-otro-negocio"]) {
      expect(decidirCambioDePlan(aEquipo({ sedes, sedeQueSeQueda: pedida }))).toEqual({
        tipo: "rechazado",
        status: 400,
        error: MENSAJE_SEDE_QUE_SE_QUEDA_NO_VALE,
      })
    }
  })

  it("con una sola sede activa y la elección: se queda ella y se apaga", () => {
    expect(decidirCambioDePlan(aEquipo({ sedes: [sede("a", "Centro"), sede("v", "Vieja", { activo: false })], sedeQueSeQueda: "a" }))).toEqual({
      tipo: "a-equipo",
      sedeQueSeQueda: "a",
      sedesADesactivar: ["a"],
    })
  })

  it("las demás activas se desactivan con ella", () => {
    expect(decidirCambioDePlan(aEquipo({ sedes: [sede("a", "Centro"), sede("b", "Providencia"), sede("c", "Maipú")], sedeQueSeQueda: "b" }))).toEqual({
      tipo: "a-equipo",
      sedeQueSeQueda: "b",
      sedesADesactivar: ["a", "b", "c"],
    })
  })

  it("las horas por delante de la sede que se queda no frenan el cambio", () => {
    expect(decidirCambioDePlan(aEquipo({ sedes: [sede("a", "Centro", { horasFuturas: 9 }), sede("b", "Providencia")], sedeQueSeQueda: "a" }))).toMatchObject({
      tipo: "a-equipo",
      sedeQueSeQueda: "a",
    })
  })

  it("las horas por delante de OTRA sede sí: 409 con el total y dónde están", () => {
    const decision = decidirCambioDePlan(
      aEquipo({
        sedes: [sede("a", "Centro"), sede("b", "Providencia", { horasFuturas: 2 }), sede("c", "Maipú", { horasFuturas: 1 })],
        sedeQueSeQueda: "a",
      })
    )
    expect(decision).toMatchObject({ tipo: "rechazado", status: 409, extra: { horasFuturas: 3 } })
    const error = (decision as { error: string }).error
    expect(error).toContain("3 horas")
    expect(error).toContain("Providencia (2) y Maipú (1)")
    expect(error).toContain("Centro")
  })

  it("las horas de una sede inactiva no cuentan: ya no atiende", () => {
    expect(
      decidirCambioDePlan(aEquipo({ sedes: [sede("a", "Centro"), sede("b", "Vieja", { activo: false, horasFuturas: 5 })], sedeQueSeQueda: "a" }))
    ).toMatchObject({ tipo: "a-equipo" })
  })

  it("no mira integrantes ni invitaciones: eso es de volver a Independiente", () => {
    expect(decidirCambioDePlan(aEquipo({ sedes: [], integrantes: 4, invitacionesPendientes: 2 }))).toMatchObject({ tipo: "a-equipo" })
  })
})

describe("decidirCambioDePlan: Equipo a Independiente", () => {
  it("sin integrantes ni invitaciones pendientes, sí", () => {
    expect(decidirCambioDePlan(aIndependiente())).toEqual({ tipo: "a-independiente" })
  })

  it("con integrantes, 409 que dice cuántos", () => {
    const uno = decidirCambioDePlan(aIndependiente({ integrantes: 1 }))
    const tres = decidirCambioDePlan(aIndependiente({ integrantes: 3 }))
    expect(uno).toMatchObject({ tipo: "rechazado", status: 409, extra: { integrantes: 1 } })
    expect((uno as { error: string }).error).toContain("un integrante")
    expect((tres as { error: string }).error).toContain("3 integrantes")
  })

  it("con invitaciones pendientes, 409 que dice cuántas y dónde cancelarlas", () => {
    const una = decidirCambioDePlan(aIndependiente({ invitacionesPendientes: 1 }))
    const dos = decidirCambioDePlan(aIndependiente({ invitacionesPendientes: 2 }))
    expect(una).toMatchObject({ tipo: "rechazado", status: 409, extra: { invitacionesPendientes: 1 } })
    expect((una as { error: string }).error).toContain("una invitación pendiente")
    expect((una as { error: string }).error).toContain("Cancélala en Equipo")
    expect((dos as { error: string }).error).toContain("2 invitaciones pendientes")
    expect((dos as { error: string }).error).toContain("Cancélalas en Equipo")
  })

  it("los integrantes se dicen antes que las invitaciones", () => {
    expect(decidirCambioDePlan(aIndependiente({ integrantes: 1, invitacionesPendientes: 1 }))).toMatchObject({ extra: { integrantes: 1 } })
  })
})
