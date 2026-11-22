import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, centavos, datosBase, pedido, sesiones } from "@/pruebas/datos"
import { MAXIMO_DE_PAQUETES } from "@/lib/paquetes"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/paquetes"

/** La dueña de una clínica dental: ahí los paquetes no existen. */
const dueñaDeUnaClinica = { user: { ...sesiones.dueña.user, rubro: "odontologia" } }

const paquete = (id: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  serviceId: "s-color",
  sesiones: 6,
  priceCents: centavos(125000),
  createdAt: new Date("2026-11-01"),
  ...datos,
})

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosBase(),
    paqueteDeSesiones: [
      paquete("pq-color"),
      paquete("pq-peinado", { serviceId: "s-peinado", sesiones: 3, priceCents: centavos(10000), vigenciaMeses: 6, active: false, createdAt: new Date("2026-11-02") }),
      paquete("pq-ajeno", { businessId: OTRO_NEGOCIO, serviceId: "s-ajeno", createdAt: new Date("2026-11-03") }),
    ],
  })
})

async function listar(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET()
}

async function crear(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, cuerpo))
}

const NUEVO = { servicioId: "s-corte", sesiones: 5, precio: 30000, vigenciaMeses: 6 }

describe("GET /api/configuracion/paquetes", () => {
  it("la dueña ve los del negocio, también los pausados, con lo que vale cada sesión y el ahorro", async () => {
    const res = await listar(sesiones.dueña)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      {
        id: "pq-color",
        servicioId: "s-color",
        servicio: "Color",
        sesiones: 6,
        precio: 125000,
        vigenciaMeses: null,
        activo: true,
        // 125.000 / 6, hacia abajo en centavos.
        valorPorSesion: 20833.33,
        // Sueltas serían 150.000: 25.000 menos, un 17 %.
        ahorro: 17,
      },
      {
        id: "pq-peinado",
        servicioId: "s-peinado",
        servicio: "Peinado",
        sesiones: 3,
        precio: 10000,
        vigenciaMeses: 6,
        activo: false,
        valorPorSesion: 3333.33,
        // El servicio no tiene precio: no hay con qué comparar.
        ahorro: null,
      },
    ])
  })

  it("la consulta va acotada al negocio de la sesión: el paquete del otro negocio no llega", async () => {
    await listar(sesiones.encargado)

    expect(base.prisma.paqueteDeSesiones.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: NEGOCIO }, take: MAXIMO_DE_PAQUETES })
    )

    const delOtro = await (await listar(sesiones.dueñoAjeno)).json()
    expect(delOtro.map((p: { id: string }) => p.id)).toEqual(["pq-ajeno"])
  })

  it("el encargado también los ve", async () => {
    expect((await listar(sesiones.encargado)).status).toBe(200)
  })

  it("la profesional, quien no tiene membresía, la clínica dental y quien no tiene sesión: 401", async () => {
    for (const sesion of [sesiones.carla, sesiones.sinMiembro, dueñaDeUnaClinica, null]) {
      expect((await listar(sesion)).status).toBe(401)
    }
    expect(base.prisma.paqueteDeSesiones.findMany).not.toHaveBeenCalled()
  })
})

describe("POST /api/configuracion/paquetes", () => {
  it("la dueña crea un paquete: el precio llega en pesos y se guarda en centavos, con el negocio de la sesión", async () => {
    const res = await crear(sesiones.dueña, NUEVO)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data).toEqual({
      id: expect.any(String),
      servicioId: "s-corte",
      servicio: "Corte",
      sesiones: 5,
      precio: 30000,
      vigenciaMeses: 6,
      activo: true,
      valorPorSesion: 6000,
      // Sueltas: 5 × 8.000 = 40.000.
      ahorro: 25,
    })
    expect(base.buscar("paqueteDeSesiones", { id: data.id })[0]).toMatchObject({
      businessId: NEGOCIO,
      serviceId: "s-corte",
      sesiones: 5,
      priceCents: 3000000,
      vigenciaMeses: 6,
      active: true,
    })
  })

  it("el encargado también, y sin vigencia el paquete no vence", async () => {
    const res = await crear(sesiones.encargado, { servicioId: "s-corte", sesiones: 2, precio: 16000 })
    const data = await res.json()

    expect(res.status).toBe(201)
    // Sin rebaja frente a pagarlas sueltas no hay ahorro que mostrar.
    expect(data).toMatchObject({ vigenciaMeses: null, valorPorSesion: 8000, ahorro: null })
  })

  it("el negocio lo pone la sesión, no el pedido: un `businessId` en el cuerpo no cambia nada", async () => {
    const res = await crear(sesiones.dueña, { ...NUEVO, businessId: OTRO_NEGOCIO })
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(base.buscar("paqueteDeSesiones", { id: data.id })[0]).toMatchObject({ businessId: NEGOCIO })
  })

  it("un servicio de otro negocio, o que no existe, es un 404 y no crea nada", async () => {
    const antes = base.volcado()

    for (const servicioId of ["s-ajeno", "s-no-existe"]) {
      const res = await crear(sesiones.dueña, { ...NUEVO, servicioId })
      expect(res.status).toBe(404)
    }
    expect(base.prisma.service.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s-ajeno", businessId: NEGOCIO } })
    )
    expect(base.volcado()).toEqual(antes)
  })

  it("un servicio desactivado es un 400 que dice por qué", async () => {
    const antes = base.volcado()
    const res = await crear(sesiones.dueña, { ...NUEVO, servicioId: "s-viejo" })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/desactivado/)
    expect(base.volcado()).toEqual(antes)
  })

  it("sesiones fuera de 2 a 50, precio en cero o negativo, o una vigencia de 40 meses: 400 y no crea nada", async () => {
    const antes = base.volcado()
    for (const cuerpo of [
      { ...NUEVO, sesiones: 1 },
      { ...NUEVO, sesiones: 51 },
      { ...NUEVO, sesiones: 2.5 },
      { ...NUEVO, sesiones: "6" },
      { ...NUEVO, precio: 0 },
      { ...NUEVO, precio: -100 },
      { ...NUEVO, precio: 10.005 },
      { ...NUEVO, precio: 30_000_000 },
      { ...NUEVO, vigenciaMeses: 40 },
      { ...NUEVO, vigenciaMeses: 0 },
      { ...NUEVO, vigenciaMeses: 1.5 },
      { ...NUEVO, servicioId: "" },
      { sesiones: 5, precio: 30000 },
      { servicioId: "s-corte", precio: 30000 },
      { servicioId: "s-corte", sesiones: 5 },
      {},
      undefined,
    ]) {
      const res = await crear(sesiones.dueña, cuerpo)
      expect(res.status, JSON.stringify(cuerpo)).toBe(400)
      expect((await res.json()).error).toEqual(expect.any(String))
    }
    expect(base.volcado()).toEqual(antes)
  })

  it("un precio que dejaría cada sesión en $0 es un 400", async () => {
    const res = await crear(sesiones.dueña, { ...NUEVO, sesiones: 50, precio: 0.3 })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/cada sesión/)
  })

  it(`con ${MAXIMO_DE_PAQUETES} paquetes no entra otro: 409, y el tope se cuenta dentro del negocio y con candado`, async () => {
    base.reiniciar({
      ...datosBase(),
      paqueteDeSesiones: [
        ...Array.from({ length: MAXIMO_DE_PAQUETES }, (_, i) => paquete(`pq-${i}`)),
        paquete("pq-ajeno", { businessId: OTRO_NEGOCIO, serviceId: "s-ajeno" }),
      ],
    })
    const antes = base.volcado()

    const res = await crear(sesiones.dueña, NUEVO)

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/máximo/)
    expect(base.volcado()).toEqual(antes)
    expect(base.prisma.paqueteDeSesiones.count).toHaveBeenCalledWith({ where: { businessId: NEGOCIO } })
    expect(base.prisma.$executeRaw).toHaveBeenCalledTimes(1)

    // Los paquetes de un negocio no le gastan el tope a otro.
    expect((await crear(sesiones.dueñoAjeno, { ...NUEVO, servicioId: "s-ajeno" })).status).toBe(201)
  })

  it("la profesional, la clínica dental y quien no tiene sesión no crean: 401 sin tocar la base", async () => {
    const antes = base.volcado()
    for (const sesion of [sesiones.carla, sesiones.sinMiembro, dueñaDeUnaClinica, null]) {
      expect((await crear(sesion, NUEVO)).status).toBe(401)
    }
    expect(base.volcado()).toEqual(antes)
  })
})
