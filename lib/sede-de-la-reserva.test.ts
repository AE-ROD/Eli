import { describe, expect, it } from "vitest"
import {
  LARGO_MAXIMO_DE_ID_DE_SEDE,
  hayVariasSedes,
  leerSedeDelCuerpo,
  leerSedeDelPedido,
  lugarDeLaSede,
  resolverSedeDeLaReserva,
} from "./sede-de-la-reserva"

const sede = (id: string, activo = true) => ({ id, activo })

describe("leerSedeDelPedido", () => {
  it("nada, vacío o de puros espacios es 'no eligió'", () => {
    for (const valor of [undefined, null, "", "   "]) expect(leerSedeDelPedido(valor)).toBeNull()
  })

  it("un texto razonable es el id, sin espacios en las puntas", () => {
    expect(leerSedeDelPedido("abc123")).toBe("abc123")
    expect(leerSedeDelPedido("  abc123 ")).toBe("abc123")
    expect(leerSedeDelPedido("x".repeat(LARGO_MAXIMO_DE_ID_DE_SEDE))).toBe("x".repeat(LARGO_MAXIMO_DE_ID_DE_SEDE))
  })

  it("lo que no puede ser un id (número, objeto, lista, texto enorme) no coincide nunca con una sede", () => {
    for (const valor of [7, true, { id: "a" }, ["a"], "x".repeat(LARGO_MAXIMO_DE_ID_DE_SEDE + 1)]) {
      const leido = leerSedeDelPedido(valor)
      expect(leido).not.toBeNull()
      expect(resolverSedeDeLaReserva([sede("a"), sede("b")], leido).tipo).toBe("no-valida")
    }
  })

  it("nunca lanza, y del cuerpo toma sólo `sedeId`", () => {
    expect(leerSedeDelCuerpo({ sedeId: "a", otra: 1 })).toBe("a")
    expect(leerSedeDelCuerpo({})).toBeNull()
    for (const cuerpo of [null, undefined, "texto", 5, ["sedeId"]]) expect(leerSedeDelCuerpo(cuerpo)).toBeNull()
  })
})

describe("resolverSedeDeLaReserva", () => {
  it("sin sedes activas: sin sede, el id que llegue se ignora y el horario es el de siempre", () => {
    for (const sedes of [[], [sede("vieja", false)]]) {
      for (const elegida of [null, undefined, "", "vieja", "ajena"]) {
        expect(resolverSedeDeLaReserva(sedes, elegida)).toEqual({ tipo: "ok", sede: null, sedeDelHorario: null })
      }
    }
  })

  it("con una sola sede activa: se estampa esa aunque no llegue nada; el horario es el vigente (como hoy)", () => {
    const sedes = [sede("a"), sede("vieja", false)]

    expect(resolverSedeDeLaReserva(sedes, null)).toEqual({ tipo: "ok", sede: sede("a"), sedeDelHorario: null })
    expect(resolverSedeDeLaReserva(sedes, "a")).toEqual({ tipo: "ok", sede: sede("a"), sedeDelHorario: null })
  })

  it("con una sola sede activa, una elección que no es ella no vale, tampoco la inactiva ni la ajena", () => {
    const sedes = [sede("a"), sede("vieja", false)]

    expect(resolverSedeDeLaReserva(sedes, "vieja").tipo).toBe("no-valida")
    expect(resolverSedeDeLaReserva(sedes, "ajena").tipo).toBe("no-valida")
  })

  it("con dos o más: hay que elegir una activa, y el horario es el de la elegida", () => {
    const sedes = [sede("a"), sede("b"), sede("vieja", false)]

    expect(resolverSedeDeLaReserva(sedes, "b")).toEqual({ tipo: "ok", sede: sede("b"), sedeDelHorario: "b" })
    expect(resolverSedeDeLaReserva(sedes, null).tipo).toBe("no-valida")
    expect(resolverSedeDeLaReserva(sedes, "vieja").tipo).toBe("no-valida")
    expect(resolverSedeDeLaReserva(sedes, "ajena").tipo).toBe("no-valida")
  })
})

describe("hayVariasSedes", () => {
  it("cuenta sólo las activas", () => {
    expect(hayVariasSedes([])).toBe(false)
    expect(hayVariasSedes([sede("a")])).toBe(false)
    expect(hayVariasSedes([sede("a"), sede("b", false)])).toBe(false)
    expect(hayVariasSedes([sede("a"), sede("b")])).toBe(true)
  })
})

describe("lugarDeLaSede", () => {
  it("sólo nombre, dirección y comuna: nada interno", () => {
    const lugar = lugarDeLaSede({ nombre: "Centro", direccion: "Av. Italia 1234", comuna: "Providencia", id: "x", telefono: "+56912345678" } as {
      nombre: string
      direccion: string
      comuna: string
    })

    expect(lugar).toEqual({ nombre: "Centro", direccion: "Av. Italia 1234", comuna: "Providencia" })
  })
})
