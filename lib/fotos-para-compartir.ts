import sharp from "sharp"
import { almacenDeFotos, claveDeFotoPropia, type AlmacenDeFotos } from "@/lib/almacenamiento-de-fotos"
import { prisma } from "@/lib/prisma"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * El logo y la portada del negocio, listos para la imagen que aparece al
 * compartir su enlace de reservas (`app/reservar/[slug]/opengraph-image.tsx`).
 * SÓLO SERVIDOR (usa `sharp` y el almacén).
 *
 * La imagen para compartir la dibuja `next/og` (satori + resvg), que NO
 * decodifica WebP —el único formato que guardamos (`lib/procesar-foto.ts`)—: un
 * `<img>` con un WebP sale en blanco, sin error. Por eso cada foto se lee
 * DIRECTO del almacén (no por HTTP a nuestro propio dominio), se pasa a PNG
 * (logo, ya recortado en círculo) o JPEG (portada, ya recortada a la banda) con
 * `sharp`, y se entrega como data URL, del tamaño exacto con que se dibuja.
 *
 * Lo que sale de la base no se confía: la clave sale de `claveDeFotoPropia`, que
 * sólo acepta la forma exacta de una clave nuestra y que sea de ESTE negocio (el
 * del `slug`, no el de ninguna otra fila), antes de tocar el almacén.
 *
 * Es de adorno, así que nada acá puede romper la imagen: sin almacén, un objeto
 * que no está, un error de lectura o de la base, una lectura que se demora, un
 * archivo enorme o ilegible dejan esa foto en `null`, y la imagen cae al diseño
 * de las iniciales sobre el color del negocio.
 */

/** Las medidas de la imagen para compartir (el tamaño estándar de Open Graph). */
export const MEDIDAS_DE_LA_IMAGEN = {
  ancho: 1200,
  alto: 630,
  /** La banda de arriba: el color del negocio o su portada. */
  banda: 210,
  /** El círculo del logo, sin su borde. */
  logo: 148,
} as const

/**
 * Las fotos que guardamos pesan unos cientos de KB (portada 1600 × 400, logo
 * hasta 512 × 512). Lo que pase de acá no es una foto nuestra: no se decodifica.
 */
export const LIMITE_DE_BYTES = 2 * 1024 * 1024

/** Un guardado de 1600 × 400 son 640 000 píxeles: con esto sobra y una "bomba de píxeles" no pasa. */
export const LIMITE_DE_PIXELES = 4_000_000

/** Cuánto se espera al almacén. Un rastreador (WhatsApp, Facebook) no espera más que unos segundos. */
export const ESPERA_MAXIMA_EN_MS = 4_000

/** El fondo de una portada con transparencia: el de la imagen (`CREMA`). */
const FONDO_DE_LA_PORTADA = "#fcfbf8"

export type TipoDeFotoParaCompartir = "logo" | "portada"

export interface FotosParaCompartir {
  /** Data URL de un PNG cuadrado recortado en círculo, o `null` si no hay logo que se pueda usar. */
  logo: string | null
  /** Data URL de un JPEG de la banda (`ancho` × `banda`), o `null` si no hay portada que se pueda usar. */
  portada: string | null
}

export const SIN_FOTOS: FotosParaCompartir = { logo: null, portada: null }

const comoDataUrl = (tipoMime: string, bytes: Buffer): string => `data:${tipoMime};base64,${bytes.toString("base64")}`

/**
 * La foto de la base, ya lista para `<img>`. Lanza si no se puede leer o si es
 * demasiado grande: quien llama lo toma como "sin foto".
 */
export async function prepararFotoParaCompartir(bytes: Uint8Array, tipo: TipoDeFotoParaCompartir): Promise<string> {
  if (bytes.byteLength === 0 || bytes.byteLength > LIMITE_DE_BYTES) throw new Error("La foto no tiene un tamaño que sirva")
  const entrada = () => sharp(bytes, { limitInputPixels: LIMITE_DE_PIXELES, failOn: "error", animated: false })

  if (tipo === "logo") {
    // El doble de lo que se dibuja, para que se vea nítido; recortado igual que
    // en la página (`object-cover` dentro de un círculo). Lo que queda fuera del
    // círculo es transparente.
    const lado = MEDIDAS_DE_LA_IMAGEN.logo * 2
    const mascara = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}"><circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2}"/></svg>`)
    const png = await entrada()
      .resize(lado, lado, { fit: "cover" })
      .ensureAlpha()
      .composite([{ input: mascara, blend: "dest-in" }])
      .png({ compressionLevel: 9 })
      .toBuffer()
    return comoDataUrl("image/png", png)
  }

  const jpeg = await entrada()
    .resize(MEDIDAS_DE_LA_IMAGEN.ancho, MEDIDAS_DE_LA_IMAGEN.banda, { fit: "cover", position: "centre" })
    .flatten({ background: FONDO_DE_LA_PORTADA })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer()
  return comoDataUrl("image/jpeg", jpeg)
}

/** Espera `promesa` a lo sumo `ms`; pasado ese tiempo la da por perdida (lanza). */
async function conEspera<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  // Si la lectura termina después de que se dio por perdida, su error no queda sin atender.
  promesa.catch(() => undefined)
  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new Error("El almacén tardó demasiado")), ms)
      }),
    ])
  } finally {
    clearTimeout(temporizador)
  }
}

async function cargarFoto(almacen: AlmacenDeFotos, clave: string, tipo: TipoDeFotoParaCompartir, esperaMaxima: number): Promise<string | null> {
  try {
    const foto = await conEspera(almacen.leer(clave), esperaMaxima)
    // El objeto no está: la columna apunta a algo que ya no existe. Sin foto, sin ruido.
    if (!foto) return null
    return await prepararFotoParaCompartir(foto.bytes, tipo)
  } catch (error) {
    registrarError(`leyendo la ${tipo} para la imagen de compartir`, error)
    return null
  }
}

export interface OpcionesDeFotosParaCompartir {
  /** El almacén a usar (los tests); por defecto, el del proceso (`almacenDeFotos()`). */
  almacen?: AlmacenDeFotos | null
  /** Cuánto esperar a cada lectura. */
  esperaMaximaEnMs?: number
}

/**
 * El logo y la portada del negocio del `slug`, como data URLs. Cualquier
 * falla deja esa foto (o las dos) en `null`; nunca lanza.
 */
export async function leerFotosParaCompartir(slug: string, opciones: OpcionesDeFotosParaCompartir = {}): Promise<FotosParaCompartir> {
  let negocio: { id: string; logoUrl: string | null; coverUrl: string | null } | null
  try {
    negocio = await prisma.business.findUnique({ where: { slug }, select: { id: true, logoUrl: true, coverUrl: true } })
  } catch (error) {
    registrarError("leyendo las fotos del negocio para la imagen de compartir", error)
    return SIN_FOTOS
  }
  if (!negocio) return SIN_FOTOS

  // La clave sale de la columna SÓLO si tiene la forma de una clave nuestra y es de este negocio.
  const claveDelLogo = claveDeFotoPropia(negocio.logoUrl, negocio.id)
  const claveDeLaPortada = claveDeFotoPropia(negocio.coverUrl, negocio.id)
  if (!claveDelLogo && !claveDeLaPortada) return SIN_FOTOS

  const almacen = opciones.almacen === undefined ? almacenDeFotos() : opciones.almacen
  if (!almacen) return SIN_FOTOS

  const espera = opciones.esperaMaximaEnMs ?? ESPERA_MAXIMA_EN_MS
  const [logo, portada] = await Promise.all([
    claveDelLogo ? cargarFoto(almacen, claveDelLogo, "logo", espera) : null,
    claveDeLaPortada ? cargarFoto(almacen, claveDeLaPortada, "portada", espera) : null,
  ])
  return { logo, portada }
}
