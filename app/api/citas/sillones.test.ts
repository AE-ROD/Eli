import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"
import { citaDental, datosDeLaClinica, santiago, sesionesDentales } from "@/pruebas/clinica-con-sillones"
import { CODIGO_SILLON_OCUPADO, MENSAJE_SILLON_INACTIVO, MENSAJE_SILLON_NO_ENCONTRADO } from "@/lib/sillones"

/**
 * La agenda de una clínica dental con sillones: listar con el sillón (y
 * filtrar por uno) y crear una cita en un sillón. En un salón, nada de esto
 * cambia la respuesta ni se guarda.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

function escenario() {
  base.reiniciar({
    ...datosDeLaClinica(),
    appointment: [
      citaDental("cita-en-1", "2026-10-20", "10:00", "11:00", { sillonId: "sl-1", primeraVez: true }),
      citaDental("cita-sin-sillon", "2026-10-20", "12:00", "12:30", { memberId: "m-pedro" }),
      citaDental("cita-cancelada-en-1", "2026-10-20", "15:00", "16:00", { sillonId: "sl-1", status: "cancelada" }),
    ],
  })
}

async function listar(sesion: unknown, query = "fecha=2026-10-20") {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(`http://localhost/api/citas?${query}`))
}

async function crear(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido("http://localhost/api/citas", cuerpo))
}

const nueva = (inicio: string, fin: string, extra: Record<string, unknown> = {}) => ({
  title: "Limpieza",
  customerId: "c-beto",
  memberId: "m-pedro",
  startTime: santiago("2026-10-20", inicio).toISOString(),
  endTime: santiago("2026-10-20", fin).toISOString(),
  ...extra,
})

const citasDeBeto = () => base.buscar("appointment", { customerId: "c-beto" })

beforeEach(() => {
  vi.clearAllMocks()
  escenario()
})

describe("GET /api/citas en una clínica dental", () => {
  it("cada cita trae su sillón (id y nombre) y la marca de primera vez", async () => {
    const res = await listar(sesionesDentales.encargado)
    const citas = await res.json()

    expect(res.status).toBe(200)
    expect(citas.find((cita: { id: string }) => cita.id === "cita-en-1")).toMatchObject({
      sillonId: "sl-1",
      sillon: { id: "sl-1", nombre: "Sillón 1" },
      primeraVez: true,
    })
    expect(citas.find((cita: { id: string }) => cita.id === "cita-sin-sillon")).toMatchObject({ sillonId: null, sillon: null })
  })

  it("filtra por sillón", async () => {
    const res = await listar(sesionesDentales.dueña, "fecha=2026-10-20&sillonId=sl-1")

    expect((await res.json()).map((cita: { id: string }) => cita.id)).toEqual(["cita-en-1", "cita-cancelada-en-1"])
  })

  it("el filtro no abre nada: la odontóloga sigue viendo sólo lo suyo, y el sillón de otra clínica no trae nada", async () => {
    const deCarla = await (await listar(sesionesDentales.carla, "fecha=2026-10-20&sillonId=sl-1")).json()
    const ajeno = await (await listar(sesionesDentales.dueña, "fecha=2026-10-20&sillonId=sl-ajeno")).json()

    expect(deCarla.map((cita: { id: string }) => cita.id)).toEqual(["cita-en-1", "cita-cancelada-en-1"])
    expect(ajeno).toEqual([])
  })

  it("en un salón cada cita trae exactamente las claves de antes de la clínica dental, más la sede (etapa 9)", async () => {
    const citas = await (await listar(sesiones.dueña)).json()

    expect(citas.length).toBeGreaterThan(0)
    for (const cita of citas) {
      expect(Object.keys(cita).sort()).toEqual([
        "canceladaEn",
        "canceladaPor",
        "clientComments",
        "conAtencion",
        "confirmacionPorFaltas",
        "customer",
        "customerId",
        "endTime",
        "id",
        "member",
        "memberId",
        "notes",
        "price",
        // Etapa 9: `{ id, nombre }` o `null` (sin sedes).
        "sede",
        "startTime",
        "status",
        "title",
      ])
    }
  })

  it("en un salón la respuesta no cambia: sin sillón ni primera vez, y el filtro se ignora", async () => {
    const res = await listar(sesiones.dueña, "fecha=2026-10-20&sillonId=sl-1")
    const citas = await res.json()

    expect(citas).toHaveLength(3)
    for (const cita of citas) {
      expect(cita).not.toHaveProperty("sillonId")
      expect(cita).not.toHaveProperty("sillon")
      expect(cita).not.toHaveProperty("primeraVez")
    }
  })
})

describe("POST /api/citas con sillón", () => {
  it("la cita se crea en el sillón elegido", async () => {
    const res = await crear(sesionesDentales.encargado, nueva("11:00", "11:30", { sillonId: "sl-1" }))

    expect(res.status).toBe(201)
    expect(citasDeBeto()[0]).toMatchObject({ sillonId: "sl-1", businessId: NEGOCIO })
  })

  it("la odontóloga también asigna sillón a la suya", async () => {
    const res = await crear(sesionesDentales.carla, nueva("11:00", "11:30", { sillonId: "sl-2" }))

    expect(res.status).toBe(201)
    expect(citasDeBeto()[0]).toMatchObject({ sillonId: "sl-2", memberId: "m-carla" })
  })

  it("sin sillón, o con null o vacío, queda sin sillón", async () => {
    for (const sillonId of [undefined, null, ""]) {
      const res = await crear(sesionesDentales.dueña, nueva("13:00", "13:30", { sillonId, confirmarAdvertencias: true }))
      expect(res.status).toBe(201)
    }
    expect(citasDeBeto().map((cita) => cita.sillonId)).toEqual([null, null, null])
  })

  it("un sillón ocupado a esa hora es 409 con su código, aunque se confirmen las advertencias", async () => {
    const res = await crear(sesionesDentales.dueña, nueva("10:30", "11:30", { sillonId: "sl-1", confirmarAdvertencias: true }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: "Sillón 1 ya tiene una cita de 10:00 a 11:00. Elige otro sillón u otra hora.",
      codigo: CODIGO_SILLON_OCUPADO,
    })
    expect(citasDeBeto()).toHaveLength(0)
  })

  it("al odontólogo el 409 no le dice las horas de lo que choca: es la cita de una colega que no ve", async () => {
    // cita-en-1 es de Carla, de 10 a 11 en el sillón 1: Pedro no la ve en su agenda.
    const res = await crear(sesionesDentales.pedro, nueva("10:30", "11:30", { sillonId: "sl-1", confirmarAdvertencias: true }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: "Sillón 1 está ocupado a esa hora. Elige otro sillón u otra hora.",
      codigo: CODIGO_SILLON_OCUPADO,
    })
    expect(citasDeBeto()).toHaveLength(0)
  })

  it("tampoco en la revisión de la transacción, con el sillón trabado", async () => {
    base.prisma.appointment.findMany.mockResolvedValueOnce([])
    const res = await crear(sesionesDentales.pedro, nueva("10:30", "11:30", { sillonId: "sl-1", confirmarAdvertencias: true }))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Sillón 1 está ocupado a esa hora. Elige otro sillón u otra hora.")
    expect(base.prisma.$executeRaw).toHaveBeenCalled()
    expect(citasDeBeto()).toHaveLength(0)
  })

  it("el encargado, que ve toda la agenda, sí recibe las horas", async () => {
    const res = await crear(sesionesDentales.encargado, nueva("10:30", "11:30", { sillonId: "sl-1", confirmarAdvertencias: true }))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Sillón 1 ya tiene una cita de 10:00 a 11:00. Elige otro sillón u otra hora.")
  })

  it("tocarse no es chocar, y una cancelada no ocupa el sillón", async () => {
    expect((await crear(sesionesDentales.dueña, nueva("11:00", "12:00", { sillonId: "sl-1" }))).status).toBe(201)
    expect((await crear(sesionesDentales.dueña, nueva("15:00", "16:00", { sillonId: "sl-1" }))).status).toBe(201)
  })

  it("la revisión que vale es la de la transacción, con el sillón trabado", async () => {
    // Entre la primera mirada y la escritura, otra cita tomó el sillón.
    base.prisma.appointment.findMany.mockResolvedValueOnce([])
    const res = await crear(sesionesDentales.dueña, nueva("10:30", "11:30", { sillonId: "sl-1", confirmarAdvertencias: true }))

    expect(res.status).toBe(409)
    expect(citasDeBeto()).toHaveLength(0)
    expect(base.prisma.$executeRaw).toHaveBeenCalled()
  })

  it("el sillón de otra clínica es 404 y no se crea nada", async () => {
    const res = await crear(sesionesDentales.dueña, nueva("11:00", "11:30", { sillonId: "sl-ajeno" }))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: MENSAJE_SILLON_NO_ENCONTRADO })
    expect(citasDeBeto()).toHaveLength(0)
  })

  it("un sillón desactivado es 400", async () => {
    const res = await crear(sesionesDentales.dueña, nueva("11:00", "11:30", { sillonId: "sl-viejo" }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: MENSAJE_SILLON_INACTIVO })
    expect(citasDeBeto()).toHaveLength(0)
  })

  it("en un salón el sillón se ignora y nunca se guarda", async () => {
    base.reiniciar({ ...datosBase(), sillon: [{ id: "sl-1", businessId: NEGOCIO, nombre: "Sillón 1" }] })
    const res = await crear(sesiones.dueña, nueva("11:00", "11:30", { sillonId: "sl-1" }))

    expect(res.status).toBe(201)
    expect(citasDeBeto()[0].sillonId).toBeNull()
  })
})
