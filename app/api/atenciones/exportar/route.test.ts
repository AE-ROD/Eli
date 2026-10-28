import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, centavos, datosBase, linea, sesiones } from "@/pruebas/datos"
import { datosDeClienteEliminado } from "@/lib/clientes-eliminados"
import { leerCsv } from "@/lib/csv"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 10 }))
vi.mock("@/lib/rate-limit", () => ({ verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args) }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const pedido = (consulta: string) => ({ url: `http://localhost/api/atenciones/exportar?${consulta}` }) as unknown as NextRequest

/** Octubre de 2026 en Santiago: del 1 a las 00:00 (03:00 UTC) al 1 de noviembre a las 00:00. */
const OCTUBRE = "desde=2026-10-01&hasta=2026-10-31"

beforeEach(() => {
  vi.clearAllMocks()
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    customer: [
      ...datos.customer,
      { id: "c-borrada", businessId: NEGOCIO, ...datosDeClienteEliminado() },
    ],
    visit: [
      atencion("a-cobrada", {
        status: "finalizada",
        totalCents: centavos(8000),
        arrivedAt: new Date("2026-10-06T12:00:00.000Z"),
        paidAt: new Date("2026-10-06T13:00:00.000Z"),
      }),
      atencion("a-abierta", { customerId: null, customerName: "Sin reserva", arrivedAt: new Date("2026-10-31T23:00:00.000Z") }),
      // El 30 de septiembre a las 23:30 en Santiago: fuera del rango.
      atencion("a-septiembre", { arrivedAt: new Date("2026-10-01T02:30:00.000Z") }),
      atencion("a-de-eliminada", { customerId: "c-borrada", customerName: "Cliente eliminado" }),
      atencion("a-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno", customerName: "Ajena" }),
    ],
    visitService: [
      linea("l-1", "a-cobrada"),
      linea("l-2", "a-abierta", { serviceName: "Color", priceCents: centavos(25000) }),
    ],
  })
})

describe("GET /api/atenciones/exportar", () => {
  it("descarga las atenciones del rango en la hora del negocio, sin las de clientes eliminados ni las ajenas", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await GET(pedido(OCTUBRE))

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="atenciones-2026-10-01-al-2026-10-31.csv"')
    const filas = leerCsv(await res.text(), ";")
    expect(filas).toEqual([
      ["Llegada", "Cliente", "Estado", "Servicios", "Profesionales", "Total", "Cobrada el"],
      ["2026-10-06 09:00", "María González", "Finalizada", "Corte", "Carla Profesional", "8000", "2026-10-06 10:00"],
      ["2026-10-31 20:00", "Sin reserva", "En espera", "Color", "Carla Profesional", "25000", ""],
    ])
  })

  it("el encargado también descarga", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)

    expect((await GET(pedido(OCTUBRE))).status).toBe(200)
  })

  it.each([
    ["la profesional", sesiones.carla],
    ["sin sesión", null],
  ])("%s recibe 401 y no lee nada", async (_caso, sesion) => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion)

    const res = await GET(pedido(OCTUBRE))

    expect(res.status).toBe(401)
    expect(base.prisma.visit.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ["sin fechas", ""],
    ["al revés", "desde=2026-10-31&hasta=2026-10-01"],
    ["más de un año", "desde=2025-01-01&hasta=2026-10-01"],
    ["una fecha inválida", "desde=2026-02-30&hasta=2026-03-01"],
  ])("%s es 400 y no lee atenciones", async (_caso, consulta) => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await GET(pedido(consulta))

    expect(res.status).toBe(400)
    expect(base.prisma.visit.findMany).not.toHaveBeenCalled()
  })

  it("al pasarse del límite de exportaciones responde 429", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await GET(pedido(OCTUBRE))

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("exportacion", `negocio:${NEGOCIO}`)
  })
})
