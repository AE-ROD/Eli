import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { conId, pedido, sesiones } from "@/pruebas/datos"
import { citaDental, datosDeLaClinica, sesionesDentales } from "@/pruebas/clinica-con-sillones"
import { MENSAJE_NOMBRE_REPETIDO } from "@/lib/sillones"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/sillones/x"

async function editar(sesion: unknown, id: string, cuerpo: unknown) {
  const { PATCH } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PATCH(pedido(URL, cuerpo), conId(id))
}

const sillon = (id: string) => base.buscar("sillon", { id })[0]

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosDeLaClinica(),
    appointment: [citaDental("cita-en-1", "2026-10-20", "10:00", "11:00", { sillonId: "sl-1" })],
  })
})

describe("PATCH /api/configuracion/sillones/[id]", () => {
  it("la dueña lo renombra (recortado) y lo reordena", async () => {
    const res = await editar(sesionesDentales.dueña, "sl-1", { nombre: " Sillón A ", orden: 7 })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "sl-1", nombre: "Sillón A", orden: 7, activo: true })
  })

  it("el encargado lo desactiva: las citas que lo tienen lo conservan", async () => {
    const res = await editar(sesionesDentales.encargado, "sl-1", { activo: false })

    expect(res.status).toBe(200)
    expect(sillon("sl-1").activo).toBe(false)
    expect(base.buscar("appointment", { id: "cita-en-1" })[0].sillonId).toBe("sl-1")
  })

  it("y lo vuelve a activar", async () => {
    const res = await editar(sesionesDentales.encargado, "sl-viejo", { activo: true })

    expect(res.status).toBe(200)
    expect(sillon("sl-viejo").activo).toBe(true)
  })

  it("la odontóloga no: 401 y no se escribe nada", async () => {
    const antes = base.volcado()
    const res = await editar(sesionesDentales.carla, "sl-1", { nombre: "Otro" })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it("un sillón de otra clínica es 404, también para quien lo podría editar, y no se escribe nada", async () => {
    const antes = base.volcado()

    expect((await editar(sesionesDentales.dueña, "sl-ajeno", { activo: false })).status).toBe(404)
    // La pertenencia va antes que el permiso: la odontóloga también ve 404, no 401.
    expect((await editar(sesionesDentales.carla, "sl-ajeno", { activo: false })).status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("renombrarlo como otro de la clínica, sin distinguir mayúsculas, es 409", async () => {
    const res = await editar(sesionesDentales.dueña, "sl-1", { nombre: "sillón 2" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_NOMBRE_REPETIDO })
    expect(sillon("sl-1").nombre).toBe("Sillón 1")
  })

  it("dejarle su mismo nombre (con otras mayúsculas) no choca consigo mismo", async () => {
    const res = await editar(sesionesDentales.dueña, "sl-1", { nombre: "SILLÓN 1" })

    expect(res.status).toBe(200)
    expect(sillon("sl-1").nombre).toBe("SILLÓN 1")
  })

  it("sin nada que cambiar, o un orden inválido, 400", async () => {
    expect((await editar(sesionesDentales.dueña, "sl-1", {})).status).toBe(400)
    expect((await editar(sesionesDentales.dueña, "sl-1", { orden: -1 })).status).toBe(400)
  })

  it("en un salón, 404", async () => {
    expect((await editar(sesiones.dueña, "sl-1", { activo: false })).status).toBe(404)
    expect(sillon("sl-1").activo).toBe(true)
  })

  it("sin sesión, 401", async () => {
    expect((await editar(null, "sl-1", { activo: false })).status).toBe(401)
  })
})
