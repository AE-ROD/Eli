import { afterEach, describe, expect, it, vi } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { enviarFoto, mensajeDeErrorDeFoto, pedirQuitarFoto } from "./enviar-foto"

afterEach(() => {
  vi.unstubAllGlobals()
})

const FOTO = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" })

describe("mensajeDeErrorDeFoto", () => {
  it("el mensaje del servidor gana sobre el del código", () => {
    expect(mensajeDeErrorDeFoto(400, "La imagen está dañada.", "subir")).toBe("La imagen está dañada.")
    expect(mensajeDeErrorDeFoto(503, "  El almacenamiento no está configurado.  ", "subir")).toBe(
      "El almacenamiento no está configurado."
    )
  })

  it.each([400, 401, 404, 413, 429, 503])("sin mensaje del servidor, el %i tiene uno propio en español", (codigo) => {
    const mensaje = mensajeDeErrorDeFoto(codigo, "", "subir")
    expect(mensaje.length).toBeGreaterThan(10)
    expect(mensaje).not.toMatch(/^No se pudo (guardar|quitar) la foto\.$/)
  })

  it("el 401 habla de la sesión y el 429 de esperar", () => {
    expect(mensajeDeErrorDeFoto(401, "", "subir")).toMatch(/sesión/)
    expect(mensajeDeErrorDeFoto(429, "", "subir")).toMatch(/Espera/)
  })

  it("un 500 no muestra el «Error interno» del servidor", () => {
    expect(mensajeDeErrorDeFoto(500, "Error interno", "subir")).toBe("No se pudo guardar la foto.")
    expect(mensajeDeErrorDeFoto(502, "No pudimos guardar la foto. Intenta de nuevo en un momento.", "subir")).toBe(
      "No pudimos guardar la foto. Intenta de nuevo en un momento."
    )
  })

  it("lo demás dice qué no se pudo hacer: guardar o quitar", () => {
    expect(mensajeDeErrorDeFoto(500, "", "subir")).toBe("No se pudo guardar la foto.")
    expect(mensajeDeErrorDeFoto(500, "   ", "quitar")).toBe("No se pudo quitar la foto.")
    expect(mensajeDeErrorDeFoto(null, "", "subir")).toBe("No se pudo guardar la foto.")
  })
})

describe("enviarFoto", () => {
  it("manda los bytes crudos con PUT y el tipo de la imagen, y devuelve la URL", async () => {
    const fetchFalso = simularRespuesta(json({ url: "/fotos/negocios/n1/a.webp" }))
    const resultado = await enviarFoto("/api/configuracion/fotos/logo", FOTO)
    expect(resultado).toEqual({ ok: true, url: "/fotos/negocios/n1/a.webp" })
    const [ruta, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(ruta).toBe("/api/configuracion/fotos/logo")
    expect(opciones.method).toBe("PUT")
    expect(opciones.body).toBe(FOTO)
    expect(opciones.headers).toEqual({ "Content-Type": "image/webp" })
  })

  it("muestra el mensaje del servidor cuando viene", async () => {
    simularRespuesta(json({ error: "La imagen es demasiado grande." }, 413))
    expect(await enviarFoto("/x", FOTO)).toEqual({ ok: false, error: "La imagen es demasiado grande." })
  })

  it("sin mensaje del servidor, uno humano según el código", async () => {
    simularRespuesta(new Response("<html>Too Many Requests</html>", { status: 429 }))
    const resultado = await enviarFoto("/x", FOTO)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toMatch(/Espera/)
  })

  it("un 503 sin cuerpo dice que por ahora no se guardan fotos", async () => {
    simularRespuesta(new Response(null, { status: 503 }))
    const resultado = await enviarFoto("/x", FOTO)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toMatch(/Por ahora no se pueden guardar fotos/)
  })

  it("sin red, no lanza: devuelve el aviso de sin conexión", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fallo")))
    expect(await enviarFoto("/x", FOTO)).toEqual({ ok: false, error: "Sin conexión con el servidor" })
  })

  it("un éxito sin URL no se da por bueno", async () => {
    simularRespuesta(json({}))
    expect(await enviarFoto("/x", FOTO)).toEqual({ ok: false, error: "No se pudo guardar la foto." })
    simularRespuesta(json({ url: null }))
    expect((await enviarFoto("/x", FOTO)).ok).toBe(false)
  })
})

describe("pedirQuitarFoto", () => {
  it("hace DELETE y devuelve url null", async () => {
    const fetchFalso = simularRespuesta(json({ url: null }))
    expect(await pedirQuitarFoto("/api/equipo/miembros/m1/foto")).toEqual({ ok: true, url: null })
    const [ruta, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(ruta).toBe("/api/equipo/miembros/m1/foto")
    expect(opciones.method).toBe("DELETE")
  })

  it("un 204 sin cuerpo también es haberla quitado", async () => {
    simularRespuesta(new Response(null, { status: 204 }))
    expect(await pedirQuitarFoto("/x")).toEqual({ ok: true, url: null })
  })

  it("si falla, el mensaje habla de quitar", async () => {
    simularRespuesta(new Response(null, { status: 500 }))
    expect(await pedirQuitarFoto("/x")).toEqual({ ok: false, error: "No se pudo quitar la foto." })
  })
})
