import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RUBRO_DENTAL } from "@/lib/rubros"

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

const TODA_LA_SEMANA = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "09:00", endTime: "18:00" }))

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
  extra: {
    equipo?: ReturnType<typeof persona>[]
    rubro?: string | null
    servicios?: ReturnType<typeof servicio>[]
    horarios?: { dayOfWeek: number; startTime: string; endTime: string }[]
  } = {}
): Promise<string> {
  consulta = parametros
  const { FormularioReserva } = await import("./formulario-reserva")
  return renderToString(
    createElement(FormularioReserva, {
      slug: "salon-uno",
      nombreNegocio: "Salón Uno",
      rubro: extra.rubro,
      zona: "America/Santiago",
      servicios: extra.servicios ?? SERVICIOS,
      equipo: extra.equipo ?? [CARLA, PEDRO, ZOE],
      horarios: extra.horarios ?? [],
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
    const html = await primeraPintura("profesional=m-carla", { rubro: RUBRO_DENTAL })

    expect(html).toContain("¿Cuál es el motivo de tu consulta?")
    expect(html).toContain("Con cualquier odontólogo")
    expect(html).toContain("hasta 4 motivos")
    expect(estaElegido(html, "Carla Soto")).toBe(true)
  })
})

describe("FormularioReserva: la primera pintura habla con las palabras del rubro", () => {
  beforeEach(() => {
    consulta = ""
  })

  /** El texto visible: sin etiquetas, para buscar frases enteras (React parte el texto con comentarios). */
  const texto = (html: string) =>
    html
      .replace(/<!-- -->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")

  it("sin rubro (o con uno desconocido) es la reserva de siempre", async () => {
    for (const rubro of [undefined, null, "salud", "otro"]) {
      const visible = texto(await primeraPintura("", { rubro }))

      expect(visible).toContain("Reserva tu hora")
      expect(visible).toContain("Elige el servicio, el día y la hora, y deja tus datos.")
      expect(visible).toContain("¿Qué servicio necesitas?")
      expect(visible).toContain("Puedes elegir hasta 4: te los hace la misma persona, uno después del otro.")
      expect(visible).toContain("Cualquiera disponible")
    }
  })

  it("un salón: la misma estilista", async () => {
    const visible = texto(await primeraPintura("", { rubro: "salon" }))

    expect(visible).toContain("Reserva tu hora")
    expect(visible).toContain("¿Qué servicio necesitas?")
    expect(visible).toContain("Puedes elegir hasta 4: te los hace la misma estilista, uno después del otro.")
    expect(visible).not.toContain("la misma persona")
  })

  it("una barbería: el mismo barbero, con su artículo", async () => {
    const visible = texto(await primeraPintura("", { rubro: "barberia" }))

    expect(visible).toContain("te los hace el mismo barbero, uno después del otro")
  })

  it("un salón de uñas: la misma manicurista", async () => {
    const visible = texto(await primeraPintura("", { rubro: "spa-de-unas" }))

    expect(visible).toContain("te los hace la misma manicurista, uno después del otro")
  })

  it("una clínica dental: el motivo, el mismo odontólogo y una sola hora", async () => {
    const visible = texto(await primeraPintura("", { rubro: RUBRO_DENTAL }))

    expect(visible).toContain("Elige el motivo, el día y la hora, y deja tus datos.")
    expect(visible).toContain("¿Cuál es el motivo de tu consulta?")
    expect(visible).toContain("Puedes elegir hasta 4 motivos: te atiende el mismo odontólogo, en una sola hora.")
    expect(visible).toContain("Motivo")
  })

  it("el paso 2 de la clínica pregunta por la primera consulta, no por la primera vez", async () => {
    const visible = texto(await primeraPintura("servicio=s-corte", { rubro: RUBRO_DENTAL, horarios: TODA_LA_SEMANA }))

    expect(visible).toContain("¿Es tu primera consulta en la clínica?")
    expect(visible).toContain("Sí, es la primera")
    expect(visible).toContain("En la primera consulta sumamos 15 minutos para abrir tu ficha.")
    expect(visible).toContain("Responde si es tu primera consulta para ver las horas libres.")
    expect(visible).not.toContain("primera vez")
  })

  it("el paso 2 de un salón no pregunta por la primera vez", async () => {
    const visible = texto(await primeraPintura("servicio=s-corte", { rubro: "salon", horarios: TODA_LA_SEMANA }))

    expect(visible).toContain("¿Cuándo quieres venir?")
    expect(visible).not.toContain("primera")
  })

  it("sin días con atención: 'este servicio' y 'escríbele al negocio', o 'este motivo' y 'a la clínica'", async () => {
    const deSiempre = texto(await primeraPintura("servicio=s-corte", { rubro: null }))
    const salon = texto(await primeraPintura("servicio=s-corte", { rubro: "salon" }))
    const clinica = texto(await primeraPintura("servicio=s-corte", { rubro: RUBRO_DENTAL }))

    expect(deSiempre).toContain("No hay días con atención para este servicio.")
    expect(deSiempre).toContain("o escríbele al negocio.")
    expect(deSiempre).toContain("Cambiar el servicio")
    expect(salon).toContain("No hay días con atención para este servicio.")
    expect(salon).toContain("o escríbele al salón.")
    expect(clinica).toContain("No hay días con atención para este motivo.")
    expect(clinica).toContain("o escríbele a la clínica.")
    expect(clinica).toContain("Cambiar el motivo")
  })
})

describe("FormularioReserva: el aviso de urgencia de la clínica dental", () => {
  const AVISO = "¿Tienes dolor fuerte?"
  const MOTIVOS = [servicio("s-limpieza", "Limpieza", false), servicio("s-control", "Control", false), servicio("s-urgencia", "Urgencia dental", true)]
  const SIN_URGENCIAS = persona("m-bea", "Bea Díaz", ["s-limpieza", "s-control"])
  const CON_URGENCIAS = persona("m-ana", "Ana Ruiz", ["s-limpieza", "s-urgencia"])
  const HACE_TODO = persona("m-caro", "Caro Mena", null)
  const clinica = { rubro: RUBRO_DENTAL, servicios: MOTIVOS, equipo: [SIN_URGENCIAS, CON_URGENCIAS, HACE_TODO] }

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
