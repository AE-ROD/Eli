import { describe, expect, it } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeConfiguracion } from "./_frases"
import { frasesDeLasSedes, type AccionDeSedes } from "./_frases-de-sedes"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras
const NEUTRAS = palabrasDe(null)
const DE_LA_CLINICA = palabrasDe("odontologia")
const DE_UN_SALON = palabrasDe("salon")

/** Un rubro inventado con otros géneros: si una frase pegara un artículo o un adjetivo a mano, acá se rompe. */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  cita: { singular: "turno", plural: "turnos", genero: "m" },
  negocio: { singular: "taller", plural: "talleres", genero: "m" },
}

describe("las frases de las sedes, sin rubro", () => {
  const f = frasesDeLasSedes(NEUTRAS)

  it("el título, el subtítulo y las reglas", () => {
    expect(f.titulo).toBe("Sedes y horarios")
    expect(f.subtitulo).toBe("Tus clientes eligen la sede al reservar y ven qué días y a qué horas estás en cada una.")
    expect(f.regla).toContain("no puedes estar en dos lugares a la vez")
    expect(f.borrar.descripcion).toBe(
      "Se borra la sede con su horario y no se puede deshacer. Si alguna vez tuvo citas, no se puede borrar: desactívala y queda guardada."
    )
  })

  it("el cupo y el límite de 5 sedes activas", () => {
    expect(f.cupo(2)).toBe("2 de 5 sedes activas")
    expect(f.sinCupo).toBe("Ya tienes 5 sedes activas. Desactiva una para agregar otra.")
  })

  it("las horas por delante de una sede", () => {
    expect(f.fila.horasPorDelante(0)).toBe("Sin citas agendadas por delante")
    expect(f.fila.horasPorDelante(1)).toBe("1 cita agendada por delante")
    expect(f.fila.horasPorDelante(3)).toBe("3 citas agendadas por delante")
  })

  it("el paso a varios lugares nombra la dirección del negocio", () => {
    expect(f.convertir.descripcion).toBe(
      "Hoy atiendes sólo en la dirección del negocio. Si trabajas en más de un lugar, agrega cada sede con su dirección y los días y las horas en que estás ahí. Tus clientes eligen dónde reservar."
    )
    expect(f.convertir.modal.principal.ayuda).toBe(
      "Le damos nombre a la dirección del negocio que ya tienes. Su horario es el que tienes cargado hoy, y las citas agendadas por delante quedan en ella."
    )
    expect(f.convertir.boton).toBe("Trabajo en más de un lugar")
  })

  it("se cuelga de frasesDeConfiguracion", () => {
    expect(frasesDeConfiguracion(NEUTRAS).sedes.titulo).toBe("Sedes y horarios")
  })
})

describe("con las palabras de cada rubro", () => {
  it("un salón: «horas agendadas», sin que se lea como reloj", () => {
    const f = frasesDeLasSedes(DE_UN_SALON)
    expect(f.fila.horasPorDelante(0)).toBe("Sin horas agendadas por delante")
    expect(f.fila.horasPorDelante(1)).toBe("1 hora agendada por delante")
    expect(f.fila.horasPorDelante(4)).toBe("4 horas agendadas por delante")
    expect(f.convertir.descripcion).toContain("la dirección del salón")
    expect(f.borrar.descripcion).toContain("Si alguna vez tuvo horas, no se puede borrar")
  })

  it("una clínica dental: pacientes y citas", () => {
    const f = frasesDeLasSedes(DE_LA_CLINICA)
    expect(f.subtitulo).toBe("Tus pacientes eligen la sede al reservar y ven qué días y a qué horas estás en cada una.")
    expect(f.convertir.descripcion).toContain("la dirección de la clínica")
    expect(f.fila.sinHorario).toBe("Sin horario cargado: tus pacientes no ven citas en esta sede hasta que lo cargues.")
    expect(f.fila.horasPorDelante(2)).toBe("2 citas agendadas por delante")
  })

  it("un rubro con otros géneros: el artículo y el adjetivo salen del género, no de las palabras de hoy", () => {
    const f = frasesDeLasSedes(AL_REVES)
    expect(f.fila.horasPorDelante(2)).toBe("2 turnos agendados por delante")
    expect(f.fila.horasPorDelante(1)).toBe("1 turno agendado por delante")
    expect(f.borrar.descripcion).toContain("Si alguna vez tuvo turnos, no se puede borrar")
    expect(f.convertir.modal.principal.ayuda).toContain("los turnos agendados por delante quedan en ella")
    expect(f.convertir.descripcion).toContain("la dirección del taller")
    expect(f.subtitulo).toContain("Tus clientas eligen")
  })
})

describe("error: el mensaje por código", () => {
  const f = frasesDeLasSedes(NEUTRAS)
  const ACCIONES: AccionDeSedes[] = [
    "leer", "agregar", "convertir", "editar", "activar", "desactivar", "ordenar", "borrar", "guardar-horario", "cambiar-de-plan",
  ]

  it("401: la sesión terminó, aunque el servidor diga «No autorizado»", () => {
    expect(f.error(401, "No autorizado", "agregar")).toBe(
      "Tu sesión terminó o no tienes permiso para hacer este cambio. Vuelve a entrar e inténtalo de nuevo."
    )
  })

  it("404: no se encontró; 429: muchos cambios seguidos; 503: más tarde", () => {
    expect(f.error(404, "No encontrado", "editar")).toBe("No se encontró lo que querías cambiar. Recarga la página e inténtalo de nuevo.")
    expect(f.error(429, "", "editar")).toBe("Hiciste varios cambios seguidos. Espera un momento e inténtalo de nuevo.")
    expect(f.error(503, "", "editar")).toBe("Por ahora no se puede hacer este cambio. Inténtalo más tarde.")
  })

  it("409 con el motivo del servidor: ese motivo, tal cual", () => {
    expect(f.error(409, "Esa sede tiene 3 horas agendadas por delante", "desactivar")).toBe("Esa sede tiene 3 horas agendadas por delante")
  })

  it("409 sin motivo: lo más probable de cada acción, con las palabras del rubro", () => {
    expect(f.error(409, "", "borrar")).toBe("Esta sede ya tuvo citas, así que no se puede borrar. Desactívala y deja de ofrecerse.")
    expect(f.error(409, "", "desactivar")).toBe("Esta sede tiene citas agendadas por delante. Muévelas o cancélalas antes de desactivarla.")
    expect(f.error(409, "", "activar")).toContain("ya tienes 5 sedes activas")
    expect(f.error(409, "", "guardar-horario")).toContain("se pisa con el de otra sede")
    expect(frasesDeLasSedes(DE_UN_SALON).error(409, "", "desactivar")).toContain("horas agendadas por delante")
  })

  it("400 y 422: el motivo del servidor si lo hay; si no, uno genérico", () => {
    expect(f.error(400, "El nombre no puede tener más de 40 caracteres", "agregar")).toBe("El nombre no puede tener más de 40 caracteres")
    expect(f.error(422, "", "agregar")).toBe("Algo de lo que enviaste no se pudo leer. Revisa los datos e inténtalo de nuevo.")
  })

  it("un 500 o cualquier 5xx: el texto de la acción, nunca «Error interno»", () => {
    expect(f.error(500, "Error interno", "borrar")).toBe("No se pudo borrar la sede. Inténtalo de nuevo.")
    expect(f.error(502, "Bad Gateway", "guardar-horario")).toBe("No se pudo guardar el horario. Inténtalo de nuevo.")
    expect(f.error(500, "", "cambiar-de-plan")).toBe("No se pudo cambiar el plan. Inténtalo de nuevo.")
  })

  it("sin respuesta: lo que dijo la red, o el texto de la acción", () => {
    expect(f.error(null, "Sin conexión con el servidor", "agregar")).toBe("Sin conexión con el servidor")
    expect(f.error(null, "", "agregar")).toBe("No se pudo agregar la sede. Inténtalo de nuevo.")
  })

  it("un 2xx que no se pudo leer: el texto de la acción", () => {
    expect(f.error(200, "", "leer")).toBe("No se pudieron cargar las sedes. Recarga la página para verlas al día.")
  })

  it("toda acción y todo código tiene un mensaje en español, no vacío", () => {
    for (const accion of ACCIONES) {
      for (const codigo of [null, 200, 400, 401, 404, 409, 422, 429, 500, 502, 503]) {
        expect(f.error(codigo, "", accion).length).toBeGreaterThan(10)
      }
    }
  })
})
