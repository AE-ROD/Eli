import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, conId, datosBase, sesiones } from "@/pruebas/datos"
import { MARCA_DE_CLIENTE_ELIMINADO } from "@/lib/clientes-eliminados"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/**
 * La lista "Se están yendo" (`GET /api/clientes/se-van`) y el "Escribirle"
 * (`POST /api/clientes/[id]/contacto`) juntos: el segundo saca la fila del
 * primero, y eso es lo que se prueba.
 */

/** 28 de octubre de 2026, 10:00 en Santiago. */
const AHORA = new Date("2026-10-28T13:00:00.000Z")

let siguiente = 1
function visita(customerId: string, fecha: string, extra: Record<string, unknown> = {}) {
  return { id: `v-${siguiente++}`, businessId: NEGOCIO, customerId, status: "finalizada", arrivedAt: new Date(`${fecha}T15:00:00.000Z`), ...extra }
}

/** Ciclo propio de 21 días con la última visita ese día. */
function cadaTresSemanas(customerId: string, ultima: string, extra: Record<string, unknown> = {}) {
  const d = (dias: number) => new Date(new Date(`${ultima}T15:00:00.000Z`).getTime() - dias * 86_400_000).toISOString().slice(0, 10)
  return [visita(customerId, d(42), extra), visita(customerId, d(21), extra), visita(customerId, ultima, extra)]
}

function escenario() {
  siguiente = 1
  const datos = datosBase()
  return {
    ...datos,
    service: datos.service.map((s) => (s.id === "s-corte" ? { ...s, frecuenciaDias: 20 } : s)),
    customer: [
      ...datos.customer.map((c) => (c.id === "c-maria" ? { ...c, email: "maria@test", phone: "+56987654321" } : c)),
      { id: "c-elena", businessId: NEGOCIO, name: "Elena", email: "elena@test" },
      { id: "c-con-cita", businessId: NEGOCIO, name: "Ceci" },
      { id: "c-contactado", businessId: NEGOCIO, name: "Dani" },
      { id: "c-contactado-hace-tiempo", businessId: NEGOCIO, name: "Eva" },
      { id: "c-eliminado", businessId: NEGOCIO, name: "Cliente eliminado", tags: [MARCA_DE_CLIENTE_ELIMINADO] },
      { id: "c-ajeno-cruzado", businessId: OTRO_NEGOCIO, name: "Juan" },
    ],
    visit: [
      // 42 días sin venir con ciclo de 21 (≥ 31,5): se va.
      ...cadaTresSemanas("c-maria", "2026-09-16"),
      // 21 días: todavía no.
      ...cadaTresSemanas("c-beto", "2026-10-07"),
      // Una visita con Corte (cada 20): 38 días ≥ 30, se va por el ciclo del servicio.
      visita("c-elena", "2026-09-20", { id: "v-elena" }),
      ...cadaTresSemanas("c-con-cita", "2026-09-16"),
      ...cadaTresSemanas("c-contactado", "2026-09-16"),
      ...cadaTresSemanas("c-contactado-hace-tiempo", "2026-09-16"),
      ...cadaTresSemanas("c-eliminado", "2026-09-16"),
      // Del otro negocio, y un dato roto: atención del negocio 1 con un cliente del 2.
      ...cadaTresSemanas("c-ajeno", "2026-09-16", { businessId: OTRO_NEGOCIO }),
      ...cadaTresSemanas("c-ajeno-cruzado", "2026-09-16"),
    ],
    visitService: [
      { id: "l-elena", visitId: "v-elena", serviceId: "s-corte", serviceName: "Corte", professionalName: "Carla", priceCents: 800000 },
    ],
    appointment: [
      {
        id: "cita-futura",
        businessId: NEGOCIO,
        customerId: "c-con-cita",
        title: "Corte",
        status: "pendiente",
        startTime: new Date("2026-11-05T15:00:00.000Z"),
        endTime: new Date("2026-11-05T15:30:00.000Z"),
      },
    ],
    envioAClientes: [
      { id: "e-1", businessId: NEGOCIO, customerId: "c-contactado", tipo: "contacto-manual", canal: "manual", categoria: "promocional", referencia: "c-contactado:2026-10-23", enviadoAt: new Date("2026-10-23T15:00:00.000Z") },
      { id: "e-2", businessId: NEGOCIO, customerId: "c-contactado-hace-tiempo", tipo: "contacto-manual", canal: "manual", categoria: "promocional", referencia: "c-contactado-hace-tiempo:2026-10-01", enviadoAt: new Date("2026-10-01T15:00:00.000Z") },
    ],
  }
}

const pedidoVacio = {} as NextRequest

async function lista(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET()
}

async function ids(sesion: unknown): Promise<string[]> {
  const res = await lista(sesion)
  expect(res.status).toBe(200)
  return ((await res.json()).clientes as { id: string }[]).map((c) => c.id).sort()
}

async function escribirle(sesion: unknown, id: string) {
  const { POST } = await import("../[id]/contacto/route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedidoVacio, conId(id))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  vi.spyOn(console, "error").mockImplementation(() => {})
  base.reiniciar(escenario())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("GET /api/clientes/se-van", () => {
  it("lista a los que no vienen hace 1,5 ciclos, sin cita en pie, sin contacto reciente ni eliminados", async () => {
    expect(await ids(sesiones.dueña)).toEqual(["c-contactado-hace-tiempo", "c-elena", "c-maria"])
  })

  it("cada fila trae días sin venir, ciclo, de dónde sale y el último servicio", async () => {
    const res = await lista(sesiones.dueña)
    const cuerpo = await res.json()
    const porId = Object.fromEntries((cuerpo.clientes as { id: string }[]).map((c) => [c.id, c]))

    expect(porId["c-maria"]).toEqual({
      id: "c-maria",
      nombre: "María",
      apellido: "González",
      email: "maria@test",
      telefono: "+56987654321",
      ultimaVisita: "2026-09-16",
      diasSinVenir: 42,
      ciclo: 21,
      origenDelCiclo: "propio",
      ultimoServicio: null,
    })
    expect(porId["c-elena"]).toMatchObject({ diasSinVenir: 38, ciclo: 20, origenDelCiclo: "servicio", ultimoServicio: "Corte" })
    expect(cuerpo.total).toBe(3)
    expect(cuerpo.diasOcultoTrasContacto).toBe(14)
  })

  it("el encargado también la ve", async () => {
    expect(await ids(sesiones.encargado)).toEqual(["c-contactado-hace-tiempo", "c-elena", "c-maria"])
  })

  it("el profesional no: 401 (decisión c), y tampoco uno sin memberId ni sin sesión", async () => {
    for (const sesion of [sesiones.carla, sesiones.sinMiembro, null]) {
      const res = await lista(sesion)
      expect(res.status).toBe(401)
    }
    expect(base.prisma.visit.findMany).not.toHaveBeenCalled()
  })

  it("sólo clientes del negocio de la sesión: ni los del otro, ni uno del otro colgado de una atención de éste", async () => {
    const delUno = await ids(sesiones.dueña)
    expect(delUno).not.toContain("c-ajeno")
    expect(delUno).not.toContain("c-ajeno-cruzado")

    expect(await ids(sesiones.dueñoAjeno)).toEqual(["c-ajeno"])
  })

  it("una cita del otro negocio no esconde a un cliente de éste", async () => {
    await base.prisma.appointment.create({
      data: {
        id: "cita-ajena",
        businessId: OTRO_NEGOCIO,
        customerId: "c-maria",
        title: "Corte",
        status: "confirmada",
        startTime: new Date("2026-11-05T15:00:00.000Z"),
        endTime: new Date("2026-11-05T15:30:00.000Z"),
      },
    })
    expect(await ids(sesiones.dueña)).toContain("c-maria")
  })
})

describe("POST /api/clientes/[id]/contacto", () => {
  it("registra el contacto como canal manual, una vez por día, y saca la fila de la lista", async () => {
    const res = await escribirle(sesiones.dueña, "c-maria")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ registrado: true, vuelveALaListaEl: "2026-11-11" })

    const otra = await escribirle(sesiones.encargado, "c-maria")
    expect(otra.status).toBe(200)

    expect(base.buscar("envioAClientes", { customerId: "c-maria" })).toEqual([
      expect.objectContaining({
        businessId: NEGOCIO,
        tipo: "contacto-manual",
        canal: "manual",
        categoria: "promocional",
        referencia: "c-maria:2026-10-28",
      }),
    ])
    expect(await ids(sesiones.dueña)).not.toContain("c-maria")
  })

  it("la fila vuelve a aparecer a los 14 días", async () => {
    await escribirle(sesiones.dueña, "c-maria")

    vi.setSystemTime(new Date("2026-11-10T13:00:00.000Z"))
    expect(await ids(sesiones.dueña)).not.toContain("c-maria")

    vi.setSystemTime(new Date("2026-11-11T13:00:00.000Z"))
    expect(await ids(sesiones.dueña)).toContain("c-maria")
  })

  it("un cliente de otro negocio es 404 y no se escribe nada", async () => {
    const antes = base.volcado()

    const res = await escribirle(sesiones.dueña, "c-ajeno")

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("uno que no existe o eliminado responde igual: 404", async () => {
    for (const id of ["no-existe", "c-eliminado"]) {
      const res = await escribirle(sesiones.dueña, id)
      expect(res.status).toBe(404)
    }
    expect(base.buscar("envioAClientes")).toHaveLength(2)
  })

  it("el profesional del mismo negocio recibe 401; con un cliente ajeno, 404", async () => {
    const antes = base.volcado()

    expect((await escribirle(sesiones.carla, "c-maria")).status).toBe(401)
    expect((await escribirle(sesiones.carla, "c-ajeno")).status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin sesión, 401 sin tocar la base", async () => {
    const res = await escribirle(null, "c-maria")
    expect(res.status).toBe(401)
    expect(base.prisma.customer.findFirst).not.toHaveBeenCalled()
  })
})
