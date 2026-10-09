import { describe, it, expect } from "vitest"
import {
  IDS_DE_TURNOS,
  TURNOS,
  cumpleFiltros,
  diaEn,
  esZonaHorariaValida,
  horaEn,
  inicioDelDiaEn,
  iniciosDeMesEn,
  lineaCumpleFiltros,
  resumirAtenciones,
  rotuloDeIngresos,
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

// ─── Meses en una zona ───────────────────────────────────────────────────────

describe("inicioDelDiaEn", () => {
  it("es la medianoche de ese día en la zona, como instante", () => {
    // Octubre en Santiago es UTC-3; el 1 de septiembre de 2026, todavía UTC-4.
    expect(inicioDelDiaEn(2026, 10, 1, "America/Santiago").toISOString()).toBe("2026-10-01T03:00:00.000Z")
    expect(inicioDelDiaEn(2026, 9, 1, "America/Santiago").toISOString()).toBe("2026-09-01T04:00:00.000Z")
    expect(inicioDelDiaEn(2026, 10, 1, "UTC").toISOString()).toBe("2026-10-01T00:00:00.000Z")
    // Al este de Greenwich, el día empieza la víspera en UTC.
    expect(inicioDelDiaEn(2026, 10, 1, "Asia/Tokyo").toISOString()).toBe("2026-09-30T15:00:00.000Z")
  })

  it("si el día empieza con un salto de hora y sus 00:00 no existen, empieza en el salto", () => {
    // Asunción, 1 de octubre de 2023: de las 23:59:59 (UTC-4) se pasó a la 01:00 (UTC-3).
    expect(inicioDelDiaEn(2023, 10, 1, "America/Asuncion").toISOString()).toBe("2023-10-01T04:00:00.000Z")
  })

  it("el mes 0 es diciembre del año anterior, como en Date.UTC", () => {
    expect(inicioDelDiaEn(2027, 0, 1, "America/Santiago").toISOString()).toBe("2026-12-01T03:00:00.000Z")
  })
})

describe("iniciosDeMesEn", () => {
  it("el mes de ahora y el anterior, en la zona de quien mira", () => {
    expect(iniciosDeMesEn(instante("2026-10-15T15:00:00.000Z"), "America/Santiago")).toEqual({
      inicioMes: instante("2026-10-01T03:00:00.000Z"),
      inicioMesAnterior: instante("2026-09-01T04:00:00.000Z"),
    })
  })

  it("en el borde: el 30 de septiembre a las 22:30 en Santiago, en UTC ya es octubre, pero el mes sigue siendo septiembre", () => {
    const casiOctubre = instante("2026-10-01T01:30:00.000Z")

    expect(iniciosDeMesEn(casiOctubre, "America/Santiago")).toEqual({
      inicioMes: instante("2026-09-01T04:00:00.000Z"),
      inicioMesAnterior: instante("2026-08-01T04:00:00.000Z"),
    })
    expect(iniciosDeMesEn(casiOctubre, "UTC").inicioMes).toEqual(instante("2026-10-01T00:00:00.000Z"))
  })

  it("en enero, el mes anterior es diciembre del año pasado", () => {
    expect(iniciosDeMesEn(instante("2027-01-10T12:00:00.000Z"), "America/Santiago").inicioMesAnterior).toEqual(
      instante("2026-12-01T03:00:00.000Z")
    )
  })
})

describe("diaEn", () => {
  const horas = (dia: { desde: Date; hasta: Date }) => (dia.hasta.getTime() - dia.desde.getTime()) / 3_600_000

  it("el día de un instante en la zona, de su medianoche a la del día siguiente", () => {
    expect(diaEn(instante("2026-10-06T15:00:00.000Z"), "America/Santiago")).toEqual({
      desde: instante("2026-10-06T03:00:00.000Z"),
      hasta: instante("2026-10-07T03:00:00.000Z"),
    })
  })

  it("las 22:30 del 6 en Santiago ya son el 7 en UTC, pero el día sigue siendo el 6", () => {
    expect(diaEn(instante("2026-10-07T01:30:00.000Z"), "America/Santiago").desde).toEqual(instante("2026-10-06T03:00:00.000Z"))
    expect(diaEn(instante("2026-10-07T01:30:00.000Z"), "UTC").desde).toEqual(instante("2026-10-07T00:00:00.000Z"))
  })

  it("al este de Greenwich, el día empieza la víspera en UTC", () => {
    expect(diaEn(instante("2026-10-06T15:00:00.000Z"), "Asia/Tokyo")).toEqual({
      desde: instante("2026-10-06T15:00:00.000Z"),
      hasta: instante("2026-10-07T15:00:00.000Z"),
    })
  })

  it("el día del cambio de hora dura lo que dura: 23 horas en septiembre y 25 en abril, en Santiago", () => {
    // El 6 de septiembre de 2026 las 00:00 pasan a ser la 01:00: el día empieza en el salto.
    const conSalto = diaEn(instante("2026-09-06T15:00:00.000Z"), "America/Santiago")
    expect(conSalto).toEqual({ desde: instante("2026-09-06T04:00:00.000Z"), hasta: instante("2026-09-07T03:00:00.000Z") })
    expect(horas(conSalto)).toBe(23)

    // El 5 de abril de 2026 a las 00:00 se vuelve a las 23:00 del 4: el 4 tiene una hora de más.
    const conHoraRepetida = diaEn(instante("2026-04-04T15:00:00.000Z"), "America/Santiago")
    expect(conHoraRepetida).toEqual({ desde: instante("2026-04-04T03:00:00.000Z"), hasta: instante("2026-04-05T04:00:00.000Z") })
    expect(horas(conHoraRepetida)).toBe(25)
  })

  it("el último día del mes y del año terminan en el primero del siguiente", () => {
    expect(diaEn(instante("2026-10-31T15:00:00.000Z"), "America/Santiago").hasta).toEqual(instante("2026-11-01T03:00:00.000Z"))
    expect(diaEn(instante("2026-12-31T15:00:00.000Z"), "America/Santiago").hasta).toEqual(instante("2027-01-01T03:00:00.000Z"))
  })
})

// ─── Resumen y filtros ───────────────────────────────────────────────────────

/** Los montos de estos escenarios se escriben en unidades; la base los guarda en centavos. */
const c = (unidades: number) => Math.round(unidades * 100)

const linea = (datos: Partial<LineaParaReporte>): LineaParaReporte => ({
  serviceId: "s-corte",
  serviceName: "Corte",
  memberId: "m-carla",
  byOwner: false,
  professionalName: "Carla",
  priceCents: c(8000),
  ...datos,
})

const atencion = (datos: Partial<AtencionParaReporte>): AtencionParaReporte => ({
  paidAt: instante("2026-10-06T13:00:00.000Z"),
  totalCents: c(8000),
  lineas: [linea({})],
  pagos: [{ method: "efectivo", amountCents: c(8000) }],
  ...datos,
})

/**
 * Las tres atenciones con que QA encontró el error: cada una mezcla
 * profesionales, servicios o medios, así que sumarla entera con un filtro de
 * adentro da otra cifra que sumar sólo lo filtrado.
 */
const mixta = atencion({
  totalCents: c(33000),
  lineas: [
    linea({}),
    linea({ memberId: null, byOwner: true, professionalName: "Ana", serviceId: "s-color", serviceName: "Color", priceCents: c(25000) }),
  ],
  pagos: [
    { method: "efectivo", amountCents: c(20000) },
    { method: "tarjeta-credito", amountCents: c(13000) },
  ],
})
const dePedro = atencion({
  totalCents: c(25000),
  lineas: [linea({ memberId: "m-pedro", professionalName: "Pedro", serviceId: "s-color", serviceName: "Color", priceCents: c(25000) })],
  pagos: [{ method: "transferencia", amountCents: c(25000) }],
})
const deCarlaConTarjeta = atencion({
  totalCents: c(12000),
  lineas: [linea({ priceCents: c(12000) })],
  pagos: [{ method: "tarjeta-credito", amountCents: c(12000) }],
})
const periodo = [mixta, dePedro, deCarlaConTarjeta]

describe("resumirAtenciones sin filtros de línea ni de medio", () => {
  it("sin atenciones: todo en cero, el ticket promedio en null y los desgloses vacíos", () => {
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
    const resumen = resumirAtenciones([
      atencion({ totalCents: c(10000) }),
      atencion({ totalCents: c(5000) }),
      atencion({ totalCents: 1 }),
    ])

    expect(resumen.ingresos).toBe(15000.01)
    expect(resumen.cantidad).toBe(3)
    expect(resumen.ticketPromedio).toBe(5000)
  })

  it("por medio suma todos los pagos, y por profesional y por servicio todas las líneas", () => {
    const resumen = resumirAtenciones(periodo)

    expect(resumen).toMatchObject({ ingresos: 70000, cantidad: 3 })
    expect(resumen.porMedio).toEqual([
      { medio: "tarjeta-credito", nombre: "Tarjeta de crédito", monto: 25000 },
      { medio: "transferencia", nombre: "Transferencia", monto: 25000 },
      { medio: "efectivo", nombre: "Efectivo", monto: 20000 },
    ])
    expect(resumen.porProfesional?.map(({ id, monto }) => [id, monto])).toEqual([
      ["duenio", 25000],
      ["m-pedro", 25000],
      ["m-carla", 20000],
    ])
    expect(resumen.porServicio?.map(({ id, monto, cantidad }) => [id, monto, cantidad])).toEqual([
      ["s-color", 50000, 2],
      ["s-corte", 20000, 2],
    ])
  })

  it("suma en centavos enteros: tres pagos de 0,10 dan 0,30 justos", () => {
    const resumen = resumirAtenciones(
      [10, 10, 10].map((cents) => atencion({ totalCents: cents, pagos: [{ method: "efectivo", amountCents: cents }] }))
    )

    expect(resumen.ingresos).toBe(0.3)
    expect(resumen.porMedio).toEqual([{ medio: "efectivo", nombre: "Efectivo", monto: 0.3 }])
  })

  it("desglosa por profesional: los miembros por id, el dueño y los ex-miembros por el nombre copiado", () => {
    const resumen = resumirAtenciones([
      atencion({
        lineas: [
          linea({ priceCents: c(8000) }),
          linea({ memberId: null, byOwner: true, professionalName: "Ana", priceCents: c(25000) }),
          linea({ memberId: null, professionalName: "Juan", priceCents: c(5000) }),
        ],
      }),
      // Carla se cambió el nombre: sigue siendo la misma persona (mismo id).
      atencion({ lineas: [linea({ professionalName: "Carla P.", priceCents: c(2000) })] }),
      // Un ex-miembro que se llama igual que la dueña no se suma con ella.
      atencion({ lineas: [linea({ memberId: null, professionalName: "Ana", priceCents: c(1000) })] }),
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
      atencion({ lineas: [linea({}), linea({ serviceId: "s-color", serviceName: "Color", priceCents: c(25000) })] }),
      atencion({ lineas: [linea({}), linea({ serviceId: null, serviceName: "Alisado viejo", priceCents: c(30000) })] }),
    ])

    expect(resumen.porServicio).toEqual([
      { clave: "sin-catalogo:Alisado viejo", id: null, nombre: "Alisado viejo", cantidad: 1, monto: 30000 },
      { clave: "servicio:s-color", id: "s-color", nombre: "Color", cantidad: 1, monto: 25000 },
      { clave: "servicio:s-corte", id: "s-corte", nombre: "Corte", cantidad: 2, monto: 16000 },
    ])
  })
})

describe("resumirAtenciones con filtros de línea (profesional, servicio)", () => {
  it("profesional: ingresos son sólo sus líneas, no la atención entera", () => {
    // QA: con "Profesional = Carla" aparecían las líneas de la dueña.
    const resumen = resumirAtenciones([mixta, deCarlaConTarjeta], { profesional: "m-carla" })

    expect(resumen.ingresos).toBe(20000) // 8.000 + 12.000; la atención mixta entera eran 33.000
    expect(resumen.cantidad).toBe(2)
    expect(resumen.ticketPromedio).toBe(10000)
    expect(resumen.porProfesional).toEqual([
      { clave: "miembro:m-carla", id: "m-carla", nombre: "Carla", monto: 20000, servicios: 2 },
    ])
    expect(resumen.porServicio).toEqual([
      { clave: "servicio:s-corte", id: "s-corte", nombre: "Corte", cantidad: 2, monto: 20000 },
    ])
  })

  it("por medio es null: un pago no se puede atribuir a una línea", () => {
    expect(resumirAtenciones(periodo, { profesional: "m-carla" }).porMedio).toBeNull()
    expect(resumirAtenciones(periodo, { servicio: "s-color" }).porMedio).toBeNull()
  })

  it("servicio: sólo las líneas de ese servicio, de quien sea", () => {
    const resumen = resumirAtenciones(periodo, { servicio: "s-color" })

    expect(resumen).toMatchObject({ ingresos: 50000, cantidad: 2, ticketPromedio: 25000 })
    expect(resumen.porProfesional?.map(({ id }) => id)).toEqual(["duenio", "m-pedro"])
  })

  it("profesional y servicio a la vez: la línea tiene que cumplir los dos", () => {
    expect(resumirAtenciones(periodo, { profesional: "duenio", servicio: "s-color" })).toMatchObject({
      ingresos: 25000,
      cantidad: 1,
    })
    expect(resumirAtenciones(periodo, { profesional: "m-carla", servicio: "s-color" })).toMatchObject({
      ingresos: 0,
      cantidad: 0,
      ticketPromedio: null,
      porProfesional: [],
      porServicio: [],
    })
  })

  it("cantidad son las atenciones con al menos una línea que cumple, aunque tengan varias", () => {
    const dosDeCarla = atencion({ lineas: [linea({}), linea({ priceCents: c(2000) })] })

    expect(resumirAtenciones([dosDeCarla, dePedro], { profesional: "m-carla" })).toMatchObject({
      ingresos: 10000,
      cantidad: 1,
      ticketPromedio: 10000,
    })
  })

  it("con medio además: el medio no cambia las cifras, que salen de las líneas", () => {
    const resumen = resumirAtenciones([mixta], { profesional: "m-carla", medio: "efectivo" })

    expect(resumen).toMatchObject({ ingresos: 8000, cantidad: 1, porMedio: null })
    expect(resumen.porProfesional).toHaveLength(1)
  })
})

describe("resumirAtenciones con medio de pago y sin filtros de línea", () => {
  it("ingresos son sólo los pagos de ese medio, no el total de la atención", () => {
    // QA: con "Medio = Efectivo" sumaba también lo pagado con tarjeta.
    const resumen = resumirAtenciones([mixta], { medio: "efectivo" })

    expect(resumen.ingresos).toBe(20000) // la atención eran 33.000: 13.000 fueron con tarjeta
    expect(resumen.cantidad).toBe(1)
    expect(resumen.ticketPromedio).toBe(20000)
    expect(resumen.porMedio).toEqual([{ medio: "efectivo", nombre: "Efectivo", monto: 20000 }])
  })

  it("cuentan sólo las atenciones con al menos un pago de ese medio", () => {
    const resumen = resumirAtenciones(periodo, { medio: "tarjeta-credito" })

    expect(resumen).toMatchObject({ ingresos: 25000, cantidad: 2, ticketPromedio: 12500 })
    expect(resumen.porMedio).toEqual([{ medio: "tarjeta-credito", nombre: "Tarjeta de crédito", monto: 25000 }])
  })

  it("por profesional y por servicio son null: lo pagado con un medio no se reparte entre las líneas", () => {
    const resumen = resumirAtenciones(periodo, { medio: "efectivo" })

    expect(resumen.porProfesional).toBeNull()
    expect(resumen.porServicio).toBeNull()
  })

  it("sin atenciones con ese medio: cero, sin ticket y el desglose vacío", () => {
    expect(resumirAtenciones(periodo, { medio: "billetera-digital" })).toEqual({
      ingresos: 0,
      cantidad: 0,
      ticketPromedio: null,
      porMedio: [],
      porProfesional: null,
      porServicio: null,
    })
  })
})

describe("lineaCumpleFiltros", () => {
  const color = linea({ memberId: "m-pedro", serviceId: "s-color" })

  it("sin filtros de línea, toda línea cumple", () => {
    expect(lineaCumpleFiltros(color, {})).toBe(true)
  })

  it("con filtros, tiene que cumplirlos todos", () => {
    expect(lineaCumpleFiltros(color, { profesional: "m-pedro" })).toBe(true)
    expect(lineaCumpleFiltros(color, { servicio: "s-color" })).toBe(true)
    expect(lineaCumpleFiltros(color, { profesional: "m-pedro", servicio: "s-color" })).toBe(true)
    expect(lineaCumpleFiltros(color, { profesional: "m-pedro", servicio: "s-corte" })).toBe(false)
    expect(lineaCumpleFiltros(color, { profesional: "m-carla" })).toBe(false)
  })

  it("el dueño se filtra como `duenio`, y un ex-miembro no coincide con nadie", () => {
    expect(lineaCumpleFiltros(linea({ memberId: null, byOwner: true }), { profesional: "duenio" })).toBe(true)
    expect(lineaCumpleFiltros(linea({ memberId: null }), { profesional: "duenio" })).toBe(false)
  })
})

describe("cumpleFiltros", () => {
  const zona = "America/Santiago"
  const variada = atencion({
    paidAt: instante("2026-10-06T13:00:00.000Z"), // 10:00 en Santiago
    lineas: [
      linea({}),
      linea({ memberId: "m-pedro", professionalName: "Pedro", serviceId: "s-color", serviceName: "Color" }),
      linea({ memberId: null, byOwner: true, professionalName: "Ana", serviceId: "s-color", serviceName: "Color" }),
    ],
    pagos: [{ method: "transferencia", amountCents: c(41000) }],
  })

  it("sin filtros, entra", () => {
    expect(cumpleFiltros(variada, { zona })).toBe(true)
  })

  it("por turno, en la zona dada", () => {
    expect(cumpleFiltros(variada, { zona, turno: "manana" })).toBe(true)
    expect(cumpleFiltros(variada, { zona, turno: "tarde" })).toBe(false)
    // En Tokio las 13:00 UTC son las 22:00.
    expect(cumpleFiltros(variada, { zona: "Asia/Tokyo", turno: "noche" })).toBe(true)
  })

  it("por profesional: un miembro o el dueño", () => {
    expect(cumpleFiltros(variada, { zona, profesional: "m-pedro" })).toBe(true)
    expect(cumpleFiltros(variada, { zona, profesional: "duenio" })).toBe(true)
    expect(cumpleFiltros(variada, { zona, profesional: "m-otro" })).toBe(false)
  })

  it("por servicio y por medio", () => {
    expect(cumpleFiltros(variada, { zona, servicio: "s-color" })).toBe(true)
    expect(cumpleFiltros(variada, { zona, servicio: "s-peinado" })).toBe(false)
    expect(cumpleFiltros(variada, { zona, medio: "transferencia" })).toBe(true)
    expect(cumpleFiltros(variada, { zona, medio: "efectivo" })).toBe(false)
  })

  it("profesional y servicio se miran sobre la misma línea", () => {
    expect(cumpleFiltros(variada, { zona, profesional: "m-carla", servicio: "s-corte" })).toBe(true)
    // Carla hizo un corte y Pedro un color, pero Carla no hizo color.
    expect(cumpleFiltros(variada, { zona, profesional: "m-carla", servicio: "s-color" })).toBe(false)
    expect(cumpleFiltros(variada, { zona, profesional: "duenio", servicio: "s-color" })).toBe(true)
  })
})

describe("rotuloDeIngresos", () => {
  const sinFiltros = { profesional: "", servicio: "", medio: "" }

  it("sin filtros es Ingresos; al profesional, lo que atendió", () => {
    expect(rotuloDeIngresos(false, sinFiltros)).toBe("Ingresos")
    expect(rotuloDeIngresos(true, sinFiltros)).toBe("Lo que atendiste")
  })

  it("con filtros de línea dice de qué líneas son las cifras", () => {
    expect(rotuloDeIngresos(false, { ...sinFiltros, profesional: "Carla" })).toBe("Ingresos · servicios de Carla")
    expect(rotuloDeIngresos(false, { ...sinFiltros, servicio: "Color" })).toBe("Ingresos · Color")
    expect(rotuloDeIngresos(false, { ...sinFiltros, profesional: "Carla", servicio: "Color" })).toBe(
      "Ingresos · Color de Carla"
    )
    expect(rotuloDeIngresos(true, { ...sinFiltros, servicio: "Color" })).toBe("Lo que atendiste · Color")
  })

  it("con sólo el medio, es lo cobrado con ese medio", () => {
    expect(rotuloDeIngresos(false, { ...sinFiltros, medio: "efectivo" })).toBe("Cobrado en efectivo")
    expect(rotuloDeIngresos(false, { ...sinFiltros, medio: "tarjeta-debito" })).toBe("Cobrado con tarjeta de débito")
    expect(rotuloDeIngresos(false, { ...sinFiltros, medio: "transferencia" })).toBe("Cobrado con transferencia")
  })

  it("con medio y filtros de línea, suma las líneas y aclara qué atenciones entran: las que tienen algún pago con ese medio", () => {
    expect(rotuloDeIngresos(false, { profesional: "Carla", servicio: "", medio: "efectivo" })).toBe(
      "Ingresos · servicios de Carla · atenciones con algún pago en efectivo"
    )
    expect(rotuloDeIngresos(false, { profesional: "", servicio: "Color", medio: "transferencia" })).toBe(
      "Ingresos · Color · atenciones con algún pago con transferencia"
    )
  })
})
