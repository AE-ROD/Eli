import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AlmacenEnDisco,
  AlmacenEnR2,
  almacenDeFotos,
  CARPETA_DE_FOTOS_EN_DESARROLLO,
  claveDeFotoDeLaCuenta,
  claveDeFotoPropia,
  claveNuevaDeFoto,
  claveNuevaDeFotoDeLaCuenta,
  elegirAlmacenDeFotos,
  ErrorDeAlmacenamiento,
  esClaveDeFoto,
  ponerAlmacenDeFotos,
  rutaPublicaDeFoto,
} from "./almacenamiento-de-fotos"
import { crearAlmacenEnMemoria } from "@/pruebas/almacen-de-fotos"

const UUID = "0b8a7c1e-2d3f-4a5b-8c9d-0e1f2a3b4c5d"
const OTRO_UUID = "11111111-2222-4333-8444-555555555555"
const CLAVE = `negocios/negocio-1/logo-${UUID}.webp`
const CLAVE_DE_CUENTA = `usuarios/u-1/cuenta-${UUID}.webp`
const BYTES = Uint8Array.from([1, 2, 3, 4, 5])

describe("esClaveDeFoto: la única forma de clave que existe", () => {
  it.each([
    CLAVE,
    `negocios/negocio-1/portada-${UUID}.webp`,
    `negocios/negocio-1/miembro-m-carla-${UUID}.webp`,
    `negocios/cm9x0abcd0000xyz/miembro-cm9x0efgh0001uvw-${UUID}.webp`,
    `negocios/neg_1/logo-${OTRO_UUID}.webp`,
    CLAVE_DE_CUENTA,
    `usuarios/cm9x0abcd0000xyz/cuenta-${OTRO_UUID}.webp`,
    `usuarios/u_1-b/cuenta-${UUID}.webp`,
  ])("acepta %s", (clave) => {
    expect(esClaveDeFoto(clave)).toBe(true)
  })

  it.each([
    ["con .. para salir de la carpeta", `negocios/negocio-1/../negocio-2/logo-${UUID}.webp`],
    ["con .. en lugar del negocio", `negocios/../logo-${UUID}.webp`],
    ["con .. codificado", `negocios/%2e%2e/negocio-2/logo-${UUID}.webp`],
    ["con barra inicial", `/${CLAVE}`],
    ["con barra invertida", `negocios\\negocio-1\\logo-${UUID}.webp`],
    ["con un segmento de más", `negocios/negocio-1/otro/logo-${UUID}.webp`],
    ["con un segmento de menos", `negocios/logo-${UUID}.webp`],
    ["fuera de negocios/", `otros/negocio-1/logo-${UUID}.webp`],
    ["con un tipo desconocido", `negocios/negocio-1/banner-${UUID}.webp`],
    ["miembro sin id", `negocios/negocio-1/miembro--${UUID}.webp`],
    ["sin uuid", "negocios/negocio-1/logo.webp"],
    ["con un uuid mal formado", "negocios/negocio-1/logo-1234.webp"],
    ["con un uuid en mayúsculas", `negocios/negocio-1/logo-${UUID.toUpperCase()}.webp`],
    ["con otra extensión", `negocios/negocio-1/logo-${UUID}.png`],
    ["con doble extensión", `negocios/negocio-1/logo-${UUID}.webp.php`],
    ["con un salto de línea al final", `${CLAVE}\n`],
    ["con un byte nulo", `negocios/negocio-1/logo-${UUID}.webp\0.png`],
    ["con espacios", `negocios/negocio 1/logo-${UUID}.webp`],
    ["con un punto en el negocio", `negocios/negocio.1/logo-${UUID}.webp`],
    ["vacía", ""],
    ["demasiado larga", `negocios/${"a".repeat(300)}/logo-${UUID}.webp`],
    ["de cuenta con .. para salir de su carpeta", `usuarios/u-1/../u-2/cuenta-${UUID}.webp`],
    ["de cuenta con .. en lugar de la cuenta", `usuarios/../cuenta-${UUID}.webp`],
    ["de cuenta con .. codificado", `usuarios/%2e%2e/u-2/cuenta-${UUID}.webp`],
    ["de cuenta con barra inicial", `/${CLAVE_DE_CUENTA}`],
    ["de cuenta con barra invertida", `usuarios\\u-1\\cuenta-${UUID}.webp`],
    ["de cuenta con una barra de más", `usuarios//u-1/cuenta-${UUID}.webp`],
    ["de cuenta con un segmento de más", `usuarios/u-1/otra/cuenta-${UUID}.webp`],
    ["de cuenta con un segmento de menos", `usuarios/cuenta-${UUID}.webp`],
    ["de cuenta sin id", `usuarios//cuenta-${UUID}.webp`],
    ["de cuenta con otro nombre de archivo", `usuarios/u-1/logo-${UUID}.webp`],
    ["de cuenta con nombre de integrante", `usuarios/u-1/miembro-m-1-${UUID}.webp`],
    ["de cuenta con otra extensión", `usuarios/u-1/cuenta-${UUID}.png`],
    ["de cuenta con doble extensión", `usuarios/u-1/cuenta-${UUID}.webp.php`],
    ["de cuenta sin uuid", "usuarios/u-1/cuenta.webp"],
    ["de cuenta con un uuid en mayúsculas", `usuarios/u-1/cuenta-${UUID.toUpperCase()}.webp`],
    ["de cuenta con un salto de línea al final", `${CLAVE_DE_CUENTA}\n`],
    ["de cuenta con un byte nulo", `usuarios/u-1/cuenta-${UUID}.webp\0.png`],
    ["de cuenta con un punto en el id", `usuarios/u.1/cuenta-${UUID}.webp`],
    ["de cuenta con la forma del negocio", `negocios/u-1/cuenta-${UUID}.webp`],
    ["con otra carpeta raíz", `cuentas/u-1/cuenta-${UUID}.webp`],
    ["de cuenta demasiado larga", `usuarios/${"a".repeat(300)}/cuenta-${UUID}.webp`],
  ])("rechaza una clave %s", (_caso, clave) => {
    expect(esClaveDeFoto(clave)).toBe(false)
  })

  it("rechaza lo que no es texto", () => {
    for (const valor of [null, undefined, 7, {}, ["negocios"]]) expect(esClaveDeFoto(valor)).toBe(false)
  })
})

describe("claveNuevaDeFoto", () => {
  it("arma negocios/<negocio>/<tipo>-<uuid>.webp, y la de un integrante lleva su id", () => {
    expect(claveNuevaDeFoto({ businessId: "negocio-1", tipo: "logo" })).toMatch(/^negocios\/negocio-1\/logo-[0-9a-f-]{36}\.webp$/)
    expect(claveNuevaDeFoto({ businessId: "negocio-1", tipo: "portada" })).toMatch(/^negocios\/negocio-1\/portada-[0-9a-f-]{36}\.webp$/)
    expect(claveNuevaDeFoto({ businessId: "negocio-1", tipo: "miembro", miembroId: "m-carla" })).toMatch(
      /^negocios\/negocio-1\/miembro-m-carla-[0-9a-f-]{36}\.webp$/
    )
  })

  it("siempre es válida y nunca se repite (cambiar la foto cambia la URL)", () => {
    const claves = Array.from({ length: 50 }, () => claveNuevaDeFoto({ businessId: "negocio-1", tipo: "logo" }))
    expect(new Set(claves).size).toBe(50)
    for (const clave of claves) expect(esClaveDeFoto(clave)).toBe(true)
  })

  it("un id con caracteres raros no llega a una clave: lanza", () => {
    expect(() => claveNuevaDeFoto({ businessId: "../otro", tipo: "logo" })).toThrow()
    expect(() => claveNuevaDeFoto({ businessId: "negocio-1", tipo: "miembro", miembroId: "a/b" })).toThrow()
    expect(() => claveNuevaDeFoto({ businessId: "negocio-1", tipo: "miembro" })).toThrow()
    expect(() => claveNuevaDeFoto({ businessId: "", tipo: "logo" })).toThrow()
  })

  it("la ruta pública es del mismo sitio y la reconoce imagenPublica", async () => {
    const { imagenPublica } = await import("./pagina-del-negocio")
    const ruta = rutaPublicaDeFoto(CLAVE)
    expect(ruta).toBe(`/fotos/${CLAVE}`)
    expect(imagenPublica(ruta)).toBe(ruta)
  })
})

describe("claveDeFotoPropia: lo que viene de la base no se borra sin comprobar el prefijo", () => {
  it("devuelve la clave de una foto de ESTE negocio", () => {
    expect(claveDeFotoPropia(`/fotos/${CLAVE}`, "negocio-1")).toBe(CLAVE)
  })

  it("null si es de otro negocio, aunque la forma sea válida", () => {
    expect(claveDeFotoPropia(`/fotos/${CLAVE}`, "negocio-2")).toBeNull()
    // Un negocio cuyo id empieza igual no es el mismo.
    expect(claveDeFotoPropia(`/fotos/negocios/negocio-10/logo-${UUID}.webp`, "negocio-1")).toBeNull()
    expect(claveDeFotoPropia(`/fotos/negocios/negocio-1/logo-${UUID}.webp`, "negocio-")).toBeNull()
  })

  it("null si no es una foto nuestra: otra ruta, otro sitio, una escapada o algo vacío", () => {
    for (const url of [
      null,
      undefined,
      "",
      "https://cdn.ejemplo.cl/logo.png",
      "//cdn.ejemplo.cl/fotos/negocios/negocio-1/logo.webp",
      "/otra/ruta.webp",
      `fotos/${CLAVE}`,
      `/fotos/negocios/negocio-1/../negocio-2/logo-${UUID}.webp`,
      `/fotos/negocios/negocio-2/../../negocio-1/logo-${UUID}.webp`,
      `/fotos/${CLAVE}?x=1`,
      `/fotos/${CLAVE}#hash`,
      "/fotos/negocios/negocio-1/logo.webp",
    ]) {
      expect(claveDeFotoPropia(url, "negocio-1")).toBeNull()
    }
  })
})

describe("claveNuevaDeFotoDeLaCuenta", () => {
  it("arma usuarios/<cuenta>/cuenta-<uuid>.webp, válida y nunca repetida", () => {
    const claves = Array.from({ length: 50 }, () => claveNuevaDeFotoDeLaCuenta("u-1"))

    for (const clave of claves) expect(clave).toMatch(/^usuarios\/u-1\/cuenta-[0-9a-f-]{36}\.webp$/)
    for (const clave of claves) expect(esClaveDeFoto(clave)).toBe(true)
    expect(new Set(claves).size).toBe(50)
  })

  it("un id con caracteres raros no llega a una clave: lanza", () => {
    for (const id of ["", "../u-2", "a/b", "u 1", "u.1", "u-1\n", "a".repeat(65)]) {
      expect(() => claveNuevaDeFotoDeLaCuenta(id), JSON.stringify(id)).toThrow()
    }
  })

  it("la ruta pública es la misma de las demás fotos", () => {
    expect(rutaPublicaDeFoto(CLAVE_DE_CUENTA)).toBe(`/fotos/${CLAVE_DE_CUENTA}`)
  })
})

describe("claveDeFotoDeLaCuenta: una persona sólo apunta a su carpeta", () => {
  it("devuelve la clave de una foto de ESTA cuenta", () => {
    expect(claveDeFotoDeLaCuenta(`/fotos/${CLAVE_DE_CUENTA}`, "u-1")).toBe(CLAVE_DE_CUENTA)
  })

  it("null si es de otra cuenta, aunque la forma sea válida (un fotoUrl armado a mano)", () => {
    expect(claveDeFotoDeLaCuenta(`/fotos/${CLAVE_DE_CUENTA}`, "u-2")).toBeNull()
    // Una cuenta cuyo id empieza igual no es la misma.
    expect(claveDeFotoDeLaCuenta(`/fotos/usuarios/u-10/cuenta-${UUID}.webp`, "u-1")).toBeNull()
    expect(claveDeFotoDeLaCuenta(`/fotos/usuarios/u-1/cuenta-${UUID}.webp`, "u-")).toBeNull()
    expect(claveDeFotoDeLaCuenta(`/fotos/${CLAVE_DE_CUENTA}`, "")).toBeNull()
    expect(claveDeFotoDeLaCuenta(`/fotos/${CLAVE_DE_CUENTA}`, null)).toBeNull()
    expect(claveDeFotoDeLaCuenta(`/fotos/${CLAVE_DE_CUENTA}`, undefined)).toBeNull()
  })

  it("null si apunta a una foto de un negocio, aunque la cuenta se llame igual que el negocio", () => {
    expect(claveDeFotoDeLaCuenta(`/fotos/${CLAVE}`, "negocio-1")).toBeNull()
    expect(claveDeFotoDeLaCuenta(`/fotos/${CLAVE}`, "u-1")).toBeNull()
    expect(claveDeFotoDeLaCuenta(`/fotos/negocios/u-1/miembro-m-1-${UUID}.webp`, "u-1")).toBeNull()
  })

  it("null si no es una foto nuestra: otra ruta, otro sitio, una escapada o algo vacío", () => {
    for (const url of [
      null,
      undefined,
      "",
      "https://cdn.ejemplo.cl/yo.png",
      `//cdn.ejemplo.cl/fotos/${CLAVE_DE_CUENTA}`,
      "/otra/ruta.webp",
      `fotos/${CLAVE_DE_CUENTA}`,
      `/fotos/usuarios/u-1/../u-2/cuenta-${UUID}.webp`,
      `/fotos/usuarios/u-2/../../usuarios/u-1/cuenta-${UUID}.webp`,
      `/fotos/usuarios/u-1/%2e%2e/u-2/cuenta-${UUID}.webp`,
      `/fotos//${CLAVE_DE_CUENTA}`,
      `/fotos/${CLAVE_DE_CUENTA}?x=1`,
      `/fotos/${CLAVE_DE_CUENTA}#hash`,
      "/fotos/usuarios/u-1/cuenta.webp",
    ]) {
      expect(claveDeFotoDeLaCuenta(url, "u-1")).toBeNull()
    }
  })

  it("y al revés: claveDeFotoPropia no entrega la foto de una cuenta como si fuera de un negocio", () => {
    expect(claveDeFotoPropia(`/fotos/${CLAVE_DE_CUENTA}`, "u-1")).toBeNull()
    expect(claveDeFotoPropia(`/fotos/${CLAVE_DE_CUENTA}`, "usuarios")).toBeNull()
  })
})

describe("elegirAlmacenDeFotos", () => {
  const R2 = { R2_ACCOUNT_ID: "a1b2c3d4e5f6", R2_ACCESS_KEY_ID: "AKIDPRUEBA", R2_SECRET_ACCESS_KEY: "secreto-de-prueba", R2_BUCKET: "eli-fotos" }

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("con las cuatro R2_* usa R2, en producción y en desarrollo", () => {
    expect(elegirAlmacenDeFotos({ NODE_ENV: "production", ...R2 })).toBeInstanceOf(AlmacenEnR2)
    expect(elegirAlmacenDeFotos({ NODE_ENV: "development", ...R2 })).toBeInstanceOf(AlmacenEnR2)
  })

  it("en producción sin las R2_* no hay almacén: las fotos no están disponibles", () => {
    expect(elegirAlmacenDeFotos({ NODE_ENV: "production" })).toBeNull()
  })

  it.each(Object.keys(R2))("en producción con las R2_* a medias (falta %s) tampoco hay almacén", (falta) => {
    const incompleto = { NODE_ENV: "production", ...R2, [falta]: undefined }
    expect(elegirAlmacenDeFotos(incompleto)).toBeNull()
    expect(elegirAlmacenDeFotos({ ...incompleto, [falta]: "   " })).toBeNull()
  })

  it("en producción NUNCA cae a disco", () => {
    expect(elegirAlmacenDeFotos({ NODE_ENV: "production" })).not.toBeInstanceOf(AlmacenEnDisco)
    expect(elegirAlmacenDeFotos({ NODE_ENV: "production", R2_BUCKET: "eli-fotos" })).not.toBeInstanceOf(AlmacenEnDisco)
  })

  it("fuera de producción y sin R2_* usa disco local", () => {
    for (const NODE_ENV of ["development", "test", undefined]) {
      expect(elegirAlmacenDeFotos({ NODE_ENV })).toBeInstanceOf(AlmacenEnDisco)
    }
  })

  it("fuera de producción con las R2_* a medias no hay almacén (no se cae a disco en silencio)", () => {
    expect(elegirAlmacenDeFotos({ NODE_ENV: "development", R2_BUCKET: "eli-fotos" })).toBeNull()
  })

  it("una cuenta o un bucket con caracteres que no corresponden (irían a la URL) no se usan", () => {
    expect(elegirAlmacenDeFotos({ NODE_ENV: "production", ...R2, R2_ACCOUNT_ID: "evil.com/x" })).toBeNull()
    expect(elegirAlmacenDeFotos({ NODE_ENV: "production", ...R2, R2_BUCKET: "a/../b" })).toBeNull()
  })

  it("los avisos dicen qué falta, nunca los valores", () => {
    elegirAlmacenDeFotos({ NODE_ENV: "production", ...R2, R2_ACCOUNT_ID: "evil.com/x" })
    elegirAlmacenDeFotos({ NODE_ENV: "production", R2_ACCESS_KEY_ID: "AKIDPRUEBA", R2_SECRET_ACCESS_KEY: "secreto-de-prueba" })
    const dicho = vi.mocked(console.error).mock.calls.flat().join(" ")
    expect(dicho).not.toContain("secreto-de-prueba")
    expect(dicho).not.toContain("AKIDPRUEBA")
    expect(dicho).not.toContain("evil.com")
  })
})

describe("almacenDeFotos: memoizado e inyectable", () => {
  beforeEach(() => {
    for (const variable of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) vi.stubEnv(variable, "")
  })
  afterEach(() => {
    ponerAlmacenDeFotos(undefined)
    vi.unstubAllEnvs()
  })

  it("devuelve el que se fijó, siempre el mismo", () => {
    const doble = crearAlmacenEnMemoria()
    ponerAlmacenDeFotos(doble)
    expect(almacenDeFotos()).toBe(doble)
    expect(almacenDeFotos()).toBe(doble)
  })

  it("fijar null es 'no disponible'", () => {
    ponerAlmacenDeFotos(null)
    expect(almacenDeFotos()).toBeNull()
  })

  it("sin fijar elige por el entorno del proceso (en los tests, disco local) y lo recuerda", () => {
    ponerAlmacenDeFotos(undefined)
    const primero = almacenDeFotos()
    expect(primero).toBeInstanceOf(AlmacenEnDisco)
    expect(almacenDeFotos()).toBe(primero)
  })
})

describe("AlmacenEnDisco (sólo desarrollo)", () => {
  let carpeta: string
  let almacen: AlmacenEnDisco

  beforeEach(async () => {
    carpeta = await mkdtemp(path.join(os.tmpdir(), "eli-fotos-prueba-"))
    almacen = new AlmacenEnDisco(carpeta)
  })
  afterEach(async () => {
    await rm(carpeta, { recursive: true, force: true })
  })

  it("guarda, lee y borra", async () => {
    await almacen.guardar(CLAVE, BYTES)

    const leida = await almacen.leer(CLAVE)
    expect(leida?.tipoMime).toBe("image/webp")
    expect(Array.from(leida!.bytes)).toEqual(Array.from(BYTES))

    await almacen.borrar(CLAVE)
    expect(await almacen.leer(CLAVE)).toBeNull()
  })

  it("leer algo que no existe da null, y borrarlo no es un error", async () => {
    expect(await almacen.leer(CLAVE)).toBeNull()
    await expect(almacen.borrar(CLAVE)).resolves.toBeUndefined()
  })

  it("reemplazar escribe encima del mismo objeto", async () => {
    await almacen.guardar(CLAVE, BYTES)
    await almacen.guardar(CLAVE, Uint8Array.from([9, 9]))
    expect(Array.from((await almacen.leer(CLAVE))!.bytes)).toEqual([9, 9])
  })

  it("guarda, lee y borra la foto de una cuenta, en su carpeta usuarios/<cuenta>/", async () => {
    await almacen.guardar(CLAVE_DE_CUENTA, BYTES)

    expect(await readdir(path.join(carpeta, "usuarios", "u-1"))).toEqual([`cuenta-${UUID}.webp`])
    expect(Array.from((await almacen.leer(CLAVE_DE_CUENTA))!.bytes)).toEqual(Array.from(BYTES))
    await almacen.borrar(CLAVE_DE_CUENTA)
    expect(await almacen.leer(CLAVE_DE_CUENTA)).toBeNull()
  })

  it("valida la clave ANTES de tocar el disco: una escapada lanza y no crea nada", async () => {
    const escapadas = [
      `usuarios/u-1/../../fuera-${UUID}.webp`,
      `usuarios/u-1/../u-2/cuenta-${UUID}.webp`,
      `negocios/negocio-1/../../fuera-${UUID}.webp`,
      `../../etc/passwd`,
      `/etc/passwd`,
      `negocios/negocio-1/logo-${UUID}.png`,
      "",
    ]
    for (const clave of escapadas) {
      await expect(almacen.guardar(clave, BYTES)).rejects.toThrow("Clave de foto inválida")
      await expect(almacen.leer(clave)).rejects.toThrow("Clave de foto inválida")
      await expect(almacen.borrar(clave)).rejects.toThrow("Clave de foto inválida")
    }
    expect(await readdir(carpeta)).toEqual([])
    // Y nada apareció al lado de la carpeta.
    expect((await readdir(path.dirname(carpeta))).filter((nombre) => nombre.startsWith("fuera-"))).toEqual([])
  })

  it("la carpeta por defecto está bajo la carpeta temporal del sistema", () => {
    expect(CARPETA_DE_FOTOS_EN_DESARROLLO).toBe(path.join(os.tmpdir(), "eli-fotos"))
  })
})

describe("AlmacenEnR2", () => {
  const CUENTA = "a1b2c3d4e5f6"
  const BUCKET = "eli-fotos"
  const SECRETO = "secreto-que-no-debe-salir-de-aqui"
  const ID_DE_LLAVE = "AKIDPRUEBA"
  let fetchFalso: ReturnType<typeof vi.fn>
  let almacen: AlmacenEnR2

  beforeEach(() => {
    fetchFalso = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchFalso)
    almacen = new AlmacenEnR2({ cuenta: CUENTA, bucket: BUCKET, accessKeyId: ID_DE_LLAVE, secretAccessKey: SECRETO })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const ultimoPedido = () => fetchFalso.mock.calls.at(-1)![0] as Request

  it("guarda con un PUT firmado (S3, región auto) a <cuenta>.r2.cloudflarestorage.com/<bucket>/<clave>", async () => {
    await almacen.guardar(CLAVE, BYTES, "image/webp")

    const pedido = ultimoPedido()
    expect(pedido.method).toBe("PUT")
    expect(pedido.url).toBe(`https://${CUENTA}.r2.cloudflarestorage.com/${BUCKET}/${CLAVE}`)
    expect(pedido.headers.get("content-type")).toBe("image/webp")
    expect(Array.from(new Uint8Array(await pedido.arrayBuffer()))).toEqual(Array.from(BYTES))
    const firma = pedido.headers.get("authorization") ?? ""
    expect(firma).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDPRUEBA\/\d{8}\/auto\/s3\/aws4_request, /)
    expect(pedido.headers.get("x-amz-date")).toMatch(/^\d{8}T\d{6}Z$/)
  })

  it("lleva un tiempo máximo de espera en cada pedido", async () => {
    await almacen.guardar(CLAVE, BYTES, "image/webp")
    await almacen.leer(CLAVE)
    await almacen.borrar(CLAVE)
    for (const [, init] of fetchFalso.mock.calls as [Request, RequestInit][]) {
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it("lee: 200 trae los bytes y el tipo; 404 es null", async () => {
    fetchFalso.mockResolvedValueOnce(new Response(BYTES, { status: 200, headers: { "Content-Type": "image/webp" } }))
    const leida = await almacen.leer(CLAVE)
    expect(ultimoPedido().method).toBe("GET")
    expect(leida?.tipoMime).toBe("image/webp")
    expect(Array.from(leida!.bytes)).toEqual(Array.from(BYTES))

    fetchFalso.mockResolvedValueOnce(new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 }))
    expect(await almacen.leer(CLAVE)).toBeNull()
  })

  it("borra con un DELETE; que ya no exista (204 o 404) no es un error", async () => {
    fetchFalso.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await almacen.borrar(CLAVE)
    expect(ultimoPedido().method).toBe("DELETE")
    fetchFalso.mockResolvedValueOnce(new Response(null, { status: 404 }))
    await expect(almacen.borrar(CLAVE)).resolves.toBeUndefined()
  })

  it("un error de R2 lanza ErrorDeAlmacenamiento con el estado, sin la clave ni las llaves", async () => {
    for (const [operacion, estado] of [["guardar", 403], ["leer", 500], ["borrar", 503]] as const) {
      fetchFalso.mockResolvedValueOnce(new Response("<Error>AccessDenied " + SECRETO + "</Error>", { status: estado }))
      const error = await (operacion === "guardar"
        ? almacen.guardar(CLAVE, BYTES, "image/webp")
        : operacion === "leer"
          ? almacen.leer(CLAVE)
          : almacen.borrar(CLAVE)
      ).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ErrorDeAlmacenamiento)
      expect((error as ErrorDeAlmacenamiento).estado).toBe(estado)
      const mensaje = (error as Error).message
      expect(mensaje).toContain(String(estado))
      expect(mensaje).not.toContain(SECRETO)
      expect(mensaje).not.toContain(ID_DE_LLAVE)
      expect(mensaje).not.toContain(CLAVE)
    }
  })

  it("valida la clave ANTES de salir a la red", async () => {
    for (const clave of [`negocios/negocio-1/../x-${UUID}.webp`, "../secreto", "", `${CLAVE}?acl`]) {
      await expect(almacen.guardar(clave, BYTES, "image/webp")).rejects.toThrow("Clave de foto inválida")
      await expect(almacen.leer(clave)).rejects.toThrow("Clave de foto inválida")
      await expect(almacen.borrar(clave)).rejects.toThrow("Clave de foto inválida")
    }
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it("las llaves nunca viajan en claro: ni en la URL ni en las cabeceras", async () => {
    await almacen.guardar(CLAVE, BYTES, "image/webp")
    const pedido = ultimoPedido()
    const cabeceras = JSON.stringify([...pedido.headers.entries()])
    expect(pedido.url).not.toContain(SECRETO)
    expect(cabeceras).not.toContain(SECRETO)
  })
})
