import { describe, it, expect } from "vitest"
import {
  MARCA_DE_CLIENTE_ELIMINADO,
  NOMBRE_DE_CLIENTE_ELIMINADO,
  datosDeClienteEliminado,
  esEtiquetaReservada,
  inscripcionesDeClienteEliminado,
  textosDeAtencionDeClienteEliminado,
  textosDeCitaDeClienteEliminado,
} from "./clientes-eliminados"
import { etiquetas } from "./campos-del-panel"
import { coincide, type Tablas } from "@/pruebas/consultas-falsas"

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
      whatsappConsentAt: null,
      whatsappConsentSource: null,
      correoPromoConsentAt: null,
      correoPromoConsentSource: null,
      correoPromoBajaAt: null,
    })
  })
})

describe("inscripcionesDeClienteEliminado", () => {
  const tablas = {
    inscripcionEnEspera: [
      { id: "i-1", businessId: "n1", email: "maria@test" },
      { id: "i-otra", businessId: "n1", email: "beto@test" },
      { id: "i-ajena", businessId: "n2", email: "maria@test" },
    ],
  } as unknown as Tablas
  const borradas = (where: object) =>
    tablas.inscripcionEnEspera.filter((i) => coincide(tablas, "inscripcionEnEspera", i, where)).map((i) => i.id)

  it("las de su email en su negocio, con el email normalizado; nunca las de otro negocio", () => {
    expect(borradas(inscripcionesDeClienteEliminado("n1", "  Maria@Test "))).toEqual(["i-1"])
  })

  it("sin email no borra ninguna", () => {
    expect(borradas(inscripcionesDeClienteEliminado("n1", null))).toEqual([])
    expect(borradas(inscripcionesDeClienteEliminado("n1", "  "))).toEqual([])
  })
})

describe("lo que se borra de sus citas y atenciones", () => {
  it("de cada cita, los dos textos libres: ni el horario, ni el precio, ni el profesional", () => {
    expect(textosDeCitaDeClienteEliminado()).toEqual({ notes: null, clientComments: null })
  })

  it("de cada atención, la copia del nombre, las notas y el motivo de anulación: nada de dinero", () => {
    expect(textosDeAtencionDeClienteEliminado()).toEqual({
      customerName: NOMBRE_DE_CLIENTE_ELIMINADO,
      notes: null,
      voidReason: null,
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
