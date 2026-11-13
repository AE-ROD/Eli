import { beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import {
  MENSAJE_EXCEPCION_REPETIDA,
  MENSAJE_MATERIAL_REPETIDO,
  MENSAJE_REPARTO_INCOMPLETO,
  MENSAJE_REPARTO_NO_SUMA,
  MENSAJE_TRATANTE_NO_ODONTOLOGO,
  type ExcepcionRespuesta,
  type MaterialRespuesta,
} from "@/lib/edicion-de-protesis"
import { CLINICA, conParams, sesionesDentales as sesiones } from "@/app/api/clientes/_pruebas/clinica-dental"
import { escenarioDeProtesis } from "@/app/api/clientes/_pruebas/protesis"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/comisiones/protesis"

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenarioDeProtesis())
})

async function conSesion<T>(sesion: unknown, llamada: () => Promise<T>): Promise<T> {
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return llamada()
}

const materiales = {
  listar: async (sesion: unknown) => conSesion(sesion, async () => (await import("./materiales/route")).GET()),
  crear: async (sesion: unknown, cuerpo: unknown) =>
    conSesion(sesion, async () => (await import("./materiales/route")).POST(pedido(`${URL}/materiales`, cuerpo))),
  editar: async (sesion: unknown, id: string, cuerpo: unknown) =>
    conSesion(sesion, async () => (await import("./materiales/[id]/route")).PATCH(pedido(`${URL}/materiales/${id}`, cuerpo), conParams({ id }))),
}

const excepciones = {
  listar: async (sesion: unknown) => conSesion(sesion, async () => (await import("./excepciones/route")).GET()),
  crear: async (sesion: unknown, cuerpo: unknown) =>
    conSesion(sesion, async () => (await import("./excepciones/route")).POST(pedido(`${URL}/excepciones`, cuerpo))),
  editar: async (sesion: unknown, id: string, cuerpo: unknown) =>
    conSesion(sesion, async () => (await import("./excepciones/[id]/route")).PATCH(pedido(`${URL}/excepciones/${id}`, cuerpo), conParams({ id }))),
  borrar: async (sesion: unknown, id: string) =>
    conSesion(sesion, async () => (await import("./excepciones/[id]/route")).DELETE(pedido(`${URL}/excepciones/${id}`), conParams({ id }))),
}

const auditoria = () => base.buscar("cambioDeRepartoDeProtesis", { businessId: CLINICA })

const zirconia = {
  nombre: "Disilicato de litio",
  unidad: "pieza",
  tipos: ["corona", "fija"],
  precioCents: 25_000_000,
  pbOdontologo: 4000,
  pbClinica: 2500,
  pbTecnico: 3500,
}

describe("materiales", () => {
  it("GET: la dueña ve los de su clínica, activos e inactivos, en orden, con la regla y el laboratorio por defecto", async () => {
    const res = await materiales.listar(sesiones.dueña)

    expect(res.status).toBe(200)
    const lista = (await res.json()) as MaterialRespuesta[]
    expect(lista.map((m) => m.id)).toEqual(["mt-acrilico", "mt-zirconio", "mt-viejo"])
    expect(lista[0]).toEqual({
      id: "mt-acrilico",
      nombre: "Acrílico termocurado",
      unidad: "arcada",
      tipos: ["removible", "total"],
      precioCents: 18_000_000,
      pbOdontologo: 4000,
      pbClinica: 3000,
      pbTecnico: 3000,
      laboratorioPorDefecto: { id: "lab-sur", nombre: "Laboratorio Sur" },
      orden: 1,
      activo: true,
    })
  })

  it("POST: la dueña crea uno al final y su regla inicial queda en la auditoría", async () => {
    const res = await materiales.crear(sesiones.dueña, { ...zirconia, laboratorioPorDefectoId: "lab-sur" })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ nombre: "Disilicato de litio", tipos: ["fija", "corona"], orden: 4, laboratorioPorDefecto: { id: "lab-sur" } })
    expect(auditoria()).toEqual([
      expect.objectContaining({
        scope: "material",
        materialNombre: "Disilicato de litio",
        anteriorPbOdontologo: null,
        nuevoPbOdontologo: 4000,
        nuevoPbClinica: 2500,
        nuevoPbTecnico: 3500,
        changedById: "u-duena",
        changedByName: "Valentina Soto",
        changedByEmail: "valentina@aurora.test",
      }),
    ])
  })

  it.each([
    ["un reparto que no suma 100 %", { ...zirconia, pbTecnico: 3499 }, MENSAJE_REPARTO_NO_SUMA],
    ["tipos que no son de su unidad", { ...zirconia, unidad: "arcada" }, "removible o total"],
    ["sin tipos", { ...zirconia, tipos: [] }, "al menos un tipo"],
    ["puntos base con decimales", { ...zirconia, pbOdontologo: 4000.5, pbClinica: 2499.5 }, "enteros"],
    ["un precio negativo", { ...zirconia, precioCents: -1 }, "negativo"],
  ])("POST con %s: 400", async (_caso, cuerpo, error) => {
    const res = await materiales.crear(sesiones.dueña, cuerpo)
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain(error)
    expect(auditoria()).toEqual([])
  })

  it("POST con un nombre que ya existe (sin mayúsculas) es 409; con el laboratorio de otra clínica, 404; desactivado, 400", async () => {
    const repetido = await materiales.crear(sesiones.dueña, { ...zirconia, nombre: "zirconio" })
    expect(repetido.status).toBe(409)
    expect(await repetido.json()).toEqual({ error: MENSAJE_MATERIAL_REPETIDO })
    expect((await materiales.crear(sesiones.dueña, { ...zirconia, laboratorioPorDefectoId: "lab-ajeno" })).status).toBe(404)
    expect((await materiales.crear(sesiones.dueña, { ...zirconia, laboratorioPorDefectoId: "lab-viejo" })).status).toBe(400)
    expect(base.buscar("materialDeProtesis", { businessId: CLINICA })).toHaveLength(3)
  })

  it("PATCH del reparto: queda en la auditoría con el antes y el después, y las prótesis ya creadas NO cambian", async () => {
    const protesisAntes = base.buscar("protesis")
    const res = await materiales.editar(sesiones.dueña, "mt-acrilico", { pbOdontologo: 5000, pbClinica: 2000, pbTecnico: 3000, precioCents: 20_000_000 })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ pbOdontologo: 5000, pbClinica: 2000, pbTecnico: 3000, precioCents: 20_000_000 })
    expect(auditoria()).toEqual([
      expect.objectContaining({
        scope: "material",
        materialId: "mt-acrilico",
        anteriorPbOdontologo: 4000,
        anteriorPbClinica: 3000,
        anteriorPbTecnico: 3000,
        nuevoPbOdontologo: 5000,
        nuevoPbClinica: 2000,
        nuevoPbTecnico: 3000,
      }),
    ])
    // El reparto y el precio congelados en cada prótesis siguen como estaban.
    expect(base.buscar("protesis")).toEqual(protesisAntes)
    expect(base.buscar("protesis", { id: "pt-removible" })[0]).toMatchObject({ pbOdontologo: 4000, precioUnitarioCents: 18_000_000, valorCents: 18_000_000 })
  })

  it("PATCH sin cambiar el reparto no audita; con una sola parte, 400", async () => {
    expect((await materiales.editar(sesiones.dueña, "mt-acrilico", { precioCents: 1, activo: false, orden: 9 })).status).toBe(200)
    expect((await materiales.editar(sesiones.dueña, "mt-acrilico", { pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 })).status).toBe(200)
    expect(auditoria()).toEqual([])
    const res = await materiales.editar(sesiones.dueña, "mt-acrilico", { pbOdontologo: 5000 })
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain(MENSAJE_REPARTO_INCOMPLETO)
  })

  it("PATCH de la unidad valida los tipos como quedan", async () => {
    expect((await materiales.editar(sesiones.dueña, "mt-acrilico", { unidad: "pieza" })).status).toBe(400)
    expect((await materiales.editar(sesiones.dueña, "mt-acrilico", { unidad: "pieza", tipos: ["corona"] })).status).toBe(200)
  })

  it.each([
    ["uno de otra clínica", sesiones.dueña, "mt-ajeno", 404],
    ["el encargado (no los ve)", sesiones.encargado, "mt-acrilico", 404],
    ["un odontólogo (los ve en la ficha, no los configura)", sesiones.perez, "mt-acrilico", 401],
    ["fuera de una clínica dental", sesiones.salon, "mt-acrilico", 404],
    ["sin sesión", null, "mt-acrilico", 401],
  ])("PATCH de %s: %i y no cambia nada", async (_caso, sesion, id, status) => {
    const antes = base.volcado()
    expect((await materiales.editar(sesion, id, { precioCents: 1 })).status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["el encargado", sesiones.encargado, 401],
    ["un odontólogo", sesiones.perez, 401],
    ["fuera de una clínica dental", sesiones.salon, 404],
    ["sin sesión", null, 401],
  ])("GET y POST de %s: %i", async (_quien, sesion, status) => {
    expect((await materiales.listar(sesion)).status).toBe(status)
    expect((await materiales.crear(sesion, zirconia)).status).toBe(status)
    expect(base.buscar("materialDeProtesis", { businessId: CLINICA })).toHaveLength(3)
  })
})

describe("excepciones", () => {
  it("GET: la dueña ve las de su clínica con los nombres", async () => {
    const res = await excepciones.listar(sesiones.dueña)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      {
        id: "ex-perez",
        memberId: "m-perez",
        memberNombre: "Diego Pérez",
        materialId: "mt-zirconio",
        materialNombre: "Zirconio",
        pbOdontologo: 4000,
        pbClinica: 1500,
        pbTecnico: 4500,
      },
    ] satisfies ExcepcionRespuesta[])
  })

  it("POST crea la regla de un odontólogo en un material y la audita; repetida, 409", async () => {
    const res = await excepciones.crear(sesiones.dueña, { memberId: "m-nunez", materialId: "mt-acrilico", pbOdontologo: 4500, pbClinica: 2500, pbTecnico: 3000 })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ memberNombre: "Laura Núñez", materialNombre: "Acrílico termocurado", pbOdontologo: 4500 })
    expect(auditoria()).toEqual([
      expect.objectContaining({ scope: "excepcion", memberId: "m-nunez", memberName: "Laura Núñez", anteriorPbOdontologo: null, nuevoPbOdontologo: 4500 }),
    ])

    const repetida = await excepciones.crear(sesiones.dueña, { memberId: "m-perez", materialId: "mt-zirconio", pbOdontologo: 1, pbClinica: 1, pbTecnico: 9998 })
    expect(repetida.status).toBe(409)
    expect(await repetida.json()).toEqual({ error: MENSAJE_EXCEPCION_REPETIDA })
  })

  it.each([
    ["un miembro de otra clínica", { memberId: "m-ajeno", materialId: "mt-acrilico" }],
    ["un material de otra clínica", { memberId: "m-nunez", materialId: "mt-ajeno" }],
  ])("POST con %s: 404", async (_caso, ids) => {
    expect((await excepciones.crear(sesiones.dueña, { ...ids, pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 })).status).toBe(404)
    expect(base.buscar("excepcionDeRepartoDeProtesis", { businessId: CLINICA })).toHaveLength(1)
  })

  it("POST para un miembro que no es odontólogo (el encargado), 400: la excepción es de una tratante", async () => {
    const res = await excepciones.crear(sesiones.dueña, { memberId: "m-recepcion", materialId: "mt-acrilico", pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: MENSAJE_TRATANTE_NO_ODONTOLOGO })
    expect(base.buscar("excepcionDeRepartoDeProtesis", { businessId: CLINICA })).toHaveLength(1)
    expect(auditoria()).toEqual([])
  })

  it("POST con un reparto que no suma, 400", async () => {
    expect((await excepciones.crear(sesiones.dueña, { memberId: "m-nunez", materialId: "mt-acrilico", pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 2000 })).status).toBe(400)
  })

  it("PATCH cambia la regla y la audita; las prótesis ya creadas no cambian", async () => {
    const protesisAntes = base.buscar("protesis")
    const res = await excepciones.editar(sesiones.dueña, "ex-perez", { pbOdontologo: 5000, pbClinica: 500, pbTecnico: 4500 })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: "ex-perez", pbOdontologo: 5000, pbClinica: 500 })
    expect(auditoria()).toEqual([
      expect.objectContaining({ scope: "excepcion", anteriorPbOdontologo: 4000, anteriorPbClinica: 1500, nuevoPbOdontologo: 5000, nuevoPbClinica: 500 }),
    ])
    expect(base.buscar("protesis")).toEqual(protesisAntes)
  })

  it("DELETE la quita y lo audita (sin regla nueva)", async () => {
    const res = await excepciones.borrar(sesiones.dueña, "ex-perez")

    expect(res.status).toBe(200)
    expect(base.buscar("excepcionDeRepartoDeProtesis", { businessId: CLINICA })).toEqual([])
    expect(auditoria()).toEqual([
      expect.objectContaining({ scope: "excepcion", memberName: "Diego Pérez", anteriorPbOdontologo: 4000, nuevoPbOdontologo: null, nuevoPbClinica: null }),
    ])
  })

  it.each([
    ["una de otra clínica", sesiones.dueña, "ex-ajena", 404],
    ["el encargado", sesiones.encargado, "ex-perez", 404],
    ["el odontólogo de la excepción (la ve, no la configura)", sesiones.perez, "ex-perez", 401],
    ["otro odontólogo (no la ve)", sesiones.nunez, "ex-perez", 404],
    ["fuera de una clínica dental", sesiones.salon, "ex-perez", 404],
    ["sin sesión", null, "ex-perez", 401],
  ])("PATCH y DELETE de %s: %i y no cambia nada", async (_caso, sesion, id, status) => {
    const antes = base.volcado()
    expect((await excepciones.editar(sesion, id, { pbOdontologo: 0, pbClinica: 10_000, pbTecnico: 0 })).status).toBe(status)
    expect((await excepciones.borrar(sesion, id)).status).toBe(status)
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["el encargado", sesiones.encargado, 401],
    ["un odontólogo", sesiones.perez, 401],
    ["fuera de una clínica dental", sesiones.salon, 404],
    ["sin sesión", null, 401],
  ])("GET y POST de %s: %i", async (_quien, sesion, status) => {
    expect((await excepciones.listar(sesion)).status).toBe(status)
    expect((await excepciones.crear(sesion, { memberId: "m-nunez", materialId: "mt-acrilico", pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 })).status).toBe(status)
  })
})
