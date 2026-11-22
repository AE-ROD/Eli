import { describe, it, expect } from "vitest"
import { cabeEnLaCaja, columnasDelCierre, cuentaDeCaja, diaDelNegocio, efectivoDelCierre, inicioDelProximoCierre, resumirCaja } from "./caja"

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
      devolucionesEfectivoCents: 0,
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

describe("devoluciones de paquetes en la caja", () => {
  const pagos = [
    { method: "efectivo", amountCents: 300_000 },
    { method: "transferencia", amountCents: 50_000 },
  ]
  const propinas = [{ method: "efectivo", amountCents: 10_000 }]

  it("la de efectivo resta del esperado; la de transferencia queda en su medio y no toca el cajón", () => {
    const resumen = resumirCaja(pagos, propinas, [
      { method: "efectivo", amountCents: 100_000 },
      { method: "transferencia", amountCents: 20_000 },
      { method: "efectivo", amountCents: 5_000 },
    ])
    expect(resumen.efectivoCobradoCents).toBe(300_000)
    expect(resumen.devolucionesEfectivoCents).toBe(105_000)
    expect(resumen.desglose.otrosMedios).toEqual({ transferencia: 50_000 })
    expect(resumen.desglose.devoluciones).toEqual({ efectivo: 105_000, transferencia: 20_000 })

    const cuenta = cuentaDeCaja(resumen, 20_000, 225_000)
    expect(cuenta.efectivoEsperadoCents).toBe(20_000 + 300_000 + 10_000 - 105_000)
    expect(cuenta.diferenciaCents).toBe(0)
  })

  it("sólo por transferencia: el esperado no cambia", () => {
    const resumen = resumirCaja(pagos, propinas, [{ method: "transferencia", amountCents: 20_000 }])
    expect(resumen.devolucionesEfectivoCents).toBe(0)
    expect(resumen.desglose.devoluciones).toEqual({ transferencia: 20_000 })
    expect(cuentaDeCaja(resumen, 0, 0).efectivoEsperadoCents).toBe(310_000)
  })

  it("lo que se guarda cumple las CHECK de la tabla (esperado = fondo + cobrado + propinas, todo en 0 o más) y conserva las cifras reales", () => {
    // Se devolvió más efectivo del que entró: sale también de las propinas y del fondo.
    const cuenta = cuentaDeCaja(resumirCaja(pagos, propinas, [{ method: "efectivo", amountCents: 315_000 }]), 20_000, 15_000)
    const columnas = columnasDelCierre(cuenta)
    expect(columnas).toMatchObject({
      efectivoCobradoCents: 0,
      propinasEfectivoCents: 0,
      fondoInicialCents: 15_000,
      efectivoEsperadoCents: 15_000,
      diferenciaCents: 0,
    })
    expect(columnas.efectivoEsperadoCents).toBe(columnas.fondoInicialCents + columnas.efectivoCobradoCents + columnas.propinasEfectivoCents)
    expect(efectivoDelCierre(columnas)).toEqual({
      fondoInicialCents: 20_000,
      efectivoCobradoCents: 300_000,
      propinasEfectivoCents: 10_000,
      devolucionesEfectivoCents: 315_000,
    })
  })

  it("devolver más de lo que hay en el cajón no deja un esperado negativo", () => {
    const cuenta = cuentaDeCaja(resumirCaja([], [], [{ method: "efectivo", amountCents: 100_000 }]), 30_000, 0)
    expect(cuenta).toMatchObject({ efectivoEsperadoCents: 0, diferenciaCents: 0 })
    const columnas = columnasDelCierre(cuenta)
    expect(columnas).toMatchObject({ fondoInicialCents: 0, efectivoCobradoCents: 0, propinasEfectivoCents: 0, efectivoEsperadoCents: 0 })
  })

  it("sin devoluciones en efectivo, las columnas son la cuenta tal cual; un cierre viejo se lee por sus columnas", () => {
    const cuenta = cuentaDeCaja(resumirCaja(pagos, propinas), 20_000, 330_000)
    const columnas = columnasDelCierre(cuenta)
    expect(columnas).toMatchObject({ fondoInicialCents: 20_000, efectivoCobradoCents: 300_000, propinasEfectivoCents: 10_000 })
    expect(columnas.desglose).not.toHaveProperty("devoluciones")
    expect(columnas.desglose).not.toHaveProperty("efectivoAntesDeDevoluciones")
    expect(efectivoDelCierre({ ...columnas, desglose: {} }).devolucionesEfectivoCents).toBe(0)
    expect(efectivoDelCierre({ ...columnas, desglose: null }).efectivoCobradoCents).toBe(300_000)
  })
})
