import { describe, it, expect } from "vitest"
import { cabeEnLaCaja, cuentaDeCaja, diaDelNegocio, inicioDelProximoCierre, resumirCaja } from "./caja"

describe("resumirCaja y cuentaDeCaja", () => {
  const resumen = resumirCaja(
    [
      { method: "efectivo", amountCents: 800_000 },
      { method: "tarjeta-debito", amountCents: 500_000 },
      { method: "efectivo", amountCents: 150 },
      { method: "tarjeta-debito", amountCents: 1 },
    ],
    [
      { method: "efectivo", amountCents: 200_000 },
      { method: "transferencia", amountCents: 100_000 },
    ]
  )

  it("separa el efectivo de los otros medios, en pagos y en propinas", () => {
    expect(resumen).toEqual({
      efectivoCobradoCents: 800_150,
      propinasEfectivoCents: 200_000,
      desglose: { otrosMedios: { "tarjeta-debito": 500_001 }, propinasOtrosMedios: { transferencia: 100_000 } },
    })
  })

  it("esperado = fondo + cobrado + propinas; diferencia = contado − esperado", () => {
    const cuenta = cuentaDeCaja(resumen, 1_000_000, 1_999_000)
    expect(cuenta.efectivoEsperadoCents).toBe(1_000_000 + 800_150 + 200_000)
    expect(cuenta.diferenciaCents).toBe(1_999_000 - 2_000_150)
    expect(cabeEnLaCaja(cuenta)).toBe(true)
  })

  it("sin nada en el rango, el esperado es el fondo", () => {
    const cuenta = cuentaDeCaja(resumirCaja([], []), 500, 500)
    expect(cuenta).toMatchObject({ efectivoEsperadoCents: 500, diferenciaCents: 0 })
  })

  it("lo que no cabe en la columna se rechaza", () => {
    expect(cabeEnLaCaja(cuentaDeCaja(resumirCaja([{ method: "efectivo", amountCents: 2_000_000_000 }], []), 1, 0))).toBe(
      false
    )
  })
})

describe("inicioDelProximoCierre", () => {
  const zona = "America/Santiago"

  it("sigue al último cierre, sin hueco", () => {
    const ultimo = new Date("2026-10-19T22:00:00.000Z")
    expect(inicioDelProximoCierre(ultimo, new Date("2026-10-20T20:00:00.000Z"), zona)).toBe(ultimo)
  })

  it("el primero arranca al inicio del día del negocio, no del servidor", () => {
    // 01:00Z del 21 son las 22:00 del 20 en Santiago (UTC-3).
    expect(inicioDelProximoCierre(null, new Date("2026-10-21T01:00:00.000Z"), zona).toISOString()).toBe(
      "2026-10-20T03:00:00.000Z"
    )
  })

  it("el día del cambio de hora (6/9/2026 en Santiago) empieza a la 01:00 local", () => {
    expect(inicioDelProximoCierre(null, new Date("2026-09-06T15:00:00.000Z"), zona).toISOString()).toBe(
      "2026-09-06T04:00:00.000Z"
    )
  })

  it("diaDelNegocio usa la fecha del negocio", () => {
    expect(diaDelNegocio(new Date("2026-10-21T01:00:00.000Z"), zona).toISOString()).toBe("2026-10-20T00:00:00.000Z")
  })
})
