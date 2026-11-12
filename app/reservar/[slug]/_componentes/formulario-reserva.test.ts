import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

/*
 * La primera pintura del paso 1, la que llega en el HTML del servidor: con
 * `?profesional=` ya filtra los servicios y marca a quien se eligió, sin
 * esperar a `/profesionales`. Se renderiza a texto (sin navegador): los
 * efectos no corren, así que lo que se ve es exactamente la primera pintura.
 */

let consulta = ""
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(consulta) }))

const servicio = (id: string, name: string) => ({ id, name, description: null, duration: 30, price: 10000 })
const SERVICIOS = [servicio("s-corte", "Corte de pelo"), servicio("s-barba", "Arreglo de barba"), servicio("s-tinte", "Tinte")]

const persona = (id: string, nombre: string, servicioIds: string[] | null, especialidad: string | null = null) => ({
  id,
  nombre,
  especialidad,
  fotoUrl: null,
  servicioIds,
})
const CARLA = persona("m-carla", "Carla Soto", ["s-corte", "s-tinte"], "Colorista")
const PEDRO = persona("m-pedro", "Pedro Rojas", ["s-corte", "s-barba"])
const ZOE = persona("m-zoe", "Zoe Vidal", [])
const NINA = persona("m-nina", "Nina Paz", null)

async function primeraPintura(
  parametros: string,
  extra: { equipo?: ReturnType<typeof persona>[]; clinicaDental?: boolean } = {}
): Promise<string> {
  consulta = parametros
  const { FormularioReserva } = await import("./formulario-reserva")
  return renderToString(
    createElement(FormularioReserva, {
      slug: "salon-uno",
      nombreNegocio: "Salón Uno",
      clinicaDental: extra.clinicaDental,
      zona: "America/Santiago",
      servicios: SERVICIOS,
      equipo: extra.equipo ?? [CARLA, PEDRO, ZOE],
      horarios: [],
      listaDeEsperaActiva: false,
      plazoDeCambios: "Puedes cancelar o cambiar hasta 24 horas antes.",
      plazoDeCambiosHoras: 24,
    })
  )
}

/** El texto de apertura de cada botón (`<button ...>`) y lo que lleva adentro, hasta el siguiente. */
const botones = (html: string) => html.split("<button").slice(1)
const botonDe = (html: string, texto: string) => botones(html).find((boton) => boton.includes(texto))
const estaElegido = (html: string, texto: string) => botonDe(html, texto)?.split(">")[0].includes('aria-pressed="true"') ?? false

describe("FormularioReserva: la primera pintura del paso 1", () => {
  beforeEach(() => {
    consulta = ""
  })

  it("sin profesional en la dirección: todos los servicios y 'cualquiera' elegido", async () => {
    const html = await primeraPintura("")

    for (const nombre of ["Corte de pelo", "Arreglo de barba", "Tinte"]) expect(html).toContain(nombre)
    expect(html).toContain("¿Con quién?")
    expect(estaElegido(html, "Cualquiera disponible")).toBe(true)
    expect(estaElegido(html, "Carla Soto")).toBe(false)
  })

  it("el selector lista al equipo con su especialidad, y no a quien no hace ningún servicio", async () => {
    const html = await primeraPintura("")

    expect(html).toContain("Carla Soto")
    expect(html).toContain("Colorista")
    expect(html).toContain("Pedro Rojas")
    expect(html).not.toContain("Zoe Vidal")
  })

  it("con ?profesional=, ya filtra en la primera pintura: sólo lo que hace, y él marcado", async () => {
    const html = await primeraPintura("profesional=m-carla")

    expect(html).toContain("Corte de pelo")
    expect(html).toContain("Tinte")
    expect(html).not.toContain("Arreglo de barba")
    expect(estaElegido(html, "Carla Soto")).toBe(true)
    expect(estaElegido(html, "Cualquiera disponible")).toBe(false)
    // Ya no es la línea de "Reservando con … Ver todos": el selector es el que lo dice.
    expect(html).not.toContain("Reservando con")
  })

  it("quien hace todos (sin servicios acotados) los muestra todos", async () => {
    const html = await primeraPintura("profesional=m-nina", { equipo: [CARLA, NINA] })

    for (const nombre of ["Corte de pelo", "Arreglo de barba", "Tinte"]) expect(html).toContain(nombre)
    expect(estaElegido(html, "Nina Paz")).toBe(true)
  })

  it("un profesional que no es del equipo, o que no hace ninguno, se ignora: todos los servicios y 'cualquiera'", async () => {
    for (const id of ["m-de-otro-negocio", "m-zoe"]) {
      const html = await primeraPintura(`profesional=${id}`)

      expect(html).toContain("Arreglo de barba")
      expect(estaElegido(html, "Cualquiera disponible")).toBe(true)
    }
  })

  it("sin equipo (atiende el dueño) no hay a quién elegir: no se pregunta", async () => {
    const html = await primeraPintura("profesional=m-carla", { equipo: [] })

    expect(html).not.toContain("¿Con quién?")
    expect(html).toContain("Arreglo de barba")
  })

  it("clínica dental: el motivo y el odontólogo, no las palabras de siempre", async () => {
    const html = await primeraPintura("profesional=m-carla", { clinicaDental: true })

    expect(html).toContain("¿Cuál es el motivo de tu consulta?")
    expect(html).toContain("Con cualquier odontólogo")
    expect(html).toContain("hasta 4 motivos")
    expect(estaElegido(html, "Carla Soto")).toBe(true)
  })
})
