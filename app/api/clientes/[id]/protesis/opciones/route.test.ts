import { beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import type { OpcionesDeProtesisRespuesta } from "@/lib/edicion-de-protesis"
import { conParams, sesionesDentales as sesiones } from "../../../_pruebas/clinica-dental"
import { escenarioDeProtesis } from "../../../_pruebas/protesis"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenarioDeProtesis())
})

async function opciones(sesion: unknown, id = "p-camila") {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return GET(pedido(`http://localhost/api/clientes/${id}/protesis/opciones`), conParams({ id }))
}

describe("GET /api/clientes/[id]/protesis/opciones", () => {
  it("la dueña: materiales activos con precio, unidad y regla; laboratorios activos; ella y los odontólogos de tratante; las excepciones", async () => {
    const res = await opciones(sesiones.dueña)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      materiales: [
        {
          id: "mt-acrilico",
          nombre: "Acrílico termocurado",
          unidad: "arcada",
          tipos: ["removible", "total"],
          precioCents: 18_000_000,
          laboratorioPorDefectoId: "lab-sur",
          reparto: { pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 },
        },
        {
          id: "mt-zirconio",
          nombre: "Zirconio",
          unidad: "pieza",
          tipos: ["fija", "implante", "corona"],
          precioCents: 29_000_000,
          laboratorioPorDefectoId: null,
          reparto: { pbOdontologo: 3500, pbClinica: 2000, pbTecnico: 4500 },
        },
      ],
      laboratorios: [{ id: "lab-sur", nombre: "Laboratorio Sur" }],
      tratantes: [
        { id: "duenio", nombre: "Valentina Soto" },
        { id: "m-perez", nombre: "Diego Pérez" },
        { id: "m-nunez", nombre: "Laura Núñez" },
      ],
      excepciones: [{ memberId: "m-perez", materialId: "mt-zirconio", pbOdontologo: 4000, pbClinica: 1500, pbTecnico: 4500 }],
      puedeEditar: true,
    } satisfies OpcionesDeProtesisRespuesta)
  })

  it("la odontóloga: sólo su parte en cada material (con su excepción), sin reglas ni excepciones, y sólo ella de tratante", async () => {
    const res = await opciones(sesiones.perez)

    expect(res.status).toBe(200)
    const cuerpo = (await res.json()) as OpcionesDeProtesisRespuesta
    expect(cuerpo.materiales.map((m) => [m.id, m.miPartePb])).toEqual([
      ["mt-acrilico", 4000],
      ["mt-zirconio", 4000],
    ])
    expect(cuerpo.tratantes).toEqual([{ id: "m-perez", nombre: "Diego Pérez" }])
    expect(cuerpo).not.toHaveProperty("excepciones")
    expect(JSON.stringify(cuerpo)).not.toMatch(/pbClinica|pbTecnico|reparto/)
  })

  it.each([
    ["el encargado", sesiones.encargado, "p-camila"],
    ["fuera de una clínica dental", sesiones.salon, "p-salon"],
    ["un paciente de otra clínica", sesiones.dueña, "p-ajena"],
  ])("%s: 404", async (_caso, sesion, id) => {
    expect((await opciones(sesion, id)).status).toBe(404)
  })

  it("la otra clínica sólo ve lo suyo", async () => {
    const cuerpo = (await (await opciones(sesiones.dueñaAjena, "p-ajena")).json()) as OpcionesDeProtesisRespuesta
    expect(cuerpo.materiales.map((m) => m.id)).toEqual(["mt-ajeno"])
    expect(cuerpo.laboratorios.map((l) => l.id)).toEqual(["lab-ajeno"])
    expect(cuerpo.excepciones?.map((e) => e.memberId)).toEqual(["m-ajeno"])
  })

  it("sin sesión, 401", async () => {
    expect((await opciones(null)).status).toBe(401)
  })
})
