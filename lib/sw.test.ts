import { readFileSync } from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * `public/sw.js` corre en el navegador, no en Node: se ejecuta en un contexto
 * aparte con un `self` y unas `caches` de mentira, y se le mandan eventos
 * `fetch` como los mandaría el navegador. Lo que importa probar es lo que NO
 * hace: no intercepta la API ni nada fuera del panel, y no guarda respuestas.
 */

const ORIGEN = "https://eli.app"
const codigo = readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8")

type Manejador = (evento: Record<string, unknown>) => void

function cargarServiceWorker(fetchFalso: (peticion: unknown) => Promise<Response>) {
  const manejadores: Record<string, Manejador> = {}
  const cache = { add: vi.fn().mockResolvedValue(undefined), put: vi.fn() }
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(["eli-sin-conexion-v0", "eli-sin-conexion-v1", "de-otro"]),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn().mockResolvedValue(new Response("<h1>Sin conexión</h1>", { headers: { "Content-Type": "text/html" } })),
  }
  const self = {
    location: new URL(ORIGEN),
    addEventListener: (tipo: string, manejador: Manejador) => {
      manejadores[tipo] = manejador
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  }
  // En el navegador `new Request("/offline.html")` se resuelve contra el
  // origen del SW; en Node hace falta decírselo.
  class RequestDelSitio extends Request {
    constructor(url: string, opciones?: RequestInit) {
      super(new URL(url, ORIGEN), opciones)
    }
  }
  vm.runInNewContext(codigo, { self, caches, fetch: fetchFalso, Request: RequestDelSitio, Response, URL, Promise })
  return { manejadores, cache, caches }
}

function eventoFetch(url: string, { mode = "navigate", method = "GET" } = {}) {
  const respondWith = vi.fn()
  return { evento: { request: { url, mode, method }, respondWith }, respondWith }
}

describe("service worker de Eli", () => {
  let fetchFalso: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchFalso = vi.fn().mockResolvedValue(new Response("panel"))
  })

  it("al instalarse guarda sólo la página sin conexión", async () => {
    const { manejadores, cache } = cargarServiceWorker(fetchFalso)
    let espera: Promise<unknown> = Promise.resolve()
    manejadores.install({ waitUntil: (p: Promise<unknown>) => (espera = p) })
    await espera

    expect(cache.add).toHaveBeenCalledTimes(1)
    expect(new URL(cache.add.mock.calls[0][0].url).pathname).toBe("/offline.html")
    expect(cache.put).not.toHaveBeenCalled()
  })

  it("al activarse borra sus cachés viejas y no toca las ajenas", async () => {
    const { manejadores, caches } = cargarServiceWorker(fetchFalso)
    let espera: Promise<unknown> = Promise.resolve()
    manejadores.activate({ waitUntil: (p: Promise<unknown>) => (espera = p) })
    await espera

    expect(caches.delete).toHaveBeenCalledTimes(1)
    expect(caches.delete).toHaveBeenCalledWith("eli-sin-conexion-v0")
  })

  it.each([
    ["la API", `${ORIGEN}/api/citas`, "cors"],
    ["la API, aunque llegue como navegación", `${ORIGEN}/api/dashboard`, "navigate"],
    ["un recurso del panel que no es abrir una pantalla", `${ORIGEN}/dashboard/agenda`, "cors"],
    ["la landing", `${ORIGEN}/`, "navigate"],
    ["la reserva pública", `${ORIGEN}/reservar/mi-salon`, "navigate"],
    ["otro sitio", "https://otro.com/dashboard", "navigate"],
  ])("no intercepta %s", (_caso, url, mode) => {
    const { manejadores } = cargarServiceWorker(fetchFalso)
    const { evento, respondWith } = eventoFetch(url, { mode })
    manejadores.fetch(evento)
    expect(respondWith).not.toHaveBeenCalled()
  })

  it("no intercepta un POST al panel", () => {
    const { manejadores } = cargarServiceWorker(fetchFalso)
    const { evento, respondWith } = eventoFetch(`${ORIGEN}/dashboard`, { method: "POST" })
    manejadores.fetch(evento)
    expect(respondWith).not.toHaveBeenCalled()
  })

  it("con conexión, la pantalla del panel viene de la red y no se guarda", async () => {
    const { manejadores, cache, caches } = cargarServiceWorker(fetchFalso)
    const { evento, respondWith } = eventoFetch(`${ORIGEN}/dashboard/agenda`)
    manejadores.fetch(evento)

    const respuesta: Response = await respondWith.mock.calls[0][0]
    expect(await respuesta.text()).toBe("panel")
    expect(cache.put).not.toHaveBeenCalled()
    expect(caches.match).not.toHaveBeenCalled()
  })

  it("sin conexión, muestra la página sin conexión", async () => {
    fetchFalso.mockRejectedValue(new TypeError("Failed to fetch"))
    const { manejadores, caches } = cargarServiceWorker(fetchFalso)
    const { evento, respondWith } = eventoFetch(`${ORIGEN}/dashboard`)
    manejadores.fetch(evento)

    const respuesta: Response = await respondWith.mock.calls[0][0]
    expect(caches.match).toHaveBeenCalledWith("/offline.html", { cacheName: "eli-sin-conexion-v1" })
    expect(await respuesta.text()).toContain("Sin conexión")
  })
})
