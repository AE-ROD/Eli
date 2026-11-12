import { describe, it, expect } from "vitest"
import {
  MENSAJE_ELEGIR_LA_SEDE,
  MENSAJE_SEDE_DESACTIVADA,
  MENSAJE_SEDE_NO_ENCONTRADA,
  decidirSedeDeLaCita,
  rechazoDeSede,
  sedeDeLaCita,
  type SedesParaAgendar,
} from "./sede-de-la-cita"

const centro = { id: "centro", nombre: "Centro", activo: true }
const norte = { id: "norte", nombre: "Norte", activo: true }
const vieja = { id: "vieja", nombre: "Vieja", activo: false }

const varias: SedesParaAgendar = { modo: "varias", sedes: [centro, norte, vieja] }
const una: SedesParaAgendar = { modo: "una", sedes: [centro, vieja] }
const ninguna: SedesParaAgendar = { modo: "una", sedes: [] }

describe("decidirSedeDeLaCita", () => {
  describe("con varias sedes activas", () => {
    it("una sede activa del negocio vale, y con ella se mira el horario", () => {
      expect(decidirSedeDeLaCita(varias, "norte")).toEqual({ tipo: "ok", sedeId: "norte", sedeDelHorario: "norte" })
    })

    it("sin elegir, falta: hay que elegir", () => {
      for (const elegida of [undefined, null, "", "   "]) {
        expect(decidirSedeDeLaCita(varias, elegida)).toEqual({ tipo: "falta" })
      }
    })

    it("una desactivada del negocio no vale", () => {
      expect(decidirSedeDeLaCita(varias, "vieja")).toEqual({ tipo: "desactivada" })
    })

    it("una que no es del negocio o no existe no se encuentra, sin distinguir cuál de las dos", () => {
      expect(decidirSedeDeLaCita(varias, "de-otro-negocio")).toEqual({ tipo: "no-encontrada" })
      expect(decidirSedeDeLaCita(varias, "no-existe")).toEqual({ tipo: "no-encontrada" })
    })

    it("el id se recorta", () => {
      expect(decidirSedeDeLaCita(varias, " centro ")).toMatchObject({ tipo: "ok", sedeId: "centro" })
    })
  })

  describe("con una sola sede activa", () => {
    it("sin elegir, se estampa esa; el horario es el vigente de siempre (sin sede)", () => {
      expect(decidirSedeDeLaCita(una, undefined)).toEqual({ tipo: "ok", sedeId: "centro", sedeDelHorario: null })
    })

    it("eligiéndola, también", () => {
      expect(decidirSedeDeLaCita(una, "centro")).toEqual({ tipo: "ok", sedeId: "centro", sedeDelHorario: null })
    })

    it("una desactivada o ajena no vale ni siquiera con una sola", () => {
      expect(decidirSedeDeLaCita(una, "vieja")).toEqual({ tipo: "desactivada" })
      expect(decidirSedeDeLaCita(una, "ajena")).toEqual({ tipo: "no-encontrada" })
    })
  })

  describe("sin sedes activas", () => {
    it("la cita va sin sede, y lo que llegue se ignora", () => {
      expect(decidirSedeDeLaCita(ninguna, undefined)).toEqual({ tipo: "ok", sedeId: null, sedeDelHorario: null })
      expect(decidirSedeDeLaCita(ninguna, "centro")).toEqual({ tipo: "ok", sedeId: null, sedeDelHorario: null })
      expect(decidirSedeDeLaCita({ modo: "una", sedes: [vieja] }, "vieja")).toEqual({ tipo: "ok", sedeId: null, sedeDelHorario: null })
    })
  })
})

describe("rechazoDeSede", () => {
  it("404 para lo que no es del negocio; 400 para lo que falta o está desactivado", () => {
    expect(rechazoDeSede({ tipo: "no-encontrada" })).toEqual({ status: 404, error: MENSAJE_SEDE_NO_ENCONTRADA })
    expect(rechazoDeSede({ tipo: "desactivada" })).toEqual({ status: 400, error: MENSAJE_SEDE_DESACTIVADA })
    expect(rechazoDeSede({ tipo: "falta" })).toEqual({ status: 400, error: MENSAJE_ELEGIR_LA_SEDE })
  })
})

describe("sedeDeLaCita (el campo del pedido)", () => {
  const campo = sedeDeLaCita().optional()

  it("un id, o nada: vacío y null son 'no eligió'", () => {
    expect(campo.parse("abc")).toBe("abc")
    expect(campo.parse(" abc ")).toBe("abc")
    expect(campo.parse(null)).toBeNull()
    expect(campo.parse("")).toBeNull()
    expect(campo.parse("  ")).toBeNull()
    expect(campo.parse(undefined)).toBeUndefined()
  })

  it("rechaza lo que no es un texto razonable", () => {
    expect(campo.safeParse(5).success).toBe(false)
    expect(campo.safeParse({}).success).toBe(false)
    expect(campo.safeParse("x".repeat(65)).success).toBe(false)
  })
})
