import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 19 }))
vi.mock("@/lib/rate-limit", () => ({ verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args) }))

vi.mock("@/lib/registro-de-errores", () => ({ registrarError: vi.fn() }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/servicios/categorias"

async function cambiar(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, cuerpo))
}

/** La categoría de cada servicio, por id. */
const categorias = (negocio = NEGOCIO) =>
  Object.fromEntries(base.buscar("service", { businessId: negocio }).map((s) => [s.id as string, s.category]))

beforeEach(() => {
  vi.clearAllMocks()
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 19 })
  base.reiniciar({
    ...datosBase(),
    service: [
      { id: "s-1", businessId: NEGOCIO, name: "Corte de pelo", category: "Corte" },
      { id: "s-2", businessId: NEGOCIO, name: "Corte de puntas", category: "corte" },
      { id: "s-3", businessId: NEGOCIO, name: "Corte infantil", category: "  CORTÉ " },
      { id: "s-4", businessId: NEGOCIO, name: "Tintura", category: "Color" },
      { id: "s-5", businessId: NEGOCIO, name: "Brushing", category: null },
      { id: "s-6", businessId: NEGOCIO, name: "Peinado", category: "" },
      { id: "s-7", businessId: NEGOCIO, name: "Alisado", category: "Corte", active: false },
      { id: "s-ajeno", businessId: OTRO_NEGOCIO, name: "Corte", category: "Corte" },
    ],
  })
})

describe("POST /api/configuracion/servicios/categorias", () => {
  describe("quién puede", () => {
    it("sin sesión, 401", async () => {
      const antes = base.volcado()
      expect((await cambiar(null, { de: "Corte", a: "Cabello" })).status).toBe(401)
      expect(base.volcado()).toEqual(antes)
    })

    it.each([
      ["un profesional", sesiones.carla],
      ["un profesional sin miembro", sesiones.sinMiembro],
    ])("%s recibe 401, no gasta el cupo y no cambia nada", async (_quien, sesion) => {
      const antes = base.volcado()

      const res = await cambiar(sesion, { de: "Corte", a: "Cabello" })

      expect(res.status).toBe(401)
      expect(base.volcado()).toEqual(antes)
      expect(mockVerificarLimite).not.toHaveBeenCalled()
    })

    it.each([
      ["la dueña", sesiones.dueña],
      ["el encargado", sesiones.encargado],
    ])("%s renombra una categoría", async (_quien, sesion) => {
      const res = await cambiar(sesion, { de: "Color", a: "Tintes" })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ actualizados: 1 })
    })
  })

  describe("renombrar y unir", () => {
    it("renombra: todos los de esa categoría, sin mayúsculas, tildes ni espacios de más (incluso los desactivados)", async () => {
      const res = await cambiar(sesiones.dueña, { de: "corte", a: "Cabello" })

      expect(await res.json()).toEqual({ actualizados: 4 })
      expect(categorias()).toEqual({
        "s-1": "Cabello",
        "s-2": "Cabello",
        "s-3": "Cabello",
        "s-4": "Color",
        "s-5": null,
        "s-6": "",
        "s-7": "Cabello",
      })
    })

    it("une: pasar una categoría a otra que ya existe deja a todos juntos, con la `a` tal como llegó", async () => {
      await cambiar(sesiones.dueña, { de: "Color", a: "corte" })

      const lista = Object.values(categorias())
      expect(lista.filter((c) => c === "corte")).toHaveLength(2)
      expect(categorias()["s-4"]).toBe("corte")
    })

    it("recorta la categoría nueva", async () => {
      await cambiar(sesiones.dueña, { de: "Color", a: "   Tintes  " })

      expect(categorias()["s-4"]).toBe("Tintes")
    })

    it("cambiar sólo mayúsculas o tildes es un renombre válido: 'corte' pasa a 'Corte'", async () => {
      const res = await cambiar(sesiones.dueña, { de: "Corte", a: "Corte" })

      // Los que ya estaban escritos exactamente así no cambian; el resto sí.
      expect(await res.json()).toEqual({ actualizados: 2 })
      expect(Object.entries(categorias()).filter(([, c]) => c === "Corte").map(([id]) => id)).toEqual(["s-1", "s-2", "s-3", "s-7"])
    })

    it("quitar la categoría: `a` en null (o vacío) deja a los servicios sin categoría", async () => {
      const res = await cambiar(sesiones.dueña, { de: "Corte", a: null })

      expect(await res.json()).toEqual({ actualizados: 4 })
      expect(categorias()).toMatchObject({ "s-1": null, "s-2": null, "s-3": null, "s-7": null, "s-4": "Color" })

      await cambiar(sesiones.dueña, { de: "Color", a: "   " })
      expect(categorias()["s-4"]).toBeNull()
    })

    it("`de` en null agrupa a los servicios sin categoría (null o vacía) y les pone una", async () => {
      const res = await cambiar(sesiones.dueña, { de: null, a: "General" })

      expect(await res.json()).toEqual({ actualizados: 2 })
      expect(categorias()).toMatchObject({ "s-5": "General", "s-6": "General", "s-1": "Corte" })
    })

    it("`de` vacío es lo mismo que null", async () => {
      const res = await cambiar(sesiones.dueña, { de: "  ", a: "General" })

      expect(await res.json()).toEqual({ actualizados: 2 })
    })

    it("de una categoría a ella misma escrita igual no cambia nada y no escribe", async () => {
      const antes = base.volcado()
      base.prisma.service.updateMany.mockClear()

      expect(await (await cambiar(sesiones.dueña, { de: "Color", a: "Color" })).json()).toEqual({ actualizados: 0 })
      expect(base.volcado()).toEqual(antes)
      expect(base.prisma.service.updateMany).not.toHaveBeenCalled()
    })

    it("de sin categoría a sin categoría sólo normaliza las que quedaron como texto vacío", async () => {
      const res = await cambiar(sesiones.dueña, { de: null, a: null })

      expect(await res.json()).toEqual({ actualizados: 1 })
      expect(categorias()).toMatchObject({ "s-5": null, "s-6": null })
    })

    it("una categoría que no existe: 200 con cero y no escribe", async () => {
      const antes = base.volcado()
      base.prisma.service.updateMany.mockClear()

      const res = await cambiar(sesiones.dueña, { de: "Inventada", a: "Otra" })

      expect(await res.json()).toEqual({ actualizados: 0 })
      expect(base.volcado()).toEqual(antes)
      expect(base.prisma.service.updateMany).not.toHaveBeenCalled()
    })

    it("sólo cambia la categoría: el resto del servicio queda igual", async () => {
      const antes = base.buscar("service", { id: "s-1" })[0]

      await cambiar(sesiones.dueña, { de: "Corte", a: "Cabello" })

      const despues = base.buscar("service", { id: "s-1" })[0]
      expect({ ...despues, category: antes.category, updatedAt: antes.updatedAt }).toEqual(antes)
    })
  })

  describe("aislamiento", () => {
    it("no toca los servicios de otro negocio con la misma categoría", async () => {
      await cambiar(sesiones.dueña, { de: "Corte", a: "Cabello" })

      expect(categorias(OTRO_NEGOCIO)).toEqual({ "s-ajeno": "Corte" })
    })

    it("el negocio sale de la sesión: la dueña del otro negocio sólo cambia los suyos", async () => {
      const res = await cambiar(sesiones.dueñoAjeno, { businessId: NEGOCIO, de: "Corte", a: "Mío" })

      expect(await res.json()).toEqual({ actualizados: 1 })
      expect(categorias(OTRO_NEGOCIO)).toEqual({ "s-ajeno": "Mío" })
      expect(categorias()["s-1"]).toBe("Corte")
    })
  })

  describe("validación", () => {
    it.each([
      ["una categoría nueva de 41 caracteres", { de: "Corte", a: "a".repeat(41) }, "La categoría no puede tener más de 40 caracteres"],
      ["sin `a`", { de: "Corte" }, "Datos inválidos"],
      ["sin `de`", { a: "Cabello" }, "Datos inválidos"],
      ["un cuerpo vacío", {}, "Datos inválidos"],
      ["`de` que no es texto", { de: 5, a: "X" }, "Datos inválidos"],
      ["`a` que no es texto", { de: "Corte", a: ["X"] }, "Datos inválidos"],
      ["`a` indefinido", { de: "Corte", a: undefined }, "Datos inválidos"],
    ])("%s: 400 y no cambia nada", async (_caso, cuerpo, mensaje) => {
      const antes = base.volcado()

      const res = await cambiar(sesiones.dueña, cuerpo)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: mensaje })
      expect(base.volcado()).toEqual(antes)
    })

    it("acepta una categoría nueva de 40 caracteres", async () => {
      const res = await cambiar(sesiones.dueña, { de: "Color", a: "a".repeat(40) })

      expect(await res.json()).toEqual({ actualizados: 1 })
    })

    it("un JSON roto es 400 y un cuerpo enorme es 413", async () => {
      expect((await cambiar(sesiones.dueña, "{ no")).status).toBe(400)
      expect((await cambiar(sesiones.dueña, "x".repeat(200 * 1024))).status).toBe(413)
    })
  })

  describe("límite de escrituras masivas", () => {
    it("cuenta por usuario en el balde de escrituras masivas", async () => {
      await cambiar(sesiones.encargado, { de: "Color", a: "Tintes" })

      expect(mockVerificarLimite).toHaveBeenCalledWith("serviciosEnLote", "usuario:u-encargado")
    })

    it("pasado el límite, 429 y no cambia nada", async () => {
      mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
      const antes = base.volcado()

      const res = await cambiar(sesiones.dueña, { de: "Color", a: "Tintes" })

      expect(res.status).toBe(429)
      expect(base.volcado()).toEqual(antes)
    })
  })
})
