import { describe, it, expect } from "vitest"
import {
  PASOS_DE_INICIO,
  cuantosHechos,
  enlaceDeWhatsApp,
  mensajeParaCompartir,
  mostrarListaDeInicio,
  pasosDeInicioPara,
  pruebaTerminada,
  textosDeLaLista,
  type PasosHechos,
} from "./lista-de-inicio"

const ninguno: PasosHechos = { horario: false, servicios: false, enlace: false, primeraReserva: false }
const todos: PasosHechos = { horario: true, servicios: true, enlace: true, primeraReserva: true }

describe("lista de inicio", () => {
  it("son cuatro pasos, sin repetir", () => {
    expect(PASOS_DE_INICIO.map((paso) => paso.id)).toEqual(["horario", "servicios", "enlace", "primeraReserva"])
  })

  it("con las palabras del rubro: paciente en una clínica dental, cliente en los demás", () => {
    const texto = (rubro: string | null) => pasosDeInicioPara(rubro).find((paso) => paso.id === "primeraReserva")?.texto
    expect(texto("odontologia")).toBe("Cuando un paciente reserve desde tu página, se marca sola.")
    expect(texto("salon")).toBe("Cuando un cliente reserve desde tu página, se marca sola.")
    expect(texto(null)).toBe("Cuando un cliente reserve desde tu página, se marca sola.")
    expect(pasosDeInicioPara("odontologia").map((paso) => paso.id)).toEqual(PASOS_DE_INICIO.map((paso) => paso.id))
  })

  it("sin rubro, o con uno sin palabras propias, los pasos son exactamente los de siempre", () => {
    for (const rubro of [null, undefined, "", "otro", "salud", "fitness"]) {
      expect(pasosDeInicioPara(rubro)).toEqual(PASOS_DE_INICIO)
    }
  })

  it("el paso de los servicios dice \"prestaciones\" en una clínica dental; los demás rubros, \"servicios\"", () => {
    const paso = (rubro: string | null) => pasosDeInicioPara(rubro).find((p) => p.id === "servicios")
    expect(paso("odontologia")?.titulo).toBe("Agrega tus prestaciones")
    expect(paso("odontologia")?.accion).toEqual({ texto: "Agregar prestaciones", href: "/dashboard/configuracion#servicios" })
    for (const rubro of ["salon", "barberia", "spa-de-unas", null]) {
      expect(paso(rubro)?.titulo).toBe("Agrega tus servicios")
      expect(paso(rubro)?.accion.texto).toBe("Agregar servicios")
    }
  })

  it("lo que no nombra a nadie no cambia con el rubro", () => {
    for (const id of ["horario", "enlace"] as const) {
      const base = PASOS_DE_INICIO.find((p) => p.id === id)
      for (const rubro of ["salon", "barberia", "spa-de-unas", "odontologia"]) {
        expect(pasosDeInicioPara(rubro).find((p) => p.id === id)).toEqual(base)
      }
    }
  })

  it("el título y el subtítulo de la tarjeta usan el negocio y el cliente del rubro, concordados", () => {
    expect(textosDeLaLista(null)).toEqual({
      titulo: "Deja tu negocio listo",
      subtitulo: "Cuatro pasos para que tus clientes empiecen a reservar solos.",
    })
    expect(textosDeLaLista("otro")).toEqual(textosDeLaLista(null))
    expect(textosDeLaLista("salon").titulo).toBe("Deja tu salón listo")
    expect(textosDeLaLista("barberia").titulo).toBe("Deja tu barbería lista")
    expect(textosDeLaLista("spa-de-unas").titulo).toBe("Deja tu salón de uñas listo")
    expect(textosDeLaLista("odontologia")).toEqual({
      titulo: "Deja tu clínica lista",
      subtitulo: "Cuatro pasos para que tus pacientes empiecen a reservar solos.",
    })
  })

  it("cuenta los pasos hechos", () => {
    expect(cuantosHechos(ninguno)).toBe(0)
    expect(cuantosHechos({ ...ninguno, horario: true, enlace: true })).toBe(2)
    expect(cuantosHechos(todos)).toBe(4)
  })

  it("se muestra mientras falte algo y la prueba siga", () => {
    expect(mostrarListaDeInicio({ pasos: ninguno, pruebaTerminada: false })).toBe(true)
    expect(mostrarListaDeInicio({ pasos: { ...todos, primeraReserva: false }, pruebaTerminada: false })).toBe(true)
  })

  it("se oculta con los cuatro hechos o con la prueba terminada", () => {
    expect(mostrarListaDeInicio({ pasos: todos, pruebaTerminada: false })).toBe(false)
    expect(mostrarListaDeInicio({ pasos: ninguno, pruebaTerminada: true })).toBe(false)
  })

  it("la prueba termina justo en su fin", () => {
    const fin = new Date("2026-10-22T12:00:00.000Z")
    expect(pruebaTerminada(fin, new Date("2026-10-22T11:59:59.999Z"))).toBe(false)
    expect(pruebaTerminada(fin, fin)).toBe(true)
  })
})

describe("compartir el enlace de reservas", () => {
  const enlace = "https://eli.cl/reservar/mi-salon"

  it("el mensaje lleva el enlace y la palabra que lee quien reserva", () => {
    expect(mensajeParaCompartir("salon", enlace)).toBe(
      `¡Hola! Ya puedes reservar tu hora en línea, cuando quieras: ${enlace}`
    )
    expect(mensajeParaCompartir("odontologia", enlace)).toContain("reservar tu hora")
    expect(mensajeParaCompartir(null, enlace)).toContain("reservar tu cita")
  })

  it("WhatsApp recibe el mensaje entero codificado, sin número de destino", () => {
    const mensaje = mensajeParaCompartir("salon", enlace)
    const url = enlaceDeWhatsApp(mensaje)
    expect(url.startsWith("https://wa.me/?text=")).toBe(true)
    expect(url).not.toContain(" ")
    expect(decodeURIComponent(url.slice("https://wa.me/?text=".length))).toBe(mensaje)
  })

  it("el paso de la lista invita a compartir y lleva a la tarjeta del enlace", () => {
    const paso = PASOS_DE_INICIO.find((p) => p.id === "enlace")
    expect(paso?.accion).toEqual({ texto: "Compartir enlace", href: "#enlace-de-reservas" })
    expect(paso?.texto).toMatch(/WhatsApp/)
  })
})
