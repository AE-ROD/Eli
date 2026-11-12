import { describe, it, expect } from "vitest"
import {
  AREAS,
  areasDelRubro,
  correosDeSolicitud,
  ejemploDeAsuntoDeFalla,
  esquemaDeContacto,
  esquemaDeSolicitud,
  etiquetaDeArea,
  etiquetaDeAreaDelRubro,
  formatearNumeroDeCaso,
} from "./soporte"
import { vocabularioDe } from "./vocabulario"

describe("formatearNumeroDeCaso", () => {
  it.each([
    [1, "#000001"],
    [123, "#000123"],
    [999999, "#999999"],
    [1234567, "#1234567"],
  ])("%i → %s", (numero, esperado) => {
    expect(formatearNumeroDeCaso(numero)).toBe(esperado)
  })
})

describe("esquemaDeSolicitud", () => {
  const valida = { tipo: "consulta", area: "cuenta-y-plan", asunto: "  Cambiar de plan ", descripcion: "¿Cómo paso al plan Equipo?" }

  it("acepta una solicitud válida y recorta espacios", () => {
    const resultado = esquemaDeSolicitud.parse(valida)
    expect(resultado.asunto).toBe("Cambiar de plan")
    expect(resultado.dondeOcurrio).toBeNull()
  })

  it("descarta campos que no son suyos (businessId, userId)", () => {
    const resultado = esquemaDeSolicitud.parse({ ...valida, businessId: "x", userId: "y" })
    expect(resultado).not.toHaveProperty("businessId")
    expect(resultado).not.toHaveProperty("userId")
  })

  it("exige asunto y descripción", () => {
    expect(esquemaDeSolicitud.safeParse({ tipo: "falla", area: "otro" }).success).toBe(false)
  })

  it("con todo vacío informa cada campo a la vez, pidiendo el dato con las palabras del camino", () => {
    const resultado = esquemaDeSolicitud.safeParse({ tipo: "reclamo", asunto: "", descripcion: "" })
    expect(resultado.success).toBe(false)
    const primeros = new Map<string, string>()
    for (const issue of resultado.error!.issues) {
      const campo = String(issue.path[0])
      if (!primeros.has(campo)) primeros.set(campo, issue.message)
    }
    expect(Object.fromEntries(primeros)).toEqual({
      area: "Elige un área",
      asunto: "Cuéntanos en pocas palabras de qué se trata",
      descripcion: "Cuéntanos qué pasó",
    })
  })
})

describe("esquemaDeContacto", () => {
  it.each([
    [{ nombre: "", email: "ana@ejemplo.com" }, "Escribe tu nombre"],
    [{ nombre: "Ana", email: "" }, "Escribe tu correo"],
    [{ nombre: "Ana", email: "ana" }, "Escribe un correo válido"],
  ])("%o → %s", (datos, mensaje) => {
    const resultado = esquemaDeContacto.safeParse(datos)
    expect(resultado.success).toBe(false)
    expect(resultado.error!.issues[0].message).toBe(mensaje)
  })
})

describe("correosDeSolicitud", () => {
  const solicitud = {
    numero: 42,
    tipo: "reclamo",
    area: "reservas",
    asunto: "Asunto",
    descripcion: "Descripción larga",
    dondeOcurrio: null,
    nombre: "Ana",
    email: "ana@ejemplo.com",
    userId: null,
    createdAt: new Date("2026-10-26T12:00:00Z"),
  }

  it("sin casilla de soporte no arma el aviso, pero sí el acuse", () => {
    const { aSoporte, acuse } = correosDeSolicitud(solicitud, null, null)
    expect(aSoporte).toBeNull()
    expect(acuse).toMatchObject({ para: "ana@ejemplo.com", responderA: null, numero: "#000042" })
  })

  it("el aviso lleva etiquetas en español y todos los datos", () => {
    const { aSoporte } = correosDeSolicitud(solicitud, { id: "n1", nombre: "Peluquería" }, "soporte@eli.test")
    expect(aSoporte).toMatchObject({ tipo: "Reclamo", area: "Reservas en línea", responderA: "ana@ejemplo.com" })
    expect(aSoporte?.detalle).toContainEqual(["Negocio", "Peluquería (n1)"])
    expect(aSoporte?.detalle).toContainEqual(["Descripción", "Descripción larga"])
  })
})

describe("las áreas con las palabras del rubro", () => {
  const palabrasDe = (rubro: string | null) => vocabularioDe(rubro).palabras

  it("sin rubro, el nombre de siempre", () => {
    expect(areasDelRubro(palabrasDe(null))).toEqual(AREAS.map((area) => ({ valor: area.valor, etiqueta: area.etiqueta })))
    expect(etiquetaDeAreaDelRubro("tablero", palabrasDe(null))).toBe("Tablero del día")
    expect(etiquetaDeAreaDelRubro("clientes", palabrasDe(null))).toBe("Clientes")
  })

  it("el salón, la barbería y el salón de uñas siguen diciendo Tablero del día y Clientes", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "salud", "fitness", "otro"]) {
      expect(areasDelRubro(palabrasDe(rubro)), rubro).toEqual(areasDelRubro(palabrasDe(null)))
    }
  })

  it("la clínica dental: Sala de espera y Pacientes; el resto, igual", () => {
    const etiquetas = Object.fromEntries(areasDelRubro(palabrasDe("odontologia")).map((area) => [area.valor, area.etiqueta]))
    expect(etiquetas).toEqual({
      agenda: "Agenda",
      reservas: "Reservas en línea",
      tablero: "Sala de espera",
      clientes: "Pacientes",
      reportes: "Reportes",
      equipo: "Equipo",
      "cuenta-y-plan": "Cuenta y plan",
      otro: "Otro",
    })
  })

  it("tiene las mismas áreas, en el mismo orden, que las de siempre", () => {
    expect(areasDelRubro(palabrasDe("odontologia")).map((area) => area.valor)).toEqual(AREAS.map((area) => area.valor))
  })

  it("los correos a soporte siguen con el nombre fijo del área, sea cual sea el rubro", () => {
    expect(etiquetaDeArea("tablero")).toBe("Tablero del día")
    expect(etiquetaDeArea("clientes")).toBe("Clientes")
  })

  it("el ejemplo del asunto de una falla nombra el servicio del rubro, con su género", () => {
    expect(ejemploDeAsuntoDeFalla(palabrasDe(null))).toBe("Ej.: No se guarda un servicio nuevo")
    expect(ejemploDeAsuntoDeFalla(palabrasDe("salon"))).toBe("Ej.: No se guarda un servicio nuevo")
    expect(ejemploDeAsuntoDeFalla(palabrasDe("odontologia"))).toBe("Ej.: No se guarda una prestación nueva")
  })
})
