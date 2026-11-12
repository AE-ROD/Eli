import { describe, expect, it } from "vitest"
import { sedesParaLaPagina } from "./pagina-del-negocio"

const sede = (id: string, nombre: string, orden: number, extra: Record<string, unknown> = {}) => ({
  id,
  nombre,
  direccion: "Av. Italia 1234",
  comuna: "Providencia",
  telefono: null,
  orden,
  activo: true,
  ...extra,
})
const fila = (sedeId: string | null, dayOfWeek: number, startTime: string, endTime: string) => ({ sedeId, dayOfWeek, startTime, endTime })

describe("sedesParaLaPagina", () => {
  it("las sedes activas en el orden de la lista, con su horario por días y los enlaces de mapa de su dirección", () => {
    const sedes = sedesParaLaPagina(
      [sede("b", "Ñuñoa", 1, { direccion: "Irarrázaval 500", comuna: "Ñuñoa", telefono: "+56912345678" }), sede("a", "Centro", 0)],
      [fila("a", 1, "09:00", "13:00"), fila("a", 3, "09:00", "13:00"), fila("a", 5, "15:00", "19:00"), fila("b", 2, "14:00", "18:00")]
    )

    expect(sedes).toEqual([
      {
        id: "a",
        nombre: "Centro",
        direccion: "Av. Italia 1234",
        comuna: "Providencia",
        telefono: null,
        mapas: {
          googleMaps: "https://www.google.com/maps/search/?api=1&query=Av.%20Italia%201234%2C%20Providencia",
          waze: "https://waze.com/ul?q=Av.%20Italia%201234%2C%20Providencia",
        },
        dias: [1, 3, 5],
        horario: ["Lun, Mié: 09:00–13:00", "Vie: 15:00–19:00"],
      },
      {
        id: "b",
        nombre: "Ñuñoa",
        direccion: "Irarrázaval 500",
        comuna: "Ñuñoa",
        telefono: "+56912345678",
        mapas: {
          googleMaps: "https://www.google.com/maps/search/?api=1&query=Irarr%C3%A1zaval%20500%2C%20%C3%91u%C3%B1oa",
          waze: "https://waze.com/ul?q=Irarr%C3%A1zaval%20500%2C%20%C3%91u%C3%B1oa",
        },
        dias: [2],
        horario: ["Mar: 14:00–18:00"],
      },
    ])
  })

  it("el horario de cada sede es el suyo: las franjas de otra sede o sin sede no cuentan", () => {
    const [centro] = sedesParaLaPagina([sede("a", "Centro", 0)], [fila("a", 1, "09:00", "13:00"), fila("otra", 1, "14:00", "18:00"), fila(null, 2, "09:00", "18:00")])

    expect(centro.dias).toEqual([1])
    expect(centro.horario).toEqual(["Lun: 09:00–13:00"])
  })

  it("una sede sin horario cargado sale con días y horario vacíos; una inactiva no sale", () => {
    const sedes = sedesParaLaPagina([sede("a", "Centro", 0), sede("vieja", "Vieja", 1, { activo: false })], [])

    expect(sedes.map((s) => s.id)).toEqual(["a"])
    expect(sedes[0]).toMatchObject({ dias: [], horario: [] })
  })

  it("sin dirección no hay mapas, pero la sede sale igual", () => {
    // La base no deja una dirección vacía; esto sólo comprueba que no revienta con un dato raro.
    const [sinCalle] = sedesParaLaPagina([sede("a", "Centro", 0, { direccion: "  " })], [])

    expect(sinCalle.mapas).toBeNull()
  })
})
