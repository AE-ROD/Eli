import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, atencion, centavos, datosBase, linea, sesiones } from "@/pruebas/datos"

/**
 * Los paquetes de sesiones en la ficha de la clienta: quién los ve, quién ve
 * los montos, quién devuelve y cuánto, y el aislamiento entre negocios y
 * entre clientas (404, nunca 403).
 */

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return base.prisma
  },
}))

const AHORA = new Date("2026-11-21T15:00:00Z")
const VENDIDO = new Date("2026-11-03T15:00:00Z")

const dental = { user: { ...sesiones.dueña.user, rubro: "odontologia" } }

/** Una atención finalizada con la línea donde se vendió el paquete. */
const venta = (n: string, datos: Record<string, unknown> = {}) => ({
  visit: atencion(`v-venta-${n}`, { status: "finalizada", ...datos }),
  linea: linea(`l-venta-${n}`, `v-venta-${n}`, { serviceId: "s-color", serviceName: "Paquete de 6 sesiones: Color", priceCents: centavos(150000) }),
})

/** Un paquete de 6 sesiones de Color por $150.000 ($25.000 la sesión), de María, salvo lo que se pise. */
const paquete = (n: string, datos: Record<string, unknown> = {}) => ({
  id: `pq-${n}`,
  businessId: NEGOCIO,
  customerId: "c-maria",
  serviceId: "s-color",
  serviceName: "Color",
  sesiones: 6,
  priceCents: centavos(150000),
  valorPorSesionCents: centavos(25000),
  lineaDeVentaId: `l-venta-${n}`,
  vendidoAt: VENDIDO,
  ...datos,
})

/** `cuantas` sesiones usadas del paquete, cada una en su atención. */
function usos(n: string, cuantas: number, estado = "finalizada") {
  const indices = Array.from({ length: cuantas }, (_, i) => i)
  return {
    visit: indices.map((i) => atencion(`v-uso-${n}-${i}`, { status: estado })),
    visitService: indices.map((i) => linea(`l-uso-${n}-${i}`, `v-uso-${n}-${i}`, { serviceId: "s-color", serviceName: "Color", priceCents: centavos(25000) })),
    usoDePaquete: indices.map((i) => ({ id: `uso-${n}-${i}`, businessId: NEGOCIO, paqueteId: `pq-${n}`, lineaId: `l-uso-${n}-${i}` })),
  }
}

interface Escenario {
  ventas?: ReturnType<typeof venta>[]
  paquetes?: ReturnType<typeof paquete>[]
  usos?: ReturnType<typeof usos>[]
}

function sembrar({ ventas = [], paquetes = [], usos: usados = [] }: Escenario) {
  base.reiniciar({
    ...datosBase(),
    visit: [...ventas.map((v) => v.visit), ...usados.flatMap((u) => u.visit)],
    visitService: [...ventas.map((v) => v.linea), ...usados.flatMap((u) => u.visitService)],
    paqueteDeCliente: paquetes,
    usoDePaquete: usados.flatMap((u) => u.usoDePaquete),
  })
}

/** Lo de siempre: María con un paquete con 2 de 6 usadas. */
const conDosUsadas = () => sembrar({ ventas: [venta("a")], paquetes: [paquete("a")], usos: [usos("a", 2)] })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] })
  conDosUsadas()
})

async function leer(sesion: unknown, id: string) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await GET(new Request("http://x") as never, { params: Promise.resolve({ id }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function devolver(sesion: unknown, id: string, paqueteId: string, cuerpo: unknown = { medio: "efectivo" }) {
  const { POST } = await import("./[paqueteId]/devolucion/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const pedido = new Request("http://x", { method: "POST", body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) })
  const respuesta = await POST(pedido as never, { params: Promise.resolve({ id, paqueteId }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const guardado = (n: string) => base.buscar("paqueteDeCliente", { id: `pq-${n}` })[0]

describe("GET: los paquetes de la clienta", () => {
  it("la dueña los ve con los montos en pesos y lo que se devolvería", async () => {
    const { status, cuerpo } = await leer(sesiones.dueña, "c-maria")
    expect(status).toBe(200)
    expect(cuerpo).toEqual({
      puedeDevolver: true,
      paquetes: [
        {
          id: "pq-a",
          servicio: "Color",
          sesiones: 6,
          usadas: 2,
          restantes: 4,
          estado: "activo",
          vendidoEl: VENDIDO.toISOString(),
          venceEl: null,
          devueltoEl: null,
          precio: 150000,
          valorPorSesion: 25000,
          devuelto: null,
          aDevolver: 100000,
        },
      ],
    })
  })

  it("el encargado ve los montos, pero no devuelve", async () => {
    const { status, cuerpo } = await leer(sesiones.encargado, "c-maria")
    expect(status).toBe(200)
    expect(cuerpo.puedeDevolver).toBe(false)
    expect(cuerpo.paquetes[0]).toMatchObject({ precio: 150000, valorPorSesion: 25000, aDevolver: 100000 })
  })

  it("la profesional ve las sesiones, con todos los montos en null", async () => {
    const { status, cuerpo } = await leer(sesiones.carla, "c-maria")
    expect(status).toBe(200)
    expect(cuerpo.puedeDevolver).toBe(false)
    expect(cuerpo.paquetes[0]).toMatchObject({
      servicio: "Color",
      sesiones: 6,
      usadas: 2,
      restantes: 4,
      estado: "activo",
      precio: null,
      valorPorSesion: null,
      devuelto: null,
      aDevolver: null,
    })
  })

  it("una sesión usada en una atención anulada no cuenta", async () => {
    sembrar({ ventas: [venta("a")], paquetes: [paquete("a")], usos: [usos("a", 2, "anulada")] })
    const { cuerpo } = await leer(sesiones.dueña, "c-maria")
    expect(cuerpo.paquetes[0]).toMatchObject({ usadas: 0, restantes: 6, aDevolver: 150000 })
  })

  it("vencido, terminado y devuelto se dicen; sólo al vencido le queda algo por devolver", async () => {
    sembrar({
      ventas: [venta("v"), venta("t"), venta("d")],
      paquetes: [
        paquete("v", { venceAt: new Date("2026-11-20T15:00:00Z"), vendidoAt: new Date("2026-08-20T15:00:00Z") }),
        paquete("t", { vendidoAt: new Date("2026-08-10T15:00:00Z") }),
        paquete("d", {
          vendidoAt: new Date("2026-08-01T15:00:00Z"),
          devueltoAt: new Date("2026-09-01T15:00:00Z"),
          devueltoCents: centavos(150000),
          devueltoMedio: "efectivo",
          devueltoPorId: "u-duena",
          devueltoPorNombre: "Ana Dueña",
        }),
      ],
      usos: [usos("t", 6)],
    })
    const { cuerpo } = await leer(sesiones.dueña, "c-maria")
    expect(cuerpo.paquetes.map((p: { id: string; estado: string; aDevolver: number | null }) => [p.id, p.estado, p.aDevolver])).toEqual([
      ["pq-v", "vencido", 150000],
      ["pq-t", "agotado", null],
      ["pq-d", "devuelto", null],
    ])
    expect(cuerpo.paquetes[2]).toMatchObject({ devuelto: 150000, devueltoEl: "2026-09-01T15:00:00.000Z" })
  })

  it("una clienta sin paquetes: lista vacía", async () => {
    expect((await leer(sesiones.dueña, "c-beto")).cuerpo.paquetes).toEqual([])
  })

  it("sin sesión, o en una clínica dental: 401", async () => {
    expect((await leer(null, "c-maria")).status).toBe(401)
    expect((await leer(dental, "c-maria")).status).toBe(401)
  })

  it("una clienta de otro negocio, o que no existe, es 404", async () => {
    expect((await leer(sesiones.dueña, "c-ajeno")).status).toBe(404)
    expect((await leer(sesiones.dueñoAjeno, "c-maria")).status).toBe(404)
    expect((await leer(sesiones.dueña, "c-nadie")).status).toBe(404)
  })

  it("no trae los paquetes de otra clienta ni los de otro negocio", async () => {
    sembrar({
      ventas: [venta("a"), venta("b", { customerId: "c-beto" })],
      paquetes: [paquete("a"), paquete("b", { customerId: "c-beto" })],
    })
    const deMaria = await leer(sesiones.dueña, "c-maria")
    expect(deMaria.cuerpo.paquetes.map((p: { id: string }) => p.id)).toEqual(["pq-a"])
  })
})

describe("POST devolución: quién y qué", () => {
  it("la dueña devuelve: con 2 de 6 usadas, las 4 que quedan por lo que vale cada una", async () => {
    const { status, cuerpo } = await devolver(sesiones.dueña, "c-maria", "pq-a", { medio: "transferencia" })
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ ok: true, devuelto: 100000 })
    expect(guardado("a")).toMatchObject({
      devueltoAt: AHORA,
      devueltoCents: centavos(100000),
      devueltoMedio: "transferencia",
      devueltoPorId: "u-duena",
      devueltoPorNombre: "Ana Dueña",
    })
    // Y desde entonces se ve devuelto, sin nada más por devolver.
    const { cuerpo: despues } = await leer(sesiones.dueña, "c-maria")
    expect(despues.paquetes[0]).toMatchObject({ estado: "devuelto", devuelto: 100000, aDevolver: null })
  })

  it("sin ninguna sesión usada devuelve el precio entero, aunque no se reparta parejo", async () => {
    // $100.000 en 6 sesiones: $16.666,66 cada una. Sin usar, se devuelve todo y no 6 × el valor.
    sembrar({ ventas: [venta("a")], paquetes: [paquete("a", { priceCents: centavos(100000), valorPorSesionCents: 1666666 })] })
    const { status, cuerpo } = await devolver(sesiones.dueña, "c-maria", "pq-a")
    expect(status).toBe(200)
    expect(cuerpo.devuelto).toBe(100000)
    expect(guardado("a")?.devueltoCents).toBe(centavos(100000))
  })

  it("un paquete vencido con sesiones sin usar también se devuelve", async () => {
    sembrar({ ventas: [venta("a")], paquetes: [paquete("a", { venceAt: new Date("2026-11-20T15:00:00Z") })], usos: [usos("a", 2)] })
    expect((await devolver(sesiones.dueña, "c-maria", "pq-a")).cuerpo).toEqual({ ok: true, devuelto: 100000 })
  })

  it("el encargado y la profesional no devuelven: 403, y el paquete queda igual", async () => {
    const delEncargado = await devolver(sesiones.encargado, "c-maria", "pq-a")
    expect(delEncargado.status).toBe(403)
    expect(delEncargado.cuerpo.error).toBe("Devolver un paquete es de la dueña.")
    expect((await devolver(sesiones.carla, "c-maria", "pq-a")).status).toBe(403)
    expect(guardado("a")?.devueltoAt).toBeNull()
  })

  it("sin sesión, o en una clínica dental: 401", async () => {
    expect((await devolver(null, "c-maria", "pq-a")).status).toBe(401)
    expect((await devolver(dental, "c-maria", "pq-a")).status).toBe(401)
    expect(guardado("a")?.devueltoAt).toBeNull()
  })

  it("ya devuelto: 409, y no se pisa lo que quedó", async () => {
    expect((await devolver(sesiones.dueña, "c-maria", "pq-a")).status).toBe(200)
    const otraVez = await devolver(sesiones.dueña, "c-maria", "pq-a", { medio: "transferencia" })
    expect(otraVez.status).toBe(409)
    expect(guardado("a")).toMatchObject({ devueltoMedio: "efectivo", devueltoCents: centavos(100000) })
  })

  it("sin sesiones por usar: 409", async () => {
    sembrar({ ventas: [venta("a")], paquetes: [paquete("a")], usos: [usos("a", 6)] })
    const { status, cuerpo } = await devolver(sesiones.dueña, "c-maria", "pq-a")
    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/no queda nada que devolver/)
    expect(guardado("a")?.devueltoAt).toBeNull()
  })

  it("la venta anulada: 409", async () => {
    sembrar({ ventas: [venta("a", { status: "anulada" })], paquetes: [paquete("a")] })
    expect((await devolver(sesiones.dueña, "c-maria", "pq-a")).status).toBe(409)
  })

  it.each([[{ medio: "bitcoin" }], [{ medio: "paquete" }], [{ medio: "constructor" }], [{}], [{ medio: 5 }], ["no es json"]])(
    "medio inválido (%j): 400 y no se devuelve nada",
    async (cuerpo) => {
      expect((await devolver(sesiones.dueña, "c-maria", "pq-a", cuerpo)).status).toBe(400)
      expect(guardado("a")?.devueltoAt).toBeNull()
    }
  )
})

describe("POST devolución: aislamiento (404, nunca 403)", () => {
  beforeEach(() => {
    sembrar({
      ventas: [venta("a"), venta("b", { customerId: "c-beto" })],
      paquetes: [paquete("a"), paquete("b", { customerId: "c-beto" })],
    })
  })

  it("el paquete de otra clienta del mismo negocio es 404", async () => {
    expect((await devolver(sesiones.dueña, "c-maria", "pq-b")).status).toBe(404)
    expect(guardado("b")?.devueltoAt).toBeNull()
  })

  it("para el otro negocio, ni la clienta ni el paquete existen", async () => {
    expect((await devolver(sesiones.dueñoAjeno, "c-maria", "pq-a")).status).toBe(404)
    // Con su propia clienta y el paquete ajeno, tampoco.
    expect((await devolver(sesiones.dueñoAjeno, "c-ajeno", "pq-a")).status).toBe(404)
    expect((await devolver(sesiones.dueña, "c-ajeno", "pq-a")).status).toBe(404)
    expect(guardado("a")?.devueltoAt).toBeNull()
  })

  it("lo ajeno es 404 también para quien no podría devolver: no se le dice que existe", async () => {
    expect((await devolver(sesiones.encargado, "c-maria", "pq-b")).status).toBe(404)
    expect((await devolver(sesiones.carla, "c-maria", "pq-nadie")).status).toBe(404)
    expect((await devolver(sesiones.encargado, "c-nadie", "pq-a")).status).toBe(404)
  })

  it("el candado de la fila lleva el negocio de la sesión", async () => {
    await devolver(sesiones.dueña, "c-maria", "pq-a")
    const candado = base.prisma.$queryRaw.mock.calls.find(([partes]) => (partes as readonly string[]).join("?").includes("FOR UPDATE"))
    expect(candado?.slice(1)).toEqual(["pq-a", NEGOCIO])
  })
})
