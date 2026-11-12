import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { AwsClient } from "aws4fetch"
import type { TipoDeFotoDeNegocio } from "@/lib/procesar-foto"

/**
 * Dónde viven las fotos (logo, portada, foto de cada integrante y foto de la
 * cuenta de cada persona). SÓLO SERVIDOR.
 *
 * El navegador nunca habla con el almacenamiento: sube la foto a NUESTRO
 * endpoint (`lib/procesar-foto.ts` la valida y la reduce), y la página pública
 * la pide a NUESTRA ruta `/fotos/...`, del mismo origen. Por eso la CSP no se
 * abre (`img-src 'self'`) y el bucket de R2 no queda expuesto: ni lectura
 * pública ni dominio propio, sólo las llaves del servidor.
 *
 * Tres implementaciones detrás de una misma interfaz:
 * - R2 de Cloudflare (API S3 con `aws4fetch`): producción;
 * - disco local bajo `os.tmpdir()/eli-fotos`: SÓLO desarrollo, sin `R2_*`;
 * - memoria: el doble de los tests (`pruebas/almacen-de-fotos.ts`).
 *
 * En producción sin las cuatro variables `R2_*` no hay almacén
 * (`almacenDeFotos()` devuelve `null`): subir o quitar una foto responde 503,
 * leer una responde 404, y el resto de la app sigue como siempre.
 */

export interface FotoLeida {
  bytes: Uint8Array
  tipoMime: string
}

export interface AlmacenDeFotos {
  /** Escribe (o reemplaza) el objeto. Lanza si no pudo. */
  guardar(clave: string, bytes: Uint8Array, tipoMime: string): Promise<void>
  /** Borra el objeto. Que no exista no es un error. Lanza si no pudo. */
  borrar(clave: string): Promise<void>
  /** Los bytes del objeto, o `null` si no existe. Lanza si no pudo preguntar. */
  leer(clave: string): Promise<FotoLeida | null>
}

// ─── Claves ──────────────────────────────────────────────────────────────────

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/**
 * Las ÚNICAS dos formas de clave que existen:
 *
 * - del negocio: `negocios/<negocio>/<logo|portada|miembro-<id>>-<uuid>.webp`;
 * - de la cuenta de una persona: `usuarios/<cuenta>/cuenta-<uuid>.webp`.
 *
 * Tanto la ruta pública como cada implementación la validan antes de tocar
 * nada: sin `..`, sin barras de más, sin mayúsculas raras ni extensiones.
 */
const FORMA_DE_CLAVE_DE_NEGOCIO = new RegExp(
  `^negocios/([A-Za-z0-9_-]{1,64})/(logo|portada|miembro-[A-Za-z0-9_-]{1,64})-${UUID}\\.webp$`
)
const FORMA_DE_CLAVE_DE_CUENTA = new RegExp(`^usuarios/([A-Za-z0-9_-]{1,64})/cuenta-${UUID}\\.webp$`)

export function esClaveDeFoto(clave: unknown): clave is string {
  return (
    typeof clave === "string" &&
    clave.length <= 256 &&
    (FORMA_DE_CLAVE_DE_NEGOCIO.test(clave) || FORMA_DE_CLAVE_DE_CUENTA.test(clave))
  )
}

/**
 * Una clave NUEVA para una foto. Lleva un uuid, así que nunca se pisa una
 * anterior: cambiar la foto cambia la URL, y por eso la ruta pública puede
 * mandarla con `Cache-Control: immutable`.
 */
export function claveNuevaDeFoto(datos: { businessId: string; tipo: TipoDeFotoDeNegocio; miembroId?: string }): string {
  const nombre = datos.tipo === "miembro" ? `miembro-${datos.miembroId ?? ""}` : datos.tipo
  const clave = `negocios/${datos.businessId}/${nombre}-${randomUUID()}.webp`
  // Un id con caracteres raros no debe llegar a una clave: se corta acá.
  if (!esClaveDeFoto(clave)) throw new Error("No se pudo armar una clave de foto válida")
  return clave
}

/**
 * Una clave NUEVA para la foto de la cuenta de una persona:
 * `usuarios/<cuenta>/cuenta-<uuid>.webp`. Con uuid, como las demás: cambiar la
 * foto cambia la URL y lo ya servido nunca cambia.
 */
export function claveNuevaDeFotoDeLaCuenta(usuarioId: string): string {
  const clave = `usuarios/${usuarioId}/cuenta-${randomUUID()}.webp`
  // Un id con caracteres raros no debe llegar a una clave: se corta acá.
  if (!esClaveDeFoto(clave)) throw new Error("No se pudo armar una clave de foto válida")
  return clave
}

/** Lo que se guarda en las columnas (`logoUrl`, `coverUrl`, `fotoUrl`) y se pide desde el navegador. */
export const rutaPublicaDeFoto = (clave: string): string => `/fotos/${clave}`

/**
 * La clave de una foto que está guardada en una columna, SÓLO si es una foto
 * de este negocio. Lo que viene de la base no se borra ni se sirve sin pasar
 * por acá: una fila con una ruta rara (a mano, de una versión vieja, de otro
 * negocio) devuelve `null` y no se toca.
 */
export function claveDeFotoPropia(url: string | null | undefined, businessId: string): string | null {
  if (!url || !url.startsWith("/fotos/")) return null
  const clave = url.slice("/fotos/".length)
  if (!esClaveDeFoto(clave)) return null
  return clave.startsWith(`negocios/${businessId}/`) ? clave : null
}

/**
 * La clave de la foto de una CUENTA que está guardada en `User.fotoUrl`, SÓLO
 * si es de la carpeta de esa persona (`usuarios/<su id>/`). Igual que
 * `claveDeFotoPropia`, pero por persona: una fila con una ruta rara (armada a
 * mano, de otra cuenta, del negocio de alguien) devuelve `null`, y entonces ni
 * se sirve, ni se muestra, ni se borra. Una persona nunca apunta a un objeto de
 * otra.
 */
export function claveDeFotoDeLaCuenta(url: string | null | undefined, usuarioId: string | null | undefined): string | null {
  if (!url || !usuarioId || !url.startsWith("/fotos/")) return null
  const clave = url.slice("/fotos/".length)
  if (!esClaveDeFoto(clave)) return null
  return clave.startsWith(`usuarios/${usuarioId}/`) ? clave : null
}

// ─── R2 ──────────────────────────────────────────────────────────────────────

/** Cuánto se espera a R2 antes de darlo por caído. */
const TIMEOUT_DE_R2_MS = 15_000

/** Una respuesta inesperada del almacenamiento. Sólo trae el estado: ni claves ni la ruta completa. */
export class ErrorDeAlmacenamiento extends Error {
  constructor(
    readonly operacion: "guardar" | "borrar" | "leer",
    readonly estado: number
  ) {
    super(`El almacenamiento de fotos respondió ${estado} al ${operacion}`)
    this.name = "ErrorDeAlmacenamiento"
  }
}

interface ConfiguracionDeR2 {
  cuenta: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

/**
 * R2 por su API compatible con S3, firmando cada pedido con `aws4fetch`
 * (región "auto", servicio "s3"). Sin reintentos escondidos: si R2 falla, el
 * endpoint responde error y la persona vuelve a intentar.
 */
export class AlmacenEnR2 implements AlmacenDeFotos {
  private readonly cliente: AwsClient
  private readonly base: string

  constructor(configuracion: ConfiguracionDeR2) {
    this.cliente = new AwsClient({
      accessKeyId: configuracion.accessKeyId,
      secretAccessKey: configuracion.secretAccessKey,
      service: "s3",
      region: "auto",
    })
    this.base = `https://${configuracion.cuenta}.r2.cloudflarestorage.com/${configuracion.bucket}`
  }

  private async pedir(clave: string, init: RequestInit): Promise<Response> {
    exigirClave(clave)
    const firmado = await this.cliente.sign(`${this.base}/${clave}`, init)
    return fetch(firmado, { signal: AbortSignal.timeout(TIMEOUT_DE_R2_MS) })
  }

  async guardar(clave: string, bytes: Uint8Array, tipoMime: string): Promise<void> {
    const respuesta = await this.pedir(clave, {
      method: "PUT",
      body: bytes as BodyInit,
      headers: { "Content-Type": tipoMime },
    })
    if (!respuesta.ok) throw new ErrorDeAlmacenamiento("guardar", respuesta.status)
    await respuesta.body?.cancel()
  }

  async borrar(clave: string): Promise<void> {
    const respuesta = await this.pedir(clave, { method: "DELETE" })
    // S3 responde 204 aunque el objeto no exista; un 404 tampoco sería un problema.
    if (!respuesta.ok && respuesta.status !== 404) throw new ErrorDeAlmacenamiento("borrar", respuesta.status)
    await respuesta.body?.cancel()
  }

  async leer(clave: string): Promise<FotoLeida | null> {
    const respuesta = await this.pedir(clave, { method: "GET" })
    if (respuesta.status === 404) {
      await respuesta.body?.cancel()
      return null
    }
    if (!respuesta.ok) throw new ErrorDeAlmacenamiento("leer", respuesta.status)
    return {
      bytes: new Uint8Array(await respuesta.arrayBuffer()),
      tipoMime: respuesta.headers.get("content-type") ?? "application/octet-stream",
    }
  }
}

// ─── Disco (sólo desarrollo) ─────────────────────────────────────────────────

/** Carpeta de las fotos en desarrollo. Se pierde con el sistema, a propósito. */
export const CARPETA_DE_FOTOS_EN_DESARROLLO = path.join(os.tmpdir(), "eli-fotos")

/** Exige una clave válida ANTES de tocar disco o red. */
function exigirClave(clave: string): void {
  if (!esClaveDeFoto(clave)) throw new Error("Clave de foto inválida")
}

/**
 * Fotos en una carpeta local, para desarrollar sin R2. Todo lo que se guarda
 * es WebP (`procesarFoto` no genera otra cosa), así que el tipo se deduce.
 */
export class AlmacenEnDisco implements AlmacenDeFotos {
  private readonly carpeta: string

  constructor(carpeta: string = CARPETA_DE_FOTOS_EN_DESARROLLO) {
    // La carpeta es de desarrollo y vive fuera del proyecto (`os.tmpdir()`): sin
    // el comentario, Turbopack rastrea el proyecto entero al construir.
    this.carpeta = path.resolve(/* turbopackIgnore: true */ carpeta)
  }

  /** La ruta del archivo, ya validada la clave y comprobado que no sale de la carpeta. */
  private ruta(clave: string): string {
    exigirClave(clave)
    const destino = path.resolve(this.carpeta, ...clave.split("/"))
    if (!destino.startsWith(this.carpeta + path.sep)) throw new Error("Clave de foto inválida")
    return destino
  }

  async guardar(clave: string, bytes: Uint8Array): Promise<void> {
    const destino = this.ruta(clave)
    await mkdir(path.dirname(destino), { recursive: true })
    await writeFile(destino, bytes)
  }

  async borrar(clave: string): Promise<void> {
    await rm(this.ruta(clave), { force: true })
  }

  async leer(clave: string): Promise<FotoLeida | null> {
    try {
      return { bytes: new Uint8Array(await readFile(this.ruta(clave))), tipoMime: "image/webp" }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  }
}

// ─── Cuál se usa ─────────────────────────────────────────────────────────────

export interface EntornoDeFotos {
  NODE_ENV?: string
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET?: string
}

/** Las variables que interesan, leídas del proceso. Sólo el servidor las ve. */
export function entornoDeFotos(): EntornoDeFotos {
  return {
    NODE_ENV: process.env.NODE_ENV,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
  }
}

// La cuenta y el bucket entran en la URL del pedido: sólo caracteres de nombre.
const NOMBRE_DE_CUENTA = /^[A-Za-z0-9]{1,64}$/
const NOMBRE_DE_BUCKET = /^[A-Za-z0-9][A-Za-z0-9.-]{1,62}$/

let avisoDeConfiguracion = false

function avisarUnaVez(mensaje: string): void {
  if (avisoDeConfiguracion) return
  avisoDeConfiguracion = true
  console.error(`[fotos] ${mensaje}`)
}

/**
 * Qué almacén corresponde a este entorno (la regla, sin memoria ni efectos).
 *
 * - Las cuatro `R2_*`: R2, en cualquier entorno.
 * - Producción sin las cuatro: `null` (las fotos no están disponibles).
 * - Fuera de producción y ninguna `R2_*`: disco local.
 * - Fuera de producción y algunas pero no todas: `null`. Una configuración a
 *   medias es un error que se ve, no un respaldo silencioso a disco.
 *
 * Los mensajes dicen QUÉ falta, nunca los valores.
 */
export function elegirAlmacenDeFotos(entorno: EntornoDeFotos): AlmacenDeFotos | null {
  const cuenta = entorno.R2_ACCOUNT_ID?.trim()
  const accessKeyId = entorno.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = entorno.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = entorno.R2_BUCKET?.trim()
  const presentes = [cuenta, accessKeyId, secretAccessKey, bucket].filter(Boolean).length

  if (presentes === 4) {
    if (!NOMBRE_DE_CUENTA.test(cuenta!) || !NOMBRE_DE_BUCKET.test(bucket!)) {
      avisarUnaVez("R2_ACCOUNT_ID o R2_BUCKET tienen caracteres que no corresponden: las fotos no están disponibles.")
      return null
    }
    return new AlmacenEnR2({ cuenta: cuenta!, bucket: bucket!, accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! })
  }

  if (entorno.NODE_ENV === "production") {
    avisarUnaVez(
      presentes === 0
        ? "Faltan las variables R2_* (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET): las fotos no están disponibles."
        : "Faltan algunas variables R2_*: las cuatro son obligatorias, las fotos no están disponibles."
    )
    return null
  }

  if (presentes === 0) return new AlmacenEnDisco()
  avisarUnaVez("Hay variables R2_* a medias: completa las cuatro (o quita todas para usar disco local). Las fotos no están disponibles.")
  return null
}

let elegido: { almacen: AlmacenDeFotos | null } | null = null

/**
 * El almacén de este proceso, o `null` si no hay (producción sin R2). Se elige
 * una vez, la primera que se pide.
 */
export function almacenDeFotos(): AlmacenDeFotos | null {
  elegido ??= { almacen: elegirAlmacenDeFotos(entornoDeFotos()) }
  return elegido.almacen
}

/**
 * Para los tests: fija el almacén (`null` = "no disponible") o, con
 * `undefined`, olvida lo fijado y vuelve a elegir por el entorno.
 */
export function ponerAlmacenDeFotos(almacen: AlmacenDeFotos | null | undefined): void {
  elegido = almacen === undefined ? null : { almacen }
}
