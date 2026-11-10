import { describe, it, expect } from "vitest"
import { coincideConWhere } from "./where-simple"

/**
 * `coincideConWhere` sostiene tests de aislamiento con dobles de Prisma
 * hechos a mano: tiene que leer el `where` como la base falsa y lanzar ante
 * lo que no entiende (F-018), no devolver `false` y dejar pasar el test.
 */
describe("coincideConWhere", () => {
  const cita = { id: "cita-1", businessId: "n1", memberId: "m1" }

  it("lee igualdad, AND, OR, NOT e in como la base falsa", () => {
    expect(coincideConWhere("appointment", cita, { AND: [{ businessId: "n1" }, { memberId: { in: ["m1", "m2"] } }] })).toBe(true)
    expect(coincideConWhere("appointment", cita, { OR: [{ businessId: "n2" }, { id: "cita-1" }] })).toBe(true)
    expect(coincideConWhere("appointment", cita, { NOT: { businessId: "n1" } })).toBe(false)
    expect(coincideConWhere("appointment", cita, { AND: [{ id: { in: [] } }] })).toBe(false)
  })

  it("ignora un undefined, como Prisma (antes lo comparaba y la fila no salía)", () => {
    expect(coincideConWhere("appointment", cita, { businessId: "n1", memberId: undefined })).toBe(true)
  })

  it("lanza ante un operador, un campo o una relación que no entiende (antes devolvía false)", () => {
    expect(() => coincideConWhere("appointment", cita, { businessId: { startsWith: "n" } })).toThrow(/operador startsWith/)
    expect(() => coincideConWhere("appointment", cita, { status: "pendiente" })).toThrow(/appointment.status no existe/)
    expect(() => coincideConWhere("appointment", cita, { customer: { name: "x" } })).not.toThrow()
    expect(() => coincideConWhere("appointment", cita, { cliente: { name: "x" } })).toThrow(/no existe/)
  })

  it("con las otras tablas, filtra por relación", () => {
    const conCliente = { ...cita, customerId: "c1" }
    const tablas = { customer: [{ id: "c1", businessId: "n1", name: "María" }] }
    expect(coincideConWhere("appointment", conCliente, { customer: { is: { businessId: "n1" } } }, tablas)).toBe(true)
    expect(coincideConWhere("appointment", conCliente, { customer: { is: { businessId: "n2" } } }, tablas)).toBe(false)
  })
})
