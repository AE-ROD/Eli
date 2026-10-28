import { describe, it, expect } from "vitest"
import { celdaSegura, decodificarCsv, detectarSeparador, escribirCsv, leerCsv } from "./csv"

const utf8 = (texto: string) => new TextEncoder().encode(texto)

describe("decodificarCsv", () => {
  it("lee UTF-8 y le quita el BOM", () => {
    expect(decodificarCsv(utf8("\uFEFFNombre;Teléfono\nMuñoz;9"))).toBe("Nombre;Teléfono\nMuñoz;9")
  })

  it("lee UTF-8 sin BOM", () => {
    expect(decodificarCsv(utf8("Nombre\nÁngela"))).toBe("Nombre\nÁngela")
  })

  it("si no es UTF-8 válido lo lee como Windows-1252 (el CSV de Excel en español)", () => {
    // "Muñoz" en Windows-1252: la ñ es el byte 0xF1, que solo no es UTF-8.
    const bytes = new Uint8Array([0x4d, 0x75, 0xf1, 0x6f, 0x7a])
    expect(decodificarCsv(bytes)).toBe("Muñoz")
  })
})

describe("detectarSeparador", () => {
  it.each([
    ["Nombre;Teléfono;Email\na;b;c", ";"],
    ["Nombre,Teléfono,Email\na,b,c", ","],
    ["Nombre\tTeléfono\tEmail\na\tb\tc", "\t"],
    ["Nombre\nAna", ","],
    // La coma entre comillas no cuenta: el separador es `;`.
    ['"Pérez, Ana";Teléfono\nx;y', ";"],
    // Sólo mira la cabecera: las comas de las filas no deciden.
    ["Nombre;Notas\nAna;uno, dos, tres, cuatro", ";"],
  ])("%j → %j", (texto, esperado) => {
    expect(detectarSeparador(texto)).toBe(esperado)
  })
})

describe("leerCsv", () => {
  it("lee celdas simples con el separador detectado", () => {
    expect(leerCsv("a;b;c\n1;2;3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ])
  })

  it("respeta comillas: separador, salto de línea y comillas dobles adentro", () => {
    const texto = 'Nombre,Notas\n"Pérez, Ana","Dijo ""hola""\ny se fue"\n'
    expect(leerCsv(texto)).toEqual([
      ["Nombre", "Notas"],
      ["Pérez, Ana", 'Dijo "hola"\ny se fue'],
    ])
  })

  it("acepta saltos de línea de Windows y no inventa una fila al final", () => {
    expect(leerCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  it("celdas vacías quedan vacías, también la última", () => {
    expect(leerCsv("a;b;c\n;;\n1;;")).toEqual([
      ["a", "b", "c"],
      ["", "", ""],
      ["1", "", ""],
    ])
  })

  it("le quita el BOM si viene", () => {
    expect(leerCsv("\uFEFFNombre;Email\nAna;a@b.cl")[0]).toEqual(["Nombre", "Email"])
  })

  it("un archivo vacío no tiene filas", () => {
    expect(leerCsv("")).toEqual([])
  })

  it("una comilla sin cerrar se lee hasta el final, sin lanzar", () => {
    expect(leerCsv('a;b\n"abierta;x\ny')).toEqual([
      ["a", "b"],
      ["abierta;x\ny"],
    ])
  })
})

describe("celdaSegura", () => {
  it.each([
    ["=HYPERLINK(\"http://x\")", "'=HYPERLINK(\"http://x\")"],
    ["+56912345678", "'+56912345678"],
    ["-2+3", "'-2+3"],
    ["@SUMA(A1)", "'@SUMA(A1)"],
    ["\t=1", "'\t=1"],
    ["Ana", "Ana"],
    ["", ""],
  ])("%j → %j", (valor, esperado) => {
    expect(celdaSegura(valor)).toBe(esperado)
  })

  it("los números no se tocan, ni siquiera los negativos", () => {
    expect(celdaSegura(-1500)).toBe("-1500")
    expect(celdaSegura(0)).toBe("0")
  })

  it("null y undefined son una celda vacía", () => {
    expect(celdaSegura(null)).toBe("")
    expect(celdaSegura(undefined)).toBe("")
  })
})

describe("escribirCsv", () => {
  it("empieza con BOM, separa con ; y termina cada fila con \\r\\n", () => {
    expect(escribirCsv([["Nombre", "Visitas"], ["Ana", 3]])).toBe("\uFEFFNombre;Visitas\r\nAna;3\r\n")
  })

  it("pone entre comillas lo que lleva ;, comillas o saltos de línea", () => {
    expect(escribirCsv([["a;b", 'dijo "sí"', "uno\ndos"]])).toBe('\uFEFF"a;b";"dijo ""sí""";"uno\ndos"\r\n')
  })

  it("protege las fórmulas antes de escapar", () => {
    expect(escribirCsv([['=1;"2"']])).toBe('\uFEFF"\'=1;""2"""\r\n')
  })

  it("lo que escribe se vuelve a leer igual (salvo la protección de fórmulas)", () => {
    const filas = [
      ["Nombre", "Notas", "Teléfono"],
      ["Pérez; Ana", 'Le dicen "Anita"\nviene los martes', "9 1234 5678"],
    ]
    expect(leerCsv(escribirCsv(filas))).toEqual(filas)
  })
})
