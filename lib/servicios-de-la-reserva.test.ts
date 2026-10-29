import { describe, it, expect } from "vitest"
import { haceLosServicios } from "./agenda-publica"
import { resumenDeLaReserva, serviciosDeLaCita } from "./servicios-de-la-reserva"
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
