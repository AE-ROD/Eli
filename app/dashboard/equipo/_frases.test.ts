import { describe, expect, it } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeEquipo } from "./_frases"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras

const NEUTRAS = palabrasDe(null)

/**
 * Un rubro inventado con otros géneros que los reales: el servicio masculino y
 * la clienta, para que una frase con un artículo pegado a mano se rompa.
 */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  profesional: { singular: "maestra", plural: "maestras", genero: "f" },
  servicio: { singular: "trabajo", plural: "trabajos", genero: "m" },
  negocio: { singular: "taller", plural: "talleres", genero: "m" },
}

describe("sin rubro: exactamente los textos de siempre", () => {
  const f = frasesDeEquipo(NEUTRAS)

  it("la página y la lista vacía", () => {
    expect(f.subtitulo).toBe("Gestiona el equipo de tu negocio")
    expect(f.sinNadie.titulo).toBe("Todavía no hay nadie en tu equipo")
    expect(f.sinNadie.ayuda).toBe("Usa el botón “Invitar al equipo” para sumar a tu encargado o a tus profesionales.")
  })

  it("los servicios de cada integrante", () => {
    expect(f.servicios.queHace).toBe("Servicios que hace")
    expect(f.servicios.queHaceDe("Ana")).toBe("Servicios que hace Ana")
    expect(f.servicios.titulo("Ana")).toBe("Servicios de Ana")
    expect(f.servicios.descripcion).toBe(
      "En la página de reservas, tus clientes sólo pueden elegir a esta persona para los servicios que hace."
    )
    expect(f.servicios.cargando).toBe("Cargando los servicios...")
    expect(f.servicios.todos).toBe("Todos los servicios")
    expect(f.servicios.sinCatalogo).toBe("Todavía no hay servicios en Configuración.")
    expect(f.servicios.elegirAlMenosUno).toBe('Elige al menos un servicio, o marca "Todos los servicios".')
    expect(f.servicios.guardado("Ana")).toBe("Se guardaron los servicios de Ana.")
    expect(f.servicios.guardar).toBe("Guardar servicios")
  })

  it("la foto y los roles", () => {
    expect(f.foto.descripcion(true)).toBe("La ven tus clientes en la página de reservas, junto al nombre.")
    expect(f.foto.descripcion(false)).toBe("Se ve en la lista del equipo. En la página de reservas sólo salen quienes atienden.")
    expect(f.roles.quienAtiende).toBe("Gestiona su propio horario y citas")
    expect(f.roles.encargado).toBe("Gestiona el equipo, la agenda, los horarios, los servicios y los cobros. Puede invitar a otros.")
  })

  it("los errores de los pedidos", () => {
    expect(f.errores).toEqual({
      cargarServicios: "No se pudieron cargar los servicios",
      cargarServiciosDeLaPersona: "No se pudieron cargar los servicios de esta persona",
      guardarServicios: "No se pudieron guardar los servicios",
    })
  })
})

describe("los rubros sin palabras propias hablan como sin rubro", () => {
  it.each(["salud", "fitness", "otro", "", "constructor", undefined])("%s", (rubro) => {
    expect(frasesDeEquipo(palabrasDe(rubro as string | null)).servicios.descripcion).toBe(frasesDeEquipo(NEUTRAS).servicios.descripcion)
    expect(JSON.stringify(frasesDeEquipo(palabrasDe(rubro as string | null)).roles)).toBe(JSON.stringify(frasesDeEquipo(NEUTRAS).roles))
  })
})

describe("salón, barbería y salón de uñas", () => {
  it("el negocio y quien atiende con su palabra", () => {
    expect(frasesDeEquipo(palabrasDe("salon")).subtitulo).toBe("Gestiona el equipo de tu salón")
    expect(frasesDeEquipo(palabrasDe("barberia")).subtitulo).toBe("Gestiona el equipo de tu barbería")
    expect(frasesDeEquipo(palabrasDe("spa-de-unas")).subtitulo).toBe("Gestiona el equipo de tu salón de uñas")
    expect(frasesDeEquipo(palabrasDe("salon")).sinNadie.ayuda).toContain("a tus estilistas.")
    expect(frasesDeEquipo(palabrasDe("barberia")).sinNadie.ayuda).toContain("a tus barberos.")
    expect(frasesDeEquipo(palabrasDe("spa-de-unas")).sinNadie.ayuda).toContain("a tus manicuristas.")
  })

  it("la reserva se llama hora: \"su propio horario y horas\" se leería como reloj", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas"]) {
      expect(frasesDeEquipo(palabrasDe(rubro)).roles.quienAtiende).toBe("Gestiona su propio horario y su agenda")
    }
  })
})

describe("clínica dental: odontólogos y prestaciones", () => {
  const f = frasesDeEquipo(palabrasDe("odontologia"))

  it("las prestaciones son femeninas: \"Todas las prestaciones\", \"una prestación\", \"las prestaciones\"", () => {
    expect(f.servicios.queHace).toBe("Prestaciones que hace")
    expect(f.servicios.titulo("Ana")).toBe("Prestaciones de Ana")
    expect(f.servicios.cargando).toBe("Cargando las prestaciones...")
    expect(f.servicios.todos).toBe("Todas las prestaciones")
    expect(f.servicios.elegirAlMenosUno).toBe('Elige al menos una prestación, o marca "Todas las prestaciones".')
    expect(f.servicios.guardado("Ana")).toBe("Se guardaron las prestaciones de Ana.")
    expect(f.servicios.descripcion).toBe(
      "En la página de reservas, tus pacientes sólo pueden elegir a esta persona para las prestaciones que hace."
    )
    expect(f.errores.cargarServicios).toBe("No se pudieron cargar las prestaciones")
    expect(f.roles.encargado).toContain("los horarios, las prestaciones y los cobros")
  })

  it("los odontólogos, la clínica y la cita", () => {
    expect(f.subtitulo).toBe("Gestiona el equipo de tu clínica")
    expect(f.sinNadie.ayuda).toContain("a tus odontólogos.")
    expect(f.roles.quienAtiende).toBe("Gestiona su propio horario y citas")
  })
})

describe("la concordancia sale del género y no de las palabras de hoy: un trabajo masculino y una maestra", () => {
  const f = frasesDeEquipo(AL_REVES)

  it("\"un trabajo\", \"los trabajos\", \"tus clientas\", \"tus maestras\"", () => {
    expect(f.servicios.elegirAlMenosUno).toBe('Elige al menos un trabajo, o marca "Todos los trabajos".')
    expect(f.servicios.cargando).toBe("Cargando los trabajos...")
    expect(f.servicios.descripcion).toContain("tus clientas sólo pueden elegir a esta persona para los trabajos que hace")
    expect(f.sinNadie.ayuda).toContain("a tus maestras.")
    expect(f.subtitulo).toBe("Gestiona el equipo de tu taller")
  })
})

describe("el plan Independiente no tiene equipo", () => {
  it("sin rubro: las palabras neutras", () => {
    const f = frasesDeEquipo(NEUTRAS).sinEquipoPorElPlan
    expect(f.titulo).toBe("Tu plan es Independiente: atiendes tú solo")
    expect(f.descripcion).toBe(
      "Para invitar a tu encargado o a tus profesionales, pasa al plan Equipo. Tu agenda, tus clientes y tu historial siguen ahí."
    )
  })

  it.each([
    ["salon", "a tus estilistas", "tus clientes"],
    ["odontologia", "a tus odontólogos", "tus pacientes"],
  ])("%s: nombra a quien atiende y a quien se atiende con las palabras del rubro", (rubro, profesionales, clientes) => {
    const { descripcion } = frasesDeEquipo(palabrasDe(rubro)).sinEquipoPorElPlan
    expect(descripcion).toContain(profesionales)
    expect(descripcion).toContain(clientes)
  })

  it("con otros géneros no cambia nada que dependa de un artículo pegado a mano", () => {
    expect(frasesDeEquipo(AL_REVES).sinEquipoPorElPlan.descripcion).toContain("a tus maestras")
  })
})
