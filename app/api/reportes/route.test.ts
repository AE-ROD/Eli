import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/app/api/atenciones/_pruebas/base-falsa"
import {
  NEGOCIO,
  OTRO_NEGOCIO,
  atencion,
  datosBase,
  linea,
  lineaDeLaDueña,
  pago,
  pedido,
  sesiones,
} from "@/app/api/atenciones/_pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** El 6 de octubre en Santiago (UTC-3): [03:00Z del 6, 03:00Z del 7). */
const DIA = "desde=2026-10-06T03:00:00.000Z&hasta=2026-10-07T03:00:00.000Z"
const reporte = (consulta = "") =>
  pedido(`http://localhost/api/reportes?${DIA}&zona=America/Santiago${consulta ? `&${consulta}` : ""}`)

const pedro = { memberId: "m-pedro", professionalName: "Pedro Profesional" }
const color = { serviceId: "s-color", serviceName: "Color", price: 25000 }
const cobrada = (id: string, paidAt: string, total: number, datos: Record<string, unknown> = {}) =>
  atencion(id, { status: "finalizada", paidAt: new Date(paidAt), total, ...datos })

function escenario() {
  return {
    ...datosBase(),
    appointment: [
      { id: "cita-carla", businessId: NEGOCIO, customerId: "c-maria", memberId: "m-carla", title: "Corte", status: "completada", startTime: new Date("2026-10-06T14:00:00.000Z"), endTime: new Date("2026-10-06T14:30:00.000Z") },
    ],
    visit: [
      // 10:00 en Santiago: mañana. Corte de Carla + Color de la dueña, pagado en dos medios.
      cobrada("v-manana", "2026-10-06T13:00:00.000Z", 33000),
      // 14:30: tarde. Color de Pedro.
      cobrada("v-tarde", "2026-10-06T17:30:00.000Z", 25000, { customerId: "c-beto", customerName: "Beto" }),
      // 12:00 en punto: ya es tarde. Nació de una cita de Carla, pero la atendió Pedro.
      cobrada("v-mediodia", "2026-10-06T15:00:00.000Z", 12000, { appointmentId: "cita-carla" }),
      // 20:00: noche. Lo hizo alguien que ya no está en el equipo.
      cobrada("v-noche", "2026-10-06T23:00:00.000Z", 8000),
      // 22:30 del 6 en Santiago, pero ya 7 en UTC: sigue siendo noche del día 6.
      cobrada("v-casi-medianoche", "2026-10-07T01:30:00.000Z", 25000),
      cobrada("v-de-ayer", "2026-10-05T15:00:00.000Z", 8000),
      atencion("v-anulada", { status: "anulada", paidAt: new Date("2026-10-06T16:00:00.000Z"), total: 8000 }),
      atencion("v-abierta", { status: "en-atencion" }),
      cobrada("v-ajena", "2026-10-06T16:00:00.000Z", 9000, { businessId: OTRO_NEGOCIO, customerId: "c-ajeno" }),
    ],
    visitService: [
      linea("l-manana-carla", "v-manana"),
      lineaDeLaDueña("l-manana-duena", "v-manana", color),
      linea("l-tarde", "v-tarde", { ...pedro, ...color }),
      linea("l-mediodia", "v-mediodia", { ...pedro, price: 12000 }),
      linea("l-noche", "v-noche", { memberId: null, professionalName: "Juan (ya no está)" }),
      linea("l-casi-medianoche", "v-casi-medianoche", color),
      linea("l-de-ayer", "v-de-ayer"),
      linea("l-anulada", "v-anulada"),
      linea("l-abierta", "v-abierta"),
      linea("l-ajena", "v-ajena", { memberId: "m-ajeno", serviceId: "s-ajeno", price: 9000 }),
    ],
    visitPayment: [
      pago("p-manana-1", "v-manana", "efectivo", 20000),
      pago("p-manana-2", "v-manana", "tarjeta-credito", 13000),
      pago("p-tarde", "v-tarde", "transferencia", 25000),
      pago("p-mediodia", "v-mediodia", "efectivo", 12000),
      pago("p-noche", "v-noche", "efectivo", 8000),
      pago("p-casi-medianoche", "v-casi-medianoche", "billetera-digital", 25000),
      pago("p-de-ayer", "v-de-ayer", "efectivo", 8000),
      pago("p-anulada", "v-anulada", "efectivo", 8000),
      pago("p-ajena", "v-ajena", "efectivo", 9000),
    ],
  }
}

const idsDeFilas = (data: { filas: { id: string }[] }) => data.filas.map((fila) => fila.id).sort()

async function pedir(sesion: unknown, consulta = "") {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const res = await GET(reporte(consulta))
  return { status: res.status, data: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenario())
})

describe("GET /api/reportes: dueña y encargado", () => {
  it("las filas son las atenciones finalizadas del período, de la más reciente a la más vieja", async () => {
    const { status, data } = await pedir(sesiones.dueña)

    expect(status).toBe(200)
    expect(data.filas.map((fila: { id: string }) => fila.id)).toEqual([
      "v-casi-medianoche",
      "v-noche",
      "v-tarde",
      "v-mediodia",
      "v-manana",
    ])
    expect(data).toMatchObject({ alcance: "negocio", total: 5, pagina: 1, paginas: 1, truncado: false })
  })

  it("cada fila trae el cobro, el turno, el cliente, los servicios con su profesional, el total y los pagos", async () => {
    const { data } = await pedir(sesiones.encargado)
    const fila = data.filas.find((f: { id: string }) => f.id === "v-manana")

    expect(fila).toEqual({
      id: "v-manana",
      cobradaEn: "2026-10-06T13:00:00.000Z",
      turno: "manana",
      cliente: { id: "c-maria", nombre: "María González" },
      lineas: [
        { id: "l-manana-carla", servicioId: "s-corte", servicio: "Corte", profesional: { id: "m-carla", nombre: "Carla Profesional" }, precio: 8000 },
        { id: "l-manana-duena", servicioId: "s-color", servicio: "Color", profesional: { id: "duenio", nombre: "Ana Dueña" }, precio: 25000 },
      ],
      total: 33000,
      pagos: [
        { id: "p-manana-1", medio: "efectivo", nombreMedio: "Efectivo", monto: 20000 },
        { id: "p-manana-2", medio: "tarjeta-credito", nombreMedio: "Tarjeta de crédito", monto: 13000 },
      ],
    })
  })

  it("el resumen: ingresos, cantidad, ticket promedio y los tres desgloses", async () => {
    const { data } = await pedir(sesiones.dueña)

    expect(data.resumen).toEqual({
      ingresos: 103000,
      cantidad: 5,
      ticketPromedio: 20600,
      porMedio: [
        { medio: "efectivo", nombre: "Efectivo", monto: 40000 },
        { medio: "billetera-digital", nombre: "Billetera digital", monto: 25000 },
        { medio: "transferencia", nombre: "Transferencia", monto: 25000 },
        { medio: "tarjeta-credito", nombre: "Tarjeta de crédito", monto: 13000 },
      ],
      porProfesional: [
        { clave: "miembro:m-pedro", id: "m-pedro", nombre: "Pedro Profesional", monto: 37000, servicios: 2 },
        { clave: "miembro:m-carla", id: "m-carla", nombre: "Carla Profesional", monto: 33000, servicios: 2 },
        { clave: "duenio:Ana Dueña", id: "duenio", nombre: "Ana Dueña", monto: 25000, servicios: 1 },
        { clave: "ex-miembro:Juan (ya no está)", id: null, nombre: "Juan (ya no está)", monto: 8000, servicios: 1 },
      ],
      porServicio: [
        { clave: "servicio:s-color", id: "s-color", nombre: "Color", cantidad: 3, monto: 75000 },
        { clave: "servicio:s-corte", id: "s-corte", nombre: "Corte", cantidad: 3, monto: 28000 },
      ],
    })
  })

  it.each([
    ["turno=manana", ["v-manana"]],
    ["turno=tarde", ["v-mediodia", "v-tarde"]],
    ["turno=noche", ["v-casi-medianoche", "v-noche"]],
    ["profesional=m-carla", ["v-casi-medianoche", "v-manana"]],
    ["profesional=duenio", ["v-manana"]],
    ["servicio=s-color", ["v-casi-medianoche", "v-manana", "v-tarde"]],
    ["medio=efectivo", ["v-manana", "v-mediodia", "v-noche"]],
    // Profesional y servicio sobre la misma línea: Carla hizo Corte sólo a la mañana.
    ["profesional=m-carla&servicio=s-corte", ["v-manana"]],
    ["turno=noche&medio=efectivo", ["v-noche"]],
    // Un filtro vacío es un filtro que no se eligió.
    ["turno=&profesional=", ["v-casi-medianoche", "v-manana", "v-mediodia", "v-noche", "v-tarde"]],
  ])("filtra por %s", async (consulta, esperadas) => {
    const { data } = await pedir(sesiones.dueña, consulta)

    expect(idsDeFilas(data)).toEqual(esperadas)
    expect(data.total).toBe(esperadas.length)
  })

  it("el resumen sale de lo filtrado", async () => {
    const { data } = await pedir(sesiones.dueña, "turno=noche")

    expect(data.resumen).toMatchObject({ ingresos: 33000, cantidad: 2, ticketPromedio: 16500 })
  })

  it("el turno se calcula en la zona que se pide: el cobro de las 12:00 de Santiago es de mañana en Caracas", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await GET(pedido(`http://localhost/api/reportes?${DIA}&zona=America/Caracas&turno=manana`))

    expect(idsDeFilas(await res.json())).toEqual(["v-manana", "v-mediodia"])
  })

  it("pagina de a 50", async () => {
    const muchas = Array.from({ length: 51 }, (_, i) =>
      cobrada(`v-${String(i).padStart(2, "0")}`, `2026-10-06T${String(10 + (i % 12)).padStart(2, "0")}:00:00.000Z`, 1000)
    )
    base.reiniciar({ ...datosBase(), visit: muchas })

    const primera = await pedir(sesiones.dueña)
    const segunda = await pedir(sesiones.dueña, "pagina=2")

    expect(primera.data.filas).toHaveLength(50)
    expect(segunda.data.filas).toHaveLength(1)
    expect(segunda.data).toMatchObject({ total: 51, pagina: 2, paginas: 2 })
    // El resumen es del período entero, no de la página.
    expect(segunda.data.resumen).toMatchObject({ ingresos: 51000, cantidad: 51 })
  })

  it("si el período supera el tope, lo dice con `truncado` en vez de callarlo", async () => {
    const muchas = Array.from({ length: 5001 }, (_, i) => cobrada(`v-${i}`, "2026-10-06T15:00:00.000Z", 1000))
    base.reiniciar({ ...datosBase(), visit: muchas })

    const { data } = await pedir(sesiones.dueña)

    expect(data.truncado).toBe(true)
    expect(data.total).toBe(5000)
  })

  it("el otro negocio no ve nada de este", async () => {
    const { data } = await pedir(sesiones.dueñoAjeno)

    expect(idsDeFilas(data)).toEqual(["v-ajena"])
    expect(data.resumen.ingresos).toBe(9000)
  })
})

describe("GET /api/reportes: la profesional", () => {
  it("ve sólo las atenciones con líneas suyas, y de cada una sólo sus líneas", async () => {
    const { data } = await pedir(sesiones.carla)

    // `v-mediodia` nació de su cita pero la atendió Pedro: en su reporte no suma nada.
    expect(idsDeFilas(data)).toEqual(["v-casi-medianoche", "v-manana"])
    const manana = data.filas.find((f: { id: string }) => f.id === "v-manana")
    expect(manana.lineas.map((l: { id: string }) => l.id)).toEqual(["l-manana-carla"])
  })

  it("no ve pagos ni totales del negocio, ni en las filas ni en el resumen", async () => {
    const { data } = await pedir(sesiones.carla)

    for (const fila of data.filas) {
      expect(fila).not.toHaveProperty("pagos")
      expect(fila).not.toHaveProperty("total")
    }
    expect(data.resumen).not.toHaveProperty("porMedio")
    expect(data.alcance).toBe("propio")
    // Ni un rastro de lo ajeno: pagos, medios, ni la línea de la dueña en la misma atención.
    expect(JSON.stringify(data)).not.toMatch(/p-manana|tarjeta-credito|efectivo|l-manana-duena|Ana Dueña/)
  })

  it("su resumen es lo suyo: lo que sumaron sus líneas", async () => {
    const { data } = await pedir(sesiones.carla)

    expect(data.resumen).toEqual({
      ingresos: 33000,
      cantidad: 2,
      ticketPromedio: 16500,
      porProfesional: [{ clave: "miembro:m-carla", id: "m-carla", nombre: "Carla Profesional", monto: 33000, servicios: 2 }],
      porServicio: [
        { clave: "servicio:s-color", id: "s-color", nombre: "Color", cantidad: 1, monto: 25000 },
        { clave: "servicio:s-corte", id: "s-corte", nombre: "Corte", cantidad: 1, monto: 8000 },
      ],
    })
  })

  it("no puede filtrar por medio de pago: le diría cómo pagó cada cliente, así que se ignora", async () => {
    const { data } = await pedir(sesiones.carla, "medio=transferencia")

    expect(idsDeFilas(data)).toEqual(["v-casi-medianoche", "v-manana"])
  })

  it("filtrar por un colega no le muestra nada del colega", async () => {
    const { data } = await pedir(sesiones.carla, "profesional=m-pedro")

    expect(data.filas).toEqual([])
    expect(data.resumen.ingresos).toBe(0)
    expect(data.resumen.ticketPromedio).toBeNull()
  })

  it("un profesional sin memberId no ve nada", async () => {
    const { data } = await pedir(sesiones.sinMiembro)

    expect(data.filas).toEqual([])
    expect(data.total).toBe(0)
  })
})

describe("GET /api/reportes: validación", () => {
  it.each([
    ["una zona que no existe", "zona=Mars/Olympus"],
    ["un desplazamiento en vez de una zona", "zona=-03:00"],
    ["sin zona", ""],
  ])("%s da 400 sin consultar", async (_caso, zona) => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await GET(pedido(`http://localhost/api/reportes?${DIA}${zona ? `&${zona}` : ""}`))

    expect(res.status).toBe(400)
    expect(base.prisma.visit.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ["un turno desconocido", "turno=madrugada"],
    ["un medio desconocido", "medio=cheque"],
    ["una página cero", "pagina=0"],
  ])("%s da 400", async (_caso, consulta) => {
    const { status } = await pedir(sesiones.dueña, consulta)

    expect(status).toBe(400)
  })

  it("un rango de más de 366 días da 400", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await GET(
      pedido("http://localhost/api/reportes?desde=2025-01-01T03:00:00.000Z&hasta=2026-01-03T03:00:00.000Z&zona=America/Santiago")
    )

    expect(res.status).toBe(400)
  })

  it("sin sesión recibe 401", async () => {
    const { status } = await pedir(null)

    expect(status).toBe(401)
  })
})
