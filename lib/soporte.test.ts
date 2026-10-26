import { describe, it, expect } from "vitest"
import { correosDeSolicitud, esquemaDeContacto, esquemaDeSolicitud, formatearNumeroDeCaso } from "./soporte"

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
