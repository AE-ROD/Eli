import { describe, expect, it } from "vitest"
import { cuerpoDelCambio, evaluarCambioDePlan, otroPlan, precioDelPlan, sedesConHorasQueImpiden, type SedeParaElegir } from "./_plan"

const sede = (id: string, extra: Partial<SedeParaElegir> = {}): SedeParaElegir => ({
  id,
  nombre: `Sede ${id}`,
  direccion: "Av. Providencia 1234",
  comuna: "Providencia",
  orden: 0,
  activo: true,
  horasFuturas: 0,
  ...extra,
})

describe("otroPlan", () => {
  it("con dos planes, el otro", () => {
    expect(otroPlan("independiente")).toBe("equipo")
    expect(otroPlan("equipo")).toBe("independiente")
  })
})

describe("precioDelPlan", () => {
  it("Independiente: $9.990 al mes, IVA incluido", () => {
    expect(precioDelPlan("independiente")).toEqual({ monto: 9990, texto: "$9.990/mes", nota: "IVA incluido" })
  })

  it("Equipo: $34.990 al mes con 5 personas incluidas y $4.990 por cada una más", () => {
    expect(precioDelPlan("equipo")).toEqual({
      monto: 34990,
      texto: "$34.990/mes",
      nota: "IVA incluido · 5 personas que atienden · +$4.990/mes por cada persona más",
    })
  })
})

describe("evaluarCambioDePlan: a Independiente", () => {
  const base = { actual: "equipo", integrantes: 0, invitacionesPendientes: 0, sedes: [] } as const

  it("sin integrantes ni invitaciones se puede, y no hay sedes que elegir", () => {
    expect(evaluarCambioDePlan(base)).toEqual({
      destino: "independiente",
      bloqueo: null,
      sedesParaElegir: [],
      sedePorDefecto: null,
      sedesQueSeDesactivan: 0,
    })
  })

  it("con integrantes se bloquea y dice cuántos", () => {
    expect(evaluarCambioDePlan({ ...base, integrantes: 2 }).bloqueo).toEqual({ integrantes: 2, invitaciones: 0 })
  })

  it("con una invitación pendiente también", () => {
    expect(evaluarCambioDePlan({ ...base, invitacionesPendientes: 1 }).bloqueo).toEqual({ integrantes: 0, invitaciones: 1 })
    expect(evaluarCambioDePlan({ ...base, integrantes: 1, invitacionesPendientes: 3 }).bloqueo).toEqual({ integrantes: 1, invitaciones: 3 })
  })
})

describe("evaluarCambioDePlan: a Equipo", () => {
  const base = { actual: "independiente", integrantes: 0, invitacionesPendientes: 0 } as const

  it("sin sedes no hay nada que elegir ni que desactivar", () => {
    expect(evaluarCambioDePlan({ ...base, sedes: [] })).toEqual({
      destino: "equipo",
      bloqueo: null,
      sedesParaElegir: [],
      sedePorDefecto: null,
      sedesQueSeDesactivan: 0,
    })
  })

  it("con una sola sede activa, ella queda elegida; y se desactiva, como todas (el servidor deja cero sedes activas)", () => {
    const cambio = evaluarCambioDePlan({ ...base, sedes: [sede("a")] })
    expect(cambio.sedePorDefecto).toBe("a")
    expect(cambio.sedesQueSeDesactivan).toBe(1)
  })

  it("con varias sedes activas hay que elegir una a propósito, y todas se desactivan", () => {
    const cambio = evaluarCambioDePlan({ ...base, sedes: [sede("a", { orden: 1 }), sede("b", { orden: 0 }), sede("c", { orden: 2 })] })
    expect(cambio.sedesParaElegir.map((s) => s.id)).toEqual(["b", "a", "c"])
    expect(cambio.sedePorDefecto).toBeNull()
    expect(cambio.sedesQueSeDesactivan).toBe(3)
  })

  it("las sedes que ya están desactivadas no se ofrecen ni cuentan", () => {
    const cambio = evaluarCambioDePlan({ ...base, sedes: [sede("a"), sede("b", { activo: false }), sede("c", { activo: false })] })
    expect(cambio.sedesParaElegir.map((s) => s.id)).toEqual(["a"])
    expect(cambio.sedePorDefecto).toBe("a")
    expect(cambio.sedesQueSeDesactivan).toBe(1)
  })

  it("con sedes y todas desactivadas no hay nada que elegir", () => {
    const cambio = evaluarCambioDePlan({ ...base, sedes: [sede("a", { activo: false })] })
    expect(cambio.sedesParaElegir).toEqual([])
    expect(cuerpoDelCambio(cambio, null)).toEqual({ ok: true, plan: "equipo" })
  })

  it("el equipo no bloquea el paso a Equipo (aunque haya, por datos viejos)", () => {
    expect(evaluarCambioDePlan({ ...base, integrantes: 3, invitacionesPendientes: 1, sedes: [] }).bloqueo).toBeNull()
  })
})

describe("cuerpoDelCambio", () => {
  it("a Equipo sin sedes: sólo el plan", () => {
    const cambio = evaluarCambioDePlan({ actual: "independiente", integrantes: 0, invitacionesPendientes: 0, sedes: [] })
    expect(cuerpoDelCambio(cambio, null)).toEqual({ ok: true, plan: "equipo" })
  })

  it("a Equipo con varias sedes: no se pide sin elegir, ni con una que no se ofrece", () => {
    const cambio = evaluarCambioDePlan({ actual: "independiente", integrantes: 0, invitacionesPendientes: 0, sedes: [sede("a"), sede("b")] })
    expect(cuerpoDelCambio(cambio, null)).toEqual({ ok: false, falta: "elegir-sede" })
    expect(cuerpoDelCambio(cambio, "z")).toEqual({ ok: false, falta: "elegir-sede" })
    expect(cuerpoDelCambio(cambio, "")).toEqual({ ok: false, falta: "elegir-sede" })
  })

  it("otra sede con horas por delante impide el paso: lo mismo que responde el servidor con 409", () => {
    const cambio = evaluarCambioDePlan({
      actual: "independiente",
      integrantes: 0,
      invitacionesPendientes: 0,
      sedes: [sede("a", { horasFuturas: 5 }), sede("b", { horasFuturas: 2 }), sede("c")],
    })
    // Quedándose con «a», «b» tiene horas por delante.
    const conA = cuerpoDelCambio(cambio, "a")
    expect(conA.ok).toBe(false)
    expect(!conA.ok && conA.falta === "horas-por-delante" && conA.sedes.map((s) => s.id)).toEqual(["b"])
    // Quedándose con «b», lo impide «a».
    expect(sedesConHorasQueImpiden(cambio, "b").map((s) => s.id)).toEqual(["a"])
  })

  it("las horas por delante de la sede que se queda no impiden nada: siguen, ahora en el negocio", () => {
    const cambio = evaluarCambioDePlan({
      actual: "independiente",
      integrantes: 0,
      invitacionesPendientes: 0,
      sedes: [sede("a", { horasFuturas: 5 }), sede("b")],
    })
    expect(cuerpoDelCambio(cambio, "a")).toEqual({ ok: true, plan: "equipo", sedeQueSeQueda: "a" })
  })

  it("una sede desactivada con horas por delante (un dato viejo) no impide el paso", () => {
    const cambio = evaluarCambioDePlan({
      actual: "independiente",
      integrantes: 0,
      invitacionesPendientes: 0,
      sedes: [sede("a"), sede("b", { activo: false, horasFuturas: 4 })],
    })
    expect(cuerpoDelCambio(cambio, "a")).toEqual({ ok: true, plan: "equipo", sedeQueSeQueda: "a" })
  })

  it("sin sede elegida, no se sabe qué impide", () => {
    const cambio = evaluarCambioDePlan({
      actual: "independiente",
      integrantes: 0,
      invitacionesPendientes: 0,
      sedes: [sede("a", { horasFuturas: 1 }), sede("b", { horasFuturas: 1 })],
    })
    expect(sedesConHorasQueImpiden(cambio, null)).toEqual([])
    expect(sedesConHorasQueImpiden(cambio, "z")).toEqual([])
  })

  it("a Equipo con la sede elegida: el plan y la sede que queda", () => {
    const cambio = evaluarCambioDePlan({ actual: "independiente", integrantes: 0, invitacionesPendientes: 0, sedes: [sede("a"), sede("b")] })
    expect(cuerpoDelCambio(cambio, "b")).toEqual({ ok: true, plan: "equipo", sedeQueSeQueda: "b" })
  })

  it("una sola sede activa: se manda ella aunque no se haya tocado nada", () => {
    const cambio = evaluarCambioDePlan({ actual: "independiente", integrantes: 0, invitacionesPendientes: 0, sedes: [sede("a")] })
    expect(cuerpoDelCambio(cambio, cambio.sedePorDefecto)).toEqual({ ok: true, plan: "equipo", sedeQueSeQueda: "a" })
  })

  it("a Independiente sin equipo: sólo el plan; con equipo, no se pide", () => {
    const libre = evaluarCambioDePlan({ actual: "equipo", integrantes: 0, invitacionesPendientes: 0, sedes: [] })
    expect(cuerpoDelCambio(libre, null)).toEqual({ ok: true, plan: "independiente" })
    const conEquipo = evaluarCambioDePlan({ actual: "equipo", integrantes: 1, invitacionesPendientes: 0, sedes: [] })
    expect(cuerpoDelCambio(conEquipo, null)).toEqual({ ok: false, falta: "nada-que-hacer" })
  })

  it("a Independiente nunca manda una sede, aunque llegue una elegida", () => {
    const libre = evaluarCambioDePlan({ actual: "equipo", integrantes: 0, invitacionesPendientes: 0, sedes: [sede("a")] })
    expect(cuerpoDelCambio(libre, "a")).toEqual({ ok: true, plan: "independiente" })
  })
})
