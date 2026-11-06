import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { OTRO_NEGOCIO, atencion, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"
import { citaDental, datosDeLaClinica, sesionesDentales } from "@/pruebas/clinica-con-sillones"
import {
  CODIGO_SILLON_OCUPADO,
  MENSAJE_SILLON_DE_CITA_CERRADA,
  MENSAJE_SILLON_INACTIVO,
  MENSAJE_SILLON_NO_ENCONTRADO,
} from "@/lib/sillones"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/citas/x/sillon"

function escenario() {
  base.reiniciar({
    ...datosDeLaClinica(),
    appointment: [
      citaDental("cita-carla", "2026-10-20", "10:00", "11:00", { sillonId: "sl-1" }),
      citaDental("cita-pedro", "2026-10-20", "10:30", "11:30", { memberId: "m-pedro", customerId: "c-beto" }),
      citaDental("cita-en-espera", "2026-10-20", "13:00", "13:30", { status: "confirmada" }),
      citaDental("cita-cancelada", "2026-10-20", "10:00", "11:00", { status: "cancelada" }),
      { ...citaDental("cita-ajena", "2026-10-20", "10:00", "11:00"), businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno" },
    ],
    visit: [atencion("v-espera", { appointmentId: "cita-en-espera" })],
  })
}

async function asignar(sesion: unknown, id: string, cuerpo: unknown) {
  const { PATCH } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PATCH(pedido(URL, cuerpo), conId(id))
}

const sillonDe = (id: string) => base.buscar("appointment", { id })[0]?.sillonId

beforeEach(() => {
  vi.clearAllMocks()
  escenario()
})

describe("PATCH /api/citas/[id]/sillon", () => {
  it("asigna un sillón libre y devuelve la cita con su sillón", async () => {
    const res = await asignar(sesionesDentales.encargado, "cita-pedro", { sillonId: "sl-2" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "cita-pedro", sillonId: "sl-2", sillon: { id: "sl-2", nombre: "Sillón 2" } })
    expect(sillonDe("cita-pedro")).toBe("sl-2")
  })

  it("lo quita con null", async () => {
    const res = await asignar(sesionesDentales.dueña, "cita-carla", { sillonId: null })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "cita-carla", sillonId: null, sillon: null })
  })

  it("a un paciente que ya está en la sala de espera (\"Asignar sillón\")", async () => {
    const res = await asignar(sesionesDentales.encargado, "cita-en-espera", { sillonId: "sl-1" })

    expect(res.status).toBe(200)
    expect(sillonDe("cita-en-espera")).toBe("sl-1")
  })

  it("la odontóloga, a su cita", async () => {
    const res = await asignar(sesionesDentales.carla, "cita-carla", { sillonId: "sl-2" })

    expect(res.status).toBe(200)
    expect(sillonDe("cita-carla")).toBe("sl-2")
  })

  it("la odontóloga no llega a la cita de un colega: 404 y no se escribe nada", async () => {
    const antes = base.volcado()
    const res = await asignar(sesionesDentales.carla, "cita-pedro", { sillonId: "sl-2" })

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("un sillón ocupado a esa hora: 409 con su código", async () => {
    const res = await asignar(sesionesDentales.dueña, "cita-pedro", { sillonId: "sl-1" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: "Sillón 1 ya tiene una cita de 10:00 a 11:00. Elige otro sillón u otra hora.",
      codigo: CODIGO_SILLON_OCUPADO,
    })
    expect(sillonDe("cita-pedro")).toBeNull()
  })

  it("el sillón de otra clínica: 404", async () => {
    const res = await asignar(sesionesDentales.dueña, "cita-pedro", { sillonId: "sl-ajeno" })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: MENSAJE_SILLON_NO_ENCONTRADO })
  })

  it("un sillón desactivado: 400", async () => {
    const res = await asignar(sesionesDentales.dueña, "cita-pedro", { sillonId: "sl-viejo" })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: MENSAJE_SILLON_INACTIVO })
  })

  it("una cita cancelada no cambia de sillón: 409", async () => {
    const res = await asignar(sesionesDentales.dueña, "cita-cancelada", { sillonId: "sl-2" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_SILLON_DE_CITA_CERRADA })
  })

  it("la cita de otra clínica: 404, sin escribir", async () => {
    const antes = base.volcado()

    expect((await asignar(sesionesDentales.dueña, "cita-ajena", { sillonId: "sl-1" })).status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("el mismo sillón que ya tiene: 200 sin escribir", async () => {
    const res = await asignar(sesionesDentales.dueña, "cita-carla", { sillonId: "sl-1" })

    expect(res.status).toBe(200)
    expect(base.prisma.appointment.updateMany).not.toHaveBeenCalled()
  })

  it("sin sillonId en el cuerpo: 400", async () => {
    expect((await asignar(sesionesDentales.dueña, "cita-carla", {})).status).toBe(400)
  })

  it("en un salón: 404", async () => {
    base.reiniciar({ ...datosBase(), appointment: [citaDental("cita-carla", "2026-10-20", "10:00", "11:00")] })

    expect((await asignar(sesiones.dueña, "cita-carla", { sillonId: null })).status).toBe(404)
  })

  it("sin sesión: 401", async () => {
    expect((await asignar(null, "cita-carla", { sillonId: null })).status).toBe(401)
  })
})
