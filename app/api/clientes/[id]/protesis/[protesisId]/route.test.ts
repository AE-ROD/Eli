import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedido } from "@/pruebas/datos"
import { MENSAJE_CON_ABONOS, type ProtesisRespuesta } from "@/lib/edicion-de-protesis"
import { MENSAJE_PASO_DE_OTRO_TIPO, MENSAJE_PROTESIS_CERRADA, MENSAJE_SOLO_AVANZA } from "@/lib/protesis"
import { conParams, sesionesDentales as sesiones } from "../../../_pruebas/clinica-dental"
import { conAbono, escenarioDeProtesis } from "../../../_pruebas/protesis"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const AHORA = new Date("2026-11-08T15:00:00.000Z")

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenarioDeProtesis())
})

afterEach(() => {
  vi.useRealTimers()
})

async function cambiar(sesion: unknown, protesisId: string, cuerpo: unknown, id = "p-camila") {
  const { PATCH } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PATCH(pedido(`http://localhost/api/clientes/${id}/protesis/${protesisId}`, cuerpo), conParams({ id, protesisId }))
}

const guardada = (id: string) => base.buscar("protesis", { id })[0]
const eventosDe = (id: string) => base.buscar("eventoDeProtesis", { protesisId: id }).map((evento) => evento.estado)

describe("PATCH /api/clientes/[id]/protesis/[protesisId]", () => {
  it("avanza al paso siguiente de su tipo y deja el evento con fecha y autor", async () => {
    const res = await cambiar(sesiones.perez, "pt-removible", { estado: "enfilado" })

    expect(res.status).toBe(200)
    const protesis = (await res.json()) as ProtesisRespuesta
    expect(protesis).toMatchObject({ estado: "enfilado", siguienteEstado: "entregada" })
    expect(protesis.eventos.at(-1)).toEqual({ estado: "enfilado", autorNombre: "Diego Pérez", createdAt: AHORA.toISOString() })
    expect(protesis.etapas.map((etapa) => [etapa.id, etapa.situacion])).toEqual([
      ["impresion", "hecha"],
      ["rodete", "hecha"],
      ["enfilado", "actual"],
      ["entregada", "pendiente"],
    ])
    expect(protesis.etapas[2]).toMatchObject({ fecha: AHORA.toISOString(), autorNombre: "Diego Pérez" })
    expect(eventosDe("pt-removible")).toEqual(["impresion", "rodete", "enfilado"])
  })

  it("una corona va de la toma de impresión a la prueba, sin laboratorio: el laboratorio ya no es un paso", async () => {
    const res = await cambiar(sesiones.nunez, "pt-corona", { estado: "prueba" })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ estado: "prueba", siguienteEstado: "entregada", laboratorio: null })
    expect(eventosDe("pt-corona")).toEqual(["impresion", "prueba"])
  })

  it.each([
    ["una corona a la prueba de rodete", "pt-corona", "rodete"],
    ["una corona a la prueba de enfilado", "pt-corona", "enfilado"],
    ["una removible a la prueba (de fija)", "pt-removible", "prueba"],
  ])("un paso que no es de su tipo (%s): 400 y no escribe nada", async (_caso, protesisId, estado) => {
    const antes = base.volcado()
    const res = await cambiar(sesiones.dueña, protesisId, { estado })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: MENSAJE_PASO_DE_OTRO_TIPO })
    expect(base.volcado()).toEqual(antes)
  })

  it("se puede saltar un paso; entregar fija la fecha de entrega y ya no cambia más", async () => {
    const res = await cambiar(sesiones.dueña, "pt-removible", { estado: "entregada" })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ estado: "entregada", entregadaEn: AHORA.toISOString(), siguienteEstado: null })
    expect(guardada("pt-removible")).toMatchObject({ estado: "entregada", entregadaEn: AHORA })

    for (const cuerpo of [{ estado: "anulada" }, { laboratorioId: null }, { entregaEstimada: "2026-12-24" }, { tono: "A1" }, { tono: null }]) {
      const otra = await cambiar(sesiones.dueña, "pt-removible", cuerpo)
      expect(otra.status).toBe(409)
      expect(await otra.json()).toEqual({ error: MENSAJE_PROTESIS_CERRADA })
    }
  })

  it("sólo hacia adelante: volver a un paso anterior es 409 y no escribe nada", async () => {
    const antes = base.volcado()
    const res = await cambiar(sesiones.dueña, "pt-removible", { estado: "impresion" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_SOLO_AVANZA })
    expect(base.volcado()).toEqual(antes)
  })

  it("pedir el paso en que ya está no es un cambio: no falla ni duplica el evento (doble clic)", async () => {
    expect((await cambiar(sesiones.dueña, "pt-removible", { estado: "rodete" })).status).toBe(200)
    expect(eventosDe("pt-removible")).toEqual(["impresion", "rodete"])
  })

  it("el laboratorio, la entrega estimada y el tono se cambian en el mismo pedido que un paso, o solos", async () => {
    const res = await cambiar(sesiones.nunez, "pt-corona", { estado: "prueba", laboratorioId: "lab-sur", entregaEstimada: "2026-11-30", tono: "C2" })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      estado: "prueba",
      laboratorio: { id: "lab-sur", nombre: "Laboratorio Sur", contacto: "+56 9 1111 2222" },
      entregaEstimada: "2026-11-30",
      tono: { id: "C2", etiqueta: "C2", grupo: "C" },
    })
  })

  it("cambia el laboratorio, la entrega estimada o el tono sin tocar el estado ni dejar evento", async () => {
    const res = await cambiar(sesiones.dueña, "pt-removible", { entregaEstimada: null })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ estado: "rodete", entregaEstimada: null })

    const otroTono = await cambiar(sesiones.perez, "pt-removible", { tono: "D4" })
    expect(otroTono.status).toBe(200)
    expect(await otroTono.json()).toMatchObject({ estado: "rodete", tono: { id: "D4", etiqueta: "D4" } })
    expect(guardada("pt-removible")).toMatchObject({ tono: "D4" })

    const sinTono = await cambiar(sesiones.perez, "pt-removible", { tono: null })
    expect(await sinTono.json()).toMatchObject({ tono: null })
    expect(eventosDe("pt-removible")).toEqual(["impresion", "rodete"])
  })

  it("un laboratorio desactivado es 400; uno de otra clínica, 404", async () => {
    expect((await cambiar(sesiones.dueña, "pt-corona", { laboratorioId: "lab-viejo" })).status).toBe(400)
    expect((await cambiar(sesiones.dueña, "pt-corona", { laboratorioId: "lab-ajeno" })).status).toBe(404)
    expect(guardada("pt-corona")).toMatchObject({ laboratorioId: null })
  })

  it("anular antes de entregar registra cuándo y quién; anulada ya no cambia", async () => {
    const res = await cambiar(sesiones.nunez, "pt-corona", { estado: "anulada" })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ estado: "anulada", anuladaEn: AHORA.toISOString(), anuladaPorNombre: "Laura Núñez", siguienteEstado: null })
    expect(eventosDe("pt-corona")).toEqual(["impresion", "anulada"])
    expect((await cambiar(sesiones.nunez, "pt-corona", { estado: "prueba" })).status).toBe(409)
  })

  it.each(["finalizada", "en-espera"])("con un abono (atención %s) no se anula: 409", async (status) => {
    base.reiniciar(conAbono(escenarioDeProtesis(), "pt-removible", 5_000_000, status))
    const res = await cambiar(sesiones.dueña, "pt-removible", { estado: "anulada" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: MENSAJE_CON_ABONOS })
    expect(guardada("pt-removible")).toMatchObject({ estado: "rodete", anuladaEn: null })
  })

  it("el abono de una atención anulada no cuenta", async () => {
    base.reiniciar(conAbono(escenarioDeProtesis(), "pt-removible", 5_000_000, "anulada"))
    expect((await cambiar(sesiones.dueña, "pt-removible", { estado: "anulada" })).status).toBe(200)
  })

  it.each([
    ["un estado que no existe", { estado: "perdida" }],
    ["un paso que ya no existe", { estado: "en-laboratorio" }],
    ["un tono fuera de la guía", { tono: "A3,5" }],
    ["nada que cambiar", {}],
    ["una fecha mal escrita", { entregaEstimada: "30/11/2026" }],
  ])("%s: 400", async (_caso, cuerpo) => {
    expect((await cambiar(sesiones.dueña, "pt-removible", cuerpo)).status).toBe(400)
  })

  it.each([
    ["una prótesis de otro paciente de la clínica", sesiones.dueña, "pt-beto", "p-camila"],
    ["una prótesis de otra clínica", sesiones.dueña, "pt-ajena", "p-camila"],
    ["una que no existe", sesiones.dueña, "pt-nada", "p-camila"],
    ["el encargado", sesiones.encargado, "pt-removible", "p-camila"],
    ["fuera de una clínica dental", sesiones.salon, "pt-removible", "p-salon"],
    ["la dueña de otra clínica", sesiones.dueñaAjena, "pt-removible", "p-camila"],
  ])("%s: 404 y no escribe nada", async (_caso, sesion, protesisId, id) => {
    const antes = base.volcado()
    expect((await cambiar(sesion, protesisId, { estado: "enfilado" }, id)).status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin sesión, 401", async () => {
    expect((await cambiar(null, "pt-removible", { estado: "prueba" })).status).toBe(401)
  })
})
