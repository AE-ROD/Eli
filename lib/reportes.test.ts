import { describe, it, expect } from "vitest"
import {
  IDS_DE_TURNOS,
  TURNOS,
  cumpleFiltros,
  esZonaHorariaValida,
  horaEn,
  resumirAtenciones,
  turnoDe,
  type AtencionParaReporte,
  type LineaParaReporte,
} from "./reportes"

const instante = (iso: string) => new Date(iso)

describe("turnos", () => {
  it("mañana antes de las 12, tarde de 12 a 18, noche desde las 18", () => {
    expect(TURNOS.map(({ id, desde, hasta }) => [id, desde, hasta])).toEqual([
      ["manana", 0, 12],
      ["tarde", 12, 18],
      ["noche", 18, 24],
    ])
    expect([...IDS_DE_TURNOS]).toEqual(["manana", "tarde", "noche"])
  })
})

describe("turnoDe en America/Santiago", () => {
  // Octubre: horario de verano, UTC-3. Julio: horario de invierno, UTC-4.
  it.each([
    ["2026-10-06T14:59:59.000Z", "manana"], // 11:59:59
    ["2026-10-06T15:00:00.000Z", "tarde"], // 12:00 en punto
    ["2026-10-06T20:59:59.000Z", "tarde"], // 17:59:59
    ["2026-10-06T21:00:00.000Z", "noche"], // 18:00 en punto
    ["2026-07-06T15:30:00.000Z", "manana"], // 11:30 en invierno: la misma hora UTC que en octubre es otro turno
  ])("%s es %s", (iso, turno) => {
    expect(turnoDe(instante(iso), "America/Santiago")).toBe(turno)
  })
})

describe("turnoDe en America/Caracas (UTC-4 todo el año)", () => {
  it.each([
    ["2026-10-06T15:00:00.000Z", "manana"], // 11:00
    ["2026-10-06T16:00:00.000Z", "tarde"], // 12:00
    ["2026-10-06T22:00:00.000Z", "noche"], // 18:00
  ])("%s es %s", (iso, turno) => {
    expect(turnoDe(instante(iso), "America/Caracas")).toBe(turno)
  })
})

describe("turnoDe cerca de la medianoche UTC", () => {
  it("las 23:30 UTC son noche en UTC, en Santiago y en Caracas", () => {
    const casiMedianoche = instante("2026-10-06T23:30:00.000Z")

    expect(turnoDe(casiMedianoche, "UTC")).toBe("noche")
    expect(turnoDe(casiMedianoche, "America/Santiago")).toBe("noche") // 20:30
    expect(turnoDe(casiMedianoche, "America/Caracas")).toBe("noche") // 19:30
  })

  it("las 00:30 UTC ya son del día siguiente en UTC (mañana) pero siguen siendo noche del anterior en América", () => {
    const pasadaMedianoche = instante("2026-10-07T00:30:00.000Z")

    expect(turnoDe(pasadaMedianoche, "UTC")).toBe("manana")
    expect(turnoDe(pasadaMedianoche, "America/Santiago")).toBe("noche") // 21:30 del 6
    expect(turnoDe(pasadaMedianoche, "America/Caracas")).toBe("noche") // 20:30 del 6
  })

  it("la medianoche exacta es hora 0, no 24", () => {
    expect(horaEn(instante("2026-10-07T00:00:00.000Z"), "UTC")).toBe(0)
    expect(turnoDe(instante("2026-10-07T00:00:00.000Z"), "UTC")).toBe("manana")
  })
})

describe("esZonaHorariaValida", () => {
  it.each(["America/Santiago", "America/Caracas", "America/Argentina/Buenos_Aires", "Etc/GMT+3", "UTC"])(
    "%s es válida",
    (zona) => {
      expect(esZonaHorariaValida(zona)).toBe(true)
    }
  )

  it.each([
    ["una zona que no existe", "Mars/Olympus"],
    ["un desplazamiento suelto, que no sabe de horario de verano", "-03:00"],
    ["otro desplazamiento", "+05:30"],
    ["vacía", ""],
    ["con espacios", "America/ Santiago"],
    ["demasiado larga", `America/${"x".repeat(100)}`],
  ])("%s no", (_caso, zona) => {
    expect(esZonaHorariaValida(zona)).toBe(false)
  })
})

// ─── Resumen y filtros ───────────────────────────────────────────────────────

const linea = (datos: Partial<LineaParaReporte>): LineaParaReporte => ({
  serviceId: "s-corte",
  serviceName: "Corte",
  memberId: "m-carla",
  byOwner: false,
  professionalName: "Carla",
  price: 8000,
  ...datos,
})

const atencion = (datos: Partial<AtencionParaReporte>): AtencionParaReporte => ({
  paidAt: instante("2026-10-06T13:00:00.000Z"),
  total: 8000,
  lineas: [linea({})],
  pagos: [{ method: "efectivo", amount: 8000 }],
  ...datos,
})

describe("resumirAtenciones", () => {
  it("sin atenciones: todo en cero y el ticket promedio en null, no en cero", () => {
    expect(resumirAtenciones([])).toEqual({
      ingresos: 0,
      cantidad: 0,
      ticketPromedio: null,
      porMedio: [],
      porProfesional: [],
      porServicio: [],
    })
  })

  it("ingresos es la suma de los totales, y el ticket promedio sale de ahí", () => {
    const resumen = resumirAtenciones([atencion({ total: 10000 }), atencion({ total: 5000 }), atencion({ total: 0.01 })])

    expect(resumen.ingresos).toBe(15000.01)
    expect(resumen.cantidad).toBe(3)
    expect(resumen.ticketPromedio).toBe(5000)
  })

  it("suma en centavos: tres pagos de 0,10 dan 0,30 justos", () => {
    const resumen = resumirAtenciones(
      [0.1, 0.1, 0.1].map((monto) => atencion({ total: monto, pagos: [{ method: "efectivo", amount: monto }] }))
    )

    expect(resumen.ingresos).toBe(0.3)
    expect(resumen.porMedio).toEqual([{ medio: "efectivo", nombre: "Efectivo", monto: 0.3 }])
  })

  it("desglosa por medio de pago, de mayor a menor", () => {
    const resumen = resumirAtenciones([
      atencion({ total: 33000, pagos: [{ method: "efectivo", amount: 20000 }, { method: "tarjeta-credito", amount: 13000 }] }),
      atencion({ total: 8000, pagos: [{ method: "tarjeta-credito", amount: 8000 }] }),
    ])

    expect(resumen.porMedio).toEqual([
      { medio: "tarjeta-credito", nombre: "Tarjeta de crédito", monto: 21000 },
      { medio: "efectivo", nombre: "Efectivo", monto: 20000 },
    ])
  })

  it("desglosa por profesional: los miembros por id, el dueño y los ex-miembros por el nombre copiado", () => {
    const resumen = resumirAtenciones([
      atencion({
        lineas: [
          linea({ price: 8000 }),
          linea({ memberId: null, byOwner: true, professionalName: "Ana", price: 25000 }),
          linea({ memberId: null, professionalName: "Juan", price: 5000 }),
        ],
      }),
      // Carla se cambió el nombre: sigue siendo la misma persona (mismo id).
      atencion({ lineas: [linea({ professionalName: "Carla P.", price: 2000 })] }),
      // Un ex-miembro que se llama igual que la dueña no se suma con ella.
      atencion({ lineas: [linea({ memberId: null, professionalName: "Ana", price: 1000 })] }),
    ])

    expect(resumen.porProfesional).toEqual([
      { clave: "duenio:Ana", id: "duenio", nombre: "Ana", monto: 25000, servicios: 1 },
      { clave: "miembro:m-carla", id: "m-carla", nombre: "Carla", monto: 10000, servicios: 2 },
      { clave: "ex-miembro:Juan", id: null, nombre: "Juan", monto: 5000, servicios: 1 },
      { clave: "ex-miembro:Ana", id: null, nombre: "Ana", monto: 1000, servicios: 1 },
    ])
  })

  it("desglosa por servicio con cantidad y monto; uno que ya no está en el catálogo se agrupa por su nombre", () => {
    const resumen = resumirAtenciones([
      atencion({ lineas: [linea({}), linea({ serviceId: "s-color", serviceName: "Color", price: 25000 })] }),
      atencion({ lineas: [linea({}), linea({ serviceId: null, serviceName: "Alisado viejo", price: 30000 })] }),
    ])

    expect(resumen.porServicio).toEqual([
      { clave: "sin-catalogo:Alisado viejo", id: null, nombre: "Alisado viejo", cantidad: 1, monto: 30000 },
      { clave: "servicio:s-color", id: "s-color", nombre: "Color", cantidad: 1, monto: 25000 },
      { clave: "servicio:s-corte", id: "s-corte", nombre: "Corte", cantidad: 2, monto: 16000 },
    ])
  })
})

describe("cumpleFiltros", () => {
  const zona = "America/Santiago"
  const mixta = atencion({
    paidAt: instante("2026-10-06T13:00:00.000Z"), // 10:00 en Santiago
    lineas: [
      linea({}),
      linea({ memberId: "m-pedro", professionalName: "Pedro", serviceId: "s-color", serviceName: "Color" }),
      linea({ memberId: null, byOwner: true, professionalName: "Ana", serviceId: "s-color", serviceName: "Color" }),
    ],
    pagos: [{ method: "transferencia", amount: 41000 }],
  })

  it("sin filtros, entra", () => {
    expect(cumpleFiltros(mixta, { zona })).toBe(true)
  })

  it("por turno, en la zona dada", () => {
    expect(cumpleFiltros(mixta, { zona, turno: "manana" })).toBe(true)
    expect(cumpleFiltros(mixta, { zona, turno: "tarde" })).toBe(false)
    // En Tokio las 13:00 UTC son las 22:00.
    expect(cumpleFiltros(mixta, { zona: "Asia/Tokyo", turno: "noche" })).toBe(true)
  })

  it("por profesional: un miembro o el dueño", () => {
    expect(cumpleFiltros(mixta, { zona, profesional: "m-pedro" })).toBe(true)
    expect(cumpleFiltros(mixta, { zona, profesional: "duenio" })).toBe(true)
    expect(cumpleFiltros(mixta, { zona, profesional: "m-otro" })).toBe(false)
  })

  it("por servicio y por medio", () => {
    expect(cumpleFiltros(mixta, { zona, servicio: "s-color" })).toBe(true)
    expect(cumpleFiltros(mixta, { zona, servicio: "s-peinado" })).toBe(false)
    expect(cumpleFiltros(mixta, { zona, medio: "transferencia" })).toBe(true)
    expect(cumpleFiltros(mixta, { zona, medio: "efectivo" })).toBe(false)
  })

  it("profesional y servicio se miran sobre la misma línea", () => {
    expect(cumpleFiltros(mixta, { zona, profesional: "m-carla", servicio: "s-corte" })).toBe(true)
    // Carla hizo un corte y Pedro un color, pero Carla no hizo color.
    expect(cumpleFiltros(mixta, { zona, profesional: "m-carla", servicio: "s-color" })).toBe(false)
    expect(cumpleFiltros(mixta, { zona, profesional: "duenio", servicio: "s-color" })).toBe(true)
  })
})
