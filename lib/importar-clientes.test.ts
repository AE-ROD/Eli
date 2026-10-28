import { describe, it, expect } from "vitest"
import { aceptaWhatsapp, descartarExistentes, normalizarCabecera, prepararFilas, sugerirMapeo, type Mapeo } from "./importar-clientes"

describe("normalizarCabecera", () => {
  it.each([
    ["  Teléfono ", "telefono"],
    ["E-mail", "e mail"],
    ["CORREO ELECTRÓNICO", "correo electronico"],
    ["Nombre_Cliente", "nombre cliente"],
  ])("%j → %j", (cabecera, esperado) => {
    expect(normalizarCabecera(cabecera)).toBe(esperado)
  })
})

describe("sugerirMapeo", () => {
  it("reconoce las cabeceras de un export típico (AgendaPro): nombre y apellido por separado", () => {
    expect(sugerirMapeo(["Nombre", "Apellido", "Email", "Teléfono", "Fecha de creación", "Notas"])).toEqual({
      nombre: 0,
      apellido: 1,
      email: 2,
      telefono: 3,
      notas: 5,
    })
  })

  it("prefiere el celular al teléfono fijo", () => {
    expect(sugerirMapeo(["Nombre", "Teléfono", "Celular"])).toMatchObject({ telefono: 2 })
  })

  it("reconoce variantes: mayúsculas, tildes y sinónimos", () => {
    expect(sugerirMapeo(["CLIENTE", "Correo electrónico", "Móvil", "Observaciones", "Acepta WhatsApp"])).toEqual({
      nombre: 0,
      email: 1,
      telefono: 2,
      notas: 3,
      whatsapp: 4,
    })
  })

  it("una columna \"WhatsApp\" a secas es el teléfono, no el consentimiento", () => {
    expect(sugerirMapeo(["Nombre", "WhatsApp"])).toEqual({ nombre: 0, telefono: 1 })
  })

  it("sin una columna que parezca el nombre no sugiere nada", () => {
    expect(sugerirMapeo(["Columna 1", "Email"])).toBeNull()
  })
})

describe("aceptaWhatsapp", () => {
  it.each(["Sí", "si", "SI", "x", "1", "true", "Yes"])("%j es sí", (valor) => {
    expect(aceptaWhatsapp(valor)).toBe(true)
  })

  it.each(["No", "", "0", "false", "quizás"])("%j no es sí", (valor) => {
    expect(aceptaWhatsapp(valor)).toBe(false)
  })
})

const MAPEO: Mapeo = { nombre: 0, apellido: 1, telefono: 2, email: 3, notas: 4 }
const CABECERA = ["Nombre", "Apellido", "Teléfono", "Email", "Notas"]

describe("prepararFilas", () => {
  it("junta nombre y apellido, normaliza el teléfono y numera como la planilla (la cabecera es la fila 1)", () => {
    const { candidatos, errores, duplicados } = prepararFilas(
      [CABECERA, [" Ana ", "Pérez", "9 1234 5678", "ana@correo.cl", "Viene los martes"]],
      MAPEO
    )

    expect(errores).toEqual([])
    expect(duplicados).toEqual([])
    expect(candidatos).toEqual([
      { fila: 2, name: "Ana Pérez", phone: "+56912345678", email: "ana@correo.cl", notes: "Viene los martes", aceptaWhatsapp: false },
    ])
  })

  it("sin apellido, el nombre queda solo; lo vacío queda en null", () => {
    const { candidatos } = prepararFilas([CABECERA, ["Beto", "", "", "", ""]], MAPEO)
    expect(candidatos[0]).toMatchObject({ name: "Beto", phone: null, email: null, notes: null })
  })

  it("las filas con error dicen su número y el motivo, y no frenan las demás", () => {
    const { candidatos, errores } = prepararFilas(
      [
        CABECERA,
        ["", "", "912345678", "", ""],
        ["Carla", "", "12345", "", ""],
        ["Dani", "", "", "no-es-correo", ""],
        ["Eva", "", "", "", ""],
      ],
      MAPEO
    )

    expect(errores).toEqual([
      { fila: 2, motivo: "El nombre tiene que tener al menos 2 caracteres" },
      { fila: 3, motivo: expect.stringMatching(/No pudimos leer el teléfono/) },
      { fila: 4, motivo: "El email no es válido" },
    ])
    expect(candidatos.map((c) => c.fila)).toEqual([5])
  })

  it("las filas vacías se saltan sin contarlas", () => {
    const resultado = prepararFilas([CABECERA, ["", "", "", "", ""], ["Ana", "", "", "", ""], ["  "]], MAPEO)
    expect(resultado.candidatos).toHaveLength(1)
    expect(resultado.errores).toEqual([])
  })

  it("descarta las repetidas dentro del archivo por teléfono (escrito distinto) o por correo (sin mayúsculas)", () => {
    const { candidatos, duplicados } = prepararFilas(
      [
        CABECERA,
        ["Ana", "", "+56 9 1234 5678", "ana@correo.cl", ""],
        ["Ana bis", "", "912345678", "", ""],
        ["Ana tris", "", "", "ANA@correo.cl", ""],
        ["Sin contacto", "", "", "", ""],
        ["Sin contacto", "", "", "", ""],
      ],
      MAPEO
    )

    expect(candidatos.map((c) => c.fila)).toEqual([2, 5, 6])
    expect(duplicados).toEqual([
      { fila: 3, motivo: "Repite el teléfono o el correo de la fila 2" },
      { fila: 4, motivo: "Repite el teléfono o el correo de la fila 2" },
    ])
  })

  it("sin columna de consentimiento nadie queda con consentimiento; con ella, sólo los que dicen sí", () => {
    const filas = [
      ["Nombre", "WhatsApp autorizado"],
      ["Ana", "Sí"],
      ["Beto", "No"],
    ]
    expect(prepararFilas(filas, { nombre: 0 }).candidatos.map((c) => c.aceptaWhatsapp)).toEqual([false, false])
    expect(prepararFilas(filas, { nombre: 0, whatsapp: 1 }).candidatos.map((c) => c.aceptaWhatsapp)).toEqual([true, false])
  })

  it("lee lo que exportó Eli: el teléfono con la comilla que lo protege de las fórmulas", () => {
    const { candidatos } = prepararFilas([["Nombre", "Teléfono"], ["Ana", "'+56912345678"]], { nombre: 0, telefono: 1 })
    expect(candidatos[0].phone).toBe("+56912345678")
  })

  it("una columna mapeada que la fila no trae se lee vacía", () => {
    const { candidatos } = prepararFilas([CABECERA, ["Ana"]], MAPEO)
    expect(candidatos[0]).toMatchObject({ name: "Ana", phone: null })
  })
})

describe("descartarExistentes", () => {
  const candidato = (fila: number, phone: string | null, email: string | null) => ({
    fila,
    name: `Cliente ${fila}`,
    phone,
    email,
    notes: null,
    aceptaWhatsapp: false,
  })

  it("descarta por teléfono (también contra los guardados sin normalizar) y por correo sin mayúsculas", () => {
    const { nuevos, duplicados } = descartarExistentes(
      [candidato(2, "+56912345678", null), candidato(3, null, "Ana@Correo.cl"), candidato(4, "+56987654321", "otro@correo.cl")],
      [
        { phone: "9 1234 5678", email: null },
        { phone: null, email: "ana@correo.cl" },
      ]
    )

    expect(nuevos.map((c) => c.fila)).toEqual([4])
    expect(duplicados).toEqual([
      { fila: 2, motivo: "Ya existe un cliente con ese teléfono" },
      { fila: 3, motivo: "Ya existe un cliente con ese correo" },
    ])
  })

  it("los clientes sin teléfono ni correo no descartan a nadie", () => {
    const { nuevos } = descartarExistentes([candidato(2, null, null)], [{ phone: null, email: null }])
    expect(nuevos).toHaveLength(1)
  })
})
