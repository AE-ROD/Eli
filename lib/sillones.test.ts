import { describe, it, expect } from "vitest"
import type { Prisma } from "@prisma/client"
import {
  CODIGO_SILLON_OCUPADO,
  SillonOcupado,
  asegurarSillonLibre,
  edicionDeSillonSchema,
  errorDeSillonOcupado,
  mensajeDeSillonOcupado,
  mensajeDeSillonOcupadoSinHorarios,
  ordenAlFinal,
  sillonDeLaCita,
  sillonNuevoSchema,
  whereDeChoqueEnSillon,
} from "./sillones"
import { crearBaseFalsa } from "@/pruebas/base-falsa"

const santiago = (hora: string) => new Date(`2026-10-20T${hora}:00.000-03:00`)
const tramo = (inicio: string, fin: string) => ({ startTime: santiago(inicio), endTime: santiago(fin) })

describe("los campos de un sillón", () => {
  it("el nombre se guarda recortado y no puede quedar vacío ni pasar de 40", () => {
    expect(sillonNuevoSchema.parse({ nombre: "  Sillón 1  " })).toEqual({ nombre: "Sillón 1" })
    expect(sillonNuevoSchema.safeParse({ nombre: "   " }).success).toBe(false)
    expect(sillonNuevoSchema.safeParse({}).success).toBe(false)
    expect(sillonNuevoSchema.safeParse({ nombre: "a".repeat(41) }).success).toBe(false)
  })

  it("el orden es un entero de 0 a 999", () => {
    expect(sillonNuevoSchema.parse({ nombre: "S", orden: 0 }).orden).toBe(0)
    expect(sillonNuevoSchema.parse({ nombre: "S", orden: 999 }).orden).toBe(999)
    for (const orden of [-1, 1000, 1.5, "2"]) {
      expect(sillonNuevoSchema.safeParse({ nombre: "S", orden }).success).toBe(false)
    }
  })

  it("editar sin nada que cambiar no pasa", () => {
    expect(edicionDeSillonSchema.safeParse({}).success).toBe(false)
    expect(edicionDeSillonSchema.parse({ activo: false })).toEqual({ activo: false })
  })

  it("el sillón de una cita: un id, o null (también el vacío) para dejarla sin sillón", () => {
    expect(sillonDeLaCita().parse("sl-1")).toBe("sl-1")
    expect(sillonDeLaCita().parse(null)).toBeNull()
    expect(sillonDeLaCita().parse("")).toBeNull()
    expect(sillonDeLaCita().safeParse(3).success).toBe(false)
  })

  it("un sillón nuevo sin orden va al final, sin pasar de 999", () => {
    expect(ordenAlFinal(null)).toBe(0)
    expect(ordenAlFinal(4)).toBe(5)
    expect(ordenAlFinal(999)).toBe(999)
  })
})

describe("mensajeDeSillonOcupado", () => {
  it("nombra el sillón y el tramo que choca, en el reloj del negocio", () => {
    expect(mensajeDeSillonOcupado("Sillón 1", [tramo("10:00", "11:00")], "America/Santiago")).toBe(
      "Sillón 1 ya tiene una cita de 10:00 a 11:00. Elige otro sillón u otra hora."
    )
  })

  it("con varias, en orden", () => {
    const choques = [tramo("11:00", "11:30"), tramo("09:30", "10:15")]
    expect(mensajeDeSillonOcupado("Sillón 2", choques, "America/Santiago")).toBe(
      "Sillón 2 ya tiene citas de 09:30 a 10:15 y de 11:00 a 11:30. Elige otro sillón u otra hora."
    )
  })

  it("sin horarios: sólo que está ocupado, sin ninguna hora", () => {
    expect(mensajeDeSillonOcupadoSinHorarios("Sillón 1")).toBe("Sillón 1 está ocupado a esa hora. Elige otro sillón u otra hora.")
  })
})

describe("el choque en un sillón", () => {
  const base = crearBaseFalsa()
  const db = base.prisma as unknown as Prisma.TransactionClient
  const cita = (id: string, inicio: string, fin: string, datos: Record<string, unknown> = {}) => ({
    id,
    businessId: "n1",
    title: "Control",
    startTime: santiago(inicio),
    endTime: santiago(fin),
    sillonId: "sl1",
    ...datos,
  })

  const sembrar = () =>
    base.reiniciar({
      business: [
        { id: "n1", name: "Uno", slug: "uno", userId: "u1", type: "odontologia" },
        { id: "n2", name: "Dos", slug: "dos", userId: "u2", type: "odontologia" },
      ],
      user: [
        { id: "u1", name: "Ana", email: "a@test" },
        { id: "u2", name: "Otro", email: "o@test" },
      ],
      sillon: [
        { id: "sl1", businessId: "n1", nombre: "Sillón 1" },
        { id: "sl2", businessId: "n1", nombre: "Sillón 2" },
        { id: "sl-ajeno", businessId: "n2", nombre: "Sillón 1" },
      ],
      appointment: [
        cita("ocupa", "10:00", "11:00"),
        cita("cancelada", "11:00", "12:00", { status: "cancelada" }),
        cita("no-vino", "12:00", "13:00", { status: "no-asistio" }),
        cita("otro-sillon", "13:00", "14:00", { sillonId: "sl2" }),
        cita("ajena", "14:00", "15:00", { businessId: "n2", sillonId: "sl-ajeno" }),
      ],
    })

  const consulta = (inicio: string, fin: string, extra: Record<string, unknown> = {}) => ({
    businessId: "n1",
    sillonId: "sl1",
    tramo: tramo(inicio, fin),
    ignorarCitaId: null,
    zona: "America/Santiago",
    ...extra,
  })

  it("pisarse con una cita que ocupa el sillón es 409 con su código", async () => {
    sembrar()
    const error = await errorDeSillonOcupado(db, consulta("10:30", "11:30", { mostrarHorarios: true }))

    expect(error).toBeInstanceOf(SillonOcupado)
    expect(error?.status).toBe(409)
    expect(error?.codigo).toBe(CODIGO_SILLON_OCUPADO)
    expect(error?.message).toBe("Sillón 1 ya tiene una cita de 10:00 a 11:00. Elige otro sillón u otra hora.")
  })

  it("las horas de lo que choca sólo con `mostrarHorarios`: sin decirlo, o en false, no las dice", async () => {
    sembrar()
    for (const extra of [{}, { mostrarHorarios: false }]) {
      const error = await errorDeSillonOcupado(db, consulta("10:30", "11:30", extra))

      expect(error).toBeInstanceOf(SillonOcupado)
      expect(error?.codigo).toBe(CODIGO_SILLON_OCUPADO)
      expect(error?.message).toBe("Sillón 1 está ocupado a esa hora. Elige otro sillón u otra hora.")
      expect(error?.message).not.toMatch(/\d{1,2}:\d{2}/)
    }
  })

  it("tocarse no es pisarse; cancelada y no vino no ocupan; otro sillón y otro negocio no cuentan", async () => {
    sembrar()
    expect(await errorDeSillonOcupado(db, consulta("11:00", "13:00"))).toBeNull()
    expect(await errorDeSillonOcupado(db, consulta("13:00", "15:00"))).toBeNull()
    expect(await errorDeSillonOcupado(db, consulta("09:00", "10:00"))).toBeNull()
  })

  it("la cita que se escribe no choca consigo misma", async () => {
    sembrar()
    expect(await errorDeSillonOcupado(db, consulta("10:15", "10:45", { ignorarCitaId: "ocupa" }))).toBeNull()
    expect(whereDeChoqueEnSillon(consulta("10:15", "10:45", { ignorarCitaId: "ocupa" }))).toMatchObject({
      id: { not: "ocupa" },
    })
  })

  it("asegurarSillonLibre traba el sillón antes de mirar, y lanza si choca", async () => {
    sembrar()
    await expect(asegurarSillonLibre(db, consulta("10:30", "11:30"))).rejects.toBeInstanceOf(SillonOcupado)
    const [sql, clave] = base.prisma.$executeRaw.mock.calls[0] as [TemplateStringsArray, string]
    expect(sql.join("?")).toContain("pg_advisory_xact_lock")
    expect(clave).toBe("sillon:n1:sl1")

    await expect(asegurarSillonLibre(db, consulta("15:00", "16:00"))).resolves.toBeUndefined()
  })
})
