import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { FotoInvalida, LIMITE_DE_PIXELES, MEDIDAS_DE_FOTO, procesarFoto } from "./procesar-foto"

// Imágenes de prueba generadas con sharp: no hay archivos binarios en el repo.

const ROJO = { r: 220, g: 30, b: 30 }
const AZUL = { r: 30, g: 30, b: 220 }

/** Mitad izquierda roja, mitad derecha azul: sirve para ver si la rotación se aplicó. */
async function rojoYAzul(ancho: number, alto: number): Promise<Buffer> {
  const izquierda = await sharp({ create: { width: ancho / 2, height: alto, channels: 3, background: ROJO } }).png().toBuffer()
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: AZUL } })
    .composite([{ input: izquierda, left: 0, top: 0 }])
    .png()
    .toBuffer()
}

const liso = (ancho: number, alto: number, canales: 3 | 4 = 3) =>
  sharp({ create: { width: ancho, height: alto, channels: canales, background: canales === 4 ? { ...ROJO, alpha: 0.5 } : ROJO } })

/** Ruido: no se comprime, así que un recorte a la mitad cae en medio de los datos. */
async function ruido(formato: "jpeg" | "png" | "webp"): Promise<Buffer> {
  const pixeles = Buffer.alloc(200 * 200 * 3)
  for (let i = 0; i < pixeles.length; i++) pixeles[i] = (i * 2654435761) % 251
  return sharp(pixeles, { raw: { width: 200, height: 200, channels: 3 } }).toFormat(formato).toBuffer()
}

async function medir(bytes: Uint8Array) {
  const metadatos = await sharp(bytes).metadata()
  return { formato: metadatos.format, ancho: metadatos.width, alto: metadatos.height, metadatos }
}

async function rechazada(entrada: Uint8Array, tipo: "logo" | "portada" | "miembro" = "miembro") {
  const error = await procesarFoto(entrada, tipo).then(
    () => null,
    (e: unknown) => e
  )
  expect(error).toBeInstanceOf(FotoInvalida)
  return error as FotoInvalida
}

describe("procesarFoto: lo que acepta", () => {
  it.each(["jpeg", "png", "webp"] as const)("una %s válida sale como WebP", async (formato) => {
    const entrada = await liso(1000, 800).toFormat(formato).toBuffer()

    const { bytes, tipoMime } = await procesarFoto(entrada, "miembro")

    expect(tipoMime).toBe("image/webp")
    const salida = await medir(bytes)
    expect(salida.formato).toBe("webp")
    expect(salida.metadatos.pages ?? 1).toBe(1)
  })

  it("las medidas: logo cabe en 512, portada es 1600 × 400 y la foto de integrante 640 × 640", async () => {
    const grande = await liso(3000, 2000).jpeg().toBuffer()

    const logo = await medir((await procesarFoto(grande, "logo")).bytes)
    expect([logo.ancho, logo.alto]).toEqual([512, 341]) // 3:2 dentro de 512 × 512, sin recortar
    const portada = await medir((await procesarFoto(grande, "portada")).bytes)
    expect([portada.ancho, portada.alto]).toEqual([MEDIDAS_DE_FOTO.portada.ancho, MEDIDAS_DE_FOTO.portada.alto])
    expect([portada.ancho, portada.alto]).toEqual([1600, 400])
    const miembro = await medir((await procesarFoto(grande, "miembro")).bytes)
    expect([miembro.ancho, miembro.alto]).toEqual([640, 640])
  })

  it("el logo no se agranda ni se recorta: uno chico queda como vino y uno apaisado conserva la proporción", async () => {
    const chico = await medir((await procesarFoto(await liso(100, 60).png().toBuffer(), "logo")).bytes)
    expect([chico.ancho, chico.alto]).toEqual([100, 60])

    const apaisado = await medir((await procesarFoto(await liso(2000, 500).png().toBuffer(), "logo")).bytes)
    expect([apaisado.ancho, apaisado.alto]).toEqual([512, 128])
  })

  it("portada y foto de integrante salen siempre del tamaño de la medida, aunque lo subido sea más chico", async () => {
    const chica = await liso(100, 60).png().toBuffer()
    const portada = await medir((await procesarFoto(chica, "portada")).bytes)
    expect([portada.ancho, portada.alto]).toEqual([1600, 400])
    const miembro = await medir((await procesarFoto(chica, "miembro")).bytes)
    expect([miembro.ancho, miembro.alto]).toEqual([640, 640])
  })

  it("el logo conserva la transparencia", async () => {
    const conAlfa = await liso(200, 200, 4).png().toBuffer()

    const { bytes } = await procesarFoto(conAlfa, "logo")

    const { metadatos } = await medir(bytes)
    expect(metadatos.hasAlpha).toBe(true)
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
    expect(data[info.channels - 1]).toBeLessThan(255) // el canal alfa del primer píxel
  })

  it("endereza según la orientación EXIF (la foto de celular girada sale derecha)", async () => {
    // 800 × 400 con EXIF "girar 90° a la derecha": se ve como 400 × 800, con el rojo arriba.
    const girada = await sharp(await rojoYAzul(800, 400)).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    expect((await sharp(girada).metadata()).orientation).toBe(6)

    const { bytes } = await procesarFoto(girada, "logo")

    const salida = await medir(bytes)
    expect([salida.ancho, salida.alto]).toEqual([256, 512])
    const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const pixel = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3))
    expect(pixel(128, 20)[0]).toBeGreaterThan(150) // arriba: rojo
    expect(pixel(128, 20)[2]).toBeLessThan(100)
    expect(pixel(128, 490)[2]).toBeGreaterThan(150) // abajo: azul
    expect(pixel(128, 490)[0]).toBeLessThan(100)
    // La salida no arrastra la orientación: ya está derecha.
    expect(salida.metadatos.orientation).toBeUndefined()
  })
})

describe("procesarFoto: sin metadatos", () => {
  it("EXIF y GPS no salen en el WebP (la ubicación de quien sacó la foto no se publica)", async () => {
    const conGps = await liso(600, 600)
      .jpeg()
      .withExif({
        IFD0: { Copyright: "Casa de la dueña", Make: "TelefonoDePrueba" },
        IFD3: { GPSLatitudeRef: "S", GPSLatitude: "33/1 26/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "70/1 39/1 0/1" },
      })
      .toBuffer()
    // Sin esto la prueba no probaría nada: la entrada SÍ trae EXIF con GPS.
    const entrada = await sharp(conGps).metadata()
    expect(entrada.exif).toBeDefined()
    expect(conGps.includes("TelefonoDePrueba")).toBe(true)

    const { bytes } = await procesarFoto(conGps, "miembro")

    const { metadatos } = await medir(bytes)
    expect(metadatos.exif).toBeUndefined()
    expect(metadatos.xmp).toBeUndefined()
    expect(bytes.includes("EXIF")).toBe(false)
    expect(bytes.includes("Exif")).toBe(false)
    expect(bytes.includes("TelefonoDePrueba")).toBe(false)
    expect(bytes.includes("Casa de la due")).toBe(false)
    expect(bytes.includes("GPS")).toBe(false)
  })

  it("el perfil de color ICC tampoco sale (los píxeles quedan en sRGB)", async () => {
    const conPerfil = await liso(300, 300).jpeg().withIccProfile("p3").toBuffer()
    expect((await sharp(conPerfil).metadata()).icc).toBeDefined()

    const { bytes } = await procesarFoto(conPerfil, "logo")

    expect((await medir(bytes)).metadatos.icc).toBeUndefined()
    expect(bytes.includes("ICCP")).toBe(false)
  })

  it("un PNG con texto incrustado sale sin él", async () => {
    // Los PNG pueden llevar texto (tEXt/iTXt); la reencodificación lo descarta.
    const conTexto = await liso(100, 100).png().withMetadata({ exif: { IFD0: { ImageDescription: "secreto-del-png" } } }).toBuffer()
    expect(conTexto.includes("secreto-del-png")).toBe(true) // sin esto la prueba no probaría nada

    const { bytes } = await procesarFoto(conTexto, "logo")

    expect(bytes.includes("secreto-del-png")).toBe(false)
  })
})

describe("procesarFoto: lo que rechaza (400, nunca llega a guardarse)", () => {
  it("un SVG, aunque lo suban como .jpg (puede traer scripts)", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>')

    expect((await rechazada(svg)).motivo).toBe("formato")
  })

  it("texto con extensión de imagen", async () => {
    expect((await rechazada(Buffer.from("esto es un texto, no una foto.jpg"))).motivo).toBe("formato")
    expect((await rechazada(Buffer.from(JSON.stringify({ foto: "x.png" })))).motivo).toBe("formato")
  })

  it("un cuerpo vacío o de unos pocos bytes", async () => {
    expect((await rechazada(new Uint8Array(0))).motivo).toBe("formato")
    expect((await rechazada(Uint8Array.from([0xff, 0xd8]))).motivo).toBe("formato")
  })

  it("GIF (aunque sea fijo), TIFF, BMP y HEIC/AVIF: sólo JPEG, PNG y WebP", async () => {
    const fijas = [
      await liso(50, 50).gif().toBuffer(),
      await liso(50, 50).tiff().toBuffer(),
      await liso(50, 50).avif().toBuffer(),
    ]
    for (const entrada of fijas) expect((await rechazada(entrada)).motivo).toBe("formato")
    const bmp = Buffer.concat([Buffer.from("BM"), Buffer.alloc(60)])
    expect((await rechazada(bmp)).motivo).toBe("formato")
  })

  it("un GIF animado", async () => {
    const f1 = await liso(40, 40).png().toBuffer()
    const f2 = await sharp({ create: { width: 40, height: 40, channels: 3, background: AZUL } }).png().toBuffer()
    const gif = await sharp([f1, f2], { join: { animated: true } }).gif({ loop: 0, delay: [100, 100] }).toBuffer()

    expect((await rechazada(gif)).motivo).toBe("formato")
  })

  it("un WebP animado", async () => {
    const f1 = await liso(40, 40).png().toBuffer()
    const f2 = await sharp({ create: { width: 40, height: 40, channels: 3, background: AZUL } }).png().toBuffer()
    const animado = await sharp([f1, f2], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer()
    expect((await sharp(animado).metadata()).pages).toBe(2) // sin esto la prueba no probaría nada

    expect((await rechazada(animado)).motivo).toBe("animada")
  })

  it("un PNG animado (APNG): trae un trozo acTL antes de los datos", async () => {
    const png = await liso(40, 40).png().toBuffer()
    const trozo = (tipo: string, datos: Buffer) => {
      const largo = Buffer.alloc(4)
      largo.writeUInt32BE(datos.length)
      return Buffer.concat([largo, Buffer.from(tipo), datos, Buffer.alloc(4)]) // CRC de relleno: se rechaza antes de decodificar
    }
    const finDeIhdr = 8 + 25
    const apng = Buffer.concat([png.subarray(0, finDeIhdr), trozo("acTL", Buffer.alloc(8)), png.subarray(finDeIhdr)])

    expect((await rechazada(apng)).motivo).toBe("animada")
  })

  it.each(["jpeg", "png", "webp"] as const)("un %s truncado (se cortó la subida a la mitad)", async (formato) => {
    const completo = await ruido(formato)
    const cortado = completo.subarray(0, Math.floor(completo.length / 2))

    expect((await rechazada(cortado)).motivo).toBe("ilegible")
  })

  it("una cabecera de JPEG con basura detrás", async () => {
    const falso = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("no soy un jpeg de verdad, ni cerca")])

    expect((await rechazada(falso)).motivo).toBe("ilegible")
  })

  it("una imagen gigante en píxeles aunque pese poco (bomba de descompresión)", async () => {
    const ancho = 8000
    const alto = 6000
    expect(ancho * alto).toBeGreaterThan(LIMITE_DE_PIXELES)
    const bomba = await liso(ancho, alto).png({ compressionLevel: 9 }).toBuffer()
    expect(bomba.length).toBeLessThan(1024 * 1024) // pasa de sobra el tope de bytes: lo corta el de píxeles

    expect((await rechazada(bomba)).motivo).toBe("enorme")
  })

  it("el mensaje es para la persona: en español y sin detalles internos", async () => {
    const error = await rechazada(Buffer.from("texto"))

    expect(error.message).toMatch(/JPG, PNG o WebP/)
    expect(error.message).not.toMatch(/sharp|vips|buffer|stack/i)
  })
})
