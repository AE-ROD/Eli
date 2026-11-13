import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { frasesDeLaGestion } from "../../../_frases"
import { EL_MISMO_PROFESIONAL, leerHorasParaReagendar, reagendarCita, type ProfesionalParaCambiar } from "../_datos"
import { ProfesionalAlReagendar } from "./gestion-de-cita"
import {
  NADIE_MARCADO,
  alElegirProfesional,
  conQuienQuedo,
  diasDeLaEleccion,
  eleccionDelPedido,
  noHayNadaQueCambiar,
  nombreDeLoMarcado,
  profesionalMarcadoAlAbrir,
} from "./reglas-de-la-gestion"

/*
 * Cambiar de profesional al reagendar por el enlace, del lado de la pantalla:
 * qué queda marcado al abrir, qué se le pide al servidor, qué días ofrece el
 * calendario y cuándo no hay nada que cambiar. El servidor revalida todo
 * (`cambiar-de-profesional.test.ts`, en el endpoint).
 */

const carla: ProfesionalParaCambiar = { id: "m-carla", nombre: "Carla", especialidad: "Colorista", fotoUrl: null, diasConAtencion: [1, 2], actual: true }
const pedro: ProfesionalParaCambiar = { id: "m-pedro", nombre: "Pedro", especialidad: null, fotoUrl: null, diasConAtencion: [2, 3] }
const EQUIPO = [carla, pedro]

describe("profesionalMarcadoAlAbrir", () => {
  it("quien atiende la cita hoy, si es de la lista", () => {
    expect(profesionalMarcadoAlAbrir({ profesional: "Carla" }, EQUIPO)).toBe("m-carla")
  })

  it("una cita sin profesional: 'cualquiera' (null)", () => {
    expect(profesionalMarcadoAlAbrir({ profesional: null }, [{ ...pedro }, { ...pedro, id: "m-otro" }])).toBeNull()
  })

  it("quien la atiende ya no se puede elegir: nadie marcado", () => {
    expect(profesionalMarcadoAlAbrir({ profesional: "Diana" }, [pedro])).toBe(NADIE_MARCADO)
  })
})

describe("eleccionDelPedido", () => {
  it("volver a marcar lo que había al abrir es 'el mismo': no se manda nada", () => {
    expect(eleccionDelPedido("m-carla", "m-carla")).toEqual({ tipo: "mismo" })
    expect(eleccionDelPedido(null, null)).toEqual({ tipo: "mismo" })
    expect(eleccionDelPedido(NADIE_MARCADO, NADIE_MARCADO)).toEqual({ tipo: "mismo" })
  })

  it("otra persona es esa persona; 'cualquiera' (null) con alguien marcado antes es cualquiera", () => {
    expect(eleccionDelPedido("m-carla", "m-pedro")).toEqual({ tipo: "uno", id: "m-pedro" })
    expect(eleccionDelPedido("m-carla", null)).toEqual({ tipo: "cualquiera" })
    expect(eleccionDelPedido(null, "m-pedro")).toEqual({ tipo: "uno", id: "m-pedro" })
    expect(eleccionDelPedido(NADIE_MARCADO, "m-pedro")).toEqual({ tipo: "uno", id: "m-pedro" })
  })
})

describe("diasDeLaEleccion", () => {
  it("'el mismo': los días de la cita; si el servidor no los dijo, todos", () => {
    expect(diasDeLaEleccion([1, 2], EQUIPO, { tipo: "mismo" })).toEqual([1, 2])
    expect(diasDeLaEleccion(null, EQUIPO, { tipo: "mismo" })).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(diasDeLaEleccion([], EQUIPO, { tipo: "mismo" })).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it("una persona: los suyos en la sede de la cita", () => {
    expect(diasDeLaEleccion([1, 2], EQUIPO, { tipo: "uno", id: "m-pedro" })).toEqual([2, 3])
  })

  it("'cualquiera': la unión de los de todos los que se pueden elegir, en orden y sin repetir", () => {
    expect(diasDeLaEleccion([1, 2], EQUIPO, { tipo: "cualquiera" })).toEqual([1, 2, 3])
  })

  it("un id que no está en la lista no deja el calendario vacío: todos, y el servidor dirá", () => {
    expect(diasDeLaEleccion([1], EQUIPO, { tipo: "uno", id: "m-nadie" })).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})

describe("nombreDeLoMarcado", () => {
  it("'el mismo' es el nombre de la cita; otra persona, el suyo; 'cualquiera', ninguno", () => {
    expect(nombreDeLoMarcado("Carla", EQUIPO, "m-carla", "m-carla")).toBe("Carla")
    expect(nombreDeLoMarcado("Carla", EQUIPO, "m-carla", "m-pedro")).toBe("Pedro")
    expect(nombreDeLoMarcado("Carla", EQUIPO, "m-carla", null)).toBeNull()
    expect(nombreDeLoMarcado(null, [], null, null)).toBeNull()
  })
})

describe("alElegirProfesional", () => {
  it("lo que ya estaba marcado no hace nada", () => {
    expect(alElegirProfesional("m-carla", "m-carla", { fecha: "2030-01-08", hora: "10:00" })).toEqual({ cambia: false, avisa: false })
  })

  it("otra persona suelta el día y la hora, y avisa sólo si había algo que soltar", () => {
    expect(alElegirProfesional("m-carla", "m-pedro", { fecha: "2030-01-08", hora: "10:00" })).toEqual({ cambia: true, avisa: true })
    expect(alElegirProfesional("m-carla", "m-pedro", { fecha: "2030-01-08", hora: "" })).toEqual({ cambia: true, avisa: true })
    expect(alElegirProfesional("m-carla", null, { fecha: "", hora: "" })).toEqual({ cambia: true, avisa: false })
  })
})

describe("noHayNadaQueCambiar", () => {
  const cita = { fecha: "2030-01-07", hora: "10:00" }

  it("el mismo día y hora con la misma persona: nada que cambiar", () => {
    expect(noHayNadaQueCambiar(cita, { fecha: "2030-01-07", hora: "10:00" }, { tipo: "mismo" })).toBe(true)
  })

  it("otro día u hora, sí", () => {
    expect(noHayNadaQueCambiar(cita, { fecha: "2030-01-08", hora: "10:00" }, { tipo: "mismo" })).toBe(false)
    expect(noHayNadaQueCambiar(cita, { fecha: "2030-01-07", hora: "10:30" }, { tipo: "mismo" })).toBe(false)
  })

  it("sólo otra persona (misma fecha y hora) sí es un cambio, y 'cualquiera' también: puede asignar a otra", () => {
    expect(noHayNadaQueCambiar(cita, { fecha: "2030-01-07", hora: "10:00" }, { tipo: "uno", id: "m-pedro" })).toBe(false)
    expect(noHayNadaQueCambiar(cita, { fecha: "2030-01-07", hora: "10:00" }, { tipo: "cualquiera" })).toBe(false)
  })
})

describe("conQuienQuedo", () => {
  it("lo dice sólo si se eligió a otra persona o cualquiera; si no, el resumen ya lo dice", () => {
    expect(conQuienQuedo({ tipo: "mismo" }, "Carla")).toBeNull()
    expect(conQuienQuedo({ tipo: "uno", id: "m-pedro" }, "Pedro")).toBe("Pedro")
    expect(conQuienQuedo({ tipo: "cualquiera" }, "Pedro")).toBe("Pedro")
    expect(conQuienQuedo({ tipo: "cualquiera" }, null)).toBeNull()
  })
})

describe("las frases de cambiar de profesional (con las palabras del rubro)", () => {
  it("el aviso al soltar el día y la hora nombra al profesional del rubro, sin artículos a mano", () => {
    expect(frasesDeLaGestion("salon").profesional.cambiaste).toBe("Cambiaste de estilista: elige de nuevo el día y la hora.")
    expect(frasesDeLaGestion("barberia").profesional.cambiaste).toBe("Cambiaste de barbero: elige de nuevo el día y la hora.")
    expect(frasesDeLaGestion("odontologia").profesional.cambiaste).toBe("Cambiaste de odontólogo: elige de nuevo el día y la hora.")
    expect(frasesDeLaGestion(null).profesional.cambiaste).toMatch(/^Cambiaste de \S+: elige de nuevo el día y la hora\.$/)
  })

  it("'cualquiera' es el de la reserva: el de siempre, y el de la clínica", () => {
    expect(frasesDeLaGestion("salon").profesional.cualquiera).toBeUndefined()
    expect(frasesDeLaGestion("odontologia").profesional.cualquiera).toEqual({
      nombre: "La primera hora disponible",
      detalle: "Con cualquier odontólogo",
    })
  })

  it("al confirmar dice con quién quedó sólo si cambió; si no, la frase de siempre", () => {
    expect(frasesDeLaGestion("salon").reagendada("jueves 15 de octubre", "10:00")).toBe(
      "Listo: tu hora quedó el jueves 15 de octubre a las 10:00. Le avisamos al salón."
    )
    expect(frasesDeLaGestion("salon").reagendada("jueves 15 de octubre", "10:00", "Pedro")).toBe(
      "Listo: tu hora quedó el jueves 15 de octubre a las 10:00, con Pedro. Le avisamos al salón."
    )
    expect(frasesDeLaGestion(null).reagendada("jueves 15 de octubre", "10:00", null)).toBe(
      "Listo: tu cita quedó el jueves 15 de octubre a las 10:00. Le avisamos al local."
    )
  })
})

describe("ProfesionalAlReagendar (el selector antes del calendario)", () => {
  const pintar = (propiedades: Partial<Parameters<typeof ProfesionalAlReagendar>[0]> = {}) =>
    renderToString(
      createElement(ProfesionalAlReagendar, {
        profesionales: EQUIPO,
        marcado: "m-carla",
        onElegir: () => undefined,
        aviso: "",
        ...propiedades,
      })
    ).replaceAll("<!-- -->", "")

  it("el mismo selector de la reserva: '¿Con quién?', 'Cualquiera disponible' y una persona por botón, con quien la atiende marcado", () => {
    const html = pintar()

    expect(html).toContain("¿Con quién?")
    expect(html).toContain("Cualquiera disponible")
    expect(html).toContain("Carla")
    expect(html).toContain("Colorista")
    expect(html).toContain("Pedro")
    // Tres botones (cualquiera y dos personas), uno solo marcado.
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<button)[\s\S])*Carla/)
    expect(html).toContain('role="group"')
    // 44px de alto como mínimo y foco visible, como en la reserva.
    expect(html).toContain("min-h-11")
    expect(html).toContain("anillo-foco")
  })

  it("una cita sin profesional trae marcado 'cualquiera'", () => {
    const html = pintar({ marcado: null })

    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<button)[\s\S])*Cualquiera disponible/)
  })

  it("si quien la atiende ya no se puede elegir, ningún botón sale marcado", () => {
    const html = pintar({ marcado: NADIE_MARCADO })

    expect(html).not.toContain('aria-pressed="true"')
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3)
  })

  it("en una clínica, 'cualquiera' se dice con sus palabras", () => {
    const html = pintar({ marcado: null, cualquiera: frasesDeLaGestion("odontologia").profesional.cualquiera })

    expect(html).toContain("La primera hora disponible")
    expect(html).toContain("Con cualquier odontólogo")
  })

  it("el aviso va en una región `status` que existe siempre, para que el lector de pantalla lo anuncie", () => {
    expect(pintar()).toMatch(/<p role="status"[^>]*><\/p>/)
    const html = pintar({ aviso: "Cambiaste de estilista: elige de nuevo el día y la hora." })
    expect(html).toMatch(/<p role="status"[^>]*>Cambiaste de estilista: elige de nuevo el día y la hora\.<\/p>/)
  })
})

describe("lo que viaja al servidor", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function falsoFetch(cuerpo: unknown) {
    const llamadas: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init })
      return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } })
    })
    return llamadas
  }

  it("las horas: sin elección no se manda `profesionalId`; 'cualquiera' lo manda vacío; una persona, su id", async () => {
    const llamadas = falsoFetch({ slots: ["09:00"] })

    await leerHorasParaReagendar("salon-uno", "tok", "2030-01-08")
    await leerHorasParaReagendar("salon-uno", "tok", "2030-01-08", EL_MISMO_PROFESIONAL)
    await leerHorasParaReagendar("salon-uno", "tok", "2030-01-08", { tipo: "cualquiera" })
    await leerHorasParaReagendar("salon-uno", "tok", "2030-01-08", { tipo: "uno", id: "m-pedro" })

    expect(llamadas.map((llamada) => llamada.url)).toEqual([
      "/api/reservar/salon-uno/cita/tok/disponibilidad?fecha=2030-01-08",
      "/api/reservar/salon-uno/cita/tok/disponibilidad?fecha=2030-01-08",
      "/api/reservar/salon-uno/cita/tok/disponibilidad?fecha=2030-01-08&profesionalId=",
      "/api/reservar/salon-uno/cita/tok/disponibilidad?fecha=2030-01-08&profesionalId=m-pedro",
    ])
  })

  it("reagendar: el cuerpo de siempre sin elección, `null` para 'cualquiera' y el id para una persona", async () => {
    const llamadas = falsoFetch({ fecha: "2030-01-08", hora: "09:00", profesional: "Pedro", precio: null })

    await reagendarCita("salon-uno", "tok", "2030-01-08", "09:00", "salon")
    await reagendarCita("salon-uno", "tok", "2030-01-08", "09:00", "salon", { tipo: "cualquiera" })
    await reagendarCita("salon-uno", "tok", "2030-01-08", "09:00", "salon", { tipo: "uno", id: "m-pedro" })

    expect(llamadas.map((llamada) => JSON.parse(String(llamada.init?.body)))).toEqual([
      { fecha: "2030-01-08", hora: "09:00" },
      { fecha: "2030-01-08", hora: "09:00", profesionalId: null },
      { fecha: "2030-01-08", hora: "09:00", profesionalId: "m-pedro" },
    ])
  })
})
