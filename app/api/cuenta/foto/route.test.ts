import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ponerAlmacenDeFotos } from "@/lib/almacenamiento-de-fotos"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"
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
const FOTO_DE_CARLA = `usuarios/u-carla/cuenta-${UUID_VIEJO}.webp`
const FOTO_DE_PEDRO = `usuarios/u-pedro/cuenta-${UUID_VIEJO}.webp`
/** La foto que ve el cliente en la reserva: la de la membresía, NO la de la cuenta. */
const FOTO_DE_MIEMBRO_DE_CARLA = `negocios/${NEGOCIO}/miembro-m-carla-${UUID_VIEJO}.webp`
const WEBP_VIEJO = { bytes: Uint8Array.from([1, 2, 3]), tipoMime: "image/webp" }

const URL_DE_LA_API = "http://localhost/api/cuenta/foto"

let almacen: AlmacenEnMemoria

const fotoDeLaCuenta = (id: string) => base.buscar("user", { id })[0].fotoUrl
const fotoDelMiembro = (id: string) => base.buscar("businessMember", { id })[0].fotoUrl
const claves = () => [...almacen.objetos.keys()].sort()

async function subir(sesion: unknown, bytes?: Uint8Array, opciones?: Parameters<typeof pedidoDeFoto>[2], url = URL_DE_LA_API) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedidoDeFoto(url, bytes, opciones))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function quitar(sesion: unknown) {
  const { DELETE } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await DELETE()
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

/** El negocio de siempre, con foto de cuenta para Carla y para Pedro, y la del integrante de Carla. */
function conFotos() {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    user: datos.user.map((usuario) => {
      if (usuario.id === "u-carla") return { ...usuario, fotoUrl: `/fotos/${FOTO_DE_CARLA}` }
      if (usuario.id === "u-pedro") return { ...usuario, fotoUrl: `/fotos/${FOTO_DE_PEDRO}` }
      return usuario
    }),
    businessMember: datos.businessMember.map((miembro) =>
      miembro.id === "m-carla" ? { ...miembro, fotoUrl: `/fotos/${FOTO_DE_MIEMBRO_DE_CARLA}` } : miembro
    ),
  })
  for (const clave of [FOTO_DE_CARLA, FOTO_DE_PEDRO, FOTO_DE_MIEMBRO_DE_CARLA]) almacen.objetos.set(clave, WEBP_VIEJO)
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

describe("PUT /api/cuenta/foto: quién puede (cualquiera con sesión, sobre su cuenta)", () => {
  it("sube la foto: 512 × 512 WebP en usuarios/<cuenta>/cuenta-<uuid>.webp, y sólo cambia la fila de quien la sube", async () => {
    const antes = base.volcado()

    const { status, cuerpo } = await subir(sesiones.carla, await jpegDePrueba())

    expect(status).toBe(200)
    expect(cuerpo.url).toMatch(/^\/fotos\/usuarios\/u-carla\/cuenta-[0-9a-f-]{36}\.webp$/)
    expect(fotoDeLaCuenta("u-carla")).toBe(cuerpo.url)
    const objeto = almacen.objetos.get(cuerpo.url.slice("/fotos/".length))!
    expect(objeto.tipoMime).toBe("image/webp")
    const medidas = await sharp(objeto.bytes).metadata()
    expect([medidas.format, medidas.width, medidas.height]).toEqual(["webp", 512, 512])

    // Nada más se escribió: ni otra cuenta, ni un integrante, ni un negocio.
    const despues = base.volcado()
    const sinLaFila = (volcado: typeof antes) => ({ ...volcado, user: volcado.user.filter((usuario) => usuario.id !== "u-carla") })
    expect(sinLaFila(despues)).toEqual(sinLaFila(antes))
    expect(fotoDelMiembro("m-carla")).toBeNull()
  })

  it("lo hace cada rol (dueña, encargado, profesional) y un profesional sin memberId: es de la persona, no del negocio", async () => {
    for (const [sesion, id] of [
      [sesiones.dueña, "u-duena"],
      [sesiones.encargado, "u-encargado"],
      [sesiones.carla, "u-carla"],
      [sesiones.sinMiembro, "u-suelto"],
    ] as const) {
      base.reiniciar({ ...datosBase(), user: [...datosBase().user, { id: "u-suelto", name: "Suelto", email: "suelto@uno.test" }] })

      const { status, cuerpo } = await subir(sesion, await jpegDePrueba())

      expect(status, id).toBe(200)
      expect(fotoDeLaCuenta(id), id).toBe(cuerpo.url)
      expect(cuerpo.url).toContain(`/fotos/usuarios/${id}/cuenta-`)
    }
  })

  it("también quien todavía no tiene negocio ni rol (la sesión sólo trae su id)", async () => {
    const { status, cuerpo } = await subir({ user: { id: "u-pedro", name: "Pedro Profesional" } }, await jpegDePrueba())

    expect(status).toBe(200)
    expect(fotoDeLaCuenta("u-pedro")).toBe(cuerpo.url)
  })

  it("sin sesión: 401, y no se pregunta el límite, no se escribe y no se toca el almacén", async () => {
    conFotos()
    const antes = base.volcado()
    const objetos = claves()

    expect((await subir(null, await jpegDePrueba())).status).toBe(401)
    expect((await quitar(null)).status).toBe(401)

    expect(base.volcado()).toEqual(antes)
    expect(claves()).toEqual(objetos)
    expect(almacen.operaciones).toEqual([])
    expect(mockVerificarLimite).not.toHaveBeenCalled()
  })

  it.each([
    ["una sesión revocada (id vacío)", { user: { id: "", role: "owner", businessId: NEGOCIO } }],
    ["una sesión sin id", { user: { role: "owner", businessId: NEGOCIO } }],
    ["una sesión sin usuario", {}],
    ["un id que no es texto", { user: { id: { $ne: null } } }],
  ])("%s: 401 y no se escribe nada", async (_caso, sesion) => {
    conFotos()
    const antes = base.volcado()

    expect((await subir(sesion, await jpegDePrueba())).status).toBe(401)
    expect((await quitar(sesion)).status).toBe(401)

    expect(base.volcado()).toEqual(antes)
    expect(almacen.operaciones).toEqual([])
  })
})

describe("aislamiento: la cuenta sale de la sesión y NUNCA toca otra", () => {
  it("un id de otra cuenta en la URL, en cabeceras o en el cuerpo no cambia a quién se escribe", async () => {
    conFotos()
    const fotoDePedroAntes = fotoDeLaCuenta("u-pedro")

    // En la URL (varios nombres), en cabeceras, y en el propio cuerpo (un JSON con un id: ni siquiera es una imagen).
    const conIdAjeno = `${URL_DE_LA_API}?id=u-pedro&userId=u-pedro&usuarioId=u-pedro&cuenta=u-pedro`
    const cabeceras = { "x-user-id": "u-pedro", "x-usuario-id": "u-pedro", "x-forwarded-user": "u-pedro" }

    const subida = await subir(sesiones.carla, await jpegDePrueba(), { cabeceras }, conIdAjeno)
    expect(subida.status).toBe(200)
    expect(subida.cuerpo.url).toContain("/fotos/usuarios/u-carla/cuenta-")

    const conCuerpoJson = await subir(
      sesiones.carla,
      Buffer.from(JSON.stringify({ id: "u-pedro", userId: "u-pedro", fotoUrl: `/fotos/${FOTO_DE_PEDRO}` })),
      { tipo: "application/json" }
    )
    expect(conCuerpoJson.status).toBe(400)

    expect((await quitar(sesiones.carla)).status).toBe(200)

    expect(fotoDeLaCuenta("u-pedro")).toBe(fotoDePedroAntes)
    expect(almacen.objetos.has(FOTO_DE_PEDRO)).toBe(true)
    // Cada escritura de cuenta llevó el id de la sesión, ninguna el del cuerpo.
    for (const [argumentos] of base.prisma.user.updateMany.mock.calls) expect(argumentos.where).toEqual({ id: "u-carla" })
    for (const [argumentos] of base.prisma.user.findUnique.mock.calls) expect(argumentos.where).toEqual({ id: "u-carla" })
  })

  it("lleva la cuenta de la sesión en la lectura y en la escritura: el where es sólo { id }", async () => {
    await subir(sesiones.dueñoAjeno, await jpegDePrueba())

    expect(base.prisma.user.findUnique.mock.calls[0][0]).toEqual({ where: { id: "u-otro" }, select: { fotoUrl: true } })
    expect(base.prisma.user.updateMany.mock.calls[0][0].where).toEqual({ id: "u-otro" })
    expect(fotoDeLaCuenta("u-duena")).toBeNull()
  })

  it("la clave nueva siempre cuelga de la cuenta de la sesión, nunca de un negocio ni de otra cuenta", async () => {
    const { cuerpo } = await subir(sesiones.dueñoAjeno, await jpegDePrueba())

    expect(cuerpo.url).toMatch(/^\/fotos\/usuarios\/u-otro\/cuenta-/)
    expect(claves()).toHaveLength(1)
    expect(claves()[0]).toMatch(/^usuarios\/u-otro\//)
  })

  it("la foto de la cuenta y la del integrante son aparte: cambiar una no toca la otra, y no hay respaldo entre ellas", async () => {
    conFotos()
    const delMiembro = fotoDelMiembro("m-carla")

    await subir(sesiones.carla, await jpegDePrueba())
    expect(fotoDelMiembro("m-carla")).toBe(delMiembro)
    expect(almacen.objetos.has(FOTO_DE_MIEMBRO_DE_CARLA)).toBe(true)

    await quitar(sesiones.carla)
    expect(fotoDeLaCuenta("u-carla")).toBeNull()
    expect(fotoDelMiembro("m-carla")).toBe(delMiembro)
    expect(almacen.objetos.has(FOTO_DE_MIEMBRO_DE_CARLA)).toBe(true)
  })

  it("una persona sin foto de cuenta no hereda la de su membresía: la columna queda en null", async () => {
    conFotos()

    expect(fotoDeLaCuenta("u-encargado")).toBeNull()
    expect(fotoDelMiembro("m-carla")).not.toBeNull()
    expect((await quitar(sesiones.encargado)).cuerpo).toEqual({ url: null })
    expect(fotoDeLaCuenta("u-encargado")).toBeNull()
  })

  it("una cuenta que ya no existe (borrada con la sesión vigente): 404 y se borra el objeto recién subido", async () => {
    const { status, cuerpo } = await subir({ user: { id: "u-fantasma" } }, await jpegDePrueba())

    expect(status).toBe(404)
    expect(cuerpo.error).toMatch(/no encontrado/i)
    expect(claves()).toEqual([])
    expect((await quitar({ user: { id: "u-fantasma" } })).status).toBe(404)
  })
})

describe("PUT /api/cuenta/foto: el pedido, el límite y el almacén", () => {
  it("un tipo de contenido que no es imagen: 400", async () => {
    const { status, cuerpo } = await subir(sesiones.carla, await jpegDePrueba(), { tipo: "text/plain" })

    expect(status).toBe(400)
    expect(cuerpo.error).toMatch(/JPG, PNG o WebP/)
    expect(almacen.operaciones).toEqual([])
  })

  it("sin Content-Type: 400", async () => {
    expect((await subir(sesiones.carla, await jpegDePrueba(), { tipo: null })).status).toBe(400)
    expect(almacen.operaciones).toEqual([])
  })

  it("bytes que no son una imagen: 400 y no se guarda nada", async () => {
    const antes = base.volcado()

    const { status } = await subir(sesiones.carla, Buffer.from("no soy una foto"), { tipo: "image/jpeg" })

    expect(status).toBe(400)
    expect(base.volcado()).toEqual(antes)
    expect(almacen.operaciones).toEqual([])
  })

  it("más de 5 MB: 413", async () => {
    const { status } = await subir(sesiones.carla, new Uint8Array(5 * 1024 * 1024 + 1))

    expect(status).toBe(413)
    expect(almacen.operaciones).toEqual([])
    expect(fotoDeLaCuenta("u-carla")).toBeNull()
  })

  it("un Content-Length que ya pasa el tope: 413 sin leer el cuerpo", async () => {
    const { status } = await subir(sesiones.carla, await jpegDePrueba(), { cabeceras: { "content-length": String(6 * 1024 * 1024) } })

    expect(status).toBe(413)
    expect(almacen.operaciones).toEqual([])
  })

  it("pasado el límite: 429; el balde es `fotos`, por usuario, y no se escribe nada", async () => {
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const { status } = await subir(sesiones.carla, await jpegDePrueba())

    expect(status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("fotos", "usuario:u-carla")
    expect(fotoDeLaCuenta("u-carla")).toBeNull()
    expect(almacen.operaciones).toEqual([])
  })

  it("pasado el límite, quitar también es 429 y la foto sigue", async () => {
    conFotos()
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    expect((await quitar(sesiones.carla)).status).toBe(429)
    expect(fotoDeLaCuenta("u-carla")).toBe(`/fotos/${FOTO_DE_CARLA}`)
  })

  it("sin almacén: 503", async () => {
    ponerAlmacenDeFotos(null)

    const { status, cuerpo } = await subir(sesiones.carla, await jpegDePrueba())

    expect(status).toBe(503)
    expect(cuerpo.error).toMatch(/todavía no están disponibles/)
    expect((await quitar(sesiones.carla)).status).toBe(503)
    expect(fotoDeLaCuenta("u-carla")).toBeNull()
  })

  it("si el almacén falla al guardar: 502 y la columna no cambia", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    conFotos()
    almacen.fallar.guardar = true

    const { status } = await subir(sesiones.carla, await jpegDePrueba())

    expect(status).toBe(502)
    expect(fotoDeLaCuenta("u-carla")).toBe(`/fotos/${FOTO_DE_CARLA}`)
  })
})

describe("PUT /api/cuenta/foto: reemplazar", () => {
  beforeEach(conFotos)

  it("guarda la nueva, apunta la columna y recién entonces borra la anterior; las demás fotos no se tocan", async () => {
    const { status, cuerpo } = await subir(sesiones.carla, await jpegDePrueba())

    expect(status).toBe(200)
    const nueva = cuerpo.url.slice("/fotos/".length)
    expect(almacen.operaciones).toEqual([
      { operacion: "guardar", clave: nueva },
      { operacion: "borrar", clave: FOTO_DE_CARLA },
    ])
    expect(fotoDeLaCuenta("u-carla")).toBe(cuerpo.url)
    expect(fotoDeLaCuenta("u-pedro")).toBe(`/fotos/${FOTO_DE_PEDRO}`)
    expect(claves()).toEqual([nueva, FOTO_DE_PEDRO, FOTO_DE_MIEMBRO_DE_CARLA].sort())
  })

  it("si la columna no se puede escribir: borra el objeto nuevo y la foto de antes sigue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    base.prisma.user.updateMany.mockRejectedValueOnce(new Error("la base se cayó"))

    const { status } = await subir(sesiones.carla, await jpegDePrueba())

    expect(status).toBe(500)
    expect(fotoDeLaCuenta("u-carla")).toBe(`/fotos/${FOTO_DE_CARLA}`)
    expect(claves()).toEqual([FOTO_DE_CARLA, FOTO_DE_PEDRO, FOTO_DE_MIEMBRO_DE_CARLA].sort())
  })

  it("si la cuenta desapareció entre la lectura y la escritura: 404 y se borra el objeto nuevo", async () => {
    base.prisma.user.updateMany.mockResolvedValueOnce({ count: 0 })

    const { status } = await subir(sesiones.carla, await jpegDePrueba())

    expect(status).toBe(404)
    expect(claves()).toEqual([FOTO_DE_CARLA, FOTO_DE_PEDRO, FOTO_DE_MIEMBRO_DE_CARLA].sort())
  })

  it.each([
    ["la de OTRA cuenta", `/fotos/${FOTO_DE_PEDRO}`],
    ["la del integrante de la reserva", `/fotos/${FOTO_DE_MIEMBRO_DE_CARLA}`],
    ["una escapada hacia otra carpeta", `/fotos/usuarios/u-carla/../u-pedro/cuenta-${UUID_VIEJO}.webp`],
    ["un sitio de afuera", "https://cdn.ejemplo.cl/yo.png"],
  ])("NUNCA borra por lo que diga la base si no es de su carpeta: si la columna trae %s, queda intacta", async (_caso, ajena) => {
    await base.prisma.user.updateMany({ where: { id: "u-carla" }, data: { fotoUrl: ajena } })

    const subida = await subir(sesiones.carla, await jpegDePrueba())
    expect(subida.status).toBe(200)
    expect(almacen.operaciones.filter((op) => op.operacion === "borrar")).toEqual([])

    await base.prisma.user.updateMany({ where: { id: "u-carla" }, data: { fotoUrl: ajena } })
    expect((await quitar(sesiones.carla)).status).toBe(200)
    expect(almacen.operaciones.filter((op) => op.operacion === "borrar")).toEqual([])
    expect(almacen.objetos.has(FOTO_DE_PEDRO)).toBe(true)
    expect(almacen.objetos.has(FOTO_DE_MIEMBRO_DE_CARLA)).toBe(true)
  })
})

describe("DELETE /api/cuenta/foto", () => {
  beforeEach(conFotos)

  it("quita SU foto: columna en null, objeto borrado, las de los demás intactas", async () => {
    const { status, cuerpo } = await quitar(sesiones.carla)

    expect(status).toBe(200)
    expect(cuerpo).toEqual({ url: null })
    expect(fotoDeLaCuenta("u-carla")).toBeNull()
    expect(claves()).toEqual([FOTO_DE_PEDRO, FOTO_DE_MIEMBRO_DE_CARLA].sort())
    expect(fotoDeLaCuenta("u-pedro")).toBe(`/fotos/${FOTO_DE_PEDRO}`)
  })

  it("sin foto, quitar igual responde 200 y no borra nada", async () => {
    expect((await quitar(sesiones.encargado)).cuerpo).toEqual({ url: null })
    expect(almacen.operaciones).toEqual([])
  })

  it("si borrar el objeto falla, igual responde 200", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    almacen.fallar.borrar = true

    expect((await quitar(sesiones.carla)).status).toBe(200)
    expect(fotoDeLaCuenta("u-carla")).toBeNull()
  })

  it("si la base falla: 500 y el objeto NO se borra (la columna sigue apuntando a él)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    base.prisma.user.updateMany.mockRejectedValueOnce(new Error("la base se cayó"))

    expect((await quitar(sesiones.carla)).status).toBe(500)
    expect(fotoDeLaCuenta("u-carla")).toBe(`/fotos/${FOTO_DE_CARLA}`)
    expect(almacen.objetos.has(FOTO_DE_CARLA)).toBe(true)
  })
})
