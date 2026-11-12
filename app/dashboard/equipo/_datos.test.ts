import { afterEach, describe, expect, it, vi } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { quitarFotoDelMiembro, subirFotoDelMiembro } from "./_datos"

afterEach(() => {
  vi.unstubAllGlobals()
})

const FOTO = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" })

describe("foto del integrante", () => {
  it("sube a la ruta de su membresía, con los bytes crudos y el tipo de la imagen", async () => {
    const fetchFalso = simularRespuesta(json({ url: "/fotos/negocios/n1/miembros/m1.webp" }))
    expect(await subirFotoDelMiembro("m1", FOTO)).toEqual({ ok: true, url: "/fotos/negocios/n1/miembros/m1.webp" })
    const [ruta, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(ruta).toBe("/api/equipo/miembros/m1/foto")
    expect(opciones.method).toBe("PUT")
    expect(opciones.body).toBe(FOTO)
    expect(opciones.headers).toEqual({ "Content-Type": "image/jpeg" })
  })

  it("el id va codificado en la ruta", async () => {
    const fetchFalso = simularRespuesta(json({ url: null }))
    await quitarFotoDelMiembro("a/b c")
    expect((fetchFalso.mock.calls[0] as [string])[0]).toBe("/api/equipo/miembros/a%2Fb%20c/foto")
  })

  it("quitar hace DELETE y devuelve url null", async () => {
    const fetchFalso = simularRespuesta(json({ url: null }))
    expect(await quitarFotoDelMiembro("m1")).toEqual({ ok: true, url: null })
    expect((fetchFalso.mock.calls[0] as [string, RequestInit])[1].method).toBe("DELETE")
  })

  it("un profesional que quiere cambiar la foto de otro recibe el 401 del servidor, con un mensaje que se puede leer", async () => {
    simularRespuesta(json({ error: "No autorizado" }, 401))
    const resultado = await subirFotoDelMiembro("m2", FOTO)
    expect(resultado).toEqual({ ok: false, error: "No autorizado" })
  })

  it("sin red no lanza", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fallo")))
    expect(await subirFotoDelMiembro("m1", FOTO)).toEqual({ ok: false, error: "Sin conexión con el servidor" })
  })
})
