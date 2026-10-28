import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"
import manifest from "@/app/manifest"
import { GET as icono } from "@/app/iconos/[nombre]/route"
import {
  CLAVE_PISTA_CERRADA,
  COLORES_DE_LA_APP,
  ICONOS_DE_LA_APP,
  esIos,
  guardarPistaCerrada,
  leerPistaCerrada,
  pistaAMostrar,
  type SituacionDelDispositivo,
} from "@/lib/pwa"

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const IPAD_COMO_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
const CHROME_ESCRITORIO =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const INSTAGRAM_EN_IPHONE = `${IPHONE} Instagram 300.0.0.0`

const situacion = (cambios: Partial<SituacionDelDispositivo>): SituacionDelDispositivo => ({
  userAgent: IPHONE,
  puntosTactiles: 5,
  instalada: false,
  cerrada: false,
  hayDialogoNativo: false,
  ...cambios,
})

describe("manifest de Eli instalable", () => {
  const datos = manifest()

  it("arranca en el panel, a pantalla completa", () => {
    expect(datos.start_url).toBe("/dashboard")
    expect(datos.display).toBe("standalone")
    expect(datos.short_name).toBe("Eli")
    expect(datos.lang).toBe("es")
  })

  it("trae íconos de 192 y 512, y uno maskable, todos servidos por la ruta de íconos", () => {
    const iconos = datos.icons ?? []
    expect(iconos.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]))
    expect(iconos.some((i) => i.purpose === "maskable")).toBe(true)
    for (const { src, sizes } of iconos) {
      const nombre = src.replace("/iconos/", "")
      expect(Object.keys(ICONOS_DE_LA_APP)).toContain(nombre)
      const lado = ICONOS_DE_LA_APP[nombre as keyof typeof ICONOS_DE_LA_APP]
      expect(sizes).toBe(`${lado}x${lado}`)
    }
  })

  it("usa los colores de la marca, los mismos tokens de app/globals.css", () => {
    const css = readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8")
    const token = (nombre: string) => css.match(new RegExp(`--color-${nombre}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]?.toLowerCase()

    expect(token("crema")).toBe(COLORES_DE_LA_APP.fondo)
    expect(token("navy")).toBe(COLORES_DE_LA_APP.marca)
    expect(datos.background_color).toBe(COLORES_DE_LA_APP.fondo)
    expect(datos.theme_color).toBe(COLORES_DE_LA_APP.fondo)
  })
})

describe("íconos de Eli instalable", () => {
  const pedir = (nombre: string) => icono(new Request("http://localhost"), { params: Promise.resolve({ nombre }) })

  it("dibuja cada ícono como PNG del tamaño declarado", async () => {
    for (const [nombre, lado] of Object.entries(ICONOS_DE_LA_APP)) {
      const respuesta = await pedir(nombre)
      expect(respuesta.status).toBe(200)
      expect(respuesta.headers.get("content-type")).toBe("image/png")
      const bytes = Buffer.from(await respuesta.arrayBuffer())
      // Ancho y alto del encabezado IHDR del PNG.
      expect(bytes.readUInt32BE(16)).toBe(lado)
      expect(bytes.readUInt32BE(20)).toBe(lado)
    }
  })

  it("responde 404 a un nombre que no es de la lista", async () => {
    expect((await pedir("otro.png")).status).toBe(404)
    expect((await pedir("toString")).status).toBe(404)
  })
})

describe("pista para instalar Eli", () => {
  it("en iPhone explica cómo agregarlo a inicio", () => {
    expect(pistaAMostrar(situacion({}))).toBe("ios")
  })

  it("reconoce el iPad que se presenta como Mac por la pantalla táctil, y no a una Mac", () => {
    expect(esIos(IPAD_COMO_MAC, 5)).toBe(true)
    expect(esIos(IPAD_COMO_MAC, 0)).toBe(false)
  })

  it("en Android muestra el botón sólo cuando el navegador ofreció instalar", () => {
    expect(pistaAMostrar(situacion({ userAgent: ANDROID, hayDialogoNativo: true }))).toBe("android")
    expect(pistaAMostrar(situacion({ userAgent: ANDROID, hayDialogoNativo: false }))).toBeNull()
  })

  it("no habla del teléfono en la computadora, aunque Chrome ofrezca instalar", () => {
    expect(pistaAMostrar(situacion({ userAgent: CHROME_ESCRITORIO, puntosTactiles: 0, hayDialogoNativo: true }))).toBeNull()
  })

  it("no aparece si ya está instalada o si la persona la cerró", () => {
    expect(pistaAMostrar(situacion({ instalada: true }))).toBeNull()
    expect(pistaAMostrar(situacion({ cerrada: true }))).toBeNull()
    expect(pistaAMostrar(situacion({ userAgent: ANDROID, hayDialogoNativo: true, cerrada: true }))).toBeNull()
  })

  it("no la muestra en el navegador de otra app, que no tiene 'Agregar a inicio'", () => {
    expect(pistaAMostrar(situacion({ userAgent: INSTAGRAM_EN_IPHONE }))).toBeNull()
  })
})

describe("recordar que se cerró la pista", () => {
  const almacenEnMemoria = () => {
    const datos = new Map<string, string>()
    return {
      getItem: (clave: string) => datos.get(clave) ?? null,
      setItem: (clave: string, valor: string) => void datos.set(clave, valor),
    }
  }
  const almacenQueTira = {
    getItem: () => {
      throw new Error("SecurityError")
    },
    setItem: () => {
      throw new Error("QuotaExceededError")
    },
  }

  it("guarda el cierre y lo vuelve a leer", () => {
    const almacen = almacenEnMemoria()
    expect(leerPistaCerrada(almacen)).toBe(false)
    guardarPistaCerrada(almacen)
    expect(almacen.getItem(CLAVE_PISTA_CERRADA)).toBe("1")
    expect(leerPistaCerrada(almacen)).toBe(true)
  })

  it("sin almacenamiento, o si tira, no rompe: cuenta como no cerrada", () => {
    expect(leerPistaCerrada(undefined)).toBe(false)
    expect(leerPistaCerrada(almacenQueTira)).toBe(false)
    expect(() => guardarPistaCerrada(almacenQueTira)).not.toThrow()
    expect(() => guardarPistaCerrada(undefined)).not.toThrow()
  })
})
