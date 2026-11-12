import { describe, expect, it } from "vitest"
import {
  diasConLaSede,
  direccionConComuna,
  hayQueElegirSede,
  sedeDeLaUrl,
  sedeSePuedeElegir,
  type SedeParaElegir,
} from "./reglas-de-la-sede"

const sede = (id: string, dias: number[], extra: Partial<SedeParaElegir> = {}): SedeParaElegir => ({
  id,
  nombre: `Sede ${id}`,
  direccion: "Av. Italia 1234",
  comuna: "Providencia",
  dias,
  horario: dias.length > 0 ? ["Lun, Mié: 09:00–13:00"] : [],
  ...extra,
})

const CENTRO = sede("centro", [1, 3])
const NUNOA = sede("nunoa", [2, 4, 5])
const SIN_HORARIO = sede("sin-horario", [])
const SEDES = [CENTRO, NUNOA, SIN_HORARIO]

describe("hayQueElegirSede", () => {
  it("sólo con dos o más sedes se pregunta '¿Dónde?'", () => {
    expect(hayQueElegirSede([])).toBe(false)
    expect(hayQueElegirSede([CENTRO])).toBe(false)
    expect(hayQueElegirSede([CENTRO, NUNOA])).toBe(true)
  })
})

describe("sedeSePuedeElegir", () => {
  it("una sede sin ningún día no se puede elegir: no tendría horas", () => {
    expect(sedeSePuedeElegir(CENTRO)).toBe(true)
    expect(sedeSePuedeElegir(SIN_HORARIO)).toBe(false)
  })
})

describe("sedeDeLaUrl (?sede=)", () => {
  it("el id de una sede del negocio con horario se deja elegido", () => {
    expect(sedeDeLaUrl("nunoa", SEDES)).toBe("nunoa")
  })

  it("falta, vacío o de puros espacios: no queda nada elegido", () => {
    for (const valor of [null, "", "   "]) expect(sedeDeLaUrl(valor, SEDES)).toBeNull()
  })

  it("un id que no es de este negocio, o que se parece al de una sede, se ignora", () => {
    for (const valor of ["ajena", "CENTRO", "centro ", "centro,nunoa", "../centro"]) expect(sedeDeLaUrl(valor, SEDES)).toBeNull()
  })

  it("una sede sin horario no se deja elegida: no tendría días que ofrecer", () => {
    expect(sedeDeLaUrl("sin-horario", SEDES)).toBeNull()
  })
})

describe("diasConLaSede", () => {
  it("del calendario de lo elegido, sólo los días en que atiende la sede", () => {
    expect(diasConLaSede([1, 2, 3, 4, 5], CENTRO)).toEqual([1, 3])
    expect(diasConLaSede([1, 2, 3, 4, 5], NUNOA)).toEqual([2, 4, 5])
  })

  it("no suma días que lo elegido no tiene (el profesional no atiende ese día)", () => {
    expect(diasConLaSede([1], CENTRO)).toEqual([1])
    expect(diasConLaSede([2], CENTRO)).toEqual([])
  })

  it("sin sede elegida, ningún día: el calendario no se ofrece antes de saber dónde", () => {
    expect(diasConLaSede([1, 2, 3], null)).toEqual([])
  })
})

describe("direccionConComuna", () => {
  it("la dirección con su comuna", () => {
    expect(direccionConComuna({ direccion: "Av. Italia 1234", comuna: "Providencia" })).toBe("Av. Italia 1234, Providencia")
  })

  it("sin comuna, sólo la dirección", () => {
    expect(direccionConComuna({ direccion: "Av. Italia 1234", comuna: " " })).toBe("Av. Italia 1234")
  })
})
