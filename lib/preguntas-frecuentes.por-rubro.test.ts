import { describe, it, expect } from "vitest"
import { CATALOGO, type PreguntaDelCatalogo } from "./catalogo-de-preguntas"
import {
  DIAS_DE_PRUEBA,
  DIAS_EXTRA_POR_REFERIDO,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
  formatearPesos,
} from "./precios"
import {
  PREGUNTAS_FRECUENTES,
  buscarPreguntas,
  normalizarTexto,
  preguntasDelRubro,
  preguntasParaFallas,
  resolverPreguntas,
  type PreguntaFrecuente,
} from "./preguntas-frecuentes"
import { DIAS_MAXIMOS_DE_ANTICIPACION } from "./reserva-publica"
import { AREAS } from "./soporte"
import { vocabularioDe, type PalabrasDelRubro } from "./vocabulario"

/**
 * Las preguntas frecuentes según el rubro: los textos de siempre sin rubro, las
 * palabras de cada rubro con su género y su número, y lo que no corresponde a
 * la clínica dental. El catálogo (`lib/catalogo-de-preguntas.ts`) escribe cada
 * pregunta con las palabras del vocabulario; acá se prueba lo que sale.
 */

type Rubro = string | null

const RUBROS: ReadonlyArray<{ id: Rubro; nombre: string }> = [
  { id: "salon", nombre: "salón de belleza" },
  { id: "barberia", nombre: "barbería" },
  { id: "spa-de-unas", nombre: "salón de uñas" },
  { id: "estetica", nombre: "centro de estética" },
  { id: "odontologia", nombre: "clínica dental" },
  { id: null, nombre: "sin rubro" },
]

/** Rubros que no tienen palabras propias: los viejos (salud, fitness, otro), uno inventado, vacío o ausente. */
const SIN_PALABRAS_PROPIAS: readonly (string | null | undefined)[] = [
  undefined,
  null,
  "",
  "salud",
  "fitness",
  "otro",
  "constructor",
  "__proto__",
]

const idsDe = (preguntas: readonly PreguntaFrecuente[]) => preguntas.map((pregunta) => pregunta.id)

/** Lo que se lee de una pregunta: el título y la respuesta, sin las palabras clave. */
function textoVisible(pregunta: PreguntaFrecuente): string {
  return [pregunta.pregunta, ...pregunta.respuesta].join(" ")
}

/** El texto de una pregunta de un rubro, para comprobar cómo suena. */
function textoDe(id: string, rubro: Rubro): string {
  const pregunta = preguntasDelRubro(rubro).find((candidata) => candidata.id === id)
  if (!pregunta) throw new Error(`No hay una pregunta "${id}" para el rubro ${String(rubro)}`)
  return textoVisible(pregunta)
}

/** Texto sin tildes ni signos y con un espacio de cada lado: `includes(" cita ")` busca la palabra entera. */
function comoPalabras(texto: string): string {
  return ` ${normalizarTexto(texto).replace(/[^a-z0-9]+/g, " ").trim()} `
}

describe("sin rubro: exactamente los textos de siempre", () => {
  const neutras = preguntasDelRubro(null)

  it("son las mismas 63 preguntas, en el mismo orden", () => {
    expect(PREGUNTAS_DE_SIEMPRE).toHaveLength(63)
    expect(idsDe(neutras)).toEqual(idsDe(PREGUNTAS_DE_SIEMPRE))
  })

  it("cada una dice lo mismo: pregunta, respuesta, palabras clave, área y si es para fallas", () => {
    for (const deSiempre of PREGUNTAS_DE_SIEMPRE) {
      const actual = neutras.find((pregunta) => pregunta.id === deSiempre.id)
      expect(actual, deSiempre.id).toEqual(deSiempre)
    }
  })

  it("PREGUNTAS_FRECUENTES son esas mismas", () => {
    expect(PREGUNTAS_FRECUENTES).toEqual(neutras)
  })

  it("un rubro sin palabras propias habla como sin rubro", () => {
    for (const rubro of SIN_PALABRAS_PROPIAS) {
      expect(preguntasDelRubro(rubro), String(rubro)).toEqual(neutras)
    }
  })
})

describe("las palabras del rubro", () => {
  const CLAVES = [
    "cliente",
    "profesional",
    "servicio",
    "servicioDeLaReserva",
    "cita",
    "citaParaElCliente",
    "negocio",
    "tablero",
    "primeraVez",
  ] as const satisfies readonly (keyof PalabrasDelRubro)[]

  /**
   * Las que nadie puede vigilar: "hora" es también el reloj ("vale una hora",
   * "la hora de inicio"), y "negocio" es la palabra de todos los rubros (la
   * ayuda sigue diciendo "el negocio").
   */
  const DE_TODOS = new Set(["hora", "horas", "negocio", "negocios"])

  const propiasDe = (rubro: Rubro): string[] => {
    const palabras = vocabularioDe(rubro).palabras
    return [...new Set(CLAVES.flatMap((clave) => [palabras[clave].singular, palabras[clave].plural]))]
  }

  /** Las palabras de los otros rubros que este no usa. */
  const ajenasA = (rubro: Rubro): string[] => {
    const propias = new Set(propiasDe(rubro).map(normalizarTexto))
    const ajenas = RUBROS.filter((otro) => otro.id !== rubro).flatMap((otro) => propiasDe(otro.id))
    return [...new Set(ajenas.map(normalizarTexto))].filter((palabra) => !propias.has(palabra) && !DE_TODOS.has(palabra))
  }

  /** El texto sin las palabras propias de varias palabras: "salón de uñas" no cuenta como "salón". */
  const sinLasPropias = (texto: string, rubro: Rubro): string => {
    const propias = propiasDe(rubro)
      .map((palabra) => comoPalabras(palabra))
      .sort((a, b) => b.length - a.length)
    return propias.reduce((leido, palabra) => leido.split(palabra).join(" · "), comoPalabras(texto))
  }

  it.each(RUBROS.map((rubro) => [rubro.nombre, rubro.id] as const))(
    "%s: ninguna pregunta usa palabras de otro rubro",
    (_nombre, rubro) => {
      const ajenas = ajenasA(rubro)
      expect(ajenas.length).toBeGreaterThan(0)
      for (const pregunta of preguntasDelRubro(rubro)) {
        const leido = sinLasPropias(textoVisible(pregunta), rubro)
        const usadas = ajenas.filter((palabra) => leido.includes(` ${palabra} `))
        expect(usadas, pregunta.id).toEqual([])
      }
    },
  )

  it.each([
    ["salon", ["estilista", "cliente", "servicio", "el Tablero", "Nueva hora", "Tu QR para el salón"]],
    ["barberia", ["barbero", "cliente", "servicio", "el Tablero", "Nueva hora", "Tu QR para la barbería"]],
    ["spa-de-unas", ["manicurista", "cliente", "servicio", "el Tablero", "Nueva hora", "Tu QR para el salón de uñas"]],
    ["estetica", ["cosmetóloga", "cliente", "servicio", "el Tablero", "Nueva hora", "Tu QR para el centro"]],
    [
      "odontologia",
      ["odontólogo", "paciente", "prestación", "la Sala de espera", "Nueva cita", "Nuevo paciente", "Tu QR para la clínica"],
    ],
    [null, ["profesional", "cliente", "servicio", "el Tablero", "Nueva cita", "Tu QR para el local"]],
  ] as const)("%s usa las suyas", (rubro, esperadas) => {
    const todo = preguntasDelRubro(rubro).map(textoVisible).join("\n")
    for (const palabra of esperadas) expect(todo, palabra).toContain(palabra)
  })

  it("el vocabulario cambia las palabras y nada más: las mismas preguntas, con los mismos ids y el mismo orden", () => {
    // La clínica dental no ve las que declaran `sinClinica` (los paquetes de sesiones); el resto, igual.
    const sinClinica = new Set(CATALOGO.filter((pregunta) => pregunta.sinClinica).map((pregunta) => pregunta.id))
    for (const rubro of RUBROS) {
      const esperadas = idsDe(PREGUNTAS_FRECUENTES).filter((id) => rubro.id !== "odontologia" || !sinClinica.has(id))
      expect(idsDe(preguntasDelRubro(rubro.id)), rubro.nombre).toEqual(esperadas)
    }
  })
})

describe("la concordancia", () => {
  it("el género de la palabra del rubro pone el artículo, el pronombre y el adjetivo", () => {
    // Estilista y manicurista son femeninas; barbero y odontólogo, masculinas.
    expect(textoDe("tablero-sin-reserva", "salon")).toContain("Una estilista lo anota asignada a sí misma.")
    expect(textoDe("tablero-sin-reserva", "spa-de-unas")).toContain("Una manicurista lo anota asignada a sí misma.")
    expect(textoDe("tablero-sin-reserva", "estetica")).toContain("Una cosmetóloga lo anota asignada a sí misma.")
    expect(textoDe("tablero-sin-reserva", "barberia")).toContain("Un barbero lo anota asignado a sí mismo.")
    expect(textoDe("tablero-sin-reserva", "odontologia")).toContain("Un odontólogo lo anota asignado a sí mismo.")

    expect(textoDe("agenda-no-veo-cita", "salon")).toContain(
      'llegan a nombre de la estilista que eligió el cliente o, con "Cualquiera disponible", de la que estaba libre.',
    )
    expect(textoDe("agenda-no-veo-cita", "barberia")).toContain(
      'llegan a nombre del barbero que eligió el cliente o, con "Cualquiera disponible", del que estaba libre.',
    )

    expect(textoDe("clientes-historial", "salon")).toContain("las horas que atendió ella")
    expect(textoDe("clientes-historial", "barberia")).toContain("las horas que atendió él")
    expect(textoDe("equipo-roles", "spa-de-unas")).toContain(
      "Manicurista: su agenda, sus atenciones y lo que ella atendió en Reportes",
    )
    expect(textoDe("reportes-falta-ingreso", "salon")).toContain("una estilista elegida")
    expect(textoDe("reportes-falta-ingreso", "odontologia")).toContain("un odontólogo elegido")
  })

  it("la clínica dental: Sala de espera, paciente, prestación, motivo y \"u\" ante odontólogo", () => {
    expect(textoDe("tablero-para-que", "odontologia")).toBe(
      "¿Para qué sirve la Sala de espera? " +
        "Es el día en columnas: Reservas de hoy, En espera, En atención, Por cobrar y Finalizado. Ahí anotas quién llegó, qué prestaciones se hicieron, quién las hizo y cuánto se cobró. " +
        "Lo cobrado en la Sala de espera es lo que suma a los ingresos de Reportes.",
    )
    expect(textoDe("reservas-aviso", "odontologia")).toContain(
      'con el paciente, la prestación, la fecha y la hora. La cita aparece en la Agenda y, el día que corresponde, en "Reservas de hoy" de la Sala de espera.',
    )
    expect(textoDe("reservas-sin-cuenta", "odontologia")).toContain("eligen el motivo, el día y la hora")
    expect(textoDe("equipo-invitar", "odontologia")).toContain("su rol (encargado u odontólogo)")
    expect(textoDe("equipo-invitar", "salon")).toContain("su rol (encargado o estilista)")
    expect(textoDe("agenda-no-encuentro-cliente", "odontologia")).toContain(
      'Agrégalo en Pacientes con "Nuevo paciente" y vuelve a crear la cita.',
    )
  })

  it("lo que lee quien reserva usa su palabra: en la clínica el panel dice cita y el correo, hora", () => {
    expect(textoDe("reservas-cancelar-cliente", "odontologia")).toContain('trae "Cancelar o cambiar mi hora"')
    expect(textoDe("reservas-cancelar-cliente", "salon")).toContain('trae "Cancelar o cambiar mi hora"')
    expect(textoDe("reservas-cancelar-cliente", null)).toContain('trae "Cancelar o cambiar mi cita"')
    expect(textoDe("agenda-nueva-cita", "odontologia")).toContain('toca "Nueva cita"')
  })

  it("el selector de la página pública de la clínica se llama distinto", () => {
    expect(textoDe("agenda-no-veo-cita", "odontologia")).toContain('con "La primera hora disponible"')
    expect(textoDe("agenda-no-veo-cita", "odontologia")).not.toContain("Cualquiera disponible")
    expect(textoDe("agenda-no-veo-cita", "salon")).toContain('con "Cualquiera disponible"')
  })

  /** Un rubro inventado con otros géneros que los reales: si una pregunta pegara "la", "nueva" o "lo" a mano, acá se rompe. */
  const AL_REVES: PalabrasDelRubro = {
    ...vocabularioDe(null).palabras,
    cliente: { singular: "clienta", plural: "clientas", genero: "f" },
    profesional: { singular: "maestra", plural: "maestras", genero: "f" },
    servicio: { singular: "faena", plural: "faenas", genero: "f" },
    cita: { singular: "turno", plural: "turnos", genero: "m" },
    tablero: { singular: "mostrador", plural: "mostradores", genero: "m" },
  }

  const alReves = (id: string): string => {
    const pregunta = resolverPreguntas({ palabras: AL_REVES, enLaClinica: false }).find((candidata) => candidata.id === id)
    if (!pregunta) throw new Error(id)
    return textoVisible(pregunta)
  }

  it("con otros géneros, la frase sigue a la palabra", () => {
    expect(alReves("agenda-nueva-cita")).toContain("¿Cómo agendo un turno desde el panel?")
    expect(alReves("agenda-nueva-cita")).toContain('toca "Nuevo turno". Escribe la faena, elige la clienta')
    expect(alReves("agenda-cancelar-cita")).toContain('Abre el turno en la agenda y toca "Cancelar turno"')
    expect(alReves("agenda-cancelar-cita")).toContain("marcarlo como completado")
    expect(alReves("agenda-cancelar-cita")).toContain("un turno marcado como completado")
    expect(alReves("agenda-cancelar-cita")).toContain("lo que se cobra en el Mostrador")
    expect(alReves("agenda-no-encuentro-cliente")).toContain("no encuentro a la clienta")
    expect(alReves("agenda-no-encuentro-cliente")).toContain("y tócala cuando aparezca")
    expect(alReves("agenda-no-encuentro-cliente")).toContain(
      'Agrégala en Clientas con "Nueva clienta" y vuelve a crear el turno.',
    )
    expect(alReves("agenda-no-veo-cita")).toContain("ves solo los turnos asignados a ti")
    expect(alReves("agenda-no-veo-cita")).toContain(
      'a nombre de la maestra que eligió la clienta o, con "Cualquiera disponible", de la que estaba libre',
    )
    expect(alReves("agenda-no-veo-cita")).toContain(
      "(por ejemplo, los de antes de que se pudiera elegir) solo los ven el dueño y el encargado, que pueden asignarlos",
    )
    expect(alReves("tablero-para-que")).toContain("¿Para qué sirve el Mostrador?")
    expect(alReves("tablero-para-que")).toContain("qué faenas se hicieron, quién las hizo")
    expect(alReves("tablero-sin-reserva")).toContain("Una maestra lo anota asignada a sí misma.")
    expect(alReves("equipo-roles")).toContain("también ve las clientas del negocio y puede crearlas")
    expect(alReves("equipo-roles")).toContain("lo que ella atendió")
    expect(alReves("reportes-profesional")).toContain("¿Qué ve una maestra en Reportes?")
    expect(alReves("reportes-profesional")).toContain("las faenas que atendió")
    expect(alReves("otro-pago-en-linea")).toContain("ellas reservan en tu página")
    expect(alReves("clientes-historial")).toContain("sus últimos turnos")
  })
})

describe('"hora" y el reloj', () => {
  it("donde la reserva se llama hora y la frase se leería como minutos, se escribe de otra forma", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "estetica"]) {
      expect(textoDe("agenda-cambiar-hora", rubro), rubro).toContain("¿Puedo reprogramar una hora?")
      expect(textoDe("agenda-cambiar-hora", rubro), rubro).toContain('Abre la reserva en la agenda y toca "Cambiar fecha y hora"')
      expect(textoDe("agenda-profesional-ve", rubro), rubro).toContain("¿Qué agenda ve cada")
      expect(textoDe("clientes-historial", rubro), rubro).toContain("sus datos, sus últimas visitas y sus notas")
      expect(textoDe("equipo-varios-negocios", rubro), rubro).toContain("ves tu agenda y tu plata")
      expect(textoDe("reservas-aviso", rubro), rubro).toContain("la fecha y la hora. La reserva aparece en la Agenda")
    }
  })

  it("en la clínica y sin rubro, la reserva es una cita y no hay nada que rodear", () => {
    for (const rubro of ["odontologia", null]) {
      expect(textoDe("agenda-cambiar-hora", rubro)).toContain("¿Puedo cambiar la hora de una cita?")
      expect(textoDe("agenda-cambiar-hora", rubro)).toContain("Abre la cita en la agenda")
      expect(textoDe("agenda-profesional-ve", rubro)).toContain("¿Qué citas ve cada")
      expect(textoDe("clientes-historial", rubro)).toContain("sus últimas citas")
      expect(textoDe("equipo-varios-negocios", rubro)).toContain("ves tus citas y tu plata")
    }
  })

  it('ninguna pregunta de belleza dice "hora" donde se lee como reloj', () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "estetica"]) {
      for (const pregunta of preguntasDelRubro(rubro)) {
        expect(textoVisible(pregunta), pregunta.id).not.toMatch(/hora de una hora|horas ve cada|últimas horas|tus horas|la hora aparece/i)
      }
    }
  })
})

describe("lo que no corresponde a la clínica dental", () => {
  const CON_HORA_VALLE: PreguntaDelCatalogo = {
    id: "hora-valle",
    area: "reservas",
    pregunta: "¿Cómo cobro menos en las horas tranquilas?",
    respuesta: ["Enciende la hora valle en Configuración."],
    palabrasClave: ["hora valle", "descuento"],
    sinClinica: true,
  }
  const DE_TODOS: PreguntaDelCatalogo = {
    id: "agendar",
    area: "agenda",
    pregunta: "¿Cómo agendo?",
    respuesta: ["Así."],
    palabrasClave: [],
  }
  /** Mezcla un tema que sí existe con uno que no: se escribe por rubro, no se oculta. */
  const MEZCLADA: PreguntaDelCatalogo = {
    id: "cobrar",
    area: "tablero",
    pregunta: "¿Cómo cobro?",
    respuesta: ({ enLaClinica }) => [enLaClinica ? "Elige los medios de pago." : "Elige los medios de pago y la propina."],
    palabrasClave: [],
  }
  const DE_PRUEBA = [DE_TODOS, CON_HORA_VALLE, MEZCLADA]

  it("una pregunta que declara sinClinica no se muestra en la clínica dental", () => {
    expect(idsDe(preguntasDelRubro("odontologia", DE_PRUEBA))).toEqual(["agendar", "cobrar"])
  })

  it("y se muestra en todos los demás, también sin rubro o con uno desconocido", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "estetica", null, undefined, "", "salud", "fitness", "otro"]) {
      expect(idsDe(preguntasDelRubro(rubro, DE_PRUEBA)), String(rubro)).toEqual(["agendar", "hora-valle", "cobrar"])
    }
  })

  it("una pregunta que mezcla un tema que existe con uno que no se reescribe por rubro", () => {
    const enLaClinica = preguntasDelRubro("odontologia", DE_PRUEBA).find((pregunta) => pregunta.id === "cobrar")
    const enElSalon = preguntasDelRubro("salon", DE_PRUEBA).find((pregunta) => pregunta.id === "cobrar")
    expect(enLaClinica?.respuesta).toEqual(["Elige los medios de pago."])
    expect(enElSalon?.respuesta).toEqual(["Elige los medios de pago y la propina."])
  })

  it("en el catálogo, la clínica ve todo menos lo que declara sinClinica", () => {
    expect(idsDe(preguntasDelRubro("odontologia"))).toEqual(
      CATALOGO.filter((pregunta) => !pregunta.sinClinica).map((pregunta) => pregunta.id),
    )
  })

  it('ninguna pregunta de la clínica habla de hora valle, fila virtual, propinas ni "Te toca volver"', () => {
    // Hoy ninguna lo explica. Si el día de mañana una lo hace, tiene que declarar `sinClinica`.
    expect(vocabularioDe("odontologia").palabras.etiquetas.seguimiento).toBe("Control")
    for (const pregunta of preguntasDelRubro("odontologia")) {
      expect(textoVisible(pregunta), pregunta.id).not.toMatch(/hora valle|horas valle|fila virtual|propina|te toca volver/i)
    }
  })

  it("en cada rubro, cada área conserva al menos tres preguntas y las de fallas", () => {
    for (const rubro of RUBROS) {
      const preguntas = preguntasDelRubro(rubro.id)
      for (const area of AREAS) {
        const dondeEstan = `${rubro.nombre} / ${area.valor}`
        expect(preguntas.filter((pregunta) => pregunta.area === area.valor).length, dondeEstan).toBeGreaterThanOrEqual(3)
        const sugeridas = preguntasParaFallas(area.valor, 3, preguntas)
        if (area.valor === "otro") expect(sugeridas, dondeEstan).toEqual([])
        else expect(sugeridas.length, dondeEstan).toBeGreaterThanOrEqual(1)
      }
    }
  })
})

describe("los paquetes de sesiones", () => {
  const esDePaquetes = (pregunta: PreguntaFrecuente) => pregunta.id.startsWith("paquetes-")
  const DE_PAQUETES = [
    "paquetes-que-es",
    "paquetes-crear",
    "paquetes-vender",
    "paquetes-usar-sesion",
    "paquetes-mismo-dia",
    "paquetes-anular-atencion",
    "paquetes-cuantas-quedan",
    "paquetes-vencimiento",
    "paquetes-devolver",
    "paquetes-reportes-cero",
    "paquetes-comision",
  ]

  it("no aparecen en la clínica dental, ni por su id ni por lo que dicen", () => {
    const clinica = preguntasDelRubro("odontologia")
    expect(clinica.filter(esDePaquetes)).toEqual([])
    for (const pregunta of clinica) {
      expect(comoPalabras(textoVisible(pregunta)), pregunta.id).not.toMatch(/ paquetes? /)
    }
    expect(buscarPreguntas("paquete", { preguntas: clinica })).toEqual([])
  })

  it("aparecen todas en el salón, la barbería, el salón de uñas, el centro de estética y sin rubro", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "estetica", null]) {
      expect(idsDe(preguntasDelRubro(rubro).filter(esDePaquetes)).sort(), String(rubro)).toEqual([...DE_PAQUETES].sort())
    }
  })

  it("el centro de estética tiene las mismas preguntas que el salón, con sus palabras", () => {
    expect(idsDe(preguntasDelRubro("estetica"))).toEqual(idsDe(preguntasDelRubro("salon")))
    expect(textoDe("paquetes-comision", "estetica")).toContain("¿Cuándo gana su comisión la cosmetóloga por un paquete?")
    expect(textoDe("paquetes-comision", "barberia")).toContain("¿Cuándo gana su comisión el barbero por un paquete?")
  })

  it("usan los nombres de la pantalla y no prometen comprar en la página de reservas", () => {
    expect(textoDe("paquetes-crear", "estetica")).toContain('busca "Paquetes de sesiones"')
    expect(textoDe("paquetes-crear", "estetica")).toContain('toca "Crear paquete"')
    expect(textoDe("paquetes-crear", "estetica")).toContain('("No vence", o 3, 6 o 12 meses)')
    expect(textoDe("paquetes-vender", "estetica")).toContain('Toca "Vender paquete"')
    expect(textoDe("paquetes-vender", "estetica")).toContain("en tu página de reservas no se compran")
    expect(textoDe("paquetes-usar-sesion", "estetica")).toContain('"Usar 1 sesión de su paquete"')
    expect(textoDe("paquetes-mismo-dia", "estetica")).toContain('"Usar la primera sesión hoy"')
    expect(textoDe("paquetes-devolver", "estetica")).toContain("Solo el dueño puede devolver.")
    expect(textoDe("paquetes-comision", "estetica")).toContain("Al atender cada sesión, no al vender el paquete.")
  })

  it("la búsqueda las encuentra", () => {
    const estetica = preguntasDelRubro("estetica")
    expect(idsDe(buscarPreguntas("vender paquete", { preguntas: estetica }))[0]).toBe("paquetes-vender")
    expect(idsDe(buscarPreguntas("devolucion", { preguntas: estetica }))).toContain("paquetes-devolver")
    expect(idsDe(buscarPreguntas("pack", { preguntas: estetica })).sort()).toEqual([...DE_PAQUETES].sort())
  })
})

describe("sacar a alguien del equipo", () => {
  const DE_SACAR = [
    "equipo-sacar-como",
    "equipo-sacar-quien",
    "equipo-sacar-no-deja",
    "equipo-sacar-plata",
    "equipo-sacar-historial",
    "equipo-sacar-acceso",
    "equipo-sacar-vuelve",
  ]

  it("está en todos los rubros, también en la clínica dental", () => {
    for (const rubro of RUBROS) {
      const ids = idsDe(preguntasDelRubro(rubro.id))
      for (const id of DE_SACAR) expect(ids, `${rubro.nombre} / ${id}`).toContain(id)
    }
  })

  it("habla con las palabras del rubro", () => {
    expect(textoDe("equipo-sacar-quien", "salon")).toContain("El encargado, solo a las estilistas. Una estilista no puede sacar a nadie.")
    expect(textoDe("equipo-sacar-quien", "odontologia")).toContain("El encargado, solo a los odontólogos. Un odontólogo no puede sacar a nadie.")
    expect(textoDe("equipo-sacar-no-deja", "estetica")).toContain("todavía tiene horas por delante o una atención abierta en el Tablero")
    expect(textoDe("equipo-sacar-no-deja", "odontologia")).toContain("todavía tiene citas por delante o una atención abierta en la Sala de espera")
    expect(textoDe("equipo-sacar-como", null)).toContain('Toca "Sacar del equipo"')
  })

  it("quien busca borrar o eliminar a alguien la encuentra", () => {
    expect(idsDe(buscarPreguntas("eliminar", { area: "equipo" }))).toContain("equipo-sacar-como")
    expect(idsDe(preguntasParaFallas("equipo", 3))).toContain("equipo-sacar-no-deja")
  })
})

describe("cómo están escritas las preguntas nuevas", () => {
  const esNueva = (pregunta: PreguntaFrecuente) => pregunta.id.startsWith("paquetes-") || pregunta.id.startsWith("equipo-sacar-")

  it("ninguna usa jerga: transacción, endpoint, archivar ni FK", () => {
    for (const rubro of RUBROS) {
      const nuevas = preguntasDelRubro(rubro.id).filter(esNueva)
      expect(nuevas.length, rubro.nombre).toBeGreaterThan(0)
      for (const pregunta of nuevas) {
        const dondeEstan = `${rubro.nombre} / ${pregunta.id}`
        expect(textoVisible(pregunta), dondeEstan).not.toMatch(/transacci[oó]n|endpoint|archiv|\bFK\b/i)
      }
    }
  })

  it("ninguna promete WhatsApp ni pagos en línea", () => {
    for (const pregunta of preguntasDelRubro("estetica").filter(esNueva)) {
      expect(textoVisible(pregunta), pregunta.id).not.toMatch(/whatsapp|pagar en línea|en línea/i)
    }
  })
})

describe("lo que la ayuda promete, en todos los rubros", () => {
  it("no promete lo que el producto no hace", () => {
    for (const rubro of RUBROS) {
      for (const pregunta of preguntasDelRubro(rubro.id)) {
        const texto = pregunta.respuesta.join(" ")
        const dondeEstan = `${rubro.nombre} / ${pregunta.id}`
        expect(texto, dondeEstan).not.toMatch(/\bsms\b/i)
        if (/whatsapp|pagar en línea|una app/i.test(texto)) expect(texto, dondeEstan).toMatch(/^No[. ]/)
      }
    }
  })

  it('escribe "solo" sin tilde', () => {
    for (const rubro of RUBROS) {
      for (const pregunta of preguntasDelRubro(rubro.id)) {
        expect(textoVisible(pregunta), `${rubro.nombre} / ${pregunta.id}`).not.toMatch(/\bsólo\b/i)
      }
    }
  })
})

describe("la búsqueda con el rubro", () => {
  const clinica = preguntasDelRubro("odontologia")
  const salon = preguntasDelRubro("salon")

  it("indexa el texto ya resuelto: en la clínica se busca con sus palabras", () => {
    expect(idsDe(buscarPreguntas("paciente", { preguntas: clinica }))).toContain("clientes-agregar")
    expect(idsDe(buscarPreguntas("sala de espera", { preguntas: clinica }))).toContain("tablero-para-que")
    expect(idsDe(buscarPreguntas("odontologo", { preguntas: clinica }))).toContain("agenda-profesional-ve")
    expect(idsDe(buscarPreguntas("prestacion", { preguntas: clinica }))).toContain("reportes-que-muestra")
    // Sin rubro no existen esas palabras.
    expect(buscarPreguntas("paciente")).toEqual([])
    expect(buscarPreguntas("odontologo")).toEqual([])
  })

  it("y en un salón, con las del salón", () => {
    expect(idsDe(buscarPreguntas("estilista", { preguntas: salon }))).toContain("agenda-profesional-ve")
    expect(idsDe(buscarPreguntas("nueva hora", { preguntas: salon }))).toContain("agenda-nueva-cita")
  })

  it("quien escribe la palabra de siempre sigue encontrando lo que busca", () => {
    // "cita" en un salón; "cliente", "tablero" y "servicio" en una clínica.
    expect(idsDe(buscarPreguntas("cita", { preguntas: salon }))).toEqual(
      expect.arrayContaining(["agenda-nueva-cita", "agenda-cancelar-cita", "agenda-no-veo-cita"]),
    )
    expect(idsDe(buscarPreguntas("profesional", { preguntas: salon }))).toContain("agenda-profesional-ve")
    expect(idsDe(buscarPreguntas("cliente", { preguntas: clinica }))).toContain("clientes-agregar")
    expect(idsDe(buscarPreguntas("tablero", { preguntas: clinica }))).toContain("tablero-para-que")
    expect(idsDe(buscarPreguntas("servicio", { preguntas: clinica }))).toContain("reportes-que-muestra")
  })

  it("pero no suma una palabra a una pregunta que no habla de eso", () => {
    // "vale una hora" es el reloj, no una cita.
    expect(idsDe(buscarPreguntas("cita", { preguntas: salon }))).not.toContain("cuenta-contrasena")
    expect(idsDe(buscarPreguntas("cita", { preguntas: salon }))).not.toContain("equipo-invitacion-pendiente")
    expect(idsDe(buscarPreguntas("cliente", { preguntas: clinica }))).not.toContain("cuenta-precios")
  })
})

// ─── Los textos de siempre ───────────────────────────────────────────────────
// Copia de lo que decía la ayuda antes del vocabulario por rubro. Sin rubro, la
// ayuda tiene que seguir diciendo exactamente esto. Si un texto cambia a
// propósito (el producto cambió), se cambia acá también.

const PREGUNTAS_DE_SIEMPRE: readonly PreguntaFrecuente[] = [
  // ─── Agenda ────────────────────────────────────────────────────────────────
  {
    id: "agenda-nueva-cita",
    area: "agenda",
    pregunta: "¿Cómo agendo una cita desde el panel?",
    respuesta: [
      "En Agenda, toca \"Nueva cita\". Escribe el servicio, elige el cliente, la fecha y la hora de inicio y de término. El dueño y el encargado eligen además el profesional que atiende. El precio es opcional.",
      "Las reservas que tus clientes hacen desde tu página pública aparecen solas en la agenda.",
    ],
    palabrasClave: ["agendar", "crear cita", "reservar", "turno", "hora"],
  },
  {
    id: "agenda-vistas",
    area: "agenda",
    pregunta: "¿Puedo ver la agenda por día, semana o mes?",
    respuesta: [
      "Sí. Arriba de la agenda eliges la vista Día, Semana o Mes, y con las flechas pasas al día, la semana o el mes anterior o siguiente.",
    ],
    palabrasClave: ["calendario", "vista", "semanal", "mensual", "diaria"],
  },
  {
    id: "agenda-cancelar-cita",
    area: "agenda",
    pregunta: "¿Cómo cancelo una cita?",
    respuesta: [
      "Abre la cita en la agenda y toca \"Cancelar cita\". No se borra: queda en la agenda marcada como cancelada.",
      "Desde el mismo detalle puedes marcarla como completada. Ojo: una cita marcada como completada en la agenda no suma ingresos en Reportes; lo que suma es lo que se cobra en el Tablero.",
    ],
    palabrasClave: ["anular", "eliminar", "borrar", "cancelada", "completada"],
  },
  {
    id: "agenda-cambiar-hora",
    area: "agenda",
    pregunta: "¿Puedo cambiar la hora de una cita?",
    respuesta: [
      "Sí. Abre la cita en la agenda y toca \"Cambiar fecha y hora\": eliges la fecha, la hora de inicio y la de término y, si eres dueño o encargado, el profesional.",
      "Si a esa hora ya hay algo, está bloqueada o queda fuera del horario, Eli te avisa antes de guardar y puedes confirmar igual. Tus clientes también pueden cambiar su hora desde el enlace de su correo de confirmación, dentro del plazo que fijes.",
    ],
    palabrasClave: ["reprogramar", "mover", "cambiar fecha", "reagendar"],
  },
  {
    id: "agenda-profesional-ve",
    area: "agenda",
    pregunta: "¿Qué citas ve cada profesional?",
    respuesta: [
      "Cada profesional ve su propia agenda. El dueño y el encargado ven la de todo el negocio.",
    ],
    palabrasClave: ["permisos", "rol", "ver citas", "profesional"],
  },
  {
    id: "agenda-no-veo-cita",
    area: "agenda",
    pregunta: "No veo una cita en la agenda",
    respuesta: [
      "Revisa la vista (Día, Semana o Mes) y la fecha en que estás parado: con las flechas pasas al día, la semana o el mes anterior o siguiente.",
      "Si eres profesional, ves solo las citas asignadas a ti. Las reservas de la página pública llegan a nombre del profesional que eligió el cliente o, con \"Cualquiera disponible\", del que estaba libre. Las citas sin profesional (por ejemplo, las de antes de que se pudiera elegir) solo las ven el dueño y el encargado, que pueden asignarlas desde el detalle de la cita.",
    ],
    palabrasClave: ["no aparece", "no veo", "falta", "cita perdida", "reserva", "profesional"],
    paraFallas: true,
  },
  {
    id: "agenda-no-encuentro-cliente",
    area: "agenda",
    pregunta: "Al crear una cita no encuentro al cliente",
    respuesta: [
      "En \"Nueva cita\" el cliente se elige de la lista: escribe al menos 2 letras de su nombre, correo o teléfono y tócalo cuando aparezca.",
      "Si no aparece, todavía no está en Clientes. Agrégalo en Clientes con \"Nuevo cliente\" y vuelve a crear la cita.",
    ],
    palabrasClave: ["no aparece", "buscar cliente", "nueva cita", "no encuentro", "no me deja"],
    paraFallas: true,
  },

  // ─── Reservas en línea ─────────────────────────────────────────────────────
  {
    id: "reservas-enlace",
    area: "reservas",
    pregunta: "¿Dónde está mi enlace de reservas?",
    respuesta: [
      "En el inicio del panel, en \"Tu enlace de reservas\". Cópialo y compártelo donde te encuentren tus clientes, como tu Instagram.",
      "Ahí mismo tienes \"Tu QR para el local\": un código que lleva a la misma página, para imprimirlo y dejarlo a la vista.",
    ],
    palabrasClave: ["link", "página pública", "url", "compartir", "qr", "instagram"],
  },
  {
    id: "reservas-sin-cuenta",
    area: "reservas",
    pregunta: "¿Mis clientes necesitan una cuenta para reservar?",
    respuesta: [
      "No. En tu página eligen el servicio, el día y la hora, y dejan su nombre y apellido. El teléfono y el correo son opcionales.",
      "Si dejan su correo, les llega la confirmación de la reserva y un recordatorio el día anterior. También pueden agregar la cita a su calendario.",
    ],
    palabrasClave: ["registrarse", "cliente", "confirmación", "recordatorio", "correo"],
  },
  {
    id: "reservas-sin-horas",
    area: "reservas",
    pregunta: "¿Por qué mi página no muestra horas disponibles?",
    respuesta: [
      "La página ofrece solo los días y horas que caen dentro de tu horario de atención, y solo los servicios que tienes cargados. Revisa los dos en Configuración.",
      `Tampoco se ofrecen las horas que ya pasaron, las que ya están tomadas ni los días a más de ${DIAS_MAXIMOS_DE_ANTICIPACION} días desde hoy.`,
    ],
    palabrasClave: ["no aparecen horas", "disponibilidad", "horario", "servicios", "sin horarios"],
    paraFallas: true,
  },
  {
    id: "reservas-aviso",
    area: "reservas",
    pregunta: "¿Cómo me entero cuando alguien reserva?",
    respuesta: [
      "Te llega un correo con el cliente, el servicio, la fecha y la hora. La cita aparece en la Agenda y, el día que corresponde, en \"Reservas de hoy\" del Tablero.",
    ],
    palabrasClave: ["notificación", "aviso", "nueva reserva", "correo"],
  },
  {
    id: "reservas-no-llega-aviso",
    area: "reservas",
    pregunta: "No me llega el correo cuando alguien reserva",
    respuesta: [
      "El aviso va al correo con que entra a Eli el dueño del negocio y, si la cita quedó a nombre de un profesional, también al de ese profesional. Revisa la carpeta de spam o correo no deseado.",
      "Aunque el correo no llegue, la reserva queda guardada: la ves en la Agenda y, el día que corresponde, en \"Reservas de hoy\" del Tablero.",
    ],
    palabrasClave: ["no llega", "no me llega", "spam", "aviso", "correo", "notificación"],
    paraFallas: true,
  },
  {
    id: "reservas-cancelar-cliente",
    area: "reservas",
    pregunta: "¿Un cliente puede cancelar o cambiar su reserva por su cuenta?",
    respuesta: [
      "Sí, sin cuenta. El correo de confirmación (y la pantalla de reserva confirmada) trae \"Cancelar o cambiar mi cita\": desde ahí la cancela o elige otra hora libre. Cuando lo hace, te llega un correo.",
      "Puede hacerlo hasta 24 horas antes, o el plazo que elijas en Configuración, en \"Plazo para cancelar o reagendar (horas)\" (de 0 a 72). Pasado el plazo, tiene que contactarte.",
    ],
    palabrasClave: ["cancelar reserva", "reprogramar", "cambiar hora", "cliente"],
  },

  // ─── Tablero del día ───────────────────────────────────────────────────────
  {
    id: "tablero-para-que",
    area: "tablero",
    pregunta: "¿Para qué sirve el Tablero?",
    respuesta: [
      "Es el día en columnas: Reservas de hoy, En espera, En atención, Por cobrar y Finalizado. Ahí anotas quién llegó, qué servicios se hicieron, quién los hizo y cuánto se cobró.",
      "Lo cobrado en el Tablero es lo que suma a los ingresos de Reportes.",
    ],
    palabrasClave: ["columnas", "atenciones", "día", "llegadas", "flujo"],
  },
  {
    id: "tablero-sin-reserva",
    area: "tablero",
    pregunta: "¿Cómo anoto a alguien que llegó sin reserva?",
    respuesta: [
      "En el Tablero, toca \"Anotar sin reserva\". Queda en la columna En espera y desde ahí sigue el mismo camino que una reserva. Un profesional lo anota asignado a sí mismo.",
    ],
    palabrasClave: ["walk in", "sin cita", "llegó sin reserva", "anotar"],
  },
  {
    id: "tablero-medios-de-pago",
    area: "tablero",
    pregunta: "¿Puedo registrar un cobro con varios medios de pago?",
    respuesta: [
      "Sí. Un cobro se puede repartir entre efectivo, tarjeta de débito, tarjeta de crédito, transferencia y billetera digital. Los montos tienen que sumar exactamente el total.",
      "Eli registra cómo te pagaron; el pago en sí lo recibes tú en el local, como siempre.",
    ],
    palabrasClave: ["pago dividido", "efectivo", "tarjeta", "transferencia", "cobrar"],
  },
  {
    id: "tablero-llego-por-error",
    area: "tablero",
    pregunta: "Marqué \"Llegó\" por error, ¿cómo lo deshago?",
    respuesta: [
      "Mientras la atención no haya empezado, se deshace y la reserva vuelve a su columna. Si ya empezó, hay que anularla: queda el registro de quién, cuándo y por qué.",
    ],
    palabrasClave: ["deshacer", "error", "llegada", "anular"],
    paraFallas: true,
  },
  {
    id: "tablero-corregir-cobro",
    area: "tablero",
    pregunta: "Me equivoqué en un cobro, ¿cómo lo corrijo?",
    respuesta: [
      "Lo cobrado no se edita, para que las cuentas cierren. El dueño puede anular el cobro, también días después desde Reportes. Deja de sumar a los ingresos y queda en el historial de anuladas.",
      "Antes de cobrar, en cambio, los servicios y los precios se pueden corregir.",
    ],
    palabrasClave: ["anular cobro", "error", "corregir", "devolución", "editar"],
    paraFallas: true,
  },
  {
    id: "tablero-quien-cobra",
    area: "tablero",
    pregunta: "¿Por qué no puedo cobrar una atención?",
    respuesta: [
      "Cobran el dueño y el encargado. Un profesional lleva sus atenciones hasta Por cobrar, y el cobro lo registra el dueño o el encargado.",
    ],
    palabrasClave: ["permisos", "rol", "cobrar", "profesional", "no me deja"],
    paraFallas: true,
  },
  {
    id: "paquetes-que-es",
    area: "tablero",
    pregunta: "¿Qué es un paquete de sesiones?",
    respuesta: [
      "Son varias sesiones de un servicio que tu cliente paga de una vez, a mejor precio. Por ejemplo, \"6 sesiones de Depilación láser por $150.000\".",
      "Tú creas el paquete, lo vendes al cobrar y Eli lleva la cuenta de las sesiones que quedan.",
    ],
    palabrasClave: ["paquete", "pack", "sesiones", "bono", "promoción", "prepago"],
  },
  {
    id: "paquetes-crear",
    area: "tablero",
    pregunta: "¿Cómo creo un paquete de sesiones?",
    respuesta: [
      "1. Entra a Configuración y busca \"Paquetes de sesiones\".",
      "2. Toca \"Crear paquete\".",
      "3. Elige el servicio, escribe cuántas sesiones trae (entre 2 y 50) y el precio del paquete completo.",
      "4. Elige hasta cuándo vale (\"No vence\", o 3, 6 o 12 meses) y toca \"Crear paquete\".",
      "Mientras escribes, Eli te muestra en cuánto queda cada sesión. Los paquetes los crean el dueño y el encargado.",
    ],
    palabrasClave: ["crear paquete", "nuevo paquete", "armar", "configuración", "precio", "pack"],
  },
  {
    id: "paquetes-vender",
    area: "tablero",
    pregunta: "¿Cómo vendo un paquete?",
    respuesta: [
      "1. En el Tablero, toca \"Cobrar\" en la atención del cliente.",
      "2. Toca \"Vender paquete\" y elige el paquete.",
      "3. Registra el pago como siempre. El paquete se suma al total y la plata entra ese día.",
      "El paquete queda a nombre del cliente, así que la atención tiene que ser de alguien de tu lista de Clientes.",
      "Los paquetes se venden solo al cobrar: en tu página de reservas no se compran.",
    ],
    palabrasClave: ["vender paquete", "cobrar paquete", "no me deja vender", "pack", "página de reservas"],
  },
  {
    id: "paquetes-usar-sesion",
    area: "tablero",
    pregunta: "¿Cómo descuento una sesión del paquete?",
    respuesta: [
      "El cobro lo ofrece solo. Al cobrar un servicio para el que el cliente tiene un paquete, aparece marcado \"Usar 1 sesión de su paquete\", con las sesiones que le quedan.",
      "Ese servicio queda cubierto por el paquete y se paga solo lo demás. Si esta vez prefiere pagarlo aparte, desmarca la casilla.",
    ],
    palabrasClave: ["usar sesión", "descontar", "canjear", "ocupar sesión", "cubierta por el paquete", "pack"],
  },
  {
    id: "paquetes-mismo-dia",
    area: "tablero",
    pregunta: "Compró el paquete y se atiende hoy mismo, ¿qué hago?",
    respuesta: [
      "Todo va en el mismo cobro. Al agregar el paquete con \"Vender paquete\", queda marcado \"Usar la primera sesión hoy\": el servicio de hoy queda cubierto y se paga solo el paquete.",
      "Si hoy no va a usar ninguna sesión, desmarca la casilla.",
    ],
    palabrasClave: ["primera sesión", "mismo día", "hoy", "comprar y usar", "pack"],
  },
  {
    id: "paquetes-anular-atencion",
    area: "tablero",
    pregunta: "Anulé una atención donde se usó una sesión, ¿se pierde?",
    respuesta: [
      "No. Al anular la atención, la sesión vuelve al paquete y el cliente la puede usar otro día.",
      "La atención donde vendiste el paquete es distinta: no se puede anular si ya se usó una sesión en otra atención o si el paquete se devolvió.",
    ],
    palabrasClave: ["anular", "sesión perdida", "recuperar sesión", "devolver sesión", "error", "pack"],
  },

  // ─── Clientes ──────────────────────────────────────────────────────────────
  {
    id: "clientes-agregar",
    area: "clientes",
    pregunta: "¿Cómo agrego un cliente?",
    respuesta: [
      "En Clientes, toca \"Nuevo cliente\" y escribe su nombre, correo y teléfono.",
      "Quien reserva desde tu página pública queda guardado como cliente sin que hagas nada.",
    ],
    palabrasClave: ["crear cliente", "nuevo cliente", "registrar"],
  },
  {
    id: "clientes-buscar",
    area: "clientes",
    pregunta: "¿Cómo encuentro a un cliente?",
    respuesta: [
      "En Clientes, usa el buscador: busca por nombre, correo o teléfono. También puedes filtrar por etiqueta.",
    ],
    palabrasClave: ["buscar", "filtrar", "etiqueta", "encontrar"],
  },
  {
    id: "clientes-historial",
    area: "clientes",
    pregunta: "¿Dónde veo el historial y las notas de un cliente?",
    respuesta: [
      "Abre su ficha en Clientes: ahí están sus datos, sus últimas citas y sus notas.",
      "Un profesional ve en el historial solo las citas que atendió él, y de la ficha puede editar solo las notas.",
    ],
    palabrasClave: ["ficha", "notas", "historial", "visitas"],
  },
  {
    id: "clientes-no-puedo-editar",
    area: "clientes",
    pregunta: "No puedo cambiar los datos de un cliente",
    respuesta: [
      "Cambiar los datos de un cliente (nombre, teléfono, correo, etiquetas) y borrarlo lo hacen el dueño y el encargado. Un profesional, en la ficha, puede editar solo las notas.",
    ],
    palabrasClave: ["editar cliente", "no me deja", "permisos", "borrar cliente", "profesional"],
    paraFallas: true,
  },
  {
    id: "paquetes-cuantas-quedan",
    area: "clientes",
    pregunta: "¿Dónde veo cuántas sesiones le quedan a un cliente?",
    respuesta: [
      "Abre su ficha en Clientes. En \"Paquetes\" aparece cada uno con lo que le queda, por ejemplo \"Le quedan 4 de 6\", cuándo lo compró y cuándo vence.",
      "Lo ve todo el equipo. Los montos los ven solo el dueño y el encargado.",
    ],
    palabrasClave: ["saldo", "sesiones restantes", "cuántas le quedan", "ficha", "paquete", "pack"],
  },
  {
    id: "paquetes-vencimiento",
    area: "clientes",
    pregunta: "¿Los paquetes vencen?",
    respuesta: [
      "Solo si tú les pones un plazo. Al crear el paquete eliges \"No vence\" o que valga 3, 6 o 12 meses, contados desde el día de la compra.",
      "Un paquete vencido ya no se puede usar al cobrar. El dueño todavía puede devolverlo desde la ficha del cliente.",
    ],
    palabrasClave: ["vencimiento", "vence", "vencido", "vigencia", "plazo", "caduca", "pack"],
  },
  {
    id: "paquetes-devolver",
    area: "clientes",
    pregunta: "¿Cómo devuelvo un paquete?",
    respuesta: [
      "1. Abre la ficha del cliente en Clientes.",
      "2. En \"Paquetes\", toca \"Devolver\".",
      "3. Elige cómo se devuelve la plata y confirma.",
      "Si no usó ninguna sesión, se devuelve todo. Si usó alguna, se devuelven las que le quedan, por lo que vale cada una.",
      "Solo el dueño puede devolver. Eli deja anotado cuánto, cuándo y cómo; la plata se la entregas tú. Después, el paquete no se puede usar más.",
    ],
    palabrasClave: ["devolución", "devolver plata", "reembolso", "arrepentimiento", "no me deja devolver", "pack"],
  },

  // ─── Reportes ──────────────────────────────────────────────────────────────
  {
    id: "reportes-que-muestra",
    area: "reportes",
    pregunta: "¿Qué muestra Reportes?",
    respuesta: [
      "El historial de todo lo cobrado, con un resumen: ingresos, cantidad de atenciones, ticket promedio y el desglose por medio de pago, por profesional y por servicio.",
      "Puedes filtrar por período (hoy, ayer, esta semana, este mes o un rango de fechas), por turno, por profesional, por servicio y por medio de pago.",
    ],
    palabrasClave: ["ingresos", "ventas", "filtros", "resumen", "ticket promedio"],
  },
  {
    id: "reportes-falta-ingreso",
    area: "reportes",
    pregunta: "¿Por qué un ingreso no aparece en Reportes?",
    respuesta: [
      "Reportes suma solo las atenciones cobradas en el Tablero. Una cita marcada como completada en la Agenda sin pasar por el cobro no suma: no queda registro de cuánto se cobró ni cómo.",
      "Revisa también los filtros: el período, el turno o un profesional elegido pueden estar dejándola fuera. Y si el cobro se anuló, aparece en Anuladas.",
    ],
    palabrasClave: ["no aparece", "falta", "ingresos", "no suma", "anuladas"],
    paraFallas: true,
  },
  {
    id: "reportes-turnos",
    area: "reportes",
    pregunta: "¿Cómo se cuentan los turnos mañana, tarde y noche?",
    respuesta: [
      "Mañana es antes de las 12, tarde de 12 a 18 y noche desde las 18. El día y el turno se calculan con la hora del dispositivo con que miras el reporte.",
    ],
    palabrasClave: ["turno", "mañana", "tarde", "noche", "horario", "zona horaria"],
  },
  {
    id: "reportes-exportar",
    area: "reportes",
    pregunta: "¿Puedo exportar los reportes a Excel?",
    respuesta: [
      "Los reportes se ven en el panel, pero no se descargan.",
      "Lo que sí se descarga, en un archivo CSV que abre Excel: los clientes y las atenciones de un rango de fechas, desde Clientes con \"Exportar\" (dueño y encargado), y el comprobante de cada liquidación.",
    ],
    palabrasClave: ["excel", "descargar", "exportar", "pdf", "planilla"],
  },
  {
    id: "reportes-profesional",
    area: "reportes",
    pregunta: "¿Qué ve un profesional en Reportes?",
    respuesta: [
      "Solo lo suyo: los servicios que atendió y cuánto sumaron. No ve los totales del negocio ni los medios de pago.",
    ],
    palabrasClave: ["permisos", "rol", "profesional", "privacidad"],
  },
  {
    id: "paquetes-reportes-cero",
    area: "reportes",
    pregunta: "¿Por qué una sesión de paquete aparece en $0 en Reportes?",
    respuesta: [
      "Porque esa plata ya entró el día que vendiste el paquete. La sesión aparece en $0, con \"(con paquete)\", para no contarla dos veces.",
      "Así, el total de cada día es lo que de verdad entró ese día.",
    ],
    palabrasClave: ["con paquete", "cero", "no suma", "ingresos", "sesión gratis", "pack"],
  },

  // ─── Equipo ────────────────────────────────────────────────────────────────
  {
    id: "equipo-invitar",
    area: "equipo",
    pregunta: "¿Cómo invito a alguien a mi equipo?",
    respuesta: [
      "En Equipo, toca \"Invitar al equipo\" y escribe su nombre, su correo y su rol (encargado o profesional). Le llega un correo con un enlace para crear su cuenta o, si ya tiene una en Eli (por ejemplo, porque trabaja en otro negocio), para sumarse con ella.",
      "El enlace vale 7 días y sirve una sola vez. También puedes invitarte a ti mismo como profesional de tu negocio, si además de administrarlo atiendes.",
    ],
    palabrasClave: ["invitar", "agregar profesional", "sumar", "trabajador", "invitación"],
  },
  {
    id: "equipo-no-llego",
    area: "equipo",
    pregunta: "La invitación no le llegó a la persona que invité",
    respuesta: [
      "Pídele que revise su carpeta de spam o correo no deseado, y revisa que el correo esté bien escrito.",
      "Si no la encuentra o el enlace venció, reenvíala desde Equipo, en las invitaciones pendientes: le llega un enlace nuevo y el anterior deja de servir.",
    ],
    palabrasClave: ["no llega", "spam", "correo", "invitación", "vencida"],
    paraFallas: true,
  },
  {
    id: "equipo-invitacion-pendiente",
    area: "equipo",
    pregunta: "Me dice que ya existe una invitación pendiente",
    respuesta: [
      "Ya invitaste a ese correo y la invitación sigue vigente. En Equipo, en las invitaciones pendientes, puedes reenviarla (le llega un enlace nuevo y el anterior deja de servir) o anularla. Se puede reenviar hasta 3 veces por hora.",
      "Si la invitación venció, invitar de nuevo a ese correo la reemplaza por una nueva.",
    ],
    palabrasClave: ["invitación pendiente", "volver a invitar", "reenviar", "no me deja", "vencida"],
    paraFallas: true,
  },
  {
    id: "equipo-roles",
    area: "equipo",
    pregunta: "¿Qué puede hacer cada rol?",
    respuesta: [
      "Dueño: todo. Encargado: equipo, agenda, horarios, clientes y los cobros del Tablero. Profesional: su agenda, sus atenciones y lo que él atendió en Reportes; también ve los clientes del negocio y puede crearlos.",
    ],
    palabrasClave: ["permisos", "encargado", "profesional", "dueño", "rol"],
  },
  {
    id: "equipo-horarios",
    area: "equipo",
    pregunta: "¿Cada persona del equipo tiene su propio horario?",
    respuesta: [
      "Sí. En Configuración, el dueño y el encargado eligen a quién le editan el horario. Cada profesional puede editar el suyo.",
    ],
    palabrasClave: ["horario", "turnos", "disponibilidad", "configuración"],
  },

  {
    id: "equipo-varios-negocios",
    area: "equipo",
    pregunta: "¿Puedo trabajar en más de un negocio con la misma cuenta?",
    respuesta: [
      "Sí. Una cuenta puede ser dueña de un negocio y trabajar en otros, y el dueño también puede ser profesional de su propio negocio. Al iniciar sesión eliges con qué negocio y con qué rol entras, y lo cambias cuando quieras con el botón de las flechas, junto a tu nombre en la barra lateral.",
      "Cada vez ves solo lo de ese negocio y ese rol: como profesional ves tus citas y tu plata, y tus atenciones llevan comisión como las de cualquiera del equipo.",
    ],
    palabrasClave: ["dos negocios", "otro negocio", "cambiar de negocio", "varios locales", "cuenta", "rol"],
  },
  {
    id: "paquetes-comision",
    area: "equipo",
    pregunta: "¿Cuándo gana su comisión el profesional por un paquete?",
    respuesta: [
      "Al atender cada sesión, no al vender el paquete. Cada vez que se usa una sesión, quien la atendió gana su comisión sobre lo que vale esa sesión.",
      "La venta del paquete no le suma comisión a nadie.",
    ],
    palabrasClave: ["comisión", "paquete", "sesión", "venta", "profesional", "pack"],
  },
  {
    id: "equipo-sacar-como",
    area: "equipo",
    pregunta: "¿Cómo saco a alguien del equipo?",
    respuesta: [
      "1. En Equipo, busca a la persona.",
      "2. Toca \"Sacar del equipo\". En el celular está en el botón de opciones, al lado de su nombre.",
      "3. Lee el aviso y confirma con \"Sacar del equipo\".",
      "Desde ese momento deja de aparecer en la agenda y en tu página de reservas. Su horario y sus bloqueos se borran.",
    ],
    palabrasClave: ["eliminar", "borrar", "quitar", "despedir", "renunció", "se fue", "dar de baja", "desvincular"],
  },
  {
    id: "equipo-sacar-quien",
    area: "equipo",
    pregunta: "¿Quién puede sacar a quién del equipo?",
    respuesta: [
      "El dueño puede sacar a cualquiera. El encargado, solo a los profesionales. Un profesional no puede sacar a nadie.",
      "Nadie puede sacarse a sí mismo, y al dueño no lo saca nadie.",
    ],
    palabrasClave: ["permisos", "rol", "encargado", "dueño", "profesional", "quitar"],
  },
  {
    id: "equipo-sacar-no-deja",
    area: "equipo",
    pregunta: "No me deja sacar a alguien del equipo",
    respuesta: [
      "Pasa cuando esa persona todavía tiene citas por delante o una atención abierta en el Tablero. Eli te dice cuántas son y te lleva a verlas.",
      "Las citas: muévelas a otra persona o cancélalas desde la Agenda.",
      "La atención abierta: cóbrala o anúlala en el Tablero.",
      "Después vuelve a intentarlo.",
    ],
    palabrasClave: ["no me deja", "todavía no puedes sacar", "por delante", "atención abierta", "quitar", "eliminar"],
    paraFallas: true,
  },
  {
    id: "equipo-sacar-plata",
    area: "equipo",
    pregunta: "¿Qué pasa con la plata que le debo a quien saqué del equipo?",
    respuesta: [
      "No se pierde. Lo que le quedó pendiente sigue en Liquidaciones, con su nombre, hasta que se lo pagues.",
      "Tener plata pendiente no impide sacar a la persona: Eli te lo avisa antes de confirmar.",
    ],
    palabrasClave: ["liquidación", "pendiente", "comisiones", "propinas", "adelantos", "pagar", "deuda"],
  },
  {
    id: "equipo-sacar-historial",
    area: "equipo",
    pregunta: "¿Se borra el historial de quien saqué del equipo?",
    respuesta: [
      "No. Sus atenciones pasadas, sus comisiones y sus liquidaciones quedan guardadas, y Reportes las sigue mostrando con su nombre.",
    ],
    palabrasClave: ["historial", "atenciones pasadas", "reportes", "se pierde", "borrar", "datos"],
  },
  {
    id: "equipo-sacar-acceso",
    area: "equipo",
    pregunta: "¿Cuánto tarda en perder el acceso quien saqué del equipo?",
    respuesta: [
      "Unos minutos. Después ya no puede entrar a tu negocio.",
      "Su cuenta de Eli sigue siendo suya: si trabaja en otro negocio, ahí entra como siempre.",
    ],
    palabrasClave: ["acceso", "entrar", "sesión", "sigue viendo", "bloquear", "cuenta"],
  },
  {
    id: "equipo-sacar-vuelve",
    area: "equipo",
    pregunta: "¿Qué hago si alguien que saqué vuelve al equipo?",
    respuesta: [
      "Invita de nuevo a esa persona desde Equipo, con \"Invitar al equipo\". Cuando acepta, vuelve con su historial de antes y con el rol que elijas en la invitación.",
      "Su horario hay que cargarlo otra vez en Configuración.",
    ],
    palabrasClave: ["volver", "reincorporar", "invitar de nuevo", "regresa", "recontratar", "invitación"],
  },

  // ─── Cuenta y plan ─────────────────────────────────────────────────────────
  {
    id: "cuenta-precios",
    area: "cuenta-y-plan",
    pregunta: "¿Cuánto cuesta Eli?",
    respuesta: [
      `Independiente: ${formatearPesos(PRECIO_INDEPENDIENTE)} al mes, para cuando solo tú atiendes. Equipo: ${formatearPesos(PRECIO_EQUIPO)} al mes con hasta ${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden, y ${formatearPesos(PRECIO_PERSONA_ADICIONAL)} al mes por cada persona más.`,
      "Los precios incluyen IVA y se pagan mes a mes; no hay plan anual. Los dos planes traen todas las funciones.",
    ],
    palabrasClave: ["precio", "valor", "plan", "mensualidad", "suscripción", "costo", "independiente", "equipo"],
  },
  {
    id: "cuenta-prueba",
    area: "cuenta-y-plan",
    pregunta: "¿Cómo funciona la prueba gratis?",
    respuesta: [
      `Tienes ${DIAS_DE_PRUEBA} días gratis, sin tarjeta, contados desde que creas tu negocio.`,
      "Todavía no se cobra: cuando se pueda activar un plan desde el panel, te avisaremos.",
    ],
    palabrasClave: ["prueba gratis", "gratis", "días", "tarjeta", "cobro", "pagar"],
  },
  {
    id: "cuenta-quien-cuenta",
    area: "cuenta-y-plan",
    pregunta: "¿Quién cuenta como persona que atiende?",
    respuesta: [
      "Los profesionales, siempre, y el dueño si también atiende. El encargado no cuenta.",
    ],
    palabrasClave: ["personas", "profesionales", "plan equipo", "precio"],
  },
  {
    id: "cuenta-dias-extra",
    area: "cuenta-y-plan",
    pregunta: "¿Cómo sumo días a mi prueba?",
    respuesta: [
      `Invitando a otro negocio con tu enlace de invitación, que está en el inicio del panel. Cuando ese negocio recibe su primera reserva desde su página, sumas ${DIAS_EXTRA_POR_REFERIDO} días a tu prueba. Se gana una sola vez por negocio.`,
    ],
    palabrasClave: ["referidos", "invitar negocio", "días extra", "recomendar"],
  },
  {
    id: "cuenta-contrasena",
    area: "cuenta-y-plan",
    pregunta: "Olvidé mi contraseña",
    respuesta: [
      "En Iniciar sesión, toca \"¿Olvidaste tu contraseña?\" y escribe tu correo. Te llega un enlace para crear una nueva; vale una hora y sirve una sola vez. Al cambiarla se cierran las sesiones abiertas en otros dispositivos.",
      "Si creaste tu cuenta con Google, no tienes contraseña en Eli: entra con el botón de Google.",
    ],
    palabrasClave: ["clave", "contraseña", "recuperar", "restablecer", "no puedo entrar", "login"],
    paraFallas: true,
  },
  {
    id: "cuenta-google",
    area: "cuenta-y-plan",
    pregunta: "Entro con Google y me pide correo y contraseña",
    respuesta: [
      "Cada cuenta entra de una sola forma: la que se creó con correo y contraseña entra con ellos, y la que se creó con Google, con Google. Usa la forma con la que creaste tu cuenta.",
    ],
    palabrasClave: ["google", "gmail", "iniciar sesión", "no puedo entrar", "login"],
    paraFallas: true,
  },
  {
    id: "cuenta-no-llega-recuperacion",
    area: "cuenta-y-plan",
    pregunta: "No me llega el correo para recuperar la contraseña",
    respuesta: [
      "Revisa la carpeta de spam o correo no deseado, y que escribiste el mismo correo con el que creaste tu cuenta.",
      "Si creaste tu cuenta con Google, no te llega ningún correo: no tienes contraseña en Eli. Entra con el botón de Google.",
    ],
    palabrasClave: ["no llega", "no me llega", "recuperar", "contraseña", "clave", "spam", "correo"],
    paraFallas: true,
  },

  // ─── Otro ──────────────────────────────────────────────────────────────────
  {
    id: "otro-app",
    area: "otro",
    pregunta: "¿Eli tiene una app para instalar?",
    respuesta: [
      "No hay una app para descargar. Eli funciona en el navegador del teléfono, la tablet o el computador, con la misma cuenta.",
    ],
    palabrasClave: ["app", "aplicación", "celular", "teléfono", "android", "iphone", "descargar"],
  },
  {
    id: "otro-pago-en-linea",
    area: "otro",
    pregunta: "¿Mis clientes pueden pagar en línea al reservar?",
    respuesta: [
      "No. Eli no cobra a tus clientes: ellos reservan en tu página y te pagan en el local. En el Tablero registras cuánto y cómo te pagaron.",
    ],
    palabrasClave: ["pago en línea", "pagar online", "abono", "webpay", "transferencia"],
  },
  {
    id: "otro-whatsapp",
    area: "otro",
    pregunta: "¿Eli se conecta con WhatsApp?",
    respuesta: [
      "No. Lo que sí puedes hacer es copiar tu enlace de reservas y mandarlo o publicarlo donde quieras.",
    ],
    palabrasClave: ["whatsapp", "mensajes", "chat", "integración"],
  },
  {
    id: "otro-respuesta",
    area: "otro",
    pregunta: "¿Cómo me responden después de escribirles?",
    respuesta: [
      "Cuando nos escribes desde aquí, tu mensaje queda registrado con un número de caso y te llega un correo con ese número. Te respondemos por correo.",
    ],
    palabrasClave: ["contacto", "soporte", "respuesta", "caso", "correo", "ayuda"],
  },
]
