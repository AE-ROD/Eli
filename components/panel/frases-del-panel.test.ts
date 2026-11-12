import { describe, expect, it } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDelPanel } from "./frases-del-panel"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras

const NEUTRAS = palabrasDe(null)

/**
 * Un rubro inventado con otros géneros que los reales: la clienta y el
 * servicio al revés, la cita masculina. Si una frase pegara "otro" o "el" a
 * mano, acá se rompe.
 */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  servicio: { singular: "trabajo", plural: "trabajos", genero: "m" },
  cita: { singular: "turno", plural: "turnos", genero: "m" },
  tablero: { singular: "mostrador", plural: "mostradores", genero: "m" },
  negocio: { singular: "taller", plural: "talleres", genero: "m" },
}

describe("sin rubro: exactamente los textos de siempre", () => {
  const f = frasesDelPanel(NEUTRAS)

  it("la tarjeta de la cita", () => {
    expect(f.tarjetaDeCita.noVino).toBe("No vino")
    expect(f.tarjetaDeCita.sinProfesional).toBe("Sin profesional")
  })

  it("los primeros pasos", () => {
    expect(f.bienvenida.horario.descripcion).toBe(
      "Define los días y horas en que atiendes. Así tus clientes solo podrán reservar en tu disponibilidad real."
    )
    expect(f.bienvenida.servicios.titulo).toBe("Agrega tus servicios")
    expect(f.bienvenida.servicios.descripcion).toBe(
      "Crea el catálogo de servicios que ofreces con su duración y precio. Esto aparecerá en tu página de reservas."
    )
    expect(f.bienvenida.servicios.accion).toBe("Agregar servicios")
    expect(f.bienvenida.enlace.descripcion).toBe(
      "Este es tu link único de reservas. Compártelo con tus clientes por WhatsApp, redes sociales o donde quieras."
    )
  })

  it("anular", () => {
    expect(f.anular.ejemploDeCobro).toBe("Ej.: se cobró de más, se cargó a otro cliente…")
  })

  it("los planes", () => {
    expect(f.precios.independiente).toBe("Tu agenda, tu página de reservas, el tablero del día y los reportes. Todo Eli, para ti.")
    expect(f.precios.sumarAlguien).toBe("¿Sumas a alguien? Te pasas a Equipo y tu agenda, tus clientes y tu historial siguen ahí.")
    expect(f.precios.paraElNegocioConEquipo).toBe("Para el negocio con equipo")
    expect(f.precios.equipo).toBe("Tú, tu encargado y tus profesionales, cada uno con su rol.")
    expect(f.precios.roles).toEqual([
      { rol: "Dueño", texto: "Ve todo el negocio. El plan y el pago son solo tuyos." },
      { rol: "Encargado", texto: "Organiza la agenda, los servicios y el equipo. No cuenta como persona que atiende." },
      { rol: "Profesional", texto: "Ve su agenda, sus citas y lo que lleva cobrado. Siempre cuenta." },
    ])
  })
})

describe("los rubros sin palabras propias hablan como sin rubro", () => {
  it.each(["salud", "fitness", "otro", "", "constructor", undefined])("%s", (rubro) => {
    expect(frasesDelPanel(palabrasDe(rubro as string | null))).toEqual(frasesDelPanel(NEUTRAS))
  })
})

describe("salón, barbería y salón de uñas", () => {
  it("quien atiende lleva su palabra y la reserva se llama hora, sin chocar con el reloj", () => {
    const salon = frasesDelPanel(palabrasDe("salon"))
    expect(salon.tarjetaDeCita.sinProfesional).toBe("Sin estilista")
    expect(salon.tarjetaDeCita.noVino).toBe("No vino")
    expect(salon.precios.equipo).toBe("Tú, tu encargado y tus estilistas, cada uno con su rol.")
    // "sus horas" se leería como horario: "horas agendadas".
    expect(salon.precios.roles[2]).toEqual({
      rol: "Estilista",
      texto: "Ve su agenda, sus horas agendadas y lo que lleva cobrado. Siempre cuenta.",
    })
    expect(salon.precios.roles[0].texto).toBe("Ve todo el salón. El plan y el pago son solo tuyos.")
    expect(salon.precios.paraElNegocioConEquipo).toBe("Para el salón con equipo")
  })

  it("la barbería es femenina y su profesional, masculino", () => {
    const barberia = frasesDelPanel(palabrasDe("barberia"))
    expect(barberia.precios.roles[0].texto).toBe("Ve toda la barbería. El plan y el pago son solo tuyos.")
    expect(barberia.precios.paraElNegocioConEquipo).toBe("Para la barbería con equipo")
    expect(barberia.tarjetaDeCita.sinProfesional).toBe("Sin barbero")
    expect(barberia.precios.roles[2].rol).toBe("Barbero")
  })

  it("el salón de uñas", () => {
    const unas = frasesDelPanel(palabrasDe("spa-de-unas"))
    expect(unas.precios.roles[0].texto).toBe("Ve todo el salón de uñas. El plan y el pago son solo tuyos.")
    expect(unas.tarjetaDeCita.sinProfesional).toBe("Sin manicurista")
  })
})

describe("clínica dental: pacientes, prestaciones, sala de espera", () => {
  const f = frasesDelPanel(palabrasDe("odontologia"))

  it("la tarjeta de la cita", () => {
    expect(f.tarjetaDeCita.noVino).toBe("No asistió")
    expect(f.tarjetaDeCita.sinProfesional).toBe("Sin odontólogo")
  })

  it("los primeros pasos hablan de prestaciones y pacientes", () => {
    expect(f.bienvenida.horario.descripcion).toContain("tus pacientes solo podrán reservar")
    expect(f.bienvenida.servicios.titulo).toBe("Agrega tus prestaciones")
    expect(f.bienvenida.servicios.descripcion).toBe(
      "Crea el catálogo de prestaciones que ofreces con su duración y precio. Esto aparecerá en tu página de reservas."
    )
    expect(f.bienvenida.servicios.accion).toBe("Agregar prestaciones")
    expect(f.bienvenida.enlace.descripcion).toContain("con tus pacientes por WhatsApp")
  })

  it("anular", () => {
    expect(f.anular.ejemploDeCobro).toBe("Ej.: se cobró de más, se cargó a otro paciente…")
  })

  it("los planes: la cita sigue siendo una cita, la sala de espera y las prestaciones llevan su artículo", () => {
    expect(f.precios.independiente).toBe(
      "Tu agenda, tu página de reservas, la sala de espera del día y los reportes. Todo Eli, para ti."
    )
    expect(f.precios.sumarAlguien).toContain("tus pacientes y tu historial")
    expect(f.precios.paraElNegocioConEquipo).toBe("Para la clínica con equipo")
    expect(f.precios.equipo).toBe("Tú, tu encargado y tus odontólogos, cada uno con su rol.")
    expect(f.precios.roles).toEqual([
      { rol: "Dueño", texto: "Ve toda la clínica. El plan y el pago son solo tuyos." },
      { rol: "Encargado", texto: "Organiza la agenda, las prestaciones y el equipo. No cuenta como persona que atiende." },
      { rol: "Odontólogo", texto: "Ve su agenda, sus citas y lo que lleva cobrado. Siempre cuenta." },
    ])
  })
})

describe("la concordancia sale del género y no de las palabras de hoy", () => {
  const f = frasesDelPanel(AL_REVES)

  it("\"otra clienta\", \"el mostrador\", \"todo el taller\", \"los trabajos\"", () => {
    expect(f.anular.ejemploDeCobro).toBe("Ej.: se cobró de más, se cargó a otra clienta…")
    expect(f.precios.independiente).toBe("Tu agenda, tu página de reservas, el mostrador del día y los reportes. Todo Eli, para ti.")
    expect(f.precios.sumarAlguien).toContain("tus clientas y tu historial")
    expect(f.precios.roles[0].texto).toBe("Ve todo el taller. El plan y el pago son solo tuyos.")
    expect(f.precios.roles[1].texto).toBe("Organiza la agenda, los trabajos y el equipo. No cuenta como persona que atiende.")
    expect(f.precios.roles[2].texto).toBe("Ve su agenda, sus turnos y lo que lleva cobrado. Siempre cuenta.")
  })
})
