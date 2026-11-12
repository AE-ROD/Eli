import { beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase } from "@/pruebas/datos"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

// Dinámico, como los tests de las rutas: `vi.mock` se eleva, pero la base se crea después.
const leerFotoDeLaCuenta = async (id: string | null | undefined) => (await import("./foto-de-la-cuenta")).leerFotoDeLaCuenta(id)

const UUID = "0b8a7c1e-2d3f-4a5b-8c9d-0e1f2a3b4c5d"
const SUYA = `/fotos/usuarios/u-carla/cuenta-${UUID}.webp`

function conFotoDeCuenta(id: string, fotoUrl: string | null) {
  const datos = datosBase()
  base.reiniciar({ ...datos, user: datos.user.map((usuario) => (usuario.id === id ? { ...usuario, fotoUrl } : usuario)) })
}

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datosBase())
})

describe("leerFotoDeLaCuenta", () => {
  it("devuelve la ruta de la foto de la cuenta", async () => {
    conFotoDeCuenta("u-carla", SUYA)

    expect(await leerFotoDeLaCuenta("u-carla")).toBe(SUYA)
  })

  it("lee con un select explícito de esa sola columna, con la cuenta que se le dio", async () => {
    conFotoDeCuenta("u-carla", SUYA)

    await leerFotoDeLaCuenta("u-carla")

    expect(base.prisma.user.findUnique).toHaveBeenCalledTimes(1)
    expect(base.prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "u-carla" }, select: { fotoUrl: true } })
  })

  it("sin foto, sin cuenta o sin id: null (y sin id ni se consulta)", async () => {
    expect(await leerFotoDeLaCuenta("u-carla")).toBeNull()
    expect(await leerFotoDeLaCuenta("no-existe")).toBeNull()
    base.prisma.user.findUnique.mockClear()
    for (const id of [null, undefined, ""]) expect(await leerFotoDeLaCuenta(id)).toBeNull()
    expect(base.prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it.each([
    ["la de otra cuenta", `/fotos/usuarios/u-pedro/cuenta-${UUID}.webp`],
    ["la del integrante de la reserva (no hay respaldo entre las dos)", `/fotos/negocios/${NEGOCIO}/miembro-m-carla-${UUID}.webp`],
    ["una escapada hacia otra carpeta", `/fotos/usuarios/u-carla/../u-pedro/cuenta-${UUID}.webp`],
    ["un sitio de afuera", "https://cdn.ejemplo.cl/yo.png"],
    ["una ruta cualquiera", "/otra/ruta.webp"],
  ])("NUNCA muestra un fotoUrl que no es de su carpeta: %s da null", async (_caso, fotoUrl) => {
    conFotoDeCuenta("u-carla", fotoUrl)

    expect(await leerFotoDeLaCuenta("u-carla")).toBeNull()
  })

  it("si la lectura falla (la base, o la migración sin aplicar) no se cae el panel: registra y devuelve null", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    base.prisma.user.findUnique.mockRejectedValueOnce(Object.assign(new Error("column usuarios.fotoUrl does not exist"), { code: "P2022" }))

    expect(await leerFotoDeLaCuenta("u-carla")).toBeNull()
    // El registro lleva el nombre y el código, no el mensaje (puede traer datos).
    expect(JSON.stringify(consola.mock.calls)).not.toContain("does not exist")
    expect(consola).toHaveBeenCalledTimes(1)
    consola.mockRestore()
  })
})
