import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"

/**
 * La fila virtual con sedes (etapa 9): la fila mira el "abierto ahora" del negocio
 * sin sede, que con varias sedes no dice dónde está la persona. Con dos o más
 * sedes activas se comporta como apagada (el mismo 404, sin gastar el cupo del
 * negocio); con una sola, o sin sedes, es la de siempre.
 */

const mockVerificarLimite = vi.fn()
const mockDevolverLimite = vi.fn()
vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
  devolverLimite: (...args: unknown[]) => mockDevolverLimite(...args),
}))

vi.mock("@/lib/email", () => ({ enviarAvisoFilaVirtual: vi.fn(async () => ({ data: { id: "correo" }, error: null })) }))

// Sin pedido de Next no hay "después de responder": la tarea del aviso no corre en estas pruebas.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: () => undefined,
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** El lunes 7 de enero de 2030 a las 12:00 en Santiago (UTC-3 en enero). */
const AHORA = new Date("2030-01-07T15:00:00.000Z")

type Registro = Record<string, unknown>

const sede = (id: string, businessId: string, nombre: string, extra: Registro = {}) => ({
  id,
  businessId,
  nombre,
  direccion: "Calle 1",
  comuna: "Ñuñoa",
  ...extra,
})

/** El negocio 1 con la fila encendida, Independiente y abierto de 9 a 20; `sedes` dice cuáles tiene. */
function escenario(sedes: Registro[]) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => ({ ...negocio, filaVirtualActiva: true, plan: "independiente" })),
    businessMember: [],
    sede: sedes,
    workSchedule: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      id: `h-${dayOfWeek}`,
      businessId: NEGOCIO,
      memberId: null,
      sedeId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "20:00",
    })),
  })
}

async function anotarse(slug = "salon-uno") {
  const { POST } = await import("./fila/route")
  const pedido = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nombre: "Juan Pérez" }),
  }) as unknown as NextRequest
  const respuesta = await POST(pedido, { params: Promise.resolve({ slug }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const enFila = () => base.buscar("visit", { origen: "fila" })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  mockVerificarLimite.mockResolvedValue({ permitido: true })
  mockDevolverLimite.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST /api/reservar/[slug]/fila con sedes", () => {
  it("con dos o más sedes activas se comporta como apagada: el mismo 404, sin anotar a nadie ni gastar el cupo del negocio", async () => {
    escenario([sede("s1", NEGOCIO, "Centro"), sede("s2", NEGOCIO, "Ñuñoa"), sede("s3", OTRO_NEGOCIO, "Ajena")])

    const { status, cuerpo } = await anotarse()

    expect(status).toBe(404)
    expect(cuerpo).toEqual({ error: "No encontrado" })
    expect(enFila()).toHaveLength(0)
    // El límite por negocio ni se toca: es el mismo 404 que con la fila apagada.
    expect(mockVerificarLimite).not.toHaveBeenCalledWith("filaVirtualPorNegocio", expect.anything())
  })

  it("las sedes inactivas no cuentan: con una sola activa la fila es la de siempre", async () => {
    escenario([sede("s1", NEGOCIO, "Centro"), sede("s2", NEGOCIO, "Antigua", { activo: false })])

    const { status, cuerpo } = await anotarse()

    expect(status).toBe(201)
    expect(cuerpo.numero).toBe(1)
    expect(enFila()).toHaveLength(1)
  })

  it("sin sedes es idéntica a hoy", async () => {
    escenario([])

    expect((await anotarse()).status).toBe(201)
  })

  it("las sedes de otro negocio no apagan la fila de éste", async () => {
    escenario([sede("s1", OTRO_NEGOCIO, "Una"), sede("s2", OTRO_NEGOCIO, "Dos")])

    expect((await anotarse()).status).toBe(201)
    expect((await anotarse("salon-dos")).status).toBe(404)
  })
})
