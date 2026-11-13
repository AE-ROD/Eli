import { describe, it, expect } from "vitest"
import { ejemplosDe, textoDeEjemplo, type EjemplosDelRubro } from "./ejemplos-por-rubro"
import { RUBROS, type RubroId } from "./rubros"
import { serviciosDeEjemplo } from "./servicios-de-ejemplo"
import { nombre } from "./campos-del-panel"
import { normalizarInstagram } from "./pagina-del-negocio"

const IDS = RUBROS.map((rubro) => rubro.id)

/** Todos los textos de un conjunto de ejemplos, para recorrerlos juntos. */
const textosDe = (e: EjemplosDelRubro): string[] => [
  ...e.servicios,
  ...e.categorias,
  e.especialidad,
  e.negocio,
  e.instagram,
  ...e.productos,
]

describe("ejemplosDe", () => {
  it.each(IDS)("el rubro %s tiene ejemplos de todo, sin textos vacíos ni con espacios de más", (rubro) => {
    const ejemplos = ejemplosDe(rubro)

    expect(ejemplos.servicios.length).toBeGreaterThanOrEqual(3)
    expect(ejemplos.categorias.length).toBeGreaterThanOrEqual(3)
    expect(ejemplos.productos.length).toBeGreaterThanOrEqual(2)
    for (const texto of textosDe(ejemplos)) {
      expect(texto.trim()).toBe(texto)
      expect(texto.length).toBeGreaterThan(0)
    }
  })

  it.each(IDS)("el rubro %s: lo que se ofrece de ejemplo se podría guardar de verdad", (rubro) => {
    const ejemplos = ejemplosDe(rubro)

    for (const servicio of ejemplos.servicios) expect(nombre().safeParse(servicio).success).toBe(true)
    for (const producto of ejemplos.productos) expect(nombre().safeParse(producto).success).toBe(true)
    expect(nombre().safeParse(ejemplos.negocio).success).toBe(true)
    // El mismo tope de la especialidad en `PUT /api/configuracion/pagina`.
    expect(ejemplos.especialidad.length).toBeLessThanOrEqual(60)
    // Y un usuario que el campo de Instagram acepta tal cual.
    expect(normalizarInstagram(ejemplos.instagram)).not.toBeNull()
  })

  it.each(IDS)("el rubro %s: las categorías de ejemplo son de las que trae su catálogo inicial", (rubro) => {
    const delCatalogo = new Set(serviciosDeEjemplo(rubro).map((servicio) => servicio.category))

    for (const categoria of ejemplosDe(rubro).categorias) expect(delCatalogo).toContain(categoria)
  })

  // Lo que no puede aparecer en cada rubro: el error de antes era justamente
  // ver el oficio de otro (Manicura en una barbería, Colorista donde atiende un
  // barbero, Shampoo en una clínica).
  const PROHIBIDO: Record<RubroId, RegExp> = {
    salon: /barba|manicur|uñ|esmalte|cutícula|dent|cera para/i,
    barberia: /manicur|uñ|esmalte|cutícula|colora|colorista|alisado|raíz|mascarilla|dent|shampoo/i,
    "spa-de-unas": /corte|barba|colora|colorista|alisado|raíz|shampoo|mascarilla|cera para|dent/i,
    odontologia: /corte|barba|color|manicur|uñ|esmalte|alisado|raíz|shampoo|mascarilla|cera/i,
  }

  it.each(IDS)("el rubro %s no trae ejemplos de otro oficio", (rubro) => {
    for (const texto of textosDe(ejemplosDe(rubro))) expect(texto).not.toMatch(PROHIBIDO[rubro])
  })

  it.each(IDS)("el rubro %s: el negocio de ejemplo suena a su rubro", (rubro) => {
    const señal: Record<RubroId, RegExp> = {
      salon: /^Salón /,
      barberia: /^Barbería /,
      "spa-de-unas": /^Salón de uñas /,
      odontologia: /^Clínica Dental /,
    }
    expect(ejemplosDe(rubro).negocio).toMatch(señal[rubro])
  })

  it("el Instagram de ejemplo no dice 'salon' en ningún rubro (ni en el neutro)", () => {
    for (const rubro of [...IDS, null]) expect(ejemplosDe(rubro).instagram).not.toMatch(/salon/i)
  })

  it("los ejemplos de cada rubro son los acordados", () => {
    expect(ejemplosDe("salon")).toEqual({
      servicios: ["Corte", "Coloración", "Retoque de raíz", "Alisado"],
      categorias: ["Corte", "Color", "Tratamientos"],
      especialidad: "Colorista",
      negocio: "Salón María",
      instagram: "@tu.negocio",
      productos: ["Shampoo", "Mascarilla"],
    })
    expect(ejemplosDe("barberia").servicios).toEqual(["Corte", "Perfilado de barba", "Corte y barba"])
    expect(ejemplosDe("barberia").productos).toEqual(["Cera para el pelo", "Aceite para barba"])
    expect(ejemplosDe("spa-de-unas").servicios).toEqual(["Manicure", "Esmaltado permanente", "Retoque", "Relleno"])
    expect(ejemplosDe("spa-de-unas").productos).toEqual(["Esmalte", "Aceite de cutículas"])
    expect(ejemplosDe("odontologia").servicios).toEqual(["Limpieza", "Control", "Extracción", "Urgencia"])
    expect(ejemplosDe("odontologia").especialidad).toBe("Endodoncista")
    expect(ejemplosDe("odontologia").instagram).toBe("@tu.clinica")
  })

  describe("rubro desconocido, vacío o ausente: ejemplos neutros", () => {
    const NEUTROS = ejemplosDe(null)

    it.each([undefined, null, "", "salud", "fitness", "otro", "Salon", " salon", "constructor", "__proto__", "toString", 42, ["salon"], {}])(
      "%j recibe los neutros",
      (rubro) => {
        expect(ejemplosDe(rubro)).toEqual(NEUTROS)
      }
    )

    it("no nombran ningún oficio ni se parecen a los de un rubro", () => {
      const delOficio = /corte|color|barba|manicur|uñ|esmalte|shampoo|dent|alisado|raíz|salón|barbería|clínica/i
      for (const texto of textosDe(NEUTROS)) expect(texto).not.toMatch(delOficio)
      expect(NEUTROS.negocio).toBe("Mi negocio")
    })
  })

  it("devuelve copias: cambiar lo devuelto no cambia la próxima llamada", () => {
    for (const rubro of [...IDS, null]) {
      const primera = ejemplosDe(rubro)
      primera.servicios.push("Otro")
      primera.categorias.length = 0
      primera.productos[0] = "Otro"
      primera.negocio = "Otro"

      const segunda = ejemplosDe(rubro)
      expect(segunda.servicios).not.toContain("Otro")
      expect(segunda.categorias.length).toBeGreaterThan(0)
      expect(segunda.productos[0]).not.toBe("Otro")
      expect(segunda.negocio).not.toBe("Otro")
    }
  })
})

describe("textoDeEjemplo", () => {
  it("una lista lleva 'Ej.:', comas y puntos suspensivos", () => {
    expect(textoDeEjemplo(["Corte", "Coloración"])).toBe("Ej.: Corte, Coloración...")
  })

  it("un solo valor lleva 'Ej.:' y nada más", () => {
    expect(textoDeEjemplo("Colorista")).toBe("Ej.: Colorista")
  })

  it("con los ejemplos de una barbería se lee como una barbería", () => {
    expect(textoDeEjemplo(ejemplosDe("barberia").servicios)).toBe("Ej.: Corte, Perfilado de barba, Corte y barba...")
  })
})
