import { describe, it, expect } from "vitest"
import { MAX_SEDES, type ChoqueEntreSedes, type FranjaDeSede } from "./sedes"
import {
  MENSAJE_NOMBRE_DE_SEDE_REPETIDO,
  MENSAJE_SEDE_CON_CITAS,
  MENSAJE_SIN_SEDES_TODAVIA,
  MENSAJE_YA_HAY_SEDES,
  choquesDeLaSede,
  choquesParaMostrar,
  decidirAltaDeSede,
  decidirBorrado,
  decidirConversion,
  decidirDesactivacion,
  decidirReactivacion,
  enumerar,
  mensajeDeChoques,
  nombreDeSedeRepetido,
  nombreDelDia,
  textoDeHoras,
} from "./reglas-de-sedes"

const franja = (sedeId: string, dayOfWeek: number, startTime: string, endTime: string): FranjaDeSede => ({ sedeId, dayOfWeek, startTime, endTime })
const nombres = (sedeId: string) => ({ a: "Centro", b: "Providencia", c: "Maipú" })[sedeId] ?? "otra"

describe("textos", () => {
  it("horas en singular y plural", () => {
    expect(textoDeHoras(1)).toBe("1 hora")
    expect(textoDeHoras(3)).toBe("3 horas")
  })

  it("enumera y nombra los días", () => {
    expect(enumerar([])).toBe("")
    expect(enumerar(["a"])).toBe("a")
    expect(enumerar(["a", "b"])).toBe("a y b")
    expect(enumerar(["a", "b", "c"])).toBe("a, b y c")
    expect(nombreDelDia(0)).toBe("domingo")
    expect(nombreDelDia(3)).toBe("miércoles")
    expect(nombreDelDia(9)).toBe("")
  })
})

describe("decidirAltaDeSede", () => {
  it("sin sedes activas no se agrega una: primero se convierte", () => {
    expect(decidirAltaDeSede({ activas: 0 })).toEqual({ ok: false, status: 409, error: MENSAJE_SIN_SEDES_TODAVIA })
  })

  it("de una a cuatro activas sí; con el tope no", () => {
    for (let activas = 1; activas < MAX_SEDES; activas++) expect(decidirAltaDeSede({ activas })).toEqual({ ok: true })
    expect(decidirAltaDeSede({ activas: MAX_SEDES })).toMatchObject({ ok: false, status: 409 })
    expect(decidirAltaDeSede({ activas: MAX_SEDES })).toMatchObject({ error: expect.stringContaining(String(MAX_SEDES)) })
    expect(decidirAltaDeSede({ activas: MAX_SEDES + 3 })).toMatchObject({ ok: false })
  })
})

describe("decidirConversion", () => {
  it("sólo con cero sedes activas", () => {
    expect(decidirConversion({ activas: 0 })).toEqual({ ok: true })
    expect(decidirConversion({ activas: 1 })).toEqual({ ok: false, status: 409, error: MENSAJE_YA_HAY_SEDES })
    expect(decidirConversion({ activas: 5 })).toMatchObject({ ok: false })
  })
})

describe("decidirDesactivacion", () => {
  it("una sede con horas por delante no se desactiva, y el mensaje dice cuántas", () => {
    const r = decidirDesactivacion({ horasFuturasDeLaSede: 3, otrasActivas: 2, horasFuturasDelNegocio: 3 })
    expect(r).toMatchObject({ ok: false, status: 409, extra: { horasFuturas: 3 } })
    expect((r as { error: string }).error).toContain("3 horas")
    expect((r as { error: string }).error).toContain("por delante")

    expect((decidirDesactivacion({ horasFuturasDeLaSede: 1, otrasActivas: 1, horasFuturasDelNegocio: 1 }) as { error: string }).error).toContain("1 hora ")
  })

  it("sin horas por delante se desactiva", () => {
    expect(decidirDesactivacion({ horasFuturasDeLaSede: 0, otrasActivas: 2, horasFuturasDelNegocio: 7 })).toEqual({ ok: true })
  })

  it("la última sede activa no se apaga si el negocio tiene horas por delante (aunque no sean de ella)", () => {
    expect(decidirDesactivacion({ horasFuturasDeLaSede: 0, otrasActivas: 0, horasFuturasDelNegocio: 2 })).toMatchObject({
      ok: false,
      status: 409,
      extra: { horasFuturas: 2 },
    })
    expect(decidirDesactivacion({ horasFuturasDeLaSede: 0, otrasActivas: 0, horasFuturasDelNegocio: 0 })).toEqual({ ok: true })
  })
})

describe("choquesParaMostrar y choquesDeLaSede", () => {
  it("nombra a la OTRA sede, sin repetir y de lunes a domingo", () => {
    const franjas = [
      franja("a", 0, "10:00", "12:00"),
      franja("b", 0, "11:00", "13:00"),
      franja("a", 1, "09:00", "13:00"),
      franja("a", 1, "15:00", "19:00"),
      franja("c", 1, "12:00", "16:00"),
      franja("b", 1, "12:30", "13:30"),
    ]
    // La sede `a` choca el domingo con b y el lunes con c (dos franjas suyas tocan la de c) y con b.
    expect(choquesDeLaSede("a", franjas, nombres)).toEqual([
      { dayOfWeek: 1, conSede: "Maipú" },
      { dayOfWeek: 1, conSede: "Providencia" },
      { dayOfWeek: 0, conSede: "Providencia" },
    ])
  })

  it("ignora los choques que no tocan a la sede, y tocarse no choca", () => {
    const franjas = [franja("a", 1, "09:00", "12:00"), franja("b", 1, "12:00", "15:00"), franja("b", 2, "09:00", "12:00"), franja("c", 2, "10:00", "11:00")]
    expect(choquesDeLaSede("a", franjas, nombres)).toEqual([])
    expect(choquesDeLaSede("b", franjas, nombres)).toEqual([{ dayOfWeek: 2, conSede: "Maipú" }])
  })

  it("choquesParaMostrar lee el par en cualquier orden", () => {
    const choque = { dayOfWeek: 2, a: franja("b", 2, "09:00", "12:00"), b: franja("a", 2, "10:00", "11:00") } satisfies ChoqueEntreSedes
    expect(choquesParaMostrar([choque], "a", nombres)).toEqual([{ dayOfWeek: 2, conSede: "Providencia" }])
    expect(choquesParaMostrar([choque], "c", nombres)).toEqual([])
  })

  it("el mensaje nombra los días y las sedes", () => {
    expect(
      mensajeDeChoques([
        { dayOfWeek: 1, conSede: "Maipú" },
        { dayOfWeek: 0, conSede: "Providencia" },
      ])
    ).toBe("El horario se pisa con otra sede: el lunes con Maipú y el domingo con Providencia. Una sola persona no puede estar en dos sedes a la vez")
  })
})

describe("decidirReactivacion", () => {
  it("con lugar y sin choques, sí", () => {
    expect(decidirReactivacion({ otrasActivas: MAX_SEDES - 1, choques: [] })).toEqual({ ok: true })
  })

  it("con el tope de activas, no", () => {
    expect(decidirReactivacion({ otrasActivas: MAX_SEDES, choques: [] })).toMatchObject({ ok: false, status: 409 })
  })

  it("si el horario se pisaría, no, y devuelve los choques", () => {
    const choques = [{ dayOfWeek: 4, conSede: "Maipú" }]
    expect(decidirReactivacion({ otrasActivas: 1, choques })).toMatchObject({
      ok: false,
      status: 409,
      error: expect.stringContaining("jueves"),
      extra: { choques },
    })
  })
})

describe("decidirBorrado", () => {
  it("sin ninguna cita se borra; con una, aunque sea vieja, se desactiva", () => {
    expect(decidirBorrado({ citas: 0 })).toEqual({ ok: true })
    expect(decidirBorrado({ citas: 1 })).toMatchObject({ ok: false, status: 409, error: MENSAJE_SEDE_CON_CITAS })
    expect(MENSAJE_SEDE_CON_CITAS).toContain("Desactívala")
  })
})

describe("nombreDeSedeRepetido", () => {
  const sedes = [
    { id: "a", nombre: "Centro" },
    { id: "b", nombre: "Peñalolén" },
  ]

  it("no distingue mayúsculas ni tildes", () => {
    expect(nombreDeSedeRepetido("centro", sedes)).toBe(true)
    expect(nombreDeSedeRepetido("PEÑALOLEN", sedes)).toBe(true)
    expect(nombreDeSedeRepetido("Centro 2", sedes)).toBe(false)
  })

  it("una sede puede conservar su propio nombre", () => {
    expect(nombreDeSedeRepetido("Centro", sedes, "a")).toBe(false)
    expect(nombreDeSedeRepetido("Centro", sedes, "b")).toBe(true)
  })

  it("el mensaje avisa que una desactivada también ocupa su nombre", () => {
    expect(MENSAJE_NOMBRE_DE_SEDE_REPETIDO).toContain("desactivada")
  })
})
