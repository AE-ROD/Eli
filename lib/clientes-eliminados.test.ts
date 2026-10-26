import { describe, it, expect } from "vitest"
import {
  MARCA_DE_CLIENTE_ELIMINADO,
  NOMBRE_DE_CLIENTE_ELIMINADO,
  datosDeClienteEliminado,
  esEtiquetaReservada,
} from "./clientes-eliminados"
import { etiquetas } from "./campos-del-panel"

describe("datosDeClienteEliminado", () => {
  it("borra todo dato personal y deja sólo el nombre fijo y la marca", () => {
    expect(datosDeClienteEliminado()).toEqual({
      name: NOMBRE_DE_CLIENTE_ELIMINADO,
      lastName: null,
      cedula: null,
      email: null,
      phone: null,
      notes: null,
      tags: [MARCA_DE_CLIENTE_ELIMINADO],
    })
  })
})

describe("esEtiquetaReservada", () => {
  it.each([MARCA_DE_CLIENTE_ELIMINADO, "  ELI:Cliente-Eliminado "])("reconoce %j", (etiqueta) => {
    expect(esEtiquetaReservada(etiqueta)).toBe(true)
  })

  it.each(["VIP", "eliminado", "eli"])("deja pasar %j", (etiqueta) => {
    expect(esEtiquetaReservada(etiqueta)).toBe(false)
  })

  it("las etiquetas del panel no aceptan la marca: nadie elimina (ni esconde) un cliente a mano", () => {
    const resultado = etiquetas().safeParse(["VIP", MARCA_DE_CLIENTE_ELIMINADO])

    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0].message).toBe("Esa etiqueta está reservada")
  })
})
