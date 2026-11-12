import { describe, expect, it } from "vitest"
import {
  ALTO_DE_FILA,
  ALTO_MINIMO,
  SEPARACION,
  SIN_ODONTOLOGO,
  SIN_SILLON,
  altoDeLaGrilla,
  citasPorColumna,
  columnasDeLaGrilla,
  columnasDelBloqueo,
  columnasPorOdontologo,
  columnasPorSillon,
  filasDeLaGrilla,
  horaDelMinuto,
  lineaDeAhora,
  lugaresEnLaColumna,
  posicionDelBloque,
} from "./_grilla-del-dia"

const SILLONES = [
  { id: "s2", nombre: "Sillón 2", orden: 1, activo: true },
  { id: "s1", nombre: "Sillón 1", orden: 0, activo: true },
  { id: "s3", nombre: "Sillón 3", orden: 2, activo: false },
]

const EQUIPO = [
  { id: "m1", nombre: "Matías Pérez" },
  { id: "m2", nombre: "Valentina Soto" },
]

describe("las filas de la grilla", () => {
  it("van de 15 en 15 minutos, con el rótulo sólo en la hora y la media hora", () => {
    const filas = filasDeLaGrilla(9, 10)
    expect(filas.map((fila) => fila.minuto)).toEqual([540, 555, 570, 585])
    expect(filas.map((fila) => fila.rotulo)).toEqual(["09:00", null, "09:30", null])
  })

  it("una grilla de 8 a 20 tiene 48 filas y mide 48 filas de alto", () => {
    expect(filasDeLaGrilla(8, 20)).toHaveLength(48)
    expect(altoDeLaGrilla(8, 20)).toBe(48 * ALTO_DE_FILA)
  })

  it("sin horas, sin filas", () => {
    expect(filasDeLaGrilla(10, 10)).toEqual([])
    expect(altoDeLaGrilla(10, 9)).toBe(0)
  })

  it("escribe la hora con dos cifras", () => {
    expect(horaDelMinuto(0)).toBe("00:00")
    expect(horaDelMinuto(9 * 60 + 5)).toBe("09:05")
    expect(horaDelMinuto(23 * 60 + 45)).toBe("23:45")
  })
})

describe("posicionDelBloque", () => {
  const PX = ALTO_DE_FILA / 15

  it("empieza en su hora y mide lo que dura, menos la separación", () => {
    // 10:30 a 11:15 en una grilla que empieza a las 9.
    expect(posicionDelBloque({ inicioMin: 630, finMin: 675 }, 9, 20)).toEqual({
      arriba: 90 * PX,
      alto: 45 * PX - SEPARACION,
    })
  })

  it("una cita de 30 minutos mide dos filas", () => {
    expect(posicionDelBloque({ inicioMin: 540, finMin: 570 }, 9, 20)?.alto).toBe(2 * ALTO_DE_FILA - SEPARACION)
  })

  it("una cita muy corta, o mal cargada, mide al menos el alto mínimo", () => {
    expect(posicionDelBloque({ inicioMin: 600, finMin: 605 }, 9, 20)?.alto).toBe(ALTO_MINIMO)
    expect(posicionDelBloque({ inicioMin: 600, finMin: 600 }, 9, 20)?.alto).toBe(ALTO_MINIMO)
    expect(posicionDelBloque({ inicioMin: 600, finMin: 590 }, 9, 20)).toEqual({ arriba: 60 * PX, alto: ALTO_MINIMO })
  })

  it("lo que empieza antes de la grilla se recorta arriba", () => {
    expect(posicionDelBloque({ inicioMin: 7 * 60 + 30, finMin: 8 * 60 + 30 }, 8, 20)).toEqual({
      arriba: 0,
      alto: 30 * PX - SEPARACION,
    })
  })

  it("lo que termina después de la grilla se recorta abajo", () => {
    expect(posicionDelBloque({ inicioMin: 19 * 60 + 30, finMin: 21 * 60 }, 8, 20)).toEqual({
      arriba: (11 * 60 + 30) * PX,
      alto: 30 * PX - SEPARACION,
    })
  })

  it("una cita corta al final de la grilla sube lo justo para no salirse", () => {
    const posicion = posicionDelBloque({ inicioMin: 19 * 60 + 55, finMin: 20 * 60 }, 8, 20)
    expect(posicion?.alto).toBe(ALTO_MINIMO)
    expect((posicion?.arriba ?? 0) + (posicion?.alto ?? 0)).toBe(altoDeLaGrilla(8, 20))
  })

  it("lo que cae entero fuera de la grilla no se dibuja", () => {
    expect(posicionDelBloque({ inicioMin: 6 * 60, finMin: 7 * 60 }, 8, 20)).toBeNull()
    expect(posicionDelBloque({ inicioMin: 7 * 60, finMin: 8 * 60 }, 8, 20)).toBeNull()
    expect(posicionDelBloque({ inicioMin: 20 * 60, finMin: 21 * 60 }, 8, 20)).toBeNull()
  })
})

describe("lineaDeAhora", () => {
  it("se dibuja a la altura de la hora actual", () => {
    expect(lineaDeAhora(10 * 60 + 12, 9, 20)).toBe(72 * (ALTO_DE_FILA / 15))
  })

  it("no se dibuja si no es hoy o si la hora cae fuera de la grilla", () => {
    expect(lineaDeAhora(null, 9, 20)).toBeNull()
    expect(lineaDeAhora(8 * 60, 9, 20)).toBeNull()
    expect(lineaDeAhora(21 * 60, 9, 20)).toBeNull()
    expect(lineaDeAhora(Number.NaN, 9, 20)).toBeNull()
  })
})

describe("columnasPorSillon", () => {
  it("los sillones activos en su orden; el desactivado sin citas no aparece", () => {
    expect(columnasPorSillon(SILLONES, [])).toEqual([
      { id: "s1", nombre: "Sillón 1" },
      { id: "s2", nombre: "Sillón 2" },
    ])
  })

  it("a igual orden, por nombre", () => {
    const sillones = [
      { id: "b", nombre: "Box B", orden: 0, activo: true },
      { id: "a", nombre: "Box A", orden: 0, activo: true },
    ]
    expect(columnasPorSillon(sillones, []).map((columna) => columna.id)).toEqual(["a", "b"])
  })

  it("un sillón desactivado con citas ese día aparece, marcado", () => {
    expect(columnasPorSillon(SILLONES, [{ sillonId: "s3" }])).toContainEqual({ id: "s3", nombre: "Sillón 3", inactiva: true })
  })

  it("las citas sin sillón suman la columna «Sin sillón», al final", () => {
    const columnas = columnasPorSillon(SILLONES, [{ sillonId: null }, { sillonId: "s1" }])
    expect(columnas.map((columna) => columna.id)).toEqual(["s1", "s2", SIN_SILLON])
    expect(columnas[2].nombre).toBe("Sin sillón")
  })

  it("sin citas sin sillón, no hay columna «Sin sillón»", () => {
    expect(columnasPorSillon(SILLONES, [{ sillonId: "s2" }]).map((columna) => columna.id)).not.toContain(SIN_SILLON)
  })

  it("un sillón que no vino en la lista se agrega con el nombre que trae la cita", () => {
    const columnas = columnasPorSillon(SILLONES, [{ sillonId: "s9", sillon: { id: "s9", nombre: "Box nuevo" } }])
    expect(columnas).toContainEqual({ id: "s9", nombre: "Box nuevo" })
  })

  it("sin sillones ni citas queda una columna vacía, nunca cero", () => {
    expect(columnasPorSillon([], [])).toEqual([{ id: SIN_SILLON, nombre: "Sin sillón" }])
  })
})

describe("columnasPorOdontologo", () => {
  it("el equipo en su orden", () => {
    expect(columnasPorOdontologo(EQUIPO, []).map((columna) => columna.nombre)).toEqual(["Matías Pérez", "Valentina Soto"])
  })

  it("quien tiene citas y no está en la lista se agrega (al odontólogo, su columna sale de sus citas)", () => {
    const columnas = columnasPorOdontologo([], [{ memberId: "m7", member: { id: "m7", user: { name: "Fernanda Lagos" } } }])
    expect(columnas).toEqual([{ id: "m7", nombre: "Fernanda Lagos" }])
  })

  it("las citas sin asignar suman «Sin odontólogo», al final", () => {
    const columnas = columnasPorOdontologo(EQUIPO, [{ memberId: null }])
    expect(columnas.map((columna) => columna.id)).toEqual(["m1", "m2", SIN_ODONTOLOGO])
  })

  it("sin equipo ni citas queda una columna vacía", () => {
    expect(columnasPorOdontologo([], [])).toEqual([{ id: SIN_ODONTOLOGO, nombre: "Sin odontólogo" }])
  })

  it("quien atiende se llama como el rubro lo llama: «Sin odontólogo» por defecto, otra palabra si se pasa", () => {
    const citas = [{ memberId: "m7", member: { id: "m7", user: { name: " " } } }, { memberId: null }]
    expect(columnasPorOdontologo([], citas).map((columna) => columna.nombre)).toEqual(["Odontólogo", "Sin odontólogo"])
    expect(columnasPorOdontologo([], citas, "estilista").map((columna) => columna.nombre)).toEqual(["Estilista", "Sin estilista"])
    expect(columnasDeLaGrilla("odontologo", SILLONES, [], [{ memberId: null }], "barbero").map((columna) => columna.nombre)).toEqual([
      "Sin barbero",
    ])
  })

  it("columnasDeLaGrilla elige según «Ver por»", () => {
    expect(columnasDeLaGrilla("sillon", SILLONES, EQUIPO, [])[0].id).toBe("s1")
    expect(columnasDeLaGrilla("odontologo", SILLONES, EQUIPO, [])[0].id).toBe("m1")
  })
})

describe("citasPorColumna", () => {
  const citas = [
    { id: "c1", sillonId: "s2", memberId: "m1", inicio: 600 },
    { id: "c2", sillonId: "s1", memberId: "m2", inicio: 540 },
    { id: "c3", sillonId: null, memberId: null, inicio: 570 },
    { id: "c4", sillonId: "s2", memberId: "m1", inicio: 560 },
  ]
  const inicio = (cita: (typeof citas)[number]) => cita.inicio
  const ids = (mapa: Map<string, typeof citas>) =>
    Object.fromEntries([...mapa].map(([columna, deLaColumna]) => [columna, deLaColumna.map((cita) => cita.id)]))

  it("por sillón: cada cita en su sillón, por hora; las sin sillón en «Sin sillón»", () => {
    const columnas = columnasPorSillon(SILLONES, citas)
    expect(ids(citasPorColumna(citas, columnas, "sillon", inicio))).toEqual({
      s1: ["c2"],
      s2: ["c4", "c1"],
      [SIN_SILLON]: ["c3"],
    })
  })

  it("por odontólogo: cada cita con quien la atiende", () => {
    const columnas = columnasPorOdontologo(EQUIPO, citas)
    expect(ids(citasPorColumna(citas, columnas, "odontologo", inicio))).toEqual({
      m1: ["c4", "c1"],
      m2: ["c2"],
      [SIN_ODONTOLOGO]: ["c3"],
    })
  })

  it("una cita cuya columna no está no se pierde: va a la última", () => {
    const columnas = [{ id: "s1", nombre: "Sillón 1" }]
    expect(ids(citasPorColumna([citas[0]], columnas, "sillon", inicio))).toEqual({ s1: ["c1"] })
  })
})

describe("lugaresEnLaColumna (solapes)", () => {
  it("dos citas que se pisan en el mismo sillón van lado a lado", () => {
    const lugares = lugaresEnLaColumna([
      { id: "a", inicioMin: 600, finMin: 660 },
      { id: "b", inicioMin: 630, finMin: 690 },
    ])
    expect(lugares.get("a")).toEqual({ columna: 0, columnas: 2 })
    expect(lugares.get("b")).toEqual({ columna: 1, columnas: 2 })
  })

  it("dos citas seguidas no se pisan: cada una a todo el ancho", () => {
    const lugares = lugaresEnLaColumna([
      { id: "a", inicioMin: 600, finMin: 630 },
      { id: "b", inicioMin: 630, finMin: 660 },
    ])
    expect(lugares.get("a")).toEqual({ columna: 0, columnas: 1 })
    expect(lugares.get("b")).toEqual({ columna: 0, columnas: 1 })
  })

  it("una cita muy corta se pisa a la vista con la que empieza enseguida", () => {
    const lugares = lugaresEnLaColumna([
      { id: "a", inicioMin: 600, finMin: 603 },
      { id: "b", inicioMin: 605, finMin: 630 },
    ])
    expect(lugares.get("a")?.columnas).toBe(2)
  })
})

describe("columnasDelBloqueo", () => {
  const columnas = columnasPorOdontologo(EQUIPO, [])

  it("un bloqueo de todo el negocio va en todas las columnas", () => {
    expect(columnasDelBloqueo({ memberId: null }, "sillon", columnasPorSillon(SILLONES, []))).toEqual(["s1", "s2"])
    expect(columnasDelBloqueo({ memberId: null }, "odontologo", columnas)).toEqual(["m1", "m2"])
  })

  it("el de un odontólogo va en su columna en la vista por odontólogo", () => {
    expect(columnasDelBloqueo({ memberId: "m2" }, "odontologo", columnas)).toEqual(["m2"])
  })

  it("en la vista por sillón, el de un odontólogo no va en ninguna (se lee en la lista de bloqueos)", () => {
    expect(columnasDelBloqueo({ memberId: "m2" }, "sillon", columnasPorSillon(SILLONES, []))).toEqual([])
  })

  it("el de alguien que no tiene columna, en ninguna", () => {
    expect(columnasDelBloqueo({ memberId: "m9" }, "odontologo", columnas)).toEqual([])
  })
})
