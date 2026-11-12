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

const servicio = (id: string, name: string, esUrgencia?: boolean) => ({
  id,
  name,
  description: null,
  duration: 30,
  price: 10000,
  ...(esUrgencia === undefined ? {} : { esUrgencia }),
})
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
  extra: { equipo?: ReturnType<typeof persona>[]; clinicaDental?: boolean; servicios?: ReturnType<typeof servicio>[] } = {}
): Promise<string> {
  consulta = parametros
  const { FormularioReserva } = await import("./formulario-reserva")
  return renderToString(
    createElement(FormularioReserva, {
      slug: "salon-uno",
      nombreNegocio: "Salón Uno",
      clinicaDental: extra.clinicaDental,
      zona: "America/Santiago",
      servicios: extra.servicios ?? SERVICIOS,
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

  it("?profesional= vacío, o de puros espacios, es como no ponerlo: 'cualquiera' marcado y todos los servicios", async () => {
    for (const parametros of ["profesional=", "profesional=%20%20", "profesional=&servicio=", "profesional=%09"]) {
      const html = await primeraPintura(parametros)

      expect(estaElegido(html, "Cualquiera disponible")).toBe(true)
      expect(estaElegido(html, "Carla Soto")).toBe(false)
      expect(estaElegido(html, "Pedro Rojas")).toBe(false)
      expect(html).toContain("Arreglo de barba")
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

describe("FormularioReserva: el aviso de urgencia de la clínica dental", () => {
  const AVISO = "¿Tienes dolor fuerte?"
  const MOTIVOS = [servicio("s-limpieza", "Limpieza", false), servicio("s-control", "Control", false), servicio("s-urgencia", "Urgencia dental", true)]
  const SIN_URGENCIAS = persona("m-bea", "Bea Díaz", ["s-limpieza", "s-control"])
  const CON_URGENCIAS = persona("m-ana", "Ana Ruiz", ["s-limpieza", "s-urgencia"])
  const HACE_TODO = persona("m-caro", "Caro Mena", null)
  const clinica = { clinicaDental: true, servicios: MOTIVOS, equipo: [SIN_URGENCIAS, CON_URGENCIAS, HACE_TODO] }

  beforeEach(() => {
    consulta = ""
  })

  it("sin odontólogo elegido ('cualquiera') avisa, nombrando el motivo de urgencia", async () => {
    const html = await primeraPintura("", clinica)

    expect(html).toContain(AVISO)
    expect(html).toContain("Urgencia dental")
  })

  it("con un odontólogo que no hace urgencias el motivo no está en la lista y el aviso tampoco (paso 1)", async () => {
    const html = await primeraPintura("profesional=m-bea", clinica)

    expect(estaElegido(html, "Bea Díaz")).toBe(true)
    expect(html).not.toContain("Urgencia dental")
    expect(html).not.toContain(AVISO)
  })

  it("con un odontólogo que sí las hace, o que hace todo, sigue avisando", async () => {
    for (const id of ["m-ana", "m-caro"]) {
      const html = await primeraPintura(`profesional=${id}`, clinica)

      expect(html).toContain(AVISO)
    }
  })

  it("lo mismo en el paso 2: con quien no hace urgencias no avisa; sin elegir a nadie, sí", async () => {
    const conBea = await primeraPintura("servicio=s-limpieza&profesional=m-bea", clinica)
    const conCualquiera = await primeraPintura("servicio=s-limpieza", clinica)

    expect(conBea).toContain("¿Cuándo quieres venir?")
    expect(conBea).not.toContain(AVISO)
    expect(conCualquiera).toContain("¿Cuándo quieres venir?")
    expect(conCualquiera).toContain(AVISO)
  })

  it("fuera de una clínica dental no hay aviso, aunque un servicio venga marcado", async () => {
    const html = await primeraPintura("", { servicios: MOTIVOS, equipo: [CON_URGENCIAS] })

    expect(html).not.toContain(AVISO)
  })
})
