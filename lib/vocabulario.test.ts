import { describe, it, expect } from "vitest"
import { IDS_DE_RUBROS } from "./rubros"
import { conMayuscula, vocabularioDe, type Genero, type PalabrasDelRubro } from "./vocabulario"

/*
 * Estas pruebas conservan lo que ya probaba la API de antes (las seis cadenas
 * sueltas, con los mismos valores) y suman las `palabras` con género y número.
 * Las cadenas se comparan con `toMatchObject` porque el vocabulario ahora trae
 * además `palabras`; lo que se exige de ellas es igual de estricto.
 */

describe("vocabularioDe: las seis cadenas de siempre", () => {
  it("la clínica dental dice pacientes, sala de espera, odontólogo y motivo", () => {
    expect(vocabularioDe("odontologia")).toMatchObject({
      clientes: "pacientes",
      cliente: "paciente",
      tablero: "sala de espera",
      profesional: "odontólogo",
      profesionales: "odontólogos",
      servicioDeLaReserva: "motivo",
    })
  })

  it.each(["salon", "barberia", "spa-de-unas"])("el rubro %s habla como siempre", (rubro) => {
    expect(vocabularioDe(rubro)).toMatchObject({
      clientes: "clientes",
      cliente: "cliente",
      tablero: "tablero",
      profesional: "profesional",
      profesionales: "profesionales",
      servicioDeLaReserva: "servicio",
    })
  })

  it.each([
    ["un rubro viejo", "salud"],
    ["uno desconocido", "peluqueria-canina"],
    ["casi el dental", "Odontologia"],
    ["vacío", ""],
    ["null (sesión de antes del rubro)", null],
    ["undefined", undefined],
    ["una propiedad del prototipo", "constructor"],
    ["otra", "__proto__"],
  ])("%s usa las palabras de siempre", (_caso, rubro) => {
    expect(vocabularioDe(rubro)).toMatchObject({
      clientes: "clientes",
      cliente: "cliente",
      tablero: "tablero",
      profesional: "profesional",
      profesionales: "profesionales",
      servicioDeLaReserva: "servicio",
    })
    expect(vocabularioDe(rubro).cliente).toBe("cliente")
  })

  it("devuelve una copia: cambiarla no cambia la próxima", () => {
    const primera = vocabularioDe("odontologia")
    primera.cliente = "otra cosa"
    expect(vocabularioDe("odontologia").cliente).toBe("paciente")
  })
})

/** Una fila esperada de la tabla: singular, plural y género. */
type Fila = readonly [singular: string, plural: string, genero: Genero]

type ClaveDeSustantivo = Exclude<keyof PalabrasDelRubro, "etiquetas">

interface PalabrasEsperadas {
  sustantivos: Record<ClaveDeSustantivo, Fila>
  etiquetas: PalabrasDelRubro["etiquetas"]
}

/** Todas las claves de sustantivo, en el orden de la interfaz. */
const CLAVES: readonly ClaveDeSustantivo[] = [
  "cliente",
  "profesional",
  "servicio",
  "servicioDeLaReserva",
  "cita",
  "citaParaElCliente",
  "negocio",
  "tablero",
  "primeraVez",
]

/*
 * La tabla esperada de cada rubro, escrita aparte del código a propósito: si
 * alguien cambia una palabra en `lib/vocabulario.ts`, esta prueba lo avisa. Los
 * datos salen de la investigación de vocabulario del dueño (noviembre de 2026).
 */

const DEL_SALON: PalabrasEsperadas = {
  sustantivos: {
    cliente: ["cliente", "clientes", "m"],
    profesional: ["estilista", "estilistas", "f"],
    servicio: ["servicio", "servicios", "m"],
    servicioDeLaReserva: ["servicio", "servicios", "m"],
    cita: ["hora", "horas", "f"],
    citaParaElCliente: ["hora", "horas", "f"],
    negocio: ["salón", "salones", "m"],
    tablero: ["tablero", "tableros", "m"],
    primeraVez: ["primera vez", "primeras veces", "f"],
  },
  etiquetas: { noVino: "No vino", seguimiento: "Te toca volver" },
}

const DE_LA_BARBERIA: PalabrasEsperadas = {
  ...DEL_SALON,
  sustantivos: {
    ...DEL_SALON.sustantivos,
    profesional: ["barbero", "barberos", "m"],
    negocio: ["barbería", "barberías", "f"],
  },
}

const DEL_SALON_DE_UNAS: PalabrasEsperadas = {
  ...DEL_SALON,
  sustantivos: {
    ...DEL_SALON.sustantivos,
    profesional: ["manicurista", "manicuristas", "f"],
    negocio: ["salón de uñas", "salones de uñas", "m"],
  },
}

const DE_LA_CLINICA_DENTAL: PalabrasEsperadas = {
  sustantivos: {
    cliente: ["paciente", "pacientes", "m"],
    profesional: ["odontólogo", "odontólogos", "m"],
    servicio: ["prestación", "prestaciones", "f"],
    servicioDeLaReserva: ["motivo", "motivos", "m"],
    cita: ["cita", "citas", "f"],
    citaParaElCliente: ["hora", "horas", "f"],
    negocio: ["clínica", "clínicas", "f"],
    tablero: ["sala de espera", "salas de espera", "f"],
    primeraVez: ["primera consulta", "primeras consultas", "f"],
  },
  etiquetas: { noVino: "No asistió", seguimiento: "Control" },
}

const NEUTRAS: PalabrasEsperadas = {
  sustantivos: {
    cliente: ["cliente", "clientes", "m"],
    profesional: ["profesional", "profesionales", "m"],
    servicio: ["servicio", "servicios", "m"],
    servicioDeLaReserva: ["servicio", "servicios", "m"],
    cita: ["cita", "citas", "f"],
    citaParaElCliente: ["cita", "citas", "f"],
    negocio: ["negocio", "negocios", "m"],
    tablero: ["tablero", "tableros", "m"],
    primeraVez: ["primera vez", "primeras veces", "f"],
  },
  etiquetas: { noVino: "No vino", seguimiento: "Te toca volver" },
}

/** Los rubros del catálogo, cada uno con su tabla esperada. */
const POR_RUBRO: Record<string, PalabrasEsperadas> = {
  salon: DEL_SALON,
  barberia: DE_LA_BARBERIA,
  "spa-de-unas": DEL_SALON_DE_UNAS,
  odontologia: DE_LA_CLINICA_DENTAL,
}

describe("vocabularioDe: las palabras con género y número", () => {
  it("cada rubro del catálogo tiene su tabla esperada acá (un rubro nuevo obliga a decidir sus palabras)", () => {
    expect([...IDS_DE_RUBROS].sort()).toEqual(Object.keys(POR_RUBRO).sort())
  })

  describe.each(Object.entries(POR_RUBRO))("el rubro %s", (rubro, esperadas) => {
    it.each(CLAVES)("%s: singular, plural y género", (clave) => {
      const [singular, plural, genero] = esperadas.sustantivos[clave]
      expect(vocabularioDe(rubro).palabras[clave]).toEqual({ singular, plural, genero })
    })

    it("las etiquetas ya escritas", () => {
      expect(vocabularioDe(rubro).palabras.etiquetas).toEqual(esperadas.etiquetas)
    })

    it("no trae otras claves que las acordadas", () => {
      expect(Object.keys(vocabularioDe(rubro).palabras).sort()).toEqual([...CLAVES, "etiquetas"].sort())
    })
  })

  describe("un rubro sin palabras propias usa las neutras", () => {
    it.each([
      ["los viejos salud", "salud"],
      ["los viejos fitness", "fitness"],
      ["los viejos otro", "otro"],
      ["uno desconocido", "peluqueria-canina"],
      ["casi el dental", "Odontologia"],
      ["casi el salón", "SALON"],
      ["con espacios", " salon "],
      ["vacío", ""],
      ["null (sesión de antes del rubro)", null],
      ["undefined", undefined],
      ["una propiedad del prototipo", "constructor"],
      ["otra propiedad del prototipo", "__proto__"],
      ["otra más", "toString"],
      ["otra más", "hasOwnProperty"],
      ["un número (una sesión mal serializada)", 42 as unknown as string],
      ["un objeto (una sesión mal serializada)", {} as unknown as string],
    ])("%s", (_caso, rubro) => {
      const palabras = vocabularioDe(rubro).palabras
      for (const clave of CLAVES) {
        const [singular, plural, genero] = NEUTRAS.sustantivos[clave]
        expect(palabras[clave]).toEqual({ singular, plural, genero })
      }
      expect(palabras.etiquetas).toEqual(NEUTRAS.etiquetas)
    })
  })

  describe("copias independientes", () => {
    it.each([...Object.keys(POR_RUBRO), "otro", null])(
      "el rubro %s: cambiar las palabras de una llamada no cambia las de la siguiente",
      (rubro) => {
        const primera = vocabularioDe(rubro)
        const original = structuredClone(primera.palabras)

        primera.palabras.cliente.singular = "otra cosa"
        primera.palabras.cliente.genero = original.cliente.genero === "m" ? "f" : "m"
        primera.palabras.profesional.plural = "otra cosa"
        primera.palabras.etiquetas.noVino = "otra cosa"
        primera.palabras.etiquetas.seguimiento = "otra cosa"
        primera.palabras = { ...primera.palabras, tablero: { singular: "x", plural: "x", genero: "m" } }

        expect(vocabularioDe(rubro).palabras).toEqual(original)
      },
    )

    it.each([...Object.keys(POR_RUBRO), "otro"])("el rubro %s: dos llamadas no comparten ningún objeto", (rubro) => {
      const una = vocabularioDe(rubro).palabras
      const otra = vocabularioDe(rubro).palabras
      expect(una).not.toBe(otra)
      expect(una.etiquetas).not.toBe(otra.etiquetas)
      for (const clave of CLAVES) {
        expect(una[clave]).not.toBe(otra[clave])
      }
    })

    it("la barbería y el salón de uñas no comparten objetos con el salón", () => {
      const salon = vocabularioDe("salon").palabras
      const barberia = vocabularioDe("barberia").palabras
      const salonDeUnas = vocabularioDe("spa-de-unas").palabras

      barberia.cliente.singular = "otra cosa"
      salonDeUnas.etiquetas.noVino = "otra cosa"

      expect(salon.cliente.singular).toBe("cliente")
      expect(salon.etiquetas.noVino).toBe("No vino")
      expect(vocabularioDe("salon").palabras.cliente.singular).toBe("cliente")
    })
  })

  describe("invariantes de toda tabla", () => {
    const todosLosRubros: [string, string | null][] = [
      ...Object.keys(POR_RUBRO).map((rubro): [string, string | null] => [rubro, rubro]),
      ["el neutro", "otro"],
      ["null", null],
    ]

    it.each(todosLosRubros)("%s: cada sustantivo va en minúscula, completo y con un género válido", (_nombre, rubro) => {
      const palabras = vocabularioDe(rubro).palabras
      for (const clave of CLAVES) {
        const { singular, plural, genero } = palabras[clave]
        expect(singular.trim(), `${clave}.singular`).not.toBe("")
        expect(plural.trim(), `${clave}.plural`).not.toBe("")
        expect(singular, `${clave}.singular en minúscula`).toBe(singular.toLocaleLowerCase("es-CL"))
        expect(plural, `${clave}.plural en minúscula`).toBe(plural.toLocaleLowerCase("es-CL"))
        expect(["m", "f"], `${clave}.genero`).toContain(genero)
      }
    })

    it.each(todosLosRubros)("%s: las etiquetas no están vacías y empiezan con mayúscula", (_nombre, rubro) => {
      const { noVino, seguimiento } = vocabularioDe(rubro).palabras.etiquetas
      for (const etiqueta of [noVino, seguimiento]) {
        expect(etiqueta.trim()).not.toBe("")
        expect(etiqueta).toBe(conMayuscula(etiqueta))
      }
    })
  })

  describe("las cadenas de siempre y las palabras no se contradicen donde deben coincidir", () => {
    it.each([
      ["la clínica dental", "odontologia"],
      ["un rubro neutro", "otro"],
    ])("%s", (_caso, rubro) => {
      const { clientes, cliente, tablero, profesional, profesionales, servicioDeLaReserva, palabras } =
        vocabularioDe(rubro)
      expect(clientes).toBe(palabras.cliente.plural)
      expect(cliente).toBe(palabras.cliente.singular)
      expect(tablero).toBe(palabras.tablero.singular)
      expect(profesional).toBe(palabras.profesional.singular)
      expect(profesionales).toBe(palabras.profesional.plural)
      expect(servicioDeLaReserva).toBe(palabras.servicioDeLaReserva.singular)
    })
  })
})

describe("conMayuscula", () => {
  it.each([
    ["sala de espera", "Sala de espera"],
    ["odontólogo", "Odontólogo"],
    ["clientes", "Clientes"],
    ["", ""],
  ])("%j → %j", (texto, esperado) => {
    expect(conMayuscula(texto)).toBe(esperado)
  })
})
