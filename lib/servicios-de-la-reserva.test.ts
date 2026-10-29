import { describe, it, expect } from "vitest"
import { haceLosServicios } from "./agenda-publica"
import {
  duracionAlReagendar,
  mismoPrecio,
  precioEditadoAMano,
  resumenDeLaReserva,
  serviciosDeLaCita,
} from "./servicios-de-la-reserva"
import { reservaSchema } from "./validaciones"

const corte = { name: "Corte", duration: 60, price: 8000 }
const color = { name: "Color", duration: 30, price: 25000 }
const peinado = { name: "Peinado", duration: 15, price: null }

describe("resumenDeLaReserva", () => {
  it("suma duración y precio y une los nombres con ' + '", () => {
    expect(resumenDeLaReserva([corte, color])).toEqual({
      titulo: "Corte + Color",
      duracion: 90,
      precio: 33000,
      precioIncompleto: false,
    })
  })

  it("sin precio en alguno, suma lo que hay y lo dice; sin precio en ninguno, null", () => {
    expect(resumenDeLaReserva([corte, peinado])).toMatchObject({ precio: 8000, precioIncompleto: true })
    expect(resumenDeLaReserva([peinado])).toMatchObject({ precio: null, precioIncompleto: false })
  })
})

describe("haceLosServicios", () => {
  it("tiene que hacer todos; sin filas hace todos; sin servicios pedidos, ninguno (falla cerrado)", () => {
    expect(haceLosServicios({ serviceIds: [] }, ["a", "b"])).toBe(true)
    expect(haceLosServicios({ serviceIds: ["a", "b", "c"] }, ["a", "b"])).toBe(true)
    expect(haceLosServicios({ serviceIds: ["a"] }, ["a", "b"])).toBe(false)
    expect(haceLosServicios({ serviceIds: [] }, [])).toBe(false)
  })
})

describe("serviciosDeLaCita", () => {
  const servicio = { id: "s-corte", name: "Corte", duration: 60, active: true }

  it("con filas, mandan ellas: duración copiada, nombres en orden", () => {
    expect(
      serviciosDeLaCita({
        title: "x",
        service: servicio,
        servicios: [
          { serviceId: "s-corte", serviceName: "Corte", duration: 45, price: 8000, service: { active: true } },
          { serviceId: "s-color", serviceName: "Color", duration: 30, price: 25000, service: { active: true } },
        ],
      })
    ).toEqual({ ids: ["s-corte", "s-color"], nombre: "Corte + Color", duracion: 75, activos: true })
  })

  it("una fila con el servicio borrado o inactivo: no se reagenda", () => {
    const borrado = serviciosDeLaCita({
      title: "x",
      service: servicio,
      servicios: [{ serviceId: null, serviceName: "Corte", duration: 60, price: null, service: null }],
    })
    expect(borrado).toMatchObject({ ids: [], activos: false })
    const inactivo = serviciosDeLaCita({
      title: "x",
      service: servicio,
      servicios: [{ serviceId: "s-corte", serviceName: "Corte", duration: 60, price: null, service: { active: false } }],
    })
    expect(inactivo.activos).toBe(false)
  })

  it("sin filas (la cita de antes), el servicio de serviceId; sin servicio, el título", () => {
    expect(serviciosDeLaCita({ title: "Corte", service: servicio, servicios: [] })).toEqual({
      ids: ["s-corte"],
      nombre: "Corte",
      duracion: 60,
      activos: true,
    })
    expect(serviciosDeLaCita({ title: "Algo", service: null })).toEqual({ ids: [], nombre: "Algo", duracion: null, activos: false })
  })
})

describe("reservaSchema con varios servicios", () => {
  const datos = { fecha: "2030-01-07", hora: "09:00", nombre: "Lucía", apellido: "Pérez" }

  it("sale siempre con servicioIds; servicioId suelto es uno solo", () => {
    expect(reservaSchema.parse({ ...datos, servicioId: "a" }).servicioIds).toEqual(["a"])
    expect(reservaSchema.parse({ ...datos, servicioIds: ["a", "b"] }).servicioIds).toEqual(["a", "b"])
  })

  it.each([
    ["sin servicio", {}],
    ["vacío", { servicioIds: [] }],
    ["repetido", { servicioIds: ["a", "a"] }],
    ["más de 4", { servicioIds: ["a", "b", "c", "d", "e"] }],
    ["los dos campos", { servicioIds: ["a"], servicioId: "b" }],
    ["un id larguísimo", { servicioIds: ["x".repeat(65)] }],
  ])("%s: no pasa", (_caso, extra) => {
    expect(reservaSchema.safeParse({ ...datos, ...extra }).success).toBe(false)
  })
})

describe("precioEditadoAMano", () => {
  it("con filas: editado si `price` no es la suma de las filas, con 1 peso de tolerancia", () => {
    const filas = [{ price: 8000 }, { price: 25000 }]
    expect(precioEditadoAMano({ price: 33000, servicios: filas })).toBe(false)
    expect(precioEditadoAMano({ price: 33001, servicios: filas })).toBe(false)
    expect(precioEditadoAMano({ price: 32999, servicios: filas })).toBe(false)
    expect(precioEditadoAMano({ price: 30000, servicios: filas })).toBe(true)
    expect(precioEditadoAMano({ price: null, servicios: filas })).toBe(true)
  })

  it("las filas sin precio no suman, como al reservar", () => {
    expect(precioEditadoAMano({ price: 8000, servicios: [{ price: 8000 }, { price: null }] })).toBe(false)
    expect(precioEditadoAMano({ price: null, servicios: [{ price: null }] })).toBe(false)
    expect(precioEditadoAMano({ price: 5000, servicios: [{ price: null }] })).toBe(true)
  })

  it("sin filas no hay con qué comparar", () => {
    expect(precioEditadoAMano({ price: 1 })).toBe(false)
    expect(precioEditadoAMano({ price: 1, servicios: [] })).toBe(false)
  })

  it("mismoPrecio", () => {
    expect(mismoPrecio(null, null)).toBe(true)
    expect(mismoPrecio(null, 0)).toBe(false)
    expect(mismoPrecio(100, 101)).toBe(true)
    expect(mismoPrecio(100, 102)).toBe(false)
  })
})

describe("duracionAlReagendar", () => {
  const inicio = new Date("2030-01-07T12:00:00Z")
  const hasta = (minutos: number) => new Date(inicio.getTime() + minutos * 60_000)

  it("con filas: la mayor entre su suma y lo que dura hoy la cita", () => {
    const filas = [{}, {}]
    expect(duracionAlReagendar({ startTime: inicio, endTime: hasta(90), servicios: filas }, { duracion: 90 })).toBe(90)
    // Alargada en el panel: no se acorta al moverla.
    expect(duracionAlReagendar({ startTime: inicio, endTime: hasta(120), servicios: filas }, { duracion: 90 })).toBe(120)
    // Acortada en el panel: manda la suma.
    expect(duracionAlReagendar({ startTime: inicio, endTime: hasta(60), servicios: filas }, { duracion: 90 })).toBe(90)
  })

  it("sin filas, la de su servicio, como siempre; sin duración, null", () => {
    expect(duracionAlReagendar({ startTime: inicio, endTime: hasta(120), servicios: [] }, { duracion: 60 })).toBe(60)
    expect(duracionAlReagendar({ startTime: inicio, endTime: hasta(120) }, { duracion: null })).toBeNull()
  })
})
