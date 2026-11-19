import { describe, expect, it } from "vitest"
import { leerCsv } from "@/lib/csv"
import { prepararFilas, sugerirMapeo } from "@/lib/importar-clientes"
import { contactosACsv, contactosDelSelector, leerListaEscrita } from "./contactos"

describe("contactosACsv", () => {
  it("arma el CSV con la cabecera que la importación reconoce sola", () => {
    const { csv, contactos, sinNombre } = contactosACsv([{ nombre: "Camila Rojas", telefono: "+56 9 1234 5678", correo: "" }])
    const filas = leerCsv(csv)
    expect(filas).toEqual([
      ["Nombre", "Teléfono", "Correo"],
      ["Camila Rojas", "+56 9 1234 5678", ""],
    ])
    expect(contactos).toBe(1)
    expect(sinNombre).toBe(0)
    expect(sugerirMapeo(filas[0])).toMatchObject({ nombre: 0, telefono: 1, email: 2 })
  })

  it("deja fuera y cuenta los contactos sin nombre", () => {
    const resultado = contactosACsv([
      { nombre: "  ", telefono: "911111111", correo: "" },
      { nombre: "Luis", telefono: "922222222", correo: "" },
    ])
    expect(resultado.contactos).toBe(1)
    expect(resultado.sinNombre).toBe(1)
  })

  it("protege un nombre con punto y coma o comillas", () => {
    const filas = leerCsv(contactosACsv([{ nombre: 'Ana "la del 3"; manicura', telefono: "", correo: "" }]).csv)
    expect(filas[1][0]).toBe('Ana "la del 3"; manicura')
  })

  it("las filas pasan la preparación del servidor", () => {
    const filas = leerCsv(contactosACsv([{ nombre: "Valentina", telefono: "+56 9 1234 5678", correo: "vale@correo.cl" }]).csv)
    const mapeo = sugerirMapeo(filas[0])!
    const { candidatos, errores } = prepararFilas(filas, mapeo)
    expect(errores).toEqual([])
    expect(candidatos[0]).toMatchObject({ name: "Valentina", email: "vale@correo.cl" })
  })
})

describe("contactosDelSelector", () => {
  it("toma el primer nombre, teléfono y correo con algo escrito", () => {
    expect(
      contactosDelSelector([
        { name: ["", "Camila Rojas"], tel: ["+56912345678", "222222222"], email: [] },
        { name: ["Luis"] },
      ])
    ).toEqual([
      { nombre: "Camila Rojas", telefono: "+56912345678", correo: "" },
      { nombre: "Luis", telefono: "", correo: "" },
    ])
  })
})

describe("leerListaEscrita", () => {
  it("nombre y teléfono separados por espacio, coma o tabulación", () => {
    expect(leerListaEscrita("Camila Rojas 9 1234 5678\nAna, +56912345678\nLuis Soto\t+56 9 8765 4321")).toEqual([
      { nombre: "Camila Rojas", telefono: "9 1234 5678", correo: "" },
      { nombre: "Ana", telefono: "+56912345678", correo: "" },
      { nombre: "Luis Soto", telefono: "+56 9 8765 4321", correo: "" },
    ])
  })

  it("el teléfono puede ir antes del nombre, y con correo", () => {
    expect(leerListaEscrita("+56 9 1234 5678 - Valentina - vale@correo.cl")).toEqual([
      { nombre: "Valentina", telefono: "+56 9 1234 5678", correo: "vale@correo.cl" },
    ])
  })

  it("un número corto queda en el nombre, no como teléfono", () => {
    expect(leerListaEscrita("Depto 302 Marta 912345678")[0]).toEqual({ nombre: "Depto 302 Marta", telefono: "912345678", correo: "" })
  })

  it("ignora las líneas vacías y deja sin nombre la que sólo trae número", () => {
    const contactos = leerListaEscrita("\n  \n912345678\nRosa 987654321\r\n")
    expect(contactos).toEqual([
      { nombre: "", telefono: "912345678", correo: "" },
      { nombre: "Rosa", telefono: "987654321", correo: "" },
    ])
    expect(contactosACsv(contactos).sinNombre).toBe(1)
  })
})
