import { describe, expect, it } from "vitest"
import { leerCsv } from "@/lib/csv"
import { prepararFilas, sugerirMapeo } from "@/lib/importar-clientes"
import { vcardACsv } from "./vcard"

const tarjeta = (...lineas: string[]) => ["BEGIN:VCARD", "VERSION:3.0", ...lineas, "END:VCARD"].join("\r\n")

/** El CSV convertido, leído como lo lee la importación. */
const filasDe = (texto: string) => leerCsv(vcardACsv(texto).csv)

describe("vcardACsv", () => {
  it("un contacto con nombre, celular y correo", () => {
    const filas = filasDe(tarjeta("FN:Camila Rojas", "TEL;TYPE=CELL:+56 9 1234 5678", "EMAIL:camila@correo.cl"))
    expect(filas[0]).toEqual(["Nombre", "Teléfono", "Correo"])
    expect(filas[1]).toEqual(["Camila Rojas", "+56 9 1234 5678", "camila@correo.cl"])
  })

  it("con varios teléfonos elige el celular, aunque no sea el primero", () => {
    const texto = tarjeta("FN:Ana", "TEL;TYPE=HOME:223334444", "TEL;TYPE=CELL:912345678")
    expect(filasDe(texto)[1]).toEqual(["Ana", "912345678", ""])
  })

  it("entiende las formas de marcar el celular de cada teléfono", () => {
    for (const etiqueta of ["TEL;CELL", "TEL;type=pref,cell", 'TEL;TYPE="cell"', "TEL;TYPE=IPHONE", "item1.TEL;type=CELL;type=VOICE"]) {
      const texto = tarjeta("FN:Ana", "TEL;TYPE=WORK:222222222", `${etiqueta}:933333333`)
      expect(filasDe(texto)[1][1]).toBe("933333333")
    }
  })

  it("sin FN usa N: nombre y apellido en su orden", () => {
    expect(filasDe(tarjeta("N:Soto;Valentina;;;", "TEL:911111111"))[1]).toEqual(["Valentina Soto", "911111111", ""])
  })

  it("un contacto sin nombre no se importa y se cuenta", () => {
    const resultado = vcardACsv([tarjeta("TEL:911111111"), tarjeta("FN:Luis", "TEL:922222222")].join("\r\n"))
    expect(resultado.contactos).toBe(1)
    expect(resultado.sinNombre).toBe(1)
    expect(leerCsv(resultado.csv)).toHaveLength(2)
  })

  it("un archivo sin contactos da un CSV de sólo la cabecera", () => {
    const resultado = vcardACsv("esto no es una tarjeta")
    expect(resultado.contactos).toBe(0)
    expect(leerCsv(resultado.csv)).toHaveLength(1)
  })

  it("une las líneas continuadas y desescapa comas, punto y coma y saltos", () => {
    const texto = tarjeta("FN:María de los\r\n  Ángeles Pérez\\, hija", "EMAIL:a@b.cl")
    expect(filasDe(texto)[1][0]).toBe("María de los Ángeles Pérez, hija")
  })

  it("lee los acentos de un vCard 2.1 en quoted-printable, también en varias líneas", () => {
    const texto = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9 Pe=\r\n=C3=B1a",
      "TEL;CELL:911111111",
      "END:VCARD",
    ].join("\r\n")
    expect(filasDe(texto)[1][0]).toBe("José Peña")
  })

  it("ignora la foto en base64 y las demás propiedades", () => {
    const texto = tarjeta("FN:Con Foto", "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQ", " ABCDEFG", "ORG:Empresa", "NOTE:algo", "TEL:911111111")
    expect(filasDe(texto)[1]).toEqual(["Con Foto", "911111111", ""])
  })

  it("lee un teléfono escrito como URI tel:", () => {
    expect(filasDe(tarjeta("FN:Uri", "TEL;VALUE=uri:tel:+56912345678"))[1][1]).toBe("+56912345678")
  })

  it("un nombre con el separador o con comillas no corre las columnas", () => {
    expect(filasDe(tarjeta('FN:Pérez; "Pepe"', "TEL:911111111"))[1]).toEqual(['Pérez; "Pepe"', "911111111", ""])
  })

  it("el CSV resultante lo entiende la importación: mapeo sugerido y filas listas", () => {
    const filas = filasDe(tarjeta("FN:Camila Rojas", "TEL;TYPE=CELL:+56912345678", "EMAIL:camila@correo.cl"))
    const mapeo = sugerirMapeo(filas[0])
    expect(mapeo).toEqual({ nombre: 0, telefono: 1, email: 2 })
    const { candidatos, errores } = prepararFilas(filas, mapeo!)
    expect(errores).toEqual([])
    expect(candidatos).toHaveLength(1)
    expect(candidatos[0].name).toBe("Camila Rojas")
    expect(candidatos[0].email).toBe("camila@correo.cl")
  })
})
