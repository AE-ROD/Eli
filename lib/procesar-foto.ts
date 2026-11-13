import sharp from "sharp"

/**
 * Procesa la foto que sube una persona antes de guardarla (SÓLO SERVIDOR: usa
 * `sharp`, no se importa desde un componente de cliente).
 *
 * Nada de lo que sube el usuario se guarda tal cual: se decodifica, se endereza,
 * se reduce y se vuelve a codificar siempre como WebP SIN metadatos. Eso
 * cierra de una vez varias puertas:
 * - el tipo se decide por el CONTENIDO (firma del archivo y `sharp`), nunca por
 *   el `Content-Type` ni por la extensión que declara quien sube;
 * - SVG (puede traer scripts), GIF/APNG/WebP animados, HEIC/AVIF, TIFF y PDF no
 *   pasan: sólo JPEG, PNG y WebP estáticos;
 * - EXIF, GPS (la casa de la dueña, la ubicación del celular), ICC y cualquier
 *   dato escondido en la imagen se pierden en la reencodificación;
 * - una "bomba de píxeles" (un PNG de 100 000 × 100 000 que pesa 50 KB) se corta
 *   por `limitInputPixels` antes de decodificar;
 * - lo que se guarda y se sirve es lo que generamos nosotros, no los bytes que
 *   mandó el navegador.
 */

export type TipoDeFoto = "logo" | "portada" | "miembro" | "cuenta"

/** Las fotos que cuelgan de un negocio (`negocios/<negocio>/...`); la de la cuenta cuelga de la persona. */
export type TipoDeFotoDeNegocio = Exclude<TipoDeFoto, "cuenta">

/** Hasta cuántos píxeles de entrada se aceptan (un celular de 48 MP son ~48 000 000 sólo con zoom; lo normal es 12 MP). */
export const LIMITE_DE_PIXELES = 40_000_000

/** Calidad del WebP de salida. */
const CALIDAD_WEBP = 82

/** Cuánto se deja trabajar a `sharp` con una imagen antes de darla por mala. */
const SEGUNDOS_MAXIMOS = 20

export const TIPO_MIME_DE_SALIDA = "image/webp"

/**
 * A qué tamaño queda cada tipo de foto.
 *
 * - logo: cabe en 512 × 512 sin recortar (`inside`) y sin agrandar: se ve en un
 *   círculo de 80 px, el doble de resolución para pantallas retina sobra.
 *   Conserva la transparencia.
 * - portada: 4:1, recortada del centro (`cover`). La cabecera de la página
 *   pública (`app/reservar/[slug]/_pagina/mini-pagina.tsx`) es una franja de
 *   `h-28` en celular y `sm:h-40` desde 640 px, de hasta 832 px de ancho: su
 *   proporción va de ~3,2:1 a ~5,2:1 según la pantalla y la foto se muestra con
 *   `object-cover`. 4:1 queda al medio: en el ancho máximo recorta algo arriba y
 *   abajo, en el celular algo a los lados, y en ninguno se pierde el centro.
 * - miembro: cuadrada 640 × 640, recortada del centro; se muestra en círculos
 *   de 56 px y en tarjetas más grandes.
 * - cuenta: cuadrada 512 × 512, recortada del centro; sólo se ve en el avatar
 *   del panel (de 40 a 96 px), así que 512 sobra incluso en pantallas retina.
 */
export const MEDIDAS_DE_FOTO = {
  logo: { ancho: 512, alto: 512, ajuste: "inside" },
  portada: { ancho: 1600, alto: 400, ajuste: "cover" },
  miembro: { ancho: 640, alto: 640, ajuste: "cover" },
  cuenta: { ancho: 512, alto: 512, ajuste: "cover" },
} as const satisfies Record<TipoDeFoto, { ancho: number; alto: number; ajuste: "inside" | "cover" }>

export type MotivoDeFotoInvalida = "formato" | "animada" | "enorme" | "ilegible"

/**
 * La imagen no sirve. El mensaje es para la persona (el endpoint lo devuelve
 * en un 400): no dice nada del servidor ni de `sharp`.
 */
export class FotoInvalida extends Error {
  constructor(
    readonly motivo: MotivoDeFotoInvalida,
    mensaje: string
  ) {
    super(mensaje)
    this.name = "FotoInvalida"
  }
}

const MENSAJES: Record<MotivoDeFotoInvalida, string> = {
  formato: "La foto tiene que ser JPG, PNG o WebP.",
  animada: "La foto no puede ser animada. Sube una imagen fija (JPG, PNG o WebP).",
  enorme: "La foto tiene demasiados píxeles. Sube una más chica (hasta unos 40 megapíxeles).",
  ilegible: "No pudimos leer la foto: está dañada o incompleta. Prueba con otra.",
}

const invalida = (motivo: MotivoDeFotoInvalida) => new FotoInvalida(motivo, MENSAJES[motivo])

type Formato = "jpeg" | "png" | "webp"

/**
 * El formato según la firma de los primeros bytes, antes de pasarle nada a
 * `sharp`: así SVG, HEIC/AVIF, TIFF, PDF y compañía ni llegan a los
 * decodificadores de libvips.
 */
function formatoPorFirma(bytes: Uint8Array): Formato | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg"
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte)
  ) {
    return "png"
  }
  if (bytes.length >= 12 && texto(bytes, 0, 4) === "RIFF" && texto(bytes, 8, 4) === "WEBP") return "webp"
  return null
}

function texto(bytes: Uint8Array, desde: number, largo: number): string {
  return String.fromCharCode(...bytes.subarray(desde, desde + largo))
}

/** Un PNG animado (APNG) trae un trozo `acTL` antes de los datos de la imagen. */
function esPngAnimado(bytes: Uint8Array): boolean {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let posicion = 8
  while (posicion + 8 <= bytes.length) {
    const largo = vista.getUint32(posicion)
    const tipo = texto(bytes, posicion + 4, 4)
    if (tipo === "acTL") return true
    if (tipo === "IDAT" || tipo === "IEND") return false
    posicion += 12 + largo
  }
  return false
}

/** Un WebP animado lo avisa con un bit del trozo `VP8X`. */
function esWebpAnimado(bytes: Uint8Array): boolean {
  return bytes.length >= 21 && texto(bytes, 12, 4) === "VP8X" && (bytes[20] & 0x02) !== 0
}

/**
 * Valida y reduce una foto. Devuelve siempre un WebP sin metadatos, o lanza
 * `FotoInvalida` (el endpoint responde 400).
 */
export async function procesarFoto(
  bytes: Uint8Array,
  tipo: TipoDeFoto
): Promise<{ bytes: Buffer; tipoMime: typeof TIPO_MIME_DE_SALIDA }> {
  const formato = formatoPorFirma(bytes)
  if (!formato) throw invalida("formato")
  if ((formato === "png" && esPngAnimado(bytes)) || (formato === "webp" && esWebpAnimado(bytes))) {
    throw invalida("animada")
  }

  const medida = MEDIDAS_DE_FOTO[tipo]
  const imagen = sharp(bytes, { limitInputPixels: LIMITE_DE_PIXELES, failOn: "error" })

  try {
    const metadatos = await imagen.metadata()
    // La firma ya filtró, pero el formato REAL lo dice el decodificador: si no
    // coinciden (un archivo armado para engañar), no pasa.
    if (metadatos.format !== formato) throw invalida("formato")
    if ((metadatos.pages ?? 1) > 1) throw invalida("animada")

    const reducida = imagen
      // Endereza según la orientación EXIF; después el EXIF se descarta.
      .rotate()
      .resize({
        width: medida.ancho,
        height: medida.alto,
        fit: medida.ajuste,
        // Al logo no se le agranda: se respeta lo que subieron. Portada y foto
        // de integrante salen siempre del tamaño de la medida: la página las
        // dibuja en un marco fijo y así no depende de lo que se subió.
        withoutEnlargement: tipo === "logo",
      })
      .webp({ quality: CALIDAD_WEBP })
      // Sin `.keepMetadata()`: sharp no copia EXIF, GPS, ICC ni XMP a la salida.
      .timeout({ seconds: SEGUNDOS_MAXIMOS })

    return { bytes: await reducida.toBuffer(), tipoMime: TIPO_MIME_DE_SALIDA }
  } catch (error) {
    if (error instanceof FotoInvalida) throw error
    // `sharp` lanza un `Error` común: el mensaje distingue la bomba de píxeles;
    // lo demás (truncada, dañada, inesperada) es "no se pudo leer".
    if (error instanceof Error && /pixel limit/i.test(error.message)) throw invalida("enorme")
    throw invalida("ilegible")
  }
}
