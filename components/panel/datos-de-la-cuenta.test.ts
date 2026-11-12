import { afterEach, describe, expect, it, vi } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { quitarFotoDeLaCuenta, RUTA_DE_LA_FOTO_DE_LA_CUENTA, subirFotoDeLaCuenta } from "./datos-de-la-cuenta"

afterEach(() => {
  vi.unstubAllGlobals()
})

const FOTO = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" })

describe("foto de la cuenta", () => {
  it("la ruta no lleva ningún id: la cuenta sale de la sesión", () => {
    expect(RUTA_DE_LA_FOTO_DE_LA_CUENTA).toBe("/api/cuenta/foto")
  })

  it("sube con los bytes crudos y el tipo de la imagen, y devuelve la URL", async () => {
    const fetchFalso = simularRespuesta(json({ url: "/fotos/usuarios/u1/cuenta-x.webp" }))

    expect(await subirFotoDeLaCuenta(FOTO)).toEqual({ ok: true, url: "/fotos/usuarios/u1/cuenta-x.webp" })

    const [ruta, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(ruta).toBe("/api/cuenta/foto")
    expect(opciones.method).toBe("PUT")
    expect(opciones.body).toBe(FOTO)
    expect(opciones.headers).toEqual({ "Content-Type": "image/webp" })
  })

  it("quitar hace DELETE y devuelve url null", async () => {
    const fetchFalso = simularRespuesta(json({ url: null }))

    expect(await quitarFotoDeLaCuenta()).toEqual({ ok: true, url: null })

    const [ruta, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(ruta).toBe("/api/cuenta/foto")
    expect(opciones.method).toBe("DELETE")
  })

  it("sin sesión (401) o sin red no lanza: devuelve un mensaje que se puede leer", async () => {
    simularRespuesta(json({ error: "No autorizado" }, 401))
    expect(await subirFotoDeLaCuenta(FOTO)).toEqual({ ok: false, error: "No autorizado" })

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fallo")))
    expect(await quitarFotoDeLaCuenta()).toEqual({ ok: false, error: "Sin conexión con el servidor" })
  })
})
