import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ponerAlmacenDeFotos } from "@/lib/almacenamiento-de-fotos"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, conId, datosBase, sesiones } from "@/pruebas/datos"
import { crearAlmacenEnMemoria, jpegDePrueba, pedidoDeFoto, type AlmacenEnMemoria } from "@/pruebas/almacen-de-fotos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 19 }))
vi.mock("@/lib/rate-limit", () => ({
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const UUID_VIEJO = "0b8a7c1e-2d3f-4a5b-8c9d-0e1f2a3b4c5d"
const FOTO_DE_CARLA = `negocios/${NEGOCIO}/miembro-m-carla-${UUID_VIEJO}.webp`
const FOTO_DE_PEDRO = `negocios/${NEGOCIO}/miembro-m-pedro-${UUID_VIEJO}.webp`
const FOTO_AJENA = `negocios/${OTRO_NEGOCIO}/miembro-m-ajeno-${UUID_VIEJO}.webp`
const WEBP_VIEJO = { bytes: Uint8Array.from([1, 2, 3]), tipoMime: "image/webp" }

const URL_BASE = "http://localhost/api/equipo/miembros"

let almacen: AlmacenEnMemoria

const fotoDe = (id: string) => base.buscar("businessMember", { id })[0].fotoUrl
const claves = () => [...almacen.objetos.keys()].sort()

async function subir(sesion: unknown, id: string, bytes?: Uint8Array, opciones?: Parameters<typeof pedidoDeFoto>[2]) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedidoDeFoto(`${URL_BASE}/${id}/foto`, bytes, opciones), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function quitar(sesion: unknown, id: string) {
  const { DELETE } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await DELETE(pedidoDeFoto(`${URL_BASE}/${id}/foto`, undefined, { metodo: "DELETE", tipo: null }), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

/** El negocio de siempre, con fotos ya subidas para Carla y para Pedro, y una del otro negocio. */
function conFotos() {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    businessMember: datos.businessMember.map((miembro) => {
      if (miembro.id === "m-carla") return { ...miembro, fotoUrl: `/fotos/${FOTO_DE_CARLA}` }
      if (miembro.id === "m-pedro") return { ...miembro, fotoUrl: `/fotos/${FOTO_DE_PEDRO}` }
      if (miembro.id === "m-ajeno") return { ...miembro, fotoUrl: `/fotos/${FOTO_AJENA}` }
      return miembro
    }),
  })
  for (const clave of [FOTO_DE_CARLA, FOTO_DE_PEDRO, FOTO_AJENA]) almacen.objetos.set(clave, WEBP_VIEJO)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 19 })
  base.reiniciar(datosBase())
  almacen = crearAlmacenEnMemoria()
  ponerAlmacenDeFotos(almacen)
})

afterEach(() => {
  ponerAlmacenDeFotos(undefined)
  vi.restoreAllMocks()
})

describe("PUT /api/equipo/miembros/[id]/foto: quién puede", () => {
  it("la dueña sube la foto de cualquier integrante: 640 × 640 en una clave nueva con el id de la membresía", async () => {
    const { status, cuerpo } = await subir(sesiones.dueña, "m-carla", await jpegDePrueba())

    expect(status).toBe(200)
    expect(cuerpo.url).toMatch(new RegExp(`^/fotos/negocios/${NEGOCIO}/miembro-m-carla-[0-9a-f-]{36}\\.webp$`))
    expect(fotoDe("m-carla")).toBe(cuerpo.url)
    expect(fotoDe("m-pedro")).toBeNull()
    const objeto = almacen.objetos.get(cuerpo.url.slice("/fotos/".length))!
    expect(objeto.tipoMime).toBe("image/webp")
    const medidas = await sharp(objeto.bytes).metadata()
    expect([medidas.format, medidas.width, medidas.height]).toEqual(["webp", 640, 640])
  })

  it("el encargado sube la de un profesional, y también la suya", async () => {
    expect((await subir(sesiones.encargado, "m-pedro", await jpegDePrueba())).status).toBe(200)
    expect((await subir(sesiones.encargado, "m-encargado", await jpegDePrueba())).status).toBe(200)
    expect(fotoDe("m-pedro")).toContain("miembro-m-pedro-")
    expect(fotoDe("m-encargado")).toContain("miembro-m-encargado-")
  })

  it("el profesional sube SU foto", async () => {
    const { status, cuerpo } = await subir(sesiones.carla, "m-carla", await jpegDePrueba())

    expect(status).toBe(200)
    expect(fotoDe("m-carla")).toBe(cuerpo.url)
  })

  it("el profesional no toca la foto de un colega: 401, y no se escribe nada", async () => {
    conFotos()
    const antes = base.volcado()
    const objetos = claves()

    expect((await subir(sesiones.carla, "m-pedro", await jpegDePrueba())).status).toBe(401)
    expect((await quitar(sesiones.carla, "m-pedro")).status).toBe(401)
    expect((await subir(sesiones.carla, "m-encargado", await jpegDePrueba())).status).toBe(401)

    expect(base.volcado()).toEqual(antes)
    expect(claves()).toEqual(objetos)
    expect(almacen.operaciones).toEqual([])
    expect(mockVerificarLimite).not.toHaveBeenCalled()
  })

  it("un profesional sin memberId no cambia ninguna foto (falla cerrado)", async () => {
    expect((await subir(sesiones.sinMiembro, "m-carla", await jpegDePrueba())).status).toBe(401)
    expect((await quitar(sesiones.sinMiembro, "m-pedro")).status).toBe(401)
    expect(almacen.operaciones).toEqual([])
  })

  it("sin sesión, 401", async () => {
    expect((await subir(null, "m-carla", await jpegDePrueba())).status).toBe(401)
    expect((await quitar(null, "m-carla")).status).toBe(401)
  })
})

describe("aislamiento entre negocios (404, nunca 403)", () => {
  it("un integrante de OTRO negocio es 404 para la dueña y para el encargado, y no se toca", async () => {
    conFotos()
    const antes = base.volcado()
    const objetos = claves()

    for (const sesion of [sesiones.dueña, sesiones.encargado]) {
      expect((await subir(sesion, "m-ajeno", await jpegDePrueba())).status).toBe(404)
      expect((await quitar(sesion, "m-ajeno")).status).toBe(404)
    }

    expect(base.volcado()).toEqual(antes)
    expect(claves()).toEqual(objetos)
    expect(almacen.operaciones).toEqual([])
  })

  it("lo mismo al revés: la dueña del otro negocio no alcanza a Carla", async () => {
    conFotos()

    expect((await subir(sesiones.dueñoAjeno, "m-carla", await jpegDePrueba())).status).toBe(404)
    expect((await quitar(sesiones.dueñoAjeno, "m-carla")).status).toBe(404)
    expect(fotoDe("m-carla")).toBe(`/fotos/${FOTO_DE_CARLA}`)
  })

  it("un profesional sobre un integrante de otro negocio también recibe 404, no 401", async () => {
    expect((await subir(sesiones.carla, "m-ajeno", await jpegDePrueba())).status).toBe(404)
  })

  it("un integrante que no existe es 404", async () => {
    const { status, cuerpo } = await subir(sesiones.dueña, "no-existe", await jpegDePrueba())

    expect(status).toBe(404)
    expect(cuerpo.error).toMatch(/no encontrado/i)
    expect((await quitar(sesiones.dueña, "no-existe")).status).toBe(404)
  })

  it("la búsqueda lleva el negocio de la sesión, no el de una URL ni el del cuerpo", async () => {
    await subir(sesiones.dueñoAjeno, "m-carla", await jpegDePrueba())

    const busqueda = base.prisma.businessMember.findFirst.mock.calls[0][0]
    expect(busqueda?.where).toEqual({ id: "m-carla", businessId: OTRO_NEGOCIO })
  })

  it("la clave nueva siempre cuelga del negocio de la sesión", async () => {
    const { cuerpo } = await subir(sesiones.dueñoAjeno, "m-ajeno", await jpegDePrueba())

    expect(cuerpo.url).toContain(`/fotos/negocios/${OTRO_NEGOCIO}/miembro-m-ajeno-`)
  })
})

describe("PUT /api/equipo/miembros/[id]/foto: el pedido, el límite y el almacén", () => {
  it("un tipo de contenido que no es imagen: 400", async () => {
    const { status, cuerpo } = await subir(sesiones.dueña, "m-carla", await jpegDePrueba(), { tipo: "text/plain" })

    expect(status).toBe(400)
    expect(cuerpo.error).toMatch(/JPG, PNG o WebP/)
    expect(almacen.operaciones).toEqual([])
  })

  it("bytes que no son una imagen: 400 y no se guarda nada", async () => {
    const antes = base.volcado()

    const { status } = await subir(sesiones.dueña, "m-carla", Buffer.from("no soy una foto"), { tipo: "image/jpeg" })

    expect(status).toBe(400)
    expect(base.volcado()).toEqual(antes)
    expect(almacen.operaciones).toEqual([])
  })

  it("más de 5 MB: 413", async () => {
    const { status } = await subir(sesiones.dueña, "m-carla", new Uint8Array(5 * 1024 * 1024 + 1))

    expect(status).toBe(413)
    expect(almacen.operaciones).toEqual([])
  })

  it("pasado el límite: 429; el balde es `fotos`, por usuario", async () => {
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const { status } = await subir(sesiones.carla, "m-carla", await jpegDePrueba())

    expect(status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("fotos", "usuario:u-carla")
    expect(fotoDe("m-carla")).toBeNull()
    expect(almacen.operaciones).toEqual([])
  })

  it("sin almacén: 503", async () => {
    ponerAlmacenDeFotos(null)

    const { status, cuerpo } = await subir(sesiones.dueña, "m-carla", await jpegDePrueba())

    expect(status).toBe(503)
    expect(cuerpo.error).toMatch(/todavía no están disponibles/)
    expect((await quitar(sesiones.dueña, "m-carla")).status).toBe(503)
    expect(fotoDe("m-carla")).toBeNull()
  })
})

describe("PUT /api/equipo/miembros/[id]/foto: reemplazar", () => {
  beforeEach(conFotos)

  it("guarda la nueva, apunta la columna y recién entonces borra la anterior; las demás fotos no se tocan", async () => {
    const { status, cuerpo } = await subir(sesiones.carla, "m-carla", await jpegDePrueba())

    expect(status).toBe(200)
    const nueva = cuerpo.url.slice("/fotos/".length)
    expect(almacen.operaciones).toEqual([
      { operacion: "guardar", clave: nueva },
      { operacion: "borrar", clave: FOTO_DE_CARLA },
    ])
    expect(fotoDe("m-carla")).toBe(cuerpo.url)
    expect(fotoDe("m-pedro")).toBe(`/fotos/${FOTO_DE_PEDRO}`)
    expect(claves()).toEqual([nueva, FOTO_DE_PEDRO, FOTO_AJENA].sort())
  })

  it("si la columna no se puede escribir: borra el objeto nuevo y la foto de antes sigue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    base.prisma.businessMember.updateMany.mockRejectedValueOnce(new Error("la base se cayó"))

    const { status } = await subir(sesiones.carla, "m-carla", await jpegDePrueba())

    expect(status).toBe(500)
    expect(fotoDe("m-carla")).toBe(`/fotos/${FOTO_DE_CARLA}`)
    expect(claves()).toEqual([FOTO_DE_CARLA, FOTO_DE_PEDRO, FOTO_AJENA].sort())
  })

  it("si el integrante desapareció entre la búsqueda y la escritura: 404 y se borra el objeto nuevo", async () => {
    base.prisma.businessMember.updateMany.mockResolvedValueOnce({ count: 0 })

    const { status } = await subir(sesiones.dueña, "m-carla", await jpegDePrueba())

    expect(status).toBe(404)
    expect(claves()).toEqual([FOTO_DE_CARLA, FOTO_DE_PEDRO, FOTO_AJENA].sort())
  })

  it("la escritura lleva el negocio en el where: nunca toca un integrante ajeno", async () => {
    await subir(sesiones.dueña, "m-carla", await jpegDePrueba())

    expect(base.prisma.businessMember.updateMany.mock.calls[0][0].where).toEqual({ id: "m-carla", businessId: NEGOCIO })
  })

  it("NUNCA borra por lo que diga la base si no es una foto de este negocio", async () => {
    await base.prisma.businessMember.updateMany({ where: { id: "m-carla", businessId: NEGOCIO }, data: { fotoUrl: `/fotos/${FOTO_AJENA}` } })

    const { status } = await subir(sesiones.dueña, "m-carla", await jpegDePrueba())

    expect(status).toBe(200)
    expect(almacen.operaciones.filter((op) => op.operacion === "borrar")).toEqual([])
    expect(almacen.objetos.has(FOTO_AJENA)).toBe(true)
  })
})

describe("DELETE /api/equipo/miembros/[id]/foto", () => {
  beforeEach(conFotos)

  it("el profesional quita SU foto: columna en null, objeto borrado, las de los demás intactas", async () => {
    const { status, cuerpo } = await quitar(sesiones.carla, "m-carla")

    expect(status).toBe(200)
    expect(cuerpo).toEqual({ url: null })
    expect(fotoDe("m-carla")).toBeNull()
    expect(claves()).toEqual([FOTO_DE_PEDRO, FOTO_AJENA].sort())
    expect(fotoDe("m-pedro")).toBe(`/fotos/${FOTO_DE_PEDRO}`)
  })

  it("dueña y encargado quitan la de cualquiera del negocio", async () => {
    expect((await quitar(sesiones.dueña, "m-pedro")).status).toBe(200)
    expect(fotoDe("m-pedro")).toBeNull()
    expect((await quitar(sesiones.encargado, "m-carla")).status).toBe(200)
    expect(fotoDe("m-carla")).toBeNull()
    expect(claves()).toEqual([FOTO_AJENA])
  })

  it("sin foto, quitar igual responde 200 y no borra nada", async () => {
    expect((await quitar(sesiones.dueña, "m-encargado")).cuerpo).toEqual({ url: null })
    expect(almacen.operaciones).toEqual([])
  })

  it("si la columna apunta a otro negocio, la deja en null pero no borra ese objeto", async () => {
    await base.prisma.businessMember.updateMany({ where: { id: "m-carla", businessId: NEGOCIO }, data: { fotoUrl: `/fotos/${FOTO_AJENA}` } })

    expect((await quitar(sesiones.dueña, "m-carla")).status).toBe(200)

    expect(fotoDe("m-carla")).toBeNull()
    expect(almacen.objetos.has(FOTO_AJENA)).toBe(true)
    expect(almacen.operaciones).toEqual([])
  })

  it("si borrar el objeto falla, igual responde 200", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    almacen.fallar.borrar = true

    expect((await quitar(sesiones.dueña, "m-carla")).status).toBe(200)
    expect(fotoDe("m-carla")).toBeNull()
  })

  it("pasado el límite: 429", async () => {
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    expect((await quitar(sesiones.dueña, "m-carla")).status).toBe(429)
    expect(fotoDe("m-carla")).toBe(`/fotos/${FOTO_DE_CARLA}`)
  })
})
