import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"
import { MOTIVO_FILA_VACIADA } from "@/lib/fila-virtual"

/**
 * "Vaciar la fila de hoy" (#85): anula a todos los que esperan en la fila
 * virtual del día del negocio de la sesión, y nada más.
 */

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Lunes 7 de enero de 2030, 12:00 en Santiago. */
const HOY = "2030-01-07"
const AHORA = new Date("2030-01-07T15:00:00.000Z")

type Registro = Record<string, unknown>

const enFila = (id: string, numero: number, extra: Registro = {}): Registro => ({
  id,
  businessId: NEGOCIO,
  customerName: "Juan Pérez",
  status: "en-espera",
  arrivedAt: AHORA,
  origen: "fila",
  filaTokenHash: `hash-${id}`,
  filaFecha: HOY,
  filaNumero: numero,
  ...extra,
})

async function vaciar(sesion: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await POST()
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const estado = (id: string) => base.buscar("visit", { id })[0]?.status

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((b) => ({ ...b, filaVirtualActiva: true })),
    visit: [
      enFila("espera-1", 1),
      enFila("espera-2", 2),
      enFila("atencion", 3, { status: "en-atencion" }),
      enFila("cobrada", 4, { status: "finalizada" }),
      enFila("ayer", 1, { filaFecha: "2030-01-06" }),
      // Llegó por el Tablero, sin turno: no es de la fila.
      { id: "walk-in", businessId: NEGOCIO, customerName: "Sin Turno", status: "en-espera", arrivedAt: AHORA },
      enFila("ajena", 1, { businessId: OTRO_NEGOCIO }),
    ],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST /api/fila-virtual/vaciar", () => {
  it("anula sólo las en espera de la fila de hoy del negocio de la sesión, con quién y por qué", async () => {
    const { status, cuerpo } = await vaciar(sesiones.encargado)
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ anuladas: 2 })

    for (const id of ["espera-1", "espera-2"]) {
      expect(base.buscar("visit", { id })[0]).toMatchObject({
        status: "anulada",
        voidedAt: AHORA,
        voidedById: "u-encargado",
        voidReason: MOTIVO_FILA_VACIADA,
      })
    }
    expect(estado("atencion")).toBe("en-atencion")
    expect(estado("cobrada")).toBe("finalizada")
    expect(estado("ayer")).toBe("en-espera")
    expect(estado("walk-in")).toBe("en-espera")
    expect(estado("ajena")).toBe("en-espera")
  })

  it("la dueña también puede; con la fila vacía, 0", async () => {
    expect((await vaciar(sesiones.dueña)).cuerpo).toEqual({ anuladas: 2 })
    expect((await vaciar(sesiones.dueña)).cuerpo).toEqual({ anuladas: 0 })
  })

  it("el dueño de otro negocio vacía la suya y no toca la de este", async () => {
    expect((await vaciar(sesiones.dueñoAjeno)).cuerpo).toEqual({ anuladas: 1 })
    expect(estado("ajena")).toBe("anulada")
    expect(estado("espera-1")).toBe("en-espera")
  })

  it("el profesional, uno sin miembro y sin sesión: 401 sin tocar nada", async () => {
    for (const sesion of [sesiones.carla, sesiones.sinMiembro, null]) {
      expect((await vaciar(sesion)).status).toBe(401)
    }
    expect(estado("espera-1")).toBe("en-espera")
    expect(estado("espera-2")).toBe("en-espera")
  })
})
