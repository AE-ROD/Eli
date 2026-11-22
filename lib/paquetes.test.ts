import { describe, it, expect } from "vitest"
import { ahorroDelPaquete, estadoDelPaquete, montoADevolver, nombreDelPaquete, textoDelSaldo, valorPorSesion, venceAtDe } from "./paquetes"

const AHORA = new Date("2026-11-22T12:00:00Z")
const paquete = (datos: Partial<Parameters<typeof estadoDelPaquete>[0]> = {}) => ({
  sesiones: 6,
  usadas: 2,
  venceAt: null,
  devueltoAt: null,
  ventaAnulada: false,
  ...datos,
})

describe("paquetes de sesiones: las reglas", () => {
  it("el valor por sesión es el precio repartido, hacia abajo", () => {
    expect(valorPorSesion(15000000, 6)).toBe(2500000)
    expect(valorPorSesion(10000000, 3)).toBe(3333333)
  })

  it("el ahorro se compara con pagar cada sesión suelta", () => {
    expect(ahorroDelPaquete(15000000, 6, 3000000)).toBe(17)
    expect(ahorroDelPaquete(18000000, 6, 3000000)).toBeNull()
    expect(ahorroDelPaquete(15000000, 6, null)).toBeNull()
  })

  it("el nombre de la línea de venta", () => {
    expect(nombreDelPaquete(6, "Depilación láser")).toBe("Paquete de 6 sesiones: Depilación láser")
  })

  it("vence el mismo día, tantos meses después; un día que no existe cae en el último del mes", () => {
    expect(venceAtDe(new Date("2026-11-22T12:00:00Z"), 6)).toEqual(new Date("2027-05-22T12:00:00Z"))
    expect(venceAtDe(new Date("2026-08-31T12:00:00Z"), 6)).toEqual(new Date("2027-02-28T12:00:00Z"))
    expect(venceAtDe(new Date("2026-11-22T12:00:00Z"), null)).toBeNull()
  })

  it("el estado: lo que lo invalida entero va primero", () => {
    expect(estadoDelPaquete(paquete(), AHORA)).toBe("activo")
    expect(estadoDelPaquete(paquete({ usadas: 6 }), AHORA)).toBe("agotado")
    expect(estadoDelPaquete(paquete({ venceAt: new Date("2026-11-22T12:00:00Z") }), AHORA)).toBe("vencido")
    expect(estadoDelPaquete(paquete({ venceAt: new Date("2026-11-22T12:00:01Z") }), AHORA)).toBe("activo")
    expect(estadoDelPaquete(paquete({ devueltoAt: AHORA, usadas: 6 }), AHORA)).toBe("devuelto")
    expect(estadoDelPaquete(paquete({ ventaAnulada: true, devueltoAt: AHORA }), AHORA)).toBe("anulado")
  })

  it("se devuelve todo si no usó ninguna, y las que quedan si usó alguna; nunca más de lo pagado", () => {
    const base = { sesiones: 3, priceCents: 10000000, valorPorSesionCents: 3333333 }
    expect(montoADevolver({ ...base, usadas: 0 })).toBe(10000000)
    expect(montoADevolver({ ...base, usadas: 1 })).toBe(6666666)
    expect(montoADevolver({ ...base, usadas: 3 })).toBe(0)
    expect(montoADevolver({ ...base, usadas: 9 })).toBe(0)
  })

  it("el saldo, en palabras", () => {
    expect(textoDelSaldo(6, 2)).toBe("Le quedan 4 de 6")
    expect(textoDelSaldo(6, 5)).toBe("Le queda 1 de 6")
    expect(textoDelSaldo(6, 6)).toBe("Usó las 6")
  })
})
