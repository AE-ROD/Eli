import { describe, it, expect } from "vitest"
import {
  al,
  articuloDe,
  cantidadDe,
  concordar,
  del,
  el,
  ese,
  este,
  ningun,
  numeroDe,
  pronombreDe,
  todoDe,
  todos,
  un,
  unoDe,
  type Numero,
} from "./concordancia"
import { vocabularioDe, type PalabrasDelRubro, type Sustantivo } from "./vocabulario"

/*
 * Dos partes. La primera prueba cada función con sustantivos escritos acá (un
 * masculino, un femenino y dos compuestos), así que sólo falla si cambia la
 * gramática. La segunda usa las palabras reales de los cinco conjuntos de datos
 * (salón, barbería, salón de uñas, clínica dental y neutro) y comprueba las
 * frases que la interfaz tiene que poder construir.
 */

const CLIENTE: Sustantivo = { singular: "cliente", plural: "clientes", genero: "m" }
const ESTILISTA: Sustantivo = { singular: "estilista", plural: "estilistas", genero: "f" }
const SALA_DE_ESPERA: Sustantivo = { singular: "sala de espera", plural: "salas de espera", genero: "f" }
const SALON_DE_UNAS: Sustantivo = { singular: "salón de uñas", plural: "salones de uñas", genero: "m" }

type Funcion = (sustantivo: Sustantivo, numero?: Numero) => string

/** Para cada sustantivo de prueba: la frase en singular y la frase en plural. */
type Esperadas = readonly [sustantivo: Sustantivo, singular: string, plural: string][]

describe.each<[string, Funcion, Esperadas]>([
  [
    "el",
    el,
    [
      [CLIENTE, "el cliente", "los clientes"],
      [ESTILISTA, "la estilista", "las estilistas"],
      [SALA_DE_ESPERA, "la sala de espera", "las salas de espera"],
      [SALON_DE_UNAS, "el salón de uñas", "los salones de uñas"],
    ],
  ],
  [
    "un",
    un,
    [
      [CLIENTE, "un cliente", "unos clientes"],
      [ESTILISTA, "una estilista", "unas estilistas"],
      [SALA_DE_ESPERA, "una sala de espera", "unas salas de espera"],
      [SALON_DE_UNAS, "un salón de uñas", "unos salones de uñas"],
    ],
  ],
  [
    "del",
    del,
    [
      [CLIENTE, "del cliente", "de los clientes"],
      [ESTILISTA, "de la estilista", "de las estilistas"],
      [SALA_DE_ESPERA, "de la sala de espera", "de las salas de espera"],
      [SALON_DE_UNAS, "del salón de uñas", "de los salones de uñas"],
    ],
  ],
  [
    "al",
    al,
    [
      [CLIENTE, "al cliente", "a los clientes"],
      [ESTILISTA, "a la estilista", "a las estilistas"],
      [SALA_DE_ESPERA, "a la sala de espera", "a las salas de espera"],
      [SALON_DE_UNAS, "al salón de uñas", "a los salones de uñas"],
    ],
  ],
  [
    "este",
    este,
    [
      [CLIENTE, "este cliente", "estos clientes"],
      [ESTILISTA, "esta estilista", "estas estilistas"],
      [SALA_DE_ESPERA, "esta sala de espera", "estas salas de espera"],
      [SALON_DE_UNAS, "este salón de uñas", "estos salones de uñas"],
    ],
  ],
  [
    "ese",
    ese,
    [
      [CLIENTE, "ese cliente", "esos clientes"],
      [ESTILISTA, "esa estilista", "esas estilistas"],
      [SALA_DE_ESPERA, "esa sala de espera", "esas salas de espera"],
      [SALON_DE_UNAS, "ese salón de uñas", "esos salones de uñas"],
    ],
  ],
])("%s", (_nombre, funcion, esperadas) => {
  const filas = esperadas.map(([sustantivo, singular, plural]) => ({
    nombre: sustantivo.singular,
    sustantivo,
    singular,
    plural,
  }))

  it.each(filas)("$nombre en singular, con y sin el número explícito", ({ sustantivo, singular }) => {
    expect(funcion(sustantivo)).toBe(singular)
    expect(funcion(sustantivo, "singular")).toBe(singular)
  })

  it.each(filas)("$nombre en plural", ({ sustantivo, plural }) => {
    expect(funcion(sustantivo, "plural")).toBe(plural)
  })
})

describe("ningun", () => {
  it.each([
    { sustantivo: CLIENTE, esperada: "ningún cliente" },
    { sustantivo: ESTILISTA, esperada: "ninguna estilista" },
    { sustantivo: SALA_DE_ESPERA, esperada: "ninguna sala de espera" },
    { sustantivo: SALON_DE_UNAS, esperada: "ningún salón de uñas" },
  ])("$esperada", ({ sustantivo, esperada }) => {
    expect(ningun(sustantivo)).toBe(esperada)
  })

  it("no tiene plural: ni 'ningunos' ni 'ningunas' existen, y el tipo lo impide", () => {
    // @ts-expect-error la función sólo recibe el sustantivo; no hay segundo parámetro
    const frase = ningun(CLIENTE, "plural")
    // Aunque alguien se salte el tipo, nunca sale "ningunos".
    expect(frase).toBe("ningún cliente")
  })
})

describe("todos", () => {
  it.each([
    { sustantivo: CLIENTE, esperada: "todos los clientes" },
    { sustantivo: ESTILISTA, esperada: "todas las estilistas" },
    { sustantivo: SALA_DE_ESPERA, esperada: "todas las salas de espera" },
    { sustantivo: SALON_DE_UNAS, esperada: "todos los salones de uñas" },
  ])("$esperada: siempre en plural y con artículo", ({ sustantivo, esperada }) => {
    expect(todos(sustantivo)).toBe(esperada)
  })
})

describe("concordar", () => {
  /** Un adjetivo en masculino singular y cómo queda con un masculino y con un femenino. */
  it.each([
    // Terminados en -o: cambian a -a y -as con un femenino.
    ["nuevo", "nuevo", "nueva", "nuevos", "nuevas"],
    ["registrado", "registrado", "registrada", "registrados", "registradas"],
    ["inactivo", "inactivo", "inactiva", "inactivos", "inactivas"],
    // Los que no terminan en -o no cambian de género, sólo toman el plural.
    ["grande", "grande", "grande", "grandes", "grandes"],
    ["azul", "azul", "azul", "azules", "azules"],
    ["habitual", "habitual", "habitual", "habituales", "habituales"],
    ["optimista", "optimista", "optimista", "optimistas", "optimistas"],
    // -z cambia a -ces.
    ["feliz", "feliz", "feliz", "felices", "felices"],
    ["capaz", "capaz", "capaz", "capaces", "capaces"],
    // -s no cambia: "gratis" es invariable.
    ["gratis", "gratis", "gratis", "gratis", "gratis"],
    // Vocales tónicas finales.
    ["hindú", "hindú", "hindú", "hindúes", "hindúes"],
    ["iraní", "iraní", "iraní", "iraníes", "iraníes"],
    ["rosé", "rosé", "rosé", "rosés", "rosés"],
  ])(
    "%s → %s / %s / %s / %s",
    (adjetivo, masculinoSingular, femeninoSingular, masculinoPlural, femeninoPlural) => {
      expect(concordar(adjetivo, CLIENTE)).toBe(masculinoSingular)
      expect(concordar(adjetivo, ESTILISTA)).toBe(femeninoSingular)
      expect(concordar(adjetivo, CLIENTE, "plural")).toBe(masculinoPlural)
      expect(concordar(adjetivo, ESTILISTA, "plural")).toBe(femeninoPlural)
    },
  )

  it("sin número va en singular", () => {
    expect(concordar("nuevo", ESTILISTA)).toBe(concordar("nuevo", ESTILISTA, "singular"))
  })

  it("concuerda con el género del sustantivo, no con cómo termina", () => {
    // "sala de espera" termina en -a pero lo que importa es que es femenino.
    expect(concordar("vacío", SALA_DE_ESPERA)).toBe("vacía")
    // "salón de uñas" es masculino aunque "uñas" sea femenino plural.
    expect(concordar("nuevo", SALON_DE_UNAS)).toBe("nuevo")
    expect(concordar("nuevo", SALON_DE_UNAS, "plural")).toBe("nuevos")
  })
})

/*
 * Las palabras reales de los cinco conjuntos de datos.
 */

const RUBROS_DE_PRUEBA = [
  ["salón", "salon"],
  ["barbería", "barberia"],
  ["salón de uñas", "spa-de-unas"],
  ["clínica dental", "odontologia"],
  ["neutro", "otro"],
] as const

/** Todas las frases que se pueden armar con un sustantivo, para compararlas de una vez. */
function frasesDe(sustantivo: Sustantivo) {
  return {
    el: el(sustantivo),
    elPlural: el(sustantivo, "plural"),
    un: un(sustantivo),
    unPlural: un(sustantivo, "plural"),
    del: del(sustantivo),
    delPlural: del(sustantivo, "plural"),
    al: al(sustantivo),
    alPlural: al(sustantivo, "plural"),
    este: este(sustantivo),
    estePlural: este(sustantivo, "plural"),
    ese: ese(sustantivo),
    esePlural: ese(sustantivo, "plural"),
    ningun: ningun(sustantivo),
    todos: todos(sustantivo),
  }
}

describe("las frases de quien atiende, en los cinco conjuntos de datos", () => {
  const ESPERADAS = {
    salon: {
      el: "la estilista",
      elPlural: "las estilistas",
      un: "una estilista",
      unPlural: "unas estilistas",
      del: "de la estilista",
      delPlural: "de las estilistas",
      al: "a la estilista",
      alPlural: "a las estilistas",
      este: "esta estilista",
      estePlural: "estas estilistas",
      ese: "esa estilista",
      esePlural: "esas estilistas",
      ningun: "ninguna estilista",
      todos: "todas las estilistas",
    },
    barberia: {
      el: "el barbero",
      elPlural: "los barberos",
      un: "un barbero",
      unPlural: "unos barberos",
      del: "del barbero",
      delPlural: "de los barberos",
      al: "al barbero",
      alPlural: "a los barberos",
      este: "este barbero",
      estePlural: "estos barberos",
      ese: "ese barbero",
      esePlural: "esos barberos",
      ningun: "ningún barbero",
      todos: "todos los barberos",
    },
    "spa-de-unas": {
      el: "la manicurista",
      elPlural: "las manicuristas",
      un: "una manicurista",
      unPlural: "unas manicuristas",
      del: "de la manicurista",
      delPlural: "de las manicuristas",
      al: "a la manicurista",
      alPlural: "a las manicuristas",
      este: "esta manicurista",
      estePlural: "estas manicuristas",
      ese: "esa manicurista",
      esePlural: "esas manicuristas",
      ningun: "ninguna manicurista",
      todos: "todas las manicuristas",
    },
    odontologia: {
      el: "el odontólogo",
      elPlural: "los odontólogos",
      un: "un odontólogo",
      unPlural: "unos odontólogos",
      del: "del odontólogo",
      delPlural: "de los odontólogos",
      al: "al odontólogo",
      alPlural: "a los odontólogos",
      este: "este odontólogo",
      estePlural: "estos odontólogos",
      ese: "ese odontólogo",
      esePlural: "esos odontólogos",
      ningun: "ningún odontólogo",
      todos: "todos los odontólogos",
    },
    otro: {
      el: "el profesional",
      elPlural: "los profesionales",
      un: "un profesional",
      unPlural: "unos profesionales",
      del: "del profesional",
      delPlural: "de los profesionales",
      al: "al profesional",
      alPlural: "a los profesionales",
      este: "este profesional",
      estePlural: "estos profesionales",
      ese: "ese profesional",
      esePlural: "esos profesionales",
      ningun: "ningún profesional",
      todos: "todos los profesionales",
    },
  } as const

  it.each(RUBROS_DE_PRUEBA)("%s", (_nombre, rubro) => {
    expect(frasesDe(vocabularioDe(rubro).palabras.profesional)).toEqual(ESPERADAS[rubro])
  })
})

describe("las frases de quien se atiende y de la sala de espera", () => {
  it("el cliente del salón, la barbería, el salón de uñas y el neutro", () => {
    const esperadas = {
      el: "el cliente",
      elPlural: "los clientes",
      un: "un cliente",
      unPlural: "unos clientes",
      del: "del cliente",
      delPlural: "de los clientes",
      al: "al cliente",
      alPlural: "a los clientes",
      este: "este cliente",
      estePlural: "estos clientes",
      ese: "ese cliente",
      esePlural: "esos clientes",
      ningun: "ningún cliente",
      todos: "todos los clientes",
    }
    for (const rubro of ["salon", "barberia", "spa-de-unas", "otro"]) {
      expect(frasesDe(vocabularioDe(rubro).palabras.cliente), rubro).toEqual(esperadas)
    }
  })

  it("el paciente de la clínica dental", () => {
    expect(frasesDe(vocabularioDe("odontologia").palabras.cliente)).toEqual({
      el: "el paciente",
      elPlural: "los pacientes",
      un: "un paciente",
      unPlural: "unos pacientes",
      del: "del paciente",
      delPlural: "de los pacientes",
      al: "al paciente",
      alPlural: "a los pacientes",
      este: "este paciente",
      estePlural: "estos pacientes",
      ese: "ese paciente",
      esePlural: "esos pacientes",
      ningun: "ningún paciente",
      todos: "todos los pacientes",
    })
  })

  it("la sala de espera de la clínica dental es femenina", () => {
    expect(frasesDe(vocabularioDe("odontologia").palabras.tablero)).toEqual({
      el: "la sala de espera",
      elPlural: "las salas de espera",
      un: "una sala de espera",
      unPlural: "unas salas de espera",
      del: "de la sala de espera",
      delPlural: "de las salas de espera",
      al: "a la sala de espera",
      alPlural: "a las salas de espera",
      este: "esta sala de espera",
      estePlural: "estas salas de espera",
      ese: "esa sala de espera",
      esePlural: "esas salas de espera",
      ningun: "ninguna sala de espera",
      todos: "todas las salas de espera",
    })
  })

  it("el tablero de los demás rubros es masculino", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "otro"]) {
      const tablero = vocabularioDe(rubro).palabras.tablero
      expect([el(tablero), el(tablero, "plural"), un(tablero), del(tablero), al(tablero)], rubro).toEqual([
        "el tablero",
        "los tableros",
        "un tablero",
        "del tablero",
        "al tablero",
      ])
    }
  })
})

/** Una frase que la interfaz tiene que poder construir: de qué rubro sale, cómo se arma y cómo queda. */
type FraseReal = readonly [rubro: string, armar: (palabras: PalabrasDelRubro) => string, esperada: string]

describe("las frases reales del repo", () => {
  const frases: FraseReal[] = [
    // Artículos indefinidos.
    ["barberia", (p) => un(p.profesional), "un barbero"],
    ["spa-de-unas", (p) => un(p.profesional), "una manicurista"],
    ["odontologia", (p) => un(p.cliente), "un paciente"],
    ["salon", (p) => un(p.profesional), "una estilista"],
    ["odontologia", (p) => un(p.servicio), "una prestación"],
    ["odontologia", (p) => un(p.servicioDeLaReserva), "un motivo"],
    ["salon", (p) => un(p.cita), "una hora"],
    ["odontologia", (p) => un(p.cita), "una cita"],
    ["odontologia", (p) => un(p.citaParaElCliente), "una hora"],
    // Ningún / ninguna.
    ["salon", (p) => ningun(p.cliente), "ningún cliente"],
    ["salon", (p) => ningun(p.profesional), "ninguna estilista"],
    ["odontologia", (p) => ningun(p.servicio), "ninguna prestación"],
    ["otro", (p) => ningun(p.cita), "ninguna cita"],
    // Al / del.
    ["odontologia", (p) => al(p.cliente), "al paciente"],
    ["spa-de-unas", (p) => al(p.profesional), "a la manicurista"],
    ["barberia", (p) => del(p.profesional), "del barbero"],
    ["salon", (p) => del(p.profesional), "de la estilista"],
    ["odontologia", (p) => del(p.negocio), "de la clínica"],
    ["barberia", (p) => del(p.negocio), "de la barbería"],
    ["spa-de-unas", (p) => del(p.negocio), "del salón de uñas"],
    ["salon", (p) => del(p.negocio), "del salón"],
    ["otro", (p) => del(p.negocio), "del negocio"],
    // Demostrativos.
    ["odontologia", (p) => este(p.profesional), "este odontólogo"],
    ["spa-de-unas", (p) => este(p.profesional), "esta manicurista"],
    ["odontologia", (p) => este(p.negocio), "esta clínica"],
    // Artículos definidos y plurales.
    ["odontologia", (p) => el(p.cliente, "plural"), "los pacientes"],
    ["odontologia", (p) => el(p.tablero, "plural"), "las salas de espera"],
    ["odontologia", (p) => el(p.primeraVez), "la primera consulta"],
    ["salon", (p) => el(p.primeraVez), "la primera vez"],
    ["spa-de-unas", (p) => el(p.negocio, "plural"), "los salones de uñas"],
    ["salon", (p) => todos(p.cita), "todas las horas"],
    // Adjetivos y participios.
    ["salon", (p) => `${concordar("nuevo", p.cliente)} ${p.cliente.singular}`, "nuevo cliente"],
    ["spa-de-unas", (p) => `${concordar("nuevo", p.profesional)} ${p.profesional.singular}`, "nueva manicurista"],
    ["odontologia", (p) => `${p.cliente.singular} ${concordar("registrado", p.cliente)}`, "paciente registrado"],
    ["salon", (p) => `${p.profesional.singular} ${concordar("registrado", p.profesional)}`, "estilista registrada"],
    ["salon", (p) => `${p.cita.singular} ${concordar("registrado", p.cita)}`, "hora registrada"],
    ["odontologia", (p) => `${concordar("nuevo", p.cliente, "plural")} ${p.cliente.plural}`, "nuevos pacientes"],
    ["salon", (p) => `${concordar("nuevo", p.profesional, "plural")} ${p.profesional.plural}`, "nuevas estilistas"],
    ["odontologia", (p) => `${p.servicio.plural} ${concordar("incluido", p.servicio, "plural")}`, "prestaciones incluidas"],
  ]

  it.each(frases)("%s → %s", (rubro, armar, esperada) => {
    expect(armar(vocabularioDe(rubro).palabras)).toBe(esperada)
  })
})

describe("toda frase sale en minúscula, con cualquier palabra de cualquier rubro", () => {
  const CLAVES_DE_SUSTANTIVO = [
    "cliente",
    "profesional",
    "servicio",
    "servicioDeLaReserva",
    "cita",
    "citaParaElCliente",
    "negocio",
    "tablero",
    "primeraVez",
  ] as const

  it.each(RUBROS_DE_PRUEBA)("%s", (_nombre, rubro) => {
    const palabras = vocabularioDe(rubro).palabras
    for (const clave of CLAVES_DE_SUSTANTIVO) {
      for (const frase of Object.values(frasesDe(palabras[clave]))) {
        expect(frase, `${rubro}.${clave}`).toBe(frase.toLocaleLowerCase("es-CL"))
      }
    }
  })
})

describe("las formas sueltas, sin el sustantivo", () => {
  it.each([
    ["articuloDe", articuloDe, "el", "la"],
    ["pronombreDe", pronombreDe, "lo", "la"],
    ["unoDe", unoDe, "uno", "una"],
    ["todoDe", todoDe, "todo", "toda"],
  ] as const)("%s sigue el género de la palabra", (_nombre, funcion, masculino, femenino) => {
    expect(funcion(CLIENTE)).toBe(masculino)
    expect(funcion(ESTILISTA)).toBe(femenino)
    expect(funcion(SALA_DE_ESPERA)).toBe(femenino)
    expect(funcion(SALON_DE_UNAS)).toBe(masculino)
  })

  it("numeroDe: uno es singular; cero y el resto, plural", () => {
    expect(numeroDe(1)).toBe("singular")
    expect(numeroDe(0)).toBe("plural")
    expect(numeroDe(2)).toBe("plural")
    expect(numeroDe(120)).toBe("plural")
  })

  it("cantidadDe escribe la cantidad con el número que toca", () => {
    expect(cantidadDe(1, ESTILISTA)).toBe("1 estilista")
    expect(cantidadDe(3, ESTILISTA)).toBe("3 estilistas")
    expect(cantidadDe(0, SALA_DE_ESPERA)).toBe("0 salas de espera")
    expect(cantidadDe(1, SALON_DE_UNAS)).toBe("1 salón de uñas")
  })
})
