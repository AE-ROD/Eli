import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"

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
  customerName: "Juan Pérez Soto",
  status: "en-espera",
  arrivedAt: AHORA,
  origen: "fila",
  filaTokenHash: `hash-${id}`,
  filaEmail: `${id}@correo.test`,
  filaFecha: HOY,
  filaNumero: numero,
  ...extra,
})

async function pantalla(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await GET()
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((b) => ({ ...b, filaVirtualActiva: b.id === NEGOCIO, filaVirtualTope: 10 })),
    visit: [
      enFila("a", 1, { status: "en-atencion" }),
      enFila("b", 2, { customerName: "Bea" }),
      enFila("c", 3, { customerName: "carla   díaz" }),
      enFila("anulada", 4, { status: "anulada" }),
      enFila("cobrada", 5, { status: "finalizada" }),
      enFila("ayer", 1, { filaFecha: "2030-01-06" }),
      // Llegó por el Tablero, sin turno: no es de la fila.
      { id: "walk-in", businessId: NEGOCIO, customerName: "Sin Turno", status: "en-espera", arrivedAt: AHORA },
      enFila("ajena", 1, { businessId: OTRO_NEGOCIO, customerName: "Ajena Dos" }),
    ],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET /api/fila-virtual/pantalla", () => {
  it("dueña y encargado ven la fila de hoy de su negocio: número y nombre con inicial, nada más", async () => {
    for (const sesion of [sesiones.dueña, sesiones.encargado]) {
      const { status, cuerpo } = await pantalla(sesion)
      expect(status).toBe(200)
      expect(cuerpo).toEqual({
        negocio: { nombre: "Salón Uno", slug: "salon-uno" },
        activa: true,
        tope: 10,
        enAtencion: [{ numero: 1, nombre: "Juan P." }],
        enEspera: [
          { numero: 2, nombre: "Bea" },
          { numero: 3, nombre: "carla D." },
        ],
      })
      const texto = JSON.stringify(cuerpo)
      expect(texto).not.toMatch(/@|correo|Soto|Sin Turno|Ajena/)
    }
  })

  it("el dueño de otro negocio ve sólo la suya", async () => {
    const { cuerpo } = await pantalla(sesiones.dueñoAjeno)
    expect(cuerpo.negocio.slug).toBe("salon-dos")
    expect(cuerpo.activa).toBe(false)
    expect(cuerpo.enEspera).toEqual([{ numero: 1, nombre: "Ajena D." }])
    expect(cuerpo.enAtencion).toEqual([])
  })

  it("el profesional, uno sin miembro y sin sesión: 401", async () => {
    for (const sesion of [sesiones.carla, sesiones.sinMiembro, null]) {
      expect((await pantalla(sesion)).status).toBe(401)
    }
  })
})
