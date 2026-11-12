import { describe, it, expect } from "vitest"
import { vocabularioDe } from "./vocabulario"
import {
  MAX_SERVICIOS_POR_LOTE,
  MAX_SERVICIOS_POR_NEGOCIO,
  MOTIVO_REPETIDO_EN_EL_ARCHIVO,
  MOTIVO_YA_EXISTE,
  leerDuracion,
  leerPrecio,
  leerServiciosDeTexto,
  marcarRepetidos,
  mensajeDeTopeDeServicios,
  normalizarNombre,
  repetidosDe,
  servicioParaCargarSchema,
  type FilaLeida,
  type ServicioParaCargar,
} from "./servicios-en-lote"

const servicio = (datos: Partial<ServicioParaCargar> = {}): ServicioParaCargar => ({
  name: "Corte",
  duration: 30,
  price: null,
  category: null,
  description: null,
  ...datos,
})

describe("los topes", () => {
  it("son los acordados", () => {
    expect(MAX_SERVICIOS_POR_LOTE).toBe(100)
    expect(MAX_SERVICIOS_POR_NEGOCIO).toBe(300)
  })
})

describe("leerDuracion", () => {
  it.each([
    ["45", 45],
    ["  45  ", 45],
    ["45 min", 45],
    ["45min", 45],
    ["45 MIN", 45],
    ["45 minutos", 45],
    ["45 m", 45],
    ["1h", 60],
    ["1 h", 60],
    ["1H", 60],
    ["2 horas", 120],
    ["1 hora", 60],
    ["1hr", 60],
    ["1h30", 90],
    ["1 h 30", 90],
    ["1h30min", 90],
    ["1 hora 30 minutos", 90],
    ["2h15", 135],
    ["1:30", 90],
    ["01:30", 90],
    ["0:45", 45],
    ["1,5 h", 90],
    ["1.5h", 90],
    ["1,1 h", 66],
    ["-30", -30],
  ])("%j son %i minutos", (texto, minutos) => {
    expect(leerDuracion(texto)).toBe(minutos)
  })

  it.each([
    [""],
    ["   "],
    ["mucho"],
    ["45 segundos"],
    ["1h75"],
    ["1:75"],
    ["h"],
    ["1:3"],
    ["=1+1"],
    ["@45"],
    ["45 min.."],
    ["1h 30 horas"],
  ])("%j no se entiende", (texto) => {
    expect(leerDuracion(texto)).toBeNull()
  })
})

describe("leerPrecio", () => {
  it.each([
    ["15000", 15000],
    ["0", 0],
    ["$15.000", 15000],
    ["$ 15.000", 15000],
    ["15.000", 15000],
    ["1.500.000", 1500000],
    ["15,000", 15000],
    ["15 000", 15000],
    ["15.000 CLP", 15000],
    ["15000 pesos", 15000],
    ["$15000", 15000],
    ["15000,50", 15000.5],
    ["15000.5", 15000.5],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["-5000", -5000],
    ["+5000", 5000],
  ])("%j son $%d", (texto, monto) => {
    expect(leerPrecio(texto)).toBe(monto)
  })

  it.each([[""], ["gratis"], ["quince mil"], ["15.0000"], ["1.5.0"], ["=SUMA(A1:A3)"], ["15000$$x"], ["1e5"], ["15.00.000"]])(
    "%j no se entiende",
    (texto) => {
      expect(leerPrecio(texto)).toBeNull()
    }
  )
})

describe("normalizarNombre", () => {
  it("compara sin mayúsculas, sin tildes y con los espacios colapsados", () => {
    expect(normalizarNombre("  CORTE   de  Pelo ")).toBe("corte de pelo")
    expect(normalizarNombre("Evaluación / Primera consulta")).toBe("evaluacion / primera consulta")
    expect(normalizarNombre("Pestañas")).toBe("pestanas")
  })
})

describe("leerServiciosDeTexto: con títulos", () => {
  it("lee una planilla pegada (tabulación), con los títulos en su orden", () => {
    const texto = [
      "Nombre\tDuración\tPrecio\tCategoría\tDescripción",
      "Corte de pelo\t45\t15000\tCorte\tIncluye lavado",
      "Tintura\t2h\t$35.000\tColor\t",
    ].join("\n")

    expect(leerServiciosDeTexto(texto)).toEqual({
      titulosReconocidos: true,
      filas: [
        { fila: 2, servicio: { name: "Corte de pelo", duration: 45, price: 15000, category: "Corte", description: "Incluye lavado" } },
        { fila: 3, servicio: { name: "Tintura", duration: 120, price: 35000, category: "Color", description: null } },
      ],
    })
  })

  it.each([
    ["tabulación", "\t"],
    ["punto y coma", ";"],
    ["coma", ","],
  ])("lee con el separador %s", (_nombre, sep) => {
    const texto = ["Servicio", "Duración (min)", "Valor"].join(sep) + "\r\n" + ["Brushing", "45 min", "12.000"].join(sep) + "\r\n"

    expect(leerServiciosDeTexto(texto)).toEqual({
      titulosReconocidos: true,
      filas: [{ fila: 2, servicio: { name: "Brushing", duration: 45, price: 12000, category: null, description: null } }],
    })
  })

  it("las columnas pueden ir en otro orden, repetirse o sobrar", () => {
    const texto = ["Tipo;Valor;Profesional;Prestación;Minutos", "Color;$25.000;Ana;Retoque de raíz;1h30"].join("\n")

    expect(leerServiciosDeTexto(texto).filas).toEqual([
      { fila: 2, servicio: { name: "Retoque de raíz", duration: 90, price: 25000, category: "Color", description: null } },
    ])
  })

  it.each([
    ["Nombre"],
    ["Servicio"],
    ["Prestación"],
    ["Motivo"],
    ["NOMBRE DEL SERVICIO"],
  ])("reconoce %j como el título del nombre", (titulo) => {
    const leido = leerServiciosDeTexto(`${titulo};Duración\nLimpieza;30`)
    expect(leido.titulosReconocidos).toBe(true)
    expect(leido.filas[0].servicio?.name).toBe("Limpieza")
  })

  it.each([["Duración"], ["Duración (min)"], ["Duracion"], ["Minutos"], ["DURACIÓN EN MINUTOS"]])(
    "reconoce %j como el título de la duración",
    (titulo) => {
      expect(leerServiciosDeTexto(`Nombre;${titulo}\nLimpieza;30`).filas[0].servicio?.duration).toBe(30)
    }
  )

  it.each([["Precio"], ["Valor"], ["Precio ($)"], ["PRECIO CLP"]])("reconoce %j como el título del precio", (titulo) => {
    expect(leerServiciosDeTexto(`Nombre;Duración;${titulo}\nLimpieza;30;9000`).filas[0].servicio?.price).toBe(9000)
  })

  it.each([["Categoría"], ["Categoria"], ["Tipo"]])("reconoce %j como el título de la categoría", (titulo) => {
    expect(leerServiciosDeTexto(`Nombre;Duración;${titulo}\nLimpieza;30;Prevención`).filas[0].servicio?.category).toBe("Prevención")
  })

  it("lee el CSV con BOM igual que sin él", () => {
    const sinBom = "Nombre;Duración\nCorte;30\n"
    expect(leerServiciosDeTexto("﻿" + sinBom)).toEqual(leerServiciosDeTexto(sinBom))
    expect(leerServiciosDeTexto("﻿" + sinBom).titulosReconocidos).toBe(true)
  })

  it("lee celdas entre comillas (con el separador, comillas y saltos de línea adentro)", () => {
    const texto = 'Nombre;Duración;Descripción\n"Corte; lavado y ""secado""";45;"Primera línea\nsegunda línea"\nBrushing;30;\n'

    expect(leerServiciosDeTexto(texto).filas).toEqual([
      { fila: 2, servicio: { name: 'Corte; lavado y "secado"', duration: 45, price: null, category: null, description: "Primera línea\nsegunda línea" } },
      { fila: 3, servicio: { name: "Brushing", duration: 30, price: null, category: null, description: null } },
    ])
  })

  it("una columna de duración que falta deja a cada fila con el error de la duración", () => {
    const { filas } = leerServiciosDeTexto("Nombre;Precio\nCorte;9000")
    expect(filas).toEqual([{ fila: 2, error: "Fila 2: falta la duración: escribe los minutos (45) o las horas (1h30)" }])
  })
})

describe("leerServiciosDeTexto: sin títulos", () => {
  it("el orden es nombre, duración, precio, categoría y descripción", () => {
    const texto = "Manicure\t45\t10000\tManos\tTradicional\nPedicure\t1h\t\tPies\t"

    expect(leerServiciosDeTexto(texto)).toEqual({
      titulosReconocidos: false,
      filas: [
        { fila: 1, servicio: { name: "Manicure", duration: 45, price: 10000, category: "Manos", description: "Tradicional" } },
        { fila: 2, servicio: { name: "Pedicure", duration: 60, price: null, category: "Pies", description: null } },
      ],
    })
  })

  it("una tabulación manda aunque el nombre lleve comas", () => {
    const { filas } = leerServiciosDeTexto("Corte, lavado y secado\t60\t20000")
    expect(filas[0].servicio).toMatchObject({ name: "Corte, lavado y secado", duration: 60, price: 20000 })
  })

  it("separa con coma o punto y coma sin títulos", () => {
    expect(leerServiciosDeTexto("Corte,30,9000").filas[0].servicio).toMatchObject({ name: "Corte", duration: 30, price: 9000 })
    expect(leerServiciosDeTexto("Corte;30;9.000").filas[0].servicio).toMatchObject({ name: "Corte", duration: 30, price: 9000 })
  })

  it("un servicio que se llama como un título no se confunde con la fila de títulos (trae cifras)", () => {
    const leido = leerServiciosDeTexto("Servicio;45;15000")
    expect(leido.titulosReconocidos).toBe(false)
    expect(leido.filas[0].servicio?.name).toBe("Servicio")
  })

  it("las celdas de más se ignoran, y las que faltan son vacías", () => {
    const { filas } = leerServiciosDeTexto("Corte;30;9000;Corte;Con lavado;sobra;otra\nBrushing;45")
    expect(filas.map((f) => f.servicio)).toEqual([
      { name: "Corte", duration: 30, price: 9000, category: "Corte", description: "Con lavado" },
      { name: "Brushing", duration: 45, price: null, category: null, description: null },
    ])
  })

  it("recorta los espacios de cada celda", () => {
    const { filas } = leerServiciosDeTexto("  Corte  ;  30 ;  $9.000 ;  Corte ; ")
    expect(filas[0].servicio).toEqual({ name: "Corte", duration: 30, price: 9000, category: "Corte", description: null })
  })

  it("un texto vacío o de puras líneas en blanco no tiene filas", () => {
    expect(leerServiciosDeTexto("")).toEqual({ filas: [], titulosReconocidos: false })
    expect(leerServiciosDeTexto("\n\n  \n;;;\n")).toEqual({ filas: [], titulosReconocidos: false })
  })

  it("sólo los títulos, sin servicios: reconoce los títulos y no hay filas", () => {
    expect(leerServiciosDeTexto("Nombre;Duración;Precio\n")).toEqual({ filas: [], titulosReconocidos: true })
  })
})

describe("leerServiciosDeTexto: el número de fila es el de la planilla", () => {
  it("las líneas en blanco no se leen pero cuentan, y los títulos son la fila 1", () => {
    const texto = ["Nombre;Duración", "Corte;30", "", "  ", "Brushing;45", ";", "Tinte;10"].join("\n")

    const { filas } = leerServiciosDeTexto(texto)

    expect(filas.map((f) => f.fila)).toEqual([2, 5, 7])
    expect(filas[2].error).toBe("Fila 7: la duración tiene que ser de al menos 15 minutos")
  })

  it("las líneas en blanco antes de los títulos también cuentan", () => {
    const { filas, titulosReconocidos } = leerServiciosDeTexto("\n\nNombre;Duración\nCorte;30")
    expect(titulosReconocidos).toBe(true)
    expect(filas.map((f) => f.fila)).toEqual([4])
  })

  it("sin títulos, la primera fila es la 1", () => {
    expect(leerServiciosDeTexto("Corte;30\nTinte;5").filas.map((f) => f.fila)).toEqual([1, 2])
  })

  it("una celda con saltos de línea adentro es una sola fila", () => {
    const { filas } = leerServiciosDeTexto('Nombre;Duración;Descripción\nCorte;30;"a\nb\nc"\nTinte;5')
    expect(filas.map((f) => f.fila)).toEqual([2, 3])
  })
})

describe("leerServiciosDeTexto: errores", () => {
  const error = (texto: string) => leerServiciosDeTexto(texto).filas[0].error

  it.each([
    ["un nombre de un carácter", "C;30", "Fila 1: el nombre tiene que tener al menos 2 caracteres"],
    ["un nombre vacío", ";30", "Fila 1: el nombre tiene que tener al menos 2 caracteres"],
    ["un nombre de 101 caracteres", `${"a".repeat(101)};30`, "Fila 1: el nombre no puede tener más de 100 caracteres"],
    ["una duración vacía", "Corte;", "Fila 1: falta la duración: escribe los minutos (45) o las horas (1h30)"],
    ["una duración de 10", "Corte;10", "Fila 1: la duración tiene que ser de al menos 15 minutos"],
    ["una duración de 481", "Corte;481", "Fila 1: la duración no puede pasar de 480 minutos"],
    ["una duración de 9 horas", "Corte;9h", "Fila 1: la duración no puede pasar de 480 minutos"],
    ["una duración con decimales", "Corte;45,5", "Fila 1: la duración tiene que ser un número entero de minutos"],
    ["una duración negativa", "Corte;-30", "Fila 1: la duración tiene que ser de al menos 15 minutos"],
    ["una duración ilegible", "Corte;mucho", 'Fila 1: la duración "mucho" no se entiende: escribe los minutos (45) o las horas (1h30 o 1:30)'],
    ["un precio negativo", "Corte;30;-5000", "Fila 1: el precio no puede ser negativo"],
    ["un precio de más de 10.000.000", "Corte;30;10.000.001", "Fila 1: el precio no puede ser mayor que 10.000.000"],
    ["un precio ilegible", "Corte;30;gratis", 'Fila 1: el precio "gratis" no se entiende: escribe sólo el monto (15000 o $15.000) o déjalo vacío'],
    ["una categoría de 41 caracteres", `Corte;30;;${"a".repeat(41)}`, "Fila 1: la categoría no puede tener más de 40 caracteres"],
    ["una descripción de 2001 caracteres", `Corte;30;;;${"a".repeat(2001)}`, "Fila 1: la descripción no puede tener más de 2000 caracteres"],
  ])("%s", (_caso, texto, mensaje) => {
    expect(error(texto)).toBe(mensaje)
  })

  it("acepta los bordes: 15 y 480 minutos, precio 0 y 10.000.000, textos en el tope", () => {
    const { filas } = leerServiciosDeTexto(
      [`${"a".repeat(100)};15;0;${"b".repeat(40)};${"c".repeat(2000)}`, "Corte;8h;10.000.000"].join("\n")
    )
    expect(filas.map((f) => f.error)).toEqual([undefined, undefined])
    expect(filas[1].servicio).toMatchObject({ duration: 480, price: 10_000_000 })
  })

  it("una fila mala no afecta a las demás, y dice cuál es cada error", () => {
    const { filas } = leerServiciosDeTexto("Corte;30\nTinte;5\nPeinado;45;gratis\nBrushing;45")

    expect(filas.map((f) => [f.fila, f.servicio?.name, f.error])).toEqual([
      [1, "Corte", undefined],
      [2, undefined, "Fila 2: la duración tiene que ser de al menos 15 minutos"],
      [3, undefined, 'Fila 3: el precio "gratis" no se entiende: escribe sólo el monto (15000 o $15.000) o déjalo vacío'],
      [4, "Brushing", undefined],
    ])
  })

  it("cada fila tiene exactamente un servicio o un error", () => {
    const { filas } = leerServiciosDeTexto("Corte;30\nT;5\n;;;\nBrushing;45")
    for (const fila of filas) expect((fila.servicio === undefined) !== (fila.error === undefined)).toBe(true)
  })
})

describe("leerServiciosDeTexto: fórmulas", () => {
  it.each([
    ["=HYPERLINK(\"http://x.cl\",\"Haz clic\")"],
    ["+ Extensiones"],
    ["- Corte"],
    ["@corte"],
    ["=1+1"],
  ])("el nombre %s es texto: se guarda tal cual, no se evalúa ni se rechaza", (nombreDelServicio) => {
    const entreComillas = `"${nombreDelServicio.replace(/"/g, '""')}"`
    const { filas } = leerServiciosDeTexto(`${entreComillas};30`)
    expect(filas[0].servicio?.name).toBe(nombreDelServicio)
  })

  it("la categoría y la descripción que empiezan con = + - @ también son texto", () => {
    const { filas } = leerServiciosDeTexto("Corte;30;;=Corte;+56 9 1234 5678")
    expect(filas[0].servicio).toMatchObject({ category: "=Corte", description: "+56 9 1234 5678" })
  })

  it.each([
    ["una duración", "Corte;=30"],
    ["una duración", "Corte;@30"],
    ["un precio", "Corte;30;=SUMA(A1:A3)"],
    ["un precio", "Corte;30;@9000"],
  ])("una fórmula en %s no es un número: error, nunca un valor calculado", (_campo, texto) => {
    const fila = leerServiciosDeTexto(texto).filas[0]
    expect(fila.servicio).toBeUndefined()
    expect(fila.error).toMatch(/no se entiende/)
  })
})

describe("repetidosDe y marcarRepetidos", () => {
  const filas: FilaLeida[] = [
    { fila: 1, servicio: servicio({ name: "Corte de pelo" }) },
    { fila: 2, servicio: servicio({ name: "  CORTE   de pelo " }) },
    { fila: 3, error: "Fila 3: la duración tiene que ser de al menos 15 minutos" },
    { fila: 4, servicio: servicio({ name: "Evaluación" }) },
    { fila: 5, servicio: servicio({ name: "Tintura" }) },
    { fila: 6, servicio: servicio({ name: "tintura" }) },
    { fila: 7, servicio: servicio({ name: "Brushing" }) },
  ]

  it("repetidosDe: la primera vez se queda; las siguientes son repetidas; las del negocio ya existen", () => {
    expect(repetidosDe(["Corte", "corte", "Tinte", "EVALUACION", "Tinte"], ["Evaluación"])).toEqual([null, "repetido", null, "existente", "repetido"])
  })

  it("marca los que ya existen en el negocio, sin mayúsculas ni tildes ni espacios de más", () => {
    const marcadas = marcarRepetidos(filas, ["evaluacion", "BRUSHING  "])

    expect(marcadas.find((f) => f.fila === 4)).toEqual({ fila: 4, error: MOTIVO_YA_EXISTE })
    expect(marcadas.find((f) => f.fila === 7)).toEqual({ fila: 7, error: MOTIVO_YA_EXISTE })
    expect(MOTIVO_YA_EXISTE).toBe("Ya existe un servicio con ese nombre")
  })

  it("marca los repetidos dentro de la lista y deja la primera vez", () => {
    const marcadas = marcarRepetidos(filas, [])

    expect(marcadas.find((f) => f.fila === 1)?.servicio?.name).toBe("Corte de pelo")
    expect(marcadas.find((f) => f.fila === 2)).toEqual({ fila: 2, error: MOTIVO_REPETIDO_EN_EL_ARCHIVO })
    expect(marcadas.find((f) => f.fila === 5)?.servicio?.name).toBe("Tintura")
    expect(marcadas.find((f) => f.fila === 6)).toEqual({ fila: 6, error: MOTIVO_REPETIDO_EN_EL_ARCHIVO })
    expect(MOTIVO_REPETIDO_EN_EL_ARCHIVO).toBe("Repetido en el archivo")
  })

  it("una fila que ya tenía error se queda igual y no cuenta como anterior", () => {
    const marcadas = marcarRepetidos(
      [
        { fila: 1, error: "Fila 1: la duración tiene que ser de al menos 15 minutos" },
        { fila: 2, servicio: servicio({ name: "Corte" }) },
      ],
      []
    )
    expect(marcadas[0]).toEqual({ fila: 1, error: "Fila 1: la duración tiene que ser de al menos 15 minutos" })
    expect(marcadas[1].servicio?.name).toBe("Corte")
  })

  it("si el nombre existe en el negocio, también se marcan todas las veces que se repite", () => {
    const marcadas = marcarRepetidos(
      [
        { fila: 1, servicio: servicio({ name: "Corte" }) },
        { fila: 2, servicio: servicio({ name: "corte" }) },
      ],
      ["Corte"]
    )
    expect(marcadas.map((f) => f.error)).toEqual([MOTIVO_YA_EXISTE, MOTIVO_YA_EXISTE])
  })

  it("cada fila queda con un servicio o un error, nunca los dos", () => {
    for (const fila of marcarRepetidos(filas, ["Evaluación"])) {
      expect((fila.servicio === undefined) !== (fila.error === undefined)).toBe(true)
    }
  })

  it("no muta lo que recibe ni comparte objetos con el resultado", () => {
    const entrada: FilaLeida[] = filas.map((f) => structuredClone(f))
    const existentes = ["Evaluación"]
    const copiaDeLosExistentes = [...existentes]

    const salida = marcarRepetidos(entrada, existentes)

    expect(entrada).toEqual(filas)
    expect(existentes).toEqual(copiaDeLosExistentes)
    expect(salida).not.toBe(entrada)
    salida.forEach((fila, i) => {
      expect(fila).not.toBe(entrada[i])
      if (fila.servicio) expect(fila.servicio).not.toBe(entrada[i].servicio)
    })
  })

  it("sin filas, sin filas", () => {
    expect(marcarRepetidos([], ["Corte"])).toEqual([])
  })
})

describe("servicioParaCargarSchema (lo que revalida el servidor)", () => {
  it("acepta un servicio completo y uno mínimo", () => {
    expect(servicioParaCargarSchema.parse(servicio({ name: " Corte ", price: 0, category: " Corte ", description: " algo " }))).toEqual({
      name: "Corte",
      duration: 30,
      price: 0,
      category: "Corte",
      description: "algo",
    })
  })

  it("una categoría o una descripción vacías son null", () => {
    expect(servicioParaCargarSchema.parse(servicio({ category: "  ", description: "" }))).toMatchObject({ category: null, description: null })
  })

  it("descarta las claves de más: esUrgencia no llega", () => {
    const leido = servicioParaCargarSchema.parse({ ...servicio(), esUrgencia: true, businessId: "otro" })
    expect(leido).not.toHaveProperty("esUrgencia")
    expect(leido).not.toHaveProperty("businessId")
  })

  it.each([
    ["sin duración", { duration: undefined }],
    ["duración que es texto", { duration: "30" }],
    ["sin precio (null sí; undefined no)", { price: undefined }],
    ["nombre corto", { name: "C" }],
    ["precio negativo", { price: -1 }],
  ])("rechaza %s", (_caso, campos) => {
    expect(servicioParaCargarSchema.safeParse({ ...servicio(), ...campos }).success).toBe(false)
  })
})

describe("mensajeDeTopeDeServicios", () => {
  const servicios = vocabularioDe("salon").palabras.servicio
  const prestaciones = vocabularioDe("odontologia").palabras.servicio

  it("cuando todavía caben algunos dice cuántos caben y cuántos sobran", () => {
    expect(mensajeDeTopeDeServicios(290, 25, servicios)).toBe(
      "Se pueden tener hasta 300 servicios y ya tienes 290: caben 10 más y esta carga trae 25. Quita 15 de la lista o borra los servicios que ya no uses."
    )
  })

  it("cuando ya no cabe ninguno, lo dice sin números de más", () => {
    expect(mensajeDeTopeDeServicios(300, 1, servicios)).toBe("Ya tienes el máximo de 300 servicios. Borra los servicios que ya no uses para agregar más.")
  })

  it("habla con las palabras del rubro: una clínica tiene prestaciones", () => {
    expect(mensajeDeTopeDeServicios(300, 1, prestaciones)).toBe("Ya tienes el máximo de 300 prestaciones. Borra las prestaciones que ya no uses para agregar más.")
  })
})
