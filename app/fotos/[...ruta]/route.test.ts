import type { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ponerAlmacenDeFotos } from "@/lib/almacenamiento-de-fotos"
import { crearAlmacenEnMemoria, type AlmacenEnMemoria } from "@/pruebas/almacen-de-fotos"

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 599 }))
vi.mock("@/lib/rate-limit", () => ({
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
  obtenerIp: () => "203.0.113.7",
}))

const UUID = "0b8a7c1e-2d3f-4a5b-8c9d-0e1f2a3b4c5d"
const CLAVE = `negocios/negocio-1/logo-${UUID}.webp`
const BYTES = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 5, 6])

let almacen: AlmacenEnMemoria

async function pedir(ruta: string) {
  const { GET } = await import("./route")
  const segmentos = ruta.split("/")
  return GET({ headers: new Headers() } as unknown as NextRequest, { params: Promise.resolve({ ruta: segmentos }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 599 })
  almacen = crearAlmacenEnMemoria({ [CLAVE]: { bytes: BYTES, tipoMime: "image/webp" } })
  ponerAlmacenDeFotos(almacen)
})

afterEach(() => {
  ponerAlmacenDeFotos(undefined)
  vi.restoreAllMocks()
})

describe("GET /fotos/<ruta>", () => {
  it("sin sesión sirve la imagen con sus cabeceras: WebP, caché de un año inmutable, nosniff, inline", async () => {
    const respuesta = await pedir(CLAVE)

    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get("content-type")).toBe("image/webp")
    expect(respuesta.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff")
    expect(respuesta.headers.get("content-disposition")).toBe("inline")
    expect(respuesta.headers.get("content-length")).toBe(String(BYTES.byteLength))
    expect(respuesta.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox")
    expect(Array.from(new Uint8Array(await respuesta.arrayBuffer()))).toEqual(Array.from(BYTES))
  })

  it("sirve las tres clases de foto", async () => {
    for (const nombre of ["portada", "miembro-m-carla"]) {
      const clave = `negocios/negocio-1/${nombre}-${UUID}.webp`
      almacen.objetos.set(clave, { bytes: BYTES, tipoMime: "image/webp" })
      expect((await pedir(clave)).status, nombre).toBe(200)
    }
  })

  it("siempre dice image/webp, aunque el almacén diga otra cosa (nunca se confía en el tipo guardado)", async () => {
    almacen.objetos.set(CLAVE, { bytes: BYTES, tipoMime: "text/html" })

    const respuesta = await pedir(CLAVE)

    expect(respuesta.headers.get("content-type")).toBe("image/webp")
  })

  it("el límite de lectura cuenta por IP, en su propio balde", async () => {
    await pedir(CLAVE)

    expect(mockVerificarLimite).toHaveBeenCalledWith("fotosPublicas", "ip:203.0.113.7")
  })

  it("pasado el límite: 429 sin tocar el almacén y sin dejar la respuesta en caché", async () => {
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const respuesta = await pedir(CLAVE)

    expect(respuesta.status).toBe(429)
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect(almacen.operaciones).toEqual([])
  })

  it("un objeto que no existe: 404, sin caché", async () => {
    const respuesta = await pedir(`negocios/negocio-1/logo-${"1".repeat(8)}-1111-4111-8111-${"1".repeat(12)}.webp`)

    expect(respuesta.status).toBe(404)
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect(respuesta.headers.get("content-type")).not.toBe("image/webp")
  })

  it.each([
    ["con .. para salir de la carpeta", `negocios/negocio-1/../negocio-2/logo-${UUID}.webp`],
    ["con .. al principio", `../negocios/negocio-1/logo-${UUID}.webp`],
    ["con . en el medio", `negocios/./negocio-1/logo-${UUID}.webp`],
    ["con .. codificado", `negocios/%2e%2e/negocio-1/logo-${UUID}.webp`],
    ["con una barra invertida", `negocios/negocio-1\\logo-${UUID}.webp`],
    ["fuera de negocios/", `otros/negocio-1/logo-${UUID}.webp`],
    ["de un tipo que no existe", `negocios/negocio-1/banner-${UUID}.webp`],
    ["sin uuid", "negocios/negocio-1/logo.webp"],
    ["con otra extensión", `negocios/negocio-1/logo-${UUID}.png`],
    ["con un archivo cualquiera", "etc/passwd"],
    ["con un segmento vacío", `negocios//logo-${UUID}.webp`],
    ["un solo segmento", "logo"],
    ["la carpeta del negocio", "negocios/negocio-1"],
    ["la carpeta de todos", "negocios"],
  ])("una ruta %s: 404, y ni se pregunta al almacén", async (_caso, ruta) => {
    const respuesta = await pedir(ruta)

    expect(respuesta.status).toBe(404)
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect(almacen.operaciones).toEqual([])
  })

  it("sin almacén (producción sin R2_*): 404 y nada se cae", async () => {
    ponerAlmacenDeFotos(null)

    const respuesta = await pedir(CLAVE)

    expect(respuesta.status).toBe(404)
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
  })

  it("si el almacén falla: 502 sin caché y sin detalles del error", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    almacen.fallar.leer = true

    const respuesta = await pedir(CLAVE)

    expect(respuesta.status).toBe(502)
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect(JSON.stringify(await respuesta.json())).not.toContain("almacén caído")
    expect(registro).toHaveBeenCalled()
    expect(JSON.stringify(registro.mock.calls)).not.toContain(CLAVE)
  })
})
