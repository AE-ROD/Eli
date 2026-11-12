import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import {
  descripcionDePlan,
  esPlanValido,
  nombreDePlan,
  personasAlCrearElNegocio,
  PLAN_POR_DEFECTO,
  planConocido,
  PLANES,
} from "./planes"

describe("los planes", () => {
  it("son dos: independiente y equipo", () => {
    expect([...PLANES]).toEqual(["independiente", "equipo"])
  })

  it("el plan por defecto es uno de los planes", () => {
    expect(esPlanValido(PLAN_POR_DEFECTO)).toBe(true)
  })

  it.each(["independiente", "equipo"])("%s es válido", (plan) => {
    expect(esPlanValido(plan)).toBe(true)
  })

  it.each(["", "Equipo", "EQUIPO", " equipo", "clinica", "pro", "constructor", "__proto__", null, undefined, 0, {}, []])(
    "%j no es un plan",
    (valor) => {
      expect(esPlanValido(valor)).toBe(false)
    }
  )

  it("cada plan tiene su nombre", () => {
    expect(nombreDePlan("independiente")).toBe("Independiente")
    expect(nombreDePlan("equipo")).toBe("Equipo")
  })

  it("cada plan tiene su frase para la pantalla de elegir", () => {
    expect(descripcionDePlan("independiente")).toBe("Trabajas por tu cuenta")
    expect(descripcionDePlan("equipo")).toBe("Tienes una clínica o un equipo")
  })

  it.each(["independiente", "equipo"] as const)("planConocido deja pasar %s", (plan) => {
    expect(planConocido(plan)).toBe(plan)
  })

  it.each(["", "Equipo", " equipo", "clinica", "pro", "__proto__", null, undefined, 0, true, {}, ["equipo"]])(
    "planConocido vuelve null con %j: no es un plan",
    (valor) => {
      expect(planConocido(valor)).toBeNull()
    }
  )

  describe("personasAlCrearElNegocio", () => {
    it("Independiente es siempre una persona, pida lo que pida quien llama", () => {
      expect(personasAlCrearElNegocio("independiente")).toBe(1)
      expect(personasAlCrearElNegocio("independiente", 1)).toBe(1)
      expect(personasAlCrearElNegocio("independiente", 12)).toBe(1)
    })

    it("Equipo mantiene lo pedido, y una persona si no se pidió nada", () => {
      expect(personasAlCrearElNegocio("equipo", 4)).toBe(4)
      expect(personasAlCrearElNegocio("equipo", 1)).toBe(1)
      expect(personasAlCrearElNegocio("equipo")).toBe(1)
    })
  })

  it("coincide con el CHECK de la migración: los mismos ids, ni uno más ni uno menos", () => {
    const sql = readFileSync(
      join(process.cwd(), "prisma/migrations/20261112120000_etapa_9_planes_y_sedes/migration.sql"),
      "utf-8"
    )
    const comprobacion = sql.match(/negocios_plan_check"\s+CHECK\s*\(\s*"plan"\s+IN\s*\(([^)]*)\)/)
    expect(comprobacion, "no se encontró negocios_plan_check en la migración").not.toBeNull()
    const idsDeLaBase = [...comprobacion![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
    expect(idsDeLaBase).toEqual([...PLANES].sort())
  })
})
