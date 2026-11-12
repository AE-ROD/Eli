import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ponerAlmacenDeFotos } from "./almacenamiento-de-fotos"
import { quitarFoto, subirFoto, type DestinoDeFoto } from "./cambiar-foto"
import { crearAlmacenEnMemoria, jpegDePrueba, pedidoDeFoto, type AlmacenEnMemoria } from "@/pruebas/almacen-de-fotos"

// El recorrido completo, con sus permisos y su base, se prueba en los tests de
// las dos rutas. Acá, lo que sólo se alcanza con un destino a medida.

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 19 }))
vi.mock("@/lib/rate-limit", () => ({
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const UUID_VIEJO = "0b8a7c1e-2d3f-4a5b-8c9d-0e1f2a3b4c5d"
const VIEJA = `negocios/negocio-1/logo-${UUID_VIEJO}.webp`
const QUIEN = { usuarioId: "u-1" }

let almacen: AlmacenEnMemoria

function destino(parcial: Partial<DestinoDeFoto> = {}): DestinoDeFoto & { escrituras: (string | null)[] } {
  const escrituras: (string | null)[] = []
  return {
    tipo: "logo",
    businessId: "negocio-1",
    leerUrl: async () => ({ url: `/fotos/${VIEJA}` }),
    guardarUrl: async (url) => {
      escrituras.push(url)
      return true
    },
    ...parcial,
    escrituras,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 19 })
  almacen = crearAlmacenEnMemoria({ [VIEJA]: { bytes: Uint8Array.from([1]), tipoMime: "image/webp" } })
  ponerAlmacenDeFotos(almacen)
})
afterEach(() => {
  ponerAlmacenDeFotos(undefined)
  vi.restoreAllMocks()
})

describe("subirFoto", () => {
  it("si el cuerpo se corta a mitad de la subida: 400 y no se guarda nada", async () => {
    const cortado = new ReadableStream<Uint8Array>({
      pull(controlador) {
        controlador.error(new Error("conexión cortada"))
      },
    })
    const pedido = { headers: new Headers({ "content-type": "image/jpeg" }), body: cortado } as unknown as Request
    const d = destino()

    const respuesta = await subirFoto(pedido, QUIEN, d)

    expect(respuesta.status).toBe(400)
    expect(d.escrituras).toEqual([])
    expect(almacen.operaciones).toEqual([])
  })

  it("si la fila ya no existe al leerla: 404 y el objeto recién subido se borra", async () => {
    const d = destino({ leerUrl: async () => null })

    const respuesta = await subirFoto(pedidoDeFoto("http://localhost/x", await jpegDePrueba()), QUIEN, d)

    expect(respuesta.status).toBe(404)
    expect(d.escrituras).toEqual([])
    const [guardado, borrado] = almacen.operaciones
    expect(borrado).toEqual({ operacion: "borrar", clave: guardado.clave })
    expect([...almacen.objetos.keys()]).toEqual([VIEJA])
  })

  it("si la escritura dice que la fila ya no existe: 404, se borra el nuevo y NO el anterior", async () => {
    const d = destino({ guardarUrl: async () => false })

    const respuesta = await subirFoto(pedidoDeFoto("http://localhost/x", await jpegDePrueba()), QUIEN, d)

    expect(respuesta.status).toBe(404)
    expect([...almacen.objetos.keys()]).toEqual([VIEJA])
    expect(almacen.operaciones.map((op) => op.operacion)).toEqual(["guardar", "borrar"])
    expect(almacen.operaciones[1].clave).not.toBe(VIEJA)
  })

  it("si deshacer también falla, igual responde el error original (500) sin lanzar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const d = destino({
      guardarUrl: async () => {
        almacen.fallar.borrar = true
        throw new Error("la base se cayó")
      },
    })

    const respuesta = await subirFoto(pedidoDeFoto("http://localhost/x", await jpegDePrueba()), QUIEN, d)

    expect(respuesta.status).toBe(500)
    expect(await respuesta.json()).toEqual({ error: "Error interno" })
  })

  it("la respuesta de error no filtra el mensaje de la base ni del almacén", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const d = destino({
      guardarUrl: async () => {
        throw new Error("password authentication failed for user postgres")
      },
    })

    const respuesta = await subirFoto(pedidoDeFoto("http://localhost/x", await jpegDePrueba()), QUIEN, d)

    expect(JSON.stringify(await respuesta.json())).not.toMatch(/postgres|password/)
  })

  it("el cupo se pregunta por sesión, antes de leer el cuerpo", async () => {
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
    const pedido = pedidoDeFoto("http://localhost/x", await jpegDePrueba())
    const leer = vi.spyOn(pedido.body!, "getReader")

    const respuesta = await subirFoto(pedido, QUIEN, destino())

    expect(respuesta.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("fotos", "usuario:u-1")
    expect(leer).not.toHaveBeenCalled()
  })
})

describe("quitarFoto", () => {
  it("si la fila ya no existe: 404", async () => {
    expect((await quitarFoto(QUIEN, destino({ leerUrl: async () => null }))).status).toBe(404)
    expect((await quitarFoto(QUIEN, destino({ guardarUrl: async () => false }))).status).toBe(404)
    expect(almacen.operaciones).toEqual([])
  })

  it("si la base falla: 500, y el objeto NO se borra (la columna sigue apuntando a él)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    const respuesta = await quitarFoto(
      QUIEN,
      destino({
        guardarUrl: async () => {
          throw new Error("la base se cayó")
        },
      })
    )

    expect(respuesta.status).toBe(500)
    expect(almacen.operaciones).toEqual([])
  })

  it("primero la columna a null, después el objeto", async () => {
    const d = destino()

    const respuesta = await quitarFoto(QUIEN, d)

    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({ url: null })
    expect(d.escrituras).toEqual([null])
    expect(almacen.operaciones).toEqual([{ operacion: "borrar", clave: VIEJA }])
  })
})
