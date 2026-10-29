import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import {
  CATEGORIA_SIN_NOMBRE,
  COLOR_POR_DEFECTO,
  PALETA_DEL_LOCAL,
  apareceEnLaPagina,
  colorDelNegocio,
  contraste,
  descripcionParaCompartir,
  enlaceDeInstagram,
  enlaceDeWhatsapp,
  enlacesDeMapa,
  esColorDelLocal,
  esEnlaceDeResenasValido,
  normalizarEnlaceDeResenas,
  horarioParaMostrar,
  imagenPublica,
  iniciales,
  mediosParaMostrar,
  normalizarInstagram,
  serviciosPorCategoria,
} from "./pagina-del-negocio"

describe("paleta del local", () => {
  it("tiene entre 6 y 8 colores, con claves sin repetir", () => {
    expect(PALETA_DEL_LOCAL.length).toBeGreaterThanOrEqual(6)
    expect(PALETA_DEL_LOCAL.length).toBeLessThanOrEqual(8)
    expect(new Set(PALETA_DEL_LOCAL.map((color) => color.clave)).size).toBe(PALETA_DEL_LOCAL.length)
  })

  it.each(PALETA_DEL_LOCAL.map((color) => [color.nombre, color] as const))(
    "%s: el texto sobre el fondo pasa WCAG AA (4,5:1)",
    (_nombre, color) => {
      expect(contraste(color.fondo, color.texto)).toBeGreaterThanOrEqual(4.5)
    }
  )

  it("cada color es un token del sistema de diseño, no un valor inventado", () => {
    const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8").toLowerCase()
    const tokens = new Set([...css.matchAll(/--color-[a-z0-9-]+:\s*(#[0-9a-f]{6})/g)].map((m) => m[1]))
    for (const color of PALETA_DEL_LOCAL) {
      expect(tokens).toContain(color.fondo)
      expect(tokens).toContain(color.texto)
    }
  })

  it("el cálculo de contraste da los valores conocidos", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 5)
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5)
    // Gris de referencia: #767676 sobre blanco es el límite AA, 4,54:1.
    expect(contraste("#767676", "#ffffff")).toBeCloseTo(4.54, 2)
    expect(contraste("#ffffff", "#767676")).toBeCloseTo(4.54, 2)
  })

  it("una clave desconocida, vacía o del prototipo cae en el color por defecto", () => {
    expect(colorDelNegocio(null).clave).toBe(COLOR_POR_DEFECTO)
    expect(colorDelNegocio(undefined).clave).toBe(COLOR_POR_DEFECTO)
    expect(colorDelNegocio("fucsia").clave).toBe(COLOR_POR_DEFECTO)
    expect(colorDelNegocio("constructor").clave).toBe(COLOR_POR_DEFECTO)
    expect(colorDelNegocio("menta").clave).toBe("menta")
    expect(esColorDelLocal("toString")).toBe(false)
    expect(esColorDelLocal("noche")).toBe(true)
  })
})

describe("normalizarInstagram", () => {
  it("acepta el usuario con o sin @, y el enlace del perfil", () => {
    expect(normalizarInstagram("salon.ana")).toBe("salon.ana")
    expect(normalizarInstagram("@Salon_Ana")).toBe("salon_ana")
    expect(normalizarInstagram("  @salon.ana  ")).toBe("salon.ana")
    expect(normalizarInstagram("https://www.instagram.com/salon.ana/")).toBe("salon.ana")
    expect(normalizarInstagram("instagram.com/salon.ana?igsh=abc123")).toBe("salon.ana")
    expect(normalizarInstagram("http://instagram.com/salon.ana")).toBe("salon.ana")
  })

  it("rechaza otros sitios, rutas y caracteres que Instagram no permite", () => {
    expect(normalizarInstagram("https://evil.com/salon.ana")).toBeNull()
    expect(normalizarInstagram("https://instagram.com.evil.com/x")).toBeNull()
    expect(normalizarInstagram("salon ana")).toBeNull()
    expect(normalizarInstagram("salon/ana")).toBeNull()
    expect(normalizarInstagram("javascript:alert(1)")).toBeNull()
    expect(normalizarInstagram("salón")).toBeNull()
    expect(normalizarInstagram(".salon")).toBeNull()
    expect(normalizarInstagram("salon.")).toBeNull()
    expect(normalizarInstagram("sa..lon")).toBeNull()
    expect(normalizarInstagram("a".repeat(31))).toBeNull()
    expect(normalizarInstagram("")).toBeNull()
    expect(normalizarInstagram("@")).toBeNull()
    expect(normalizarInstagram(null)).toBeNull()
  })

  it("arma el enlace al perfil", () => {
    expect(enlaceDeInstagram("@salon.ana")).toBe("https://www.instagram.com/salon.ana/")
    expect(enlaceDeInstagram("no válido")).toBeNull()
  })
})

describe("enlaceDeWhatsapp", () => {
  it("usa el número en E.164 sin el +", () => {
    expect(enlaceDeWhatsapp("+56912345678")).toBe("https://wa.me/56912345678")
    expect(enlaceDeWhatsapp("9 1234 5678")).toBe("https://wa.me/56912345678")
  })

  it("sin número o con uno ilegible no hay enlace", () => {
    expect(enlaceDeWhatsapp(null)).toBeNull()
    expect(enlaceDeWhatsapp("")).toBeNull()
    expect(enlaceDeWhatsapp("+1 555 0100")).toBeNull()
  })
})

describe("enlacesDeMapa", () => {
  it("arma Google Maps y Waze con la dirección y la comuna codificadas", () => {
    const enlaces = enlacesDeMapa("Av. Providencia 1234, local 5", "Providencia")
    const consulta = encodeURIComponent("Av. Providencia 1234, local 5, Providencia")
    expect(enlaces).toEqual({
      googleMaps: `https://www.google.com/maps/search/?api=1&query=${consulta}`,
      waze: `https://waze.com/ul?q=${consulta}`,
    })
  })

  it("codifica lo que podría romper la URL", () => {
    const enlaces = enlacesDeMapa("Calle 1 & 2 #3?x=y", null)
    expect(enlaces?.googleMaps).toBe(`https://www.google.com/maps/search/?api=1&query=Calle%201%20%26%202%20%233%3Fx%3Dy`)
  })

  it("sin dirección no hay enlaces, aunque haya comuna", () => {
    expect(enlacesDeMapa(null, "Ñuñoa")).toBeNull()
    expect(enlacesDeMapa("   ", "Ñuñoa")).toBeNull()
  })
})

describe("imagenPublica", () => {
  it("sólo deja pasar imágenes del mismo sitio", () => {
    expect(imagenPublica("/images/logo.png")).toBe("/images/logo.png")
    expect(imagenPublica("https://cdn.ejemplo.com/logo.png")).toBeNull()
    expect(imagenPublica("//cdn.ejemplo.com/logo.png")).toBeNull()
    expect(imagenPublica("/\\cdn.ejemplo.com/logo.png")).toBeNull()
    expect(imagenPublica("javascript:alert(1)")).toBeNull()
    expect(imagenPublica("data:image/png;base64,AAAA")).toBeNull()
    expect(imagenPublica(null)).toBeNull()
  })
})

describe("iniciales", () => {
  it("toma hasta dos palabras", () => {
    expect(iniciales("Ana María Pérez")).toBe("AM")
    expect(iniciales("carla")).toBe("C")
    expect(iniciales("  Ñandú   Óscar ")).toBe("ÑÓ")
    expect(iniciales("")).toBe("?")
  })
})

describe("apareceEnLaPagina", () => {
  it("sólo los profesionales: el encargado no cuenta como quien atiende", () => {
    expect(apareceEnLaPagina("worker")).toBe(true)
    expect(apareceEnLaPagina("admin")).toBe(false)
    expect(apareceEnLaPagina("owner")).toBe(false)
    expect(apareceEnLaPagina("")).toBe(false)
  })
})

describe("serviciosPorCategoria", () => {
  it("agrupa por categoría en el orden del catálogo y deja los sin categoría al final, en Otros", () => {
    const servicios = [
      { id: "1", category: "Color" },
      { id: "2", category: null },
      { id: "3", category: "Corte" },
      { id: "4", category: "color " },
      { id: "5", category: "  " },
    ]
    expect(serviciosPorCategoria(servicios)).toEqual([
      { categoria: "Color", servicios: [servicios[0], servicios[3]] },
      { categoria: "Corte", servicios: [servicios[2]] },
      { categoria: CATEGORIA_SIN_NOMBRE, servicios: [servicios[1], servicios[4]] },
    ])
  })

  it("sin servicios no hay grupos", () => {
    expect(serviciosPorCategoria([])).toEqual([])
  })
})

describe("mediosParaMostrar", () => {
  it("en el orden del catálogo, sin los desconocidos", () => {
    expect(mediosParaMostrar(["transferencia", "cheque", "efectivo"])).toEqual([
      { id: "efectivo", nombre: "Efectivo" },
      { id: "transferencia", nombre: "Transferencia" },
    ])
    expect(mediosParaMostrar([])).toEqual([])
  })
})

describe("horarioParaMostrar", () => {
  it("de lunes a domingo, con las franjas de cada día (vacío si no atiende)", () => {
    const semana = horarioParaMostrar([
      { dayOfWeek: 1, startTime: "10:00", endTime: "14:00" },
      { dayOfWeek: 1, startTime: "15:00", endTime: "20:00" },
      { dayOfWeek: 6, startTime: "10:00", endTime: "14:00" },
    ])
    expect(semana.map((dia) => dia.dia)).toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"])
    expect(semana[0].franjas).toEqual(["10:00–14:00", "15:00–20:00"])
    expect(semana[1].franjas).toEqual([])
    expect(semana[5].franjas).toEqual(["10:00–14:00"])
    expect(semana[6].franjas).toEqual([])
  })
})

describe("descripcionParaCompartir", () => {
  it("nombra la comuna si la hay", () => {
    expect(descripcionParaCompartir("Salón Ana", "Ñuñoa")).toContain("Salón Ana, en Ñuñoa")
    expect(descripcionParaCompartir("Salón Ana", null)).not.toContain(", en")
  })
})

describe("normalizarEnlaceDeResenas (#77)", () => {
  it.each([
    "https://g.page/r/CQx1abc/review",
    "https://maps.app.goo.gl/AbC123xyz",
    "https://www.google.com/maps/place/Salon+Ana/@-33.4,-70.6,17z",
    "https://google.com/maps?cid=123",
    "https://search.google.com/local/writereview?placeid=ChIJ123",
  ])("acepta %s", (enlace) => {
    expect(normalizarEnlaceDeResenas(`  ${enlace}  `)).toBe(new URL(enlace).toString())
    expect(esEnlaceDeResenasValido(enlace)).toBe(true)
  })

  it("normaliza el dominio a minúsculas", () => {
    expect(normalizarEnlaceDeResenas("https://G.PAGE/r/abc/review")).toBe("https://g.page/r/abc/review")
  })

  it.each([
    ["vacío", ""],
    ["nada", null],
    ["http", "http://g.page/r/abc/review"],
    ["otro dominio", "https://evil.com/maps"],
    ["un dominio que sólo empieza parecido", "https://google.com.evil.com/maps"],
    ["un subdominio ajeno con el nombre", "https://g.page.evil.com/r/abc"],
    ["otro dominio de Google", "https://www.google.cl/maps"],
    ["google.com fuera de Maps", "https://www.google.com/search?q=salon"],
    ["una ruta que sólo empieza con maps", "https://www.google.com/mapsx"],
    ["search.google.com fuera de reseñas", "https://search.google.com/local/reviews?placeid=1"],
    ["g.page sin ruta", "https://g.page/"],
    ["con usuario", "https://alguien@g.page/r/abc"],
    ["con puerto", "https://g.page:8443/r/abc"],
    ["con espacios en medio", "https://g.page/r/a bc"],
    ["javascript:", "javascript:alert(1)"],
    ["sin esquema", "g.page/r/abc/review"],
    ["demasiado largo", `https://g.page/r/${"a".repeat(500)}`],
  ])("rechaza %s", (_caso, enlace) => {
    expect(normalizarEnlaceDeResenas(enlace)).toBeNull()
    expect(esEnlaceDeResenasValido(enlace)).toBe(false)
  })
})
