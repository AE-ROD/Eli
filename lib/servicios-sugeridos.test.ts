import { describe, it, expect } from "vitest"
import { categoriaDeServicio, duracion, nombre, precioDeServicio } from "./campos-del-panel"
import { ejemplosDe } from "./ejemplos-por-rubro"
import { IDS_DE_RUBROS, RUBRO_DENTAL } from "./rubros"
import { normalizarNombre } from "./servicios-en-lote"
import { serviciosDeEjemplo } from "./servicios-de-ejemplo"
import { serviciosSugeridosDe, type ServicioSugerido } from "./servicios-sugeridos"

const NEUTROS = serviciosSugeridosDe(null)

describe("serviciosSugeridosDe: qué lista le toca a cada rubro", () => {
  it.each(IDS_DE_RUBROS)("%s tiene su lista propia, distinta de la neutra", (rubro) => {
    const lista = serviciosSugeridosDe(rubro)
    expect(lista).not.toBe(NEUTROS)
    expect(lista.length).toBeGreaterThanOrEqual(25)
    expect(lista.length).toBeLessThanOrEqual(35)
  })

  it.each([[null], [undefined], [""], ["salud"], ["fitness"], ["otro"], ["Salon"], ["constructor"], ["__proto__"], ["hasOwnProperty"]])(
    "el rubro %j recibe los neutros",
    (rubro) => {
      expect(serviciosSugeridosDe(rubro)).toBe(NEUTROS)
    }
  )

  it("los neutros son una lista corta", () => {
    expect(NEUTROS.length).toBeGreaterThanOrEqual(6)
    expect(NEUTROS.length).toBeLessThanOrEqual(10)
  })

  it("cada rubro habla de lo suyo", () => {
    const nombres = (rubro: string) => serviciosSugeridosDe(rubro).map((s) => normalizarNombre(s.name))
    expect(nombres("salon")).toEqual(expect.arrayContaining(["tintura completa", "mechas o balayage", "peinado de fiesta", "alisado de keratina"]))
    expect(nombres("barberia")).toEqual(expect.arrayContaining(["corte degradado", "perfilado de barba", "corte y barba", "perfilado de cejas"]))
    expect(nombres("spa-de-unas")).toEqual(expect.arrayContaining(["unas polygel", "relleno de acrilicas", "pedicure tradicional", "unas soft gel"]))
    expect(nombres("odontologia")).toEqual(expect.arrayContaining(["blanqueamiento dental", "endodoncia", "exodoncia simple", "urgencia dental", "radiografia panoramica"]))
    // Ninguno nombra el oficio de otro.
    expect(nombres("salon")).not.toContain("endodoncia")
    expect(nombres("odontologia")).not.toContain("corte de pelo")
  })
})

describe.each([...IDS_DE_RUBROS, "neutros"] as const)("los sugeridos de %s", (rubro) => {
  const lista = rubro === "neutros" ? NEUTROS : serviciosSugeridosDe(rubro)

  it("los nombres no se repiten, ni siquiera sin mayúsculas, tildes ni espacios de más", () => {
    const normalizados = lista.map((s) => normalizarNombre(s.name))
    expect(new Set(normalizados).size).toBe(lista.length)
  })

  it("la clave es estable y única: minúsculas, números y guiones", () => {
    const claves = lista.map((s) => s.clave)
    expect(new Set(claves).size).toBe(lista.length)
    for (const clave of claves) expect(clave).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  it("cada uno cumple las reglas de un servicio: nombre, duración, precio y categoría", () => {
    for (const s of lista) {
      expect(nombre().safeParse(s.name).success, s.name).toBe(true)
      expect(s.name, s.name).toBe(s.name.trim())
      expect(duracion().safeParse(s.duration).success, `${s.name}: duración`).toBe(true)
      expect(s.duration % 15, `${s.name}: múltiplo de 15`).toBe(0)
      expect(precioDeServicio().safeParse(s.price).success, `${s.name}: precio`).toBe(true)
      // Un servicio de lista tiene precio: gratis no se sugiere.
      expect(s.price, `${s.name}: precio`).toBeGreaterThan(0)
      expect(Number.isInteger(s.price), `${s.name}: pesos enteros`).toBe(true)
    }
  })

  it("la categoría no está vacía y pasa la regla de categoriaDeServicio", () => {
    for (const s of lista) {
      const categoria = categoriaDeServicio().safeParse(s.category)
      expect(categoria.success, s.name).toBe(true)
      expect(categoria.success && categoria.data, s.name).toBe(s.category)
      expect(s.category, s.name).not.toBe("")
    }
  })

  it("las categorías son pocas y se reutilizan (agrupan, no una por servicio)", () => {
    const categorias = new Set(lista.map((s) => s.category))
    expect(categorias.size).toBeGreaterThanOrEqual(2)
    expect(categorias.size).toBeLessThanOrEqual(10)
    expect(categorias.size).toBeLessThan(lista.length)
  })

  it("la lista y cada sugerido están congelados: nadie los cambia por accidente", () => {
    expect(Object.isFrozen(lista)).toBe(true)
    for (const s of lista) expect(Object.isFrozen(s)).toBe(true)
  })
})

describe("urgencias", () => {
  it("esUrgencia sólo aparece en la clínica dental, y en un solo motivo", () => {
    for (const rubro of [...IDS_DE_RUBROS, null, "otro"]) {
      const urgentes = serviciosSugeridosDe(rubro).filter((s) => s.esUrgencia !== undefined)
      if (rubro === RUBRO_DENTAL) {
        expect(urgentes.map((s) => [s.name, s.esUrgencia])).toEqual([["Urgencia dental", true]])
      } else {
        expect(urgentes, String(rubro)).toEqual([])
      }
    }
  })
})

describe("coherencia con lo que ya existe", () => {
  it.each(IDS_DE_RUBROS)("%s: los servicios de ejemplo con que nace un negocio están, con el mismo nombre, categoría, números y urgencia", (rubro) => {
    const sugeridos = serviciosSugeridosDe(rubro)
    for (const ejemplo of serviciosDeEjemplo(rubro)) {
      const igual: ServicioSugerido | undefined = sugeridos.find((s) => s.name === ejemplo.name)
      expect(igual, `${rubro}: falta ${ejemplo.name} con la misma grafía`).toBeDefined()
      expect(igual).toMatchObject({ duration: ejemplo.duration, price: ejemplo.price, category: ejemplo.category })
      expect(igual?.esUrgencia).toBe(ejemplo.esUrgencia)
    }
  })

  it.each(IDS_DE_RUBROS)("%s: ningún sugerido es un servicio de ejemplo escrito de otra manera", (rubro) => {
    const ejemplos = serviciosDeEjemplo(rubro)
    const nombresDeEjemplo = new Set(ejemplos.map((e) => normalizarNombre(e.name)))
    for (const s of serviciosSugeridosDe(rubro)) {
      const esEjemplo = ejemplos.some((e) => e.name === s.name)
      // O es el de ejemplo tal cual, o no se parece a ninguno (misma forma normalizada).
      if (!esEjemplo) expect(nombresDeEjemplo.has(normalizarNombre(s.name)), s.name).toBe(false)
    }
  })

  it.each(IDS_DE_RUBROS)("%s: usa las categorías que las pantallas ofrecen como ejemplo", (rubro) => {
    const categorias = new Set(serviciosSugeridosDe(rubro).map((s) => s.category))
    for (const categoria of ejemplosDe(rubro).categorias) expect(categorias, categoria).toContain(categoria)
    for (const ejemplo of serviciosDeEjemplo(rubro)) expect(categorias).toContain(ejemplo.category)
  })
})
