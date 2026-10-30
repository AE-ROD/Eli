import { describe, it, expect } from "vitest"
import {
  MINUTOS_POR_PERSONA_POR_DEFECTO,
  leTocaElAviso,
  minutosEstimados,
  minutosPorPersona,
  nombreParaPantalla,
  primerNombre,
} from "@/lib/fila-virtual"
import { filaVirtualSchema } from "@/lib/validaciones"

describe("minutosPorPersona", () => {
  it("es el promedio de la duración de los servicios activos", () => {
    expect(minutosPorPersona([30, 45, 60])).toBe(45)
    expect(minutosPorPersona([20, 25])).toBe(23)
  })

  it("sin servicios, o sin duraciones válidas, 20", () => {
    expect(minutosPorPersona([])).toBe(MINUTOS_POR_PERSONA_POR_DEFECTO)
    expect(minutosPorPersona([0, -10, Number.NaN])).toBe(MINUTOS_POR_PERSONA_POR_DEFECTO)
  })

  it("queda entre 5 y 120 minutos", () => {
    expect(minutosPorPersona([1, 2])).toBe(5)
    expect(minutosPorPersona([480])).toBe(120)
  })
})

describe("minutosEstimados", () => {
  it("personas adelante por minutos por persona, redondeado hacia arriba a 5", () => {
    expect(minutosEstimados(3, 20)).toBe(60)
    expect(minutosEstimados(1, 23)).toBe(25)
    expect(minutosEstimados(2, 21)).toBe(45)
  })

  it("con nadie adelante, 0", () => {
    expect(minutosEstimados(0, 30)).toBe(0)
  })
})

describe("nombreParaPantalla", () => {
  it("el primer nombre y la inicial del segundo", () => {
    expect(nombreParaPantalla("Juan Pérez")).toBe("Juan P.")
    expect(nombreParaPantalla("  maría   josé  gonzález ")).toBe("maría J.")
    expect(nombreParaPantalla("Álvaro ñuñez")).toBe("Álvaro Ñ.")
  })

  it("una sola palabra queda tal cual; vacío, vacío", () => {
    expect(nombreParaPantalla("Beto")).toBe("Beto")
    expect(nombreParaPantalla("   ")).toBe("")
  })
})

describe("primerNombre", () => {
  it("sólo la primera palabra, sin espacios de más", () => {
    expect(primerNombre("Juan Pérez Soto")).toBe("Juan")
    expect(primerNombre("  maría   josé ")).toBe("maría")
    expect(primerNombre("Beto")).toBe("Beto")
    expect(primerNombre("   ")).toBe("")
  })
})

describe("filaVirtualSchema: el nombre", () => {
  it("acepta hasta 40 caracteres y rechaza 41", () => {
    expect(filaVirtualSchema.safeParse({ nombre: "a".repeat(40) }).success).toBe(true)
    const largo = filaVirtualSchema.safeParse({ nombre: "a".repeat(41) })
    expect(largo.success).toBe(false)
    expect(largo.error?.issues[0]?.message).toBe("El nombre puede tener hasta 40 caracteres")
  })
})

describe("leTocaElAviso", () => {
  const nunca = null
  it("con correo, sin aviso previo y 1 o 0 personas adelante", () => {
    expect(leTocaElAviso(1, "a@b.cl", nunca)).toBe(true)
    expect(leTocaElAviso(0, "a@b.cl", nunca)).toBe(true)
  })

  it("con 2 o más adelante, sin correo o ya avisada, no", () => {
    expect(leTocaElAviso(2, "a@b.cl", nunca)).toBe(false)
    expect(leTocaElAviso(1, null, nunca)).toBe(false)
    expect(leTocaElAviso(1, "", nunca)).toBe(false)
    expect(leTocaElAviso(1, "a@b.cl", new Date())).toBe(false)
  })
})
