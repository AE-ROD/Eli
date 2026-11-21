import { randomBytes } from "node:crypto"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"

/** La sesión de WhatsApp en la base: cifrada, y cada negocio con la suya. */

process.env.WHATSAPP_TOKEN_KEY = randomBytes(32).toString("base64")

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const sesion = () => import("./sesion")

beforeEach(() => {
  base.reiniciar({
    ...datosBase(),
    canalDeWhatsapp: [
      { id: "canal-1", businessId: NEGOCIO, estado: "conectado", numero: "+56900000001" },
      { id: "canal-2", businessId: OTRO_NEGOCIO, estado: "conectado", numero: "+56900000002" },
    ],
  })
})

describe("sesión de WhatsApp en la base", () => {
  it("las credenciales se guardan cifradas y se leen de vuelta", async () => {
    const { credencialesNuevas, guardarCredenciales, leerCredenciales } = await sesion()
    const credenciales = credencialesNuevas()
    await guardarCredenciales(NEGOCIO, "canal-1", credenciales)
    const [canal] = base.buscar("canalDeWhatsapp", { id: "canal-1" })
    const guardadas = String(canal.credencialesCifradas)
    expect(guardadas).toMatch(/^v1:/)
    expect(guardadas).not.toContain("noiseKey")
    const leidas = leerCredenciales(guardadas)
    expect(Buffer.from(leidas.noiseKey.public).equals(Buffer.from(credenciales.noiseKey.public))).toBe(true)
  })

  it("las llaves: guardar, leer, borrar, y un negocio no lee las del otro", async () => {
    const { llavesEnLaBase } = await sesion()
    const uno = llavesEnLaBase(NEGOCIO, "canal-1")
    await uno.set({ session: { "a.0": new Uint8Array([1, 2, 3]) }, "pre-key": { "5": { private: new Uint8Array([9]), public: new Uint8Array([8]) } } })
    expect(base.buscar("claveDeWhatsapp")).toHaveLength(2)
    expect(base.buscar("claveDeWhatsapp").every((fila) => String(fila.valorCifrado).startsWith("v1:"))).toBe(true)

    const leidas = await uno.get("session", ["a.0", "no-existe"])
    expect(Array.from(leidas["a.0"] as Uint8Array)).toEqual([1, 2, 3])
    expect(leidas["no-existe"]).toBeUndefined()

    // El canal del negocio 1 pedido con el negocio 2: nada.
    expect(await llavesEnLaBase(OTRO_NEGOCIO, "canal-1").get("session", ["a.0"])).toEqual({})

    await uno.set({ session: { "a.0": null } })
    expect(base.buscar("claveDeWhatsapp", { tipo: "session" })).toHaveLength(0)
  })

  it("borrar la sesión borra sólo la del negocio", async () => {
    const { borrarSesion, llavesEnLaBase, guardarCredenciales, credencialesNuevas } = await sesion()
    await llavesEnLaBase(NEGOCIO, "canal-1").set({ session: { x: new Uint8Array([1]) } })
    await llavesEnLaBase(OTRO_NEGOCIO, "canal-2").set({ session: { x: new Uint8Array([2]) } })
    await guardarCredenciales(NEGOCIO, "canal-1", credencialesNuevas())

    await borrarSesion(NEGOCIO, "canal-1")
    expect(base.buscar("claveDeWhatsapp")).toEqual([expect.objectContaining({ businessId: OTRO_NEGOCIO })])
    expect(base.buscar("canalDeWhatsapp", { id: "canal-1" })[0]).toMatchObject({ credencialesCifradas: null, numero: null })
  })
})
