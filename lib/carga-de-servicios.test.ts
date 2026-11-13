import { describe, expect, it } from "vitest"
import { duracion } from "./campos-del-panel"
import {
  DURACIONES_VALIDAS,
  FILAS_MAXIMAS_EN_LA_VISTA_PREVIA,
  PESO_MAXIMO_DEL_ARCHIVO,
  TITULOS_DE_LA_PLANTILLA,
  conCategoriasUnificadas,
  cuantosCaben,
  estaEnBlanco,
  filaEnBlanco,
  filasEnBlanco,
  leerActualizados,
  leerArchivoDeServicios,
  leerPegadoDeLaTabla,
  leerRespuestaDeLote,
  leerYRevisarTexto,
  opcionesDeDuracion,
  partirEnTandas,
  plantillaDeServicios,
  repartirPegado,
  revisarFilas,
  sugeridosParaCargar,
  vistaDeSugeridos,
  type FilaEditable,
  type SugeridoDelRubro,
} from "./carga-de-servicios"
import { decodificarCsv } from "./csv"
import {
  MAX_SERVICIOS_POR_LOTE,
  MAX_SERVICIOS_POR_NEGOCIO,
  MOTIVO_REPETIDO_EN_EL_LOTE,
  MOTIVO_YA_EXISTE,
  leerServiciosDeTexto,
} from "./servicios-en-lote"

let contador = 0
const clave = () => `c${++contador}`

const fila = (cambios: Partial<FilaEditable> = {}): FilaEditable => ({ ...filaEnBlanco(clave()), ...cambios })

describe("las duraciones de la lista", () => {
  it("son múltiplos de 15 y van del mínimo al máximo que acepta duracion()", () => {
    expect(DURACIONES_VALIDAS[0]).toBe(15)
    expect(DURACIONES_VALIDAS.at(-1)).toBe(480)
    expect(DURACIONES_VALIDAS).toHaveLength(32)
    expect(DURACIONES_VALIDAS.every((minutos) => minutos % 15 === 0)).toBe(true)
  })

  it("todas pasan duracion(), y la siguiente por abajo y por arriba no", () => {
    for (const minutos of DURACIONES_VALIDAS) expect(duracion().safeParse(minutos).success).toBe(true)
    expect(duracion().safeParse(DURACIONES_VALIDAS[0] - 15).success).toBe(false)
    expect(duracion().safeParse(DURACIONES_VALIDAS.at(-1)! + 15).success).toBe(false)
  })

  it("una duración pegada que no es múltiplo de 15 se conserva en su lugar", () => {
    expect(opcionesDeDuracion(30)).toEqual([...DURACIONES_VALIDAS])
    const con50 = opcionesDeDuracion(50)
    expect(con50).toHaveLength(DURACIONES_VALIDAS.length + 1)
    expect(con50.indexOf(50)).toBe(con50.indexOf(45) + 1)
  })
})

describe("partirEnTandas", () => {
  it("de a 100 por defecto: 250 son 100, 100 y 50", () => {
    const tandas = partirEnTandas(Array.from({ length: 250 }, (_, i) => i))
    expect(tandas.map((t) => t.length)).toEqual([100, 100, 50])
    expect(tandas.flat()).toEqual(Array.from({ length: 250 }, (_, i) => i))
  })

  it("100 justos son una tanda; ninguno, ninguna", () => {
    expect(partirEnTandas(Array.from({ length: MAX_SERVICIOS_POR_LOTE }, () => 0))).toHaveLength(1)
    expect(partirEnTandas([])).toEqual([])
  })
})

describe("leerRespuestaDeLote", () => {
  it("cuenta los creados y trae los omitidos con su lugar en la carga entera", () => {
    const leida = leerRespuestaDeLote({ creados: 12, omitidos: [{ fila: 2, name: "Corte", motivo: "Ya existe" }] }, 100)
    expect(leida).toEqual({ creados: 12, omitidos: [{ fila: 102, name: "Corte", motivo: "Ya existe" }] })
  })

  it("acepta que `creados` sea la lista de lo creado", () => {
    expect(leerRespuestaDeLote({ creados: [{ id: "a" }, { id: "b" }], omitidos: [] }).creados).toBe(2)
  })

  it("lo que no se entiende cuenta como nada, no rompe", () => {
    for (const cuerpo of [null, undefined, "x", 5, [], { creados: "3" }, { creados: NaN }, { omitidos: "no" }]) {
      expect(leerRespuestaDeLote(cuerpo)).toEqual({ creados: 0, omitidos: [] })
    }
    expect(leerRespuestaDeLote({ creados: 1, omitidos: [null, 3, { name: "A" }] }).omitidos).toEqual([
      { fila: 3, name: "A", motivo: "" },
    ])
  })
})

describe("leerActualizados", () => {
  it("lee cuántos cambió el servidor, y lo que no se entiende es cero", () => {
    expect(leerActualizados({ actualizados: 7 })).toBe(7)
    expect(leerActualizados({ actualizados: 2.9 })).toBe(2)
    for (const cuerpo of [null, undefined, {}, { actualizados: "7" }, { actualizados: -3 }, { actualizados: NaN }, 7]) {
      expect(leerActualizados(cuerpo)).toBe(0)
    }
  })
})

describe("cuantosCaben", () => {
  it("lo que falta para el tope del negocio, sin pasar de cero", () => {
    expect(cuantosCaben(0)).toBe(MAX_SERVICIOS_POR_NEGOCIO)
    expect(cuantosCaben(290)).toBe(10)
    expect(cuantosCaben(MAX_SERVICIOS_POR_NEGOCIO + 5)).toBe(0)
  })
})

describe("conCategoriasUnificadas", () => {
  it("usa la categoría como ya está escrita en el negocio", () => {
    const lista = [{ category: "color" }, { category: "Barba" }, { category: null }]
    expect(conCategoriasUnificadas(lista, ["Color"])).toEqual([{ category: "Color" }, { category: "Barba" }, { category: null }])
  })

  it("entre las filas nuevas gana la primera escritura", () => {
    const lista = [{ category: "Tintes" }, { category: "tintes" }, { category: "TINTES " }]
    expect(conCategoriasUnificadas(lista, []).map((s) => s.category)).toEqual(["Tintes", "Tintes", "Tintes"])
  })
})

describe("leerYRevisarTexto", () => {
  const TEXTO = ["Nombre\tDuración\tPrecio\tCategoría", "Corte\t45\t15000\tcorte", "Tinte\t120\t$35.000\tColor", "Corte\t30\t\t", "X\t45", "Barba\tabc"].join("\n")

  it("cuenta listas y con problemas, con todas las filas leídas", () => {
    const lectura = leerYRevisarTexto(TEXTO, ["Tinte"], ["Corte"])
    expect(lectura.titulosReconocidos).toBe(true)
    expect(lectura.filas).toHaveLength(5)
    expect(lectura.listas).toBe(1)
    expect(lectura.conProblemas).toBe(4)
    expect(lectura.filas.filter((f) => f.error).map((f) => f.fila)).toEqual([3, 4, 5, 6])
  })

  it("marca el repetido del negocio y el repetido del archivo con su motivo", () => {
    const lectura = leerYRevisarTexto(TEXTO, ["Tinte"], ["Corte"])
    expect(lectura.filas.find((f) => f.fila === 3)?.error).toBe(MOTIVO_YA_EXISTE)
    expect(lectura.filas.find((f) => f.fila === 4)?.error).toMatch(/Repetido/)
  })

  it("deja la categoría escrita como la tiene el negocio", () => {
    const lectura = leerYRevisarTexto(TEXTO, [], ["Corte"])
    expect(lectura.servicios[0]).toMatchObject({ name: "Corte", category: "Corte", price: 15000 })
    expect(lectura.filas[0].servicio?.category).toBe("Corte")
  })

  it("un texto vacío no tiene filas", () => {
    expect(leerYRevisarTexto("   \n", [], [])).toMatchObject({ filas: [], listas: 0, conProblemas: 0, servicios: [] })
  })
})

describe("leerArchivoDeServicios", () => {
  const archivo = (bytes: number[] | string, tipo = "text/csv") => new Blob([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], { type: tipo })

  it("lee un CSV en UTF-8 sin el BOM", async () => {
    const lectura = await leerArchivoDeServicios(archivo("﻿Nombre;Duración\nMuñoz;45"))
    expect(lectura).toEqual({ ok: true, texto: "Nombre;Duración\nMuñoz;45" })
  })

  it("lee el que guardó Excel en Windows-1252 sin romper las tildes", async () => {
    const latin1 = [...Buffer.from("Nombre;Duración\nPeluquería;45", "latin1")]
    expect(latin1).toContain(0xf3)
    const lectura = await leerArchivoDeServicios(archivo(latin1))
    expect(lectura).toEqual({ ok: true, texto: "Nombre;Duración\nPeluquería;45" })
  })

  it("rechaza lo vacío, lo que pesa de más y lo que no es texto", async () => {
    expect(await leerArchivoDeServicios(archivo(""))).toEqual({ ok: false, motivo: "vacio" })
    expect(await leerArchivoDeServicios({ size: PESO_MAXIMO_DEL_ARCHIVO + 1 } as Blob)).toEqual({ ok: false, motivo: "grande" })
    expect(await leerArchivoDeServicios(archivo("a\0b"))).toEqual({ ok: false, motivo: "ilegible" })
  })

  it("avisa que un libro de Excel no se lee, en vez de mostrar basura", async () => {
    expect(await leerArchivoDeServicios(archivo([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toEqual({ ok: false, motivo: "excel" })
    expect(await leerArchivoDeServicios(archivo([0xd0, 0xcf, 0x11, 0xe0, 0xa1]))).toEqual({ ok: false, motivo: "excel" })
  })

  it("el tope es de 2 MB justos", async () => {
    expect(PESO_MAXIMO_DEL_ARCHIVO).toBe(2 * 1024 * 1024)
    expect(decodificarCsv(new Uint8Array([0x41]))).toBe("A")
  })
})

describe("plantillaDeServicios", () => {
  it("lleva los títulos y dos filas de ejemplo, y el lector las entiende todas", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "odontologia", null, "otro"]) {
      const csv = plantillaDeServicios(rubro)
      const lectura = leerServiciosDeTexto(csv)
      expect(lectura.titulosReconocidos).toBe(true)
      expect(lectura.filas).toHaveLength(2)
      expect(lectura.filas.every((f) => f.servicio && !f.error)).toBe(true)
    }
  })

  it("empieza con los títulos que reconoce el lector, en el formato de Excel (BOM y punto y coma)", () => {
    const csv = plantillaDeServicios("salon")
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv.split("\r\n")[0]).toBe(`﻿${TITULOS_DE_LA_PLANTILLA.join(";")}`)
  })

  it("los ejemplos son del rubro: una clínica dental no recibe un corte de pelo", () => {
    expect(plantillaDeServicios("odontologia")).not.toMatch(/pelo/i)
    expect(plantillaDeServicios("barberia")).toMatch(/Corte de pelo/)
  })
})

describe("filas de Agregar varios", () => {
  it("una fila sin nombre, precio ni categoría está en blanco (la duración no cuenta)", () => {
    expect(estaEnBlanco(fila())).toBe(true)
    expect(estaEnBlanco(fila({ duration: 120 }))).toBe(true)
    expect(estaEnBlanco(fila({ price: "100" }))).toBe(false)
    expect(estaEnBlanco(fila({ category: "x" }))).toBe(false)
    expect(estaEnBlanco(fila({ name: "  " }))).toBe(true)
  })

  it("empieza con las filas en blanco que se piden, cada una con su clave", () => {
    const filas = filasEnBlanco(5, clave)
    expect(filas).toHaveLength(5)
    expect(new Set(filas.map((f) => f.clave)).size).toBe(5)
  })
})

describe("repartirPegado", () => {
  const pegados = leerServiciosDeTexto("Corte\t45\t15000\tCorte\nTinte\t120\t35000\tColor\nBarba\t30").filas.map((f) => f.servicio!)

  it("escribe en las filas vacías a partir de la que se pegó", () => {
    const base = filasEnBlanco(5, clave)
    const { filas, recortados } = repartirPegado(base, 1, pegados, clave)
    expect(recortados).toBe(0)
    expect(filas).toHaveLength(5)
    expect(filas.map((f) => f.name)).toEqual(["", "Corte", "Tinte", "Barba", ""])
    expect(filas[2]).toMatchObject({ duration: 120, price: "35000", category: "Color" })
    // Las filas ocupadas conservan su clave: la tabla no reinicia lo que se estaba editando.
    expect(filas[1].clave).toBe(base[1].clave)
  })

  it("no pisa lo escrito: inserta filas nuevas y lo que había queda debajo", () => {
    const base = [fila({ name: "Mío" }), fila(), fila({ name: "Otro" })]
    const { filas } = repartirPegado(base, 0, pegados, clave)
    expect(filas.map((f) => f.name)).toEqual(["Corte", "Tinte", "Barba", "Mío", "", "Otro"])
    expect(filas[3].clave).toBe(base[0].clave)
  })

  it("la tabla no pasa del máximo de filas: lo que no entra se cuenta", () => {
    const base = filasEnBlanco(2, clave)
    const { filas, recortados } = repartirPegado(base, 0, pegados, clave, 2)
    expect(filas).toHaveLength(2)
    expect(recortados).toBe(1)
  })

  it("el precio vuelve a texto de forma que el lector lo entienda de nuevo", () => {
    const { filas } = repartirPegado([fila()], 0, [{ name: "Ab", duration: 30, price: 1234.5, category: null, description: "d" }], clave)
    expect(filas[0].price).toBe("1234,50")
    expect(filas[0].description).toBe("d")
    expect(revisarFilas(filas, [], []).servicios[0].price).toBe(1234.5)
  })
})

describe("leerPegadoDeLaTabla", () => {
  it("una planilla se lee con todas sus columnas", () => {
    const { servicios, sinLeer } = leerPegadoDeLaTabla("Corte\t45\t15000\tCorte\nTinte\t120\t35000\tColor")
    expect(servicios.map((s) => [s.name, s.duration, s.price, s.category])).toEqual([
      ["Corte", 45, 15000, "Corte"],
      ["Tinte", 120, 35000, "Color"],
    ])
    expect(sinLeer).toBe(0)
  })

  it("las líneas que no sirven se cuentan y no frenan a las demás", () => {
    expect(leerPegadoDeLaTabla("Corte\t45\nSin duración\t\nBarba\t30")).toMatchObject({ sinLeer: 1 })
  })

  it("una columna de nombres sola: cada línea es un nombre con la duración de siempre", () => {
    const { servicios, sinLeer } = leerPegadoDeLaTabla("Corte\r\nTinte, con lavado\n\n\nX\nBarba\n")
    expect(servicios.map((s) => [s.name, s.duration])).toEqual([
      ["Corte", 30],
      ["Tinte, con lavado", 30],
      ["Barba", 30],
    ])
    expect(sinLeer).toBe(1)
  })

  it("con separadores pero sin ninguna fila buena, no inventa nombres", () => {
    expect(leerPegadoDeLaTabla("Corte\tabc\nTinte\tabc")).toEqual({ servicios: [], sinLeer: 2 })
  })

  it("texto vacío, nada", () => {
    expect(leerPegadoDeLaTabla("  \n ")).toEqual({ servicios: [], sinLeer: 0 })
  })
})

describe("revisarFilas", () => {
  it("ignora las filas vacías y cuenta las que tienen algo", () => {
    const revision = revisarFilas([fila(), fila({ name: "Corte", price: "15.000", category: "Corte" }), fila()], [], [])
    expect(revision.conContenido).toBe(1)
    expect(revision.errores.size).toBe(0)
    expect(revision.servicios).toEqual([{ name: "Corte", duration: 30, price: 15000, category: "Corte", description: null }])
  })

  it("el precio y la categoría vacíos son null; el nombre se recorta", () => {
    const { servicios } = revisarFilas([fila({ name: "  Barba  " })], [], [])
    expect(servicios[0]).toMatchObject({ name: "Barba", price: null, category: null })
  })

  it("dice el primer problema de la fila, con las palabras del servidor, y no la deja pasar", () => {
    const sinNombre = fila({ price: "100" })
    const nombreCorto = fila({ name: "A" })
    const precioRaro = fila({ name: "Corte", price: "abc" })
    const precioNegativo = fila({ name: "Corte2", price: "-5" })
    const categoriaLarga = fila({ name: "Corte3", category: "x".repeat(41) })
    const duracionMala = fila({ name: "Corte4", duration: 10 })
    const revision = revisarFilas([sinNombre, nombreCorto, precioRaro, precioNegativo, categoriaLarga, duracionMala], [], [])
    expect(revision.servicios).toEqual([])
    expect(revision.errores.get(sinNombre.clave)).toMatch(/nombre/i)
    expect(revision.errores.get(nombreCorto.clave)).toMatch(/al menos 2/)
    expect(revision.errores.get(precioRaro.clave)).toMatch(/no se entiende/)
    expect(revision.errores.get(precioNegativo.clave)).toMatch(/negativo/i)
    expect(revision.errores.get(categoriaLarga.clave)).toMatch(/40/)
    expect(revision.errores.get(duracionMala.clave)).toMatch(/15 minutos/)
  })

  it("marca el que ya existe y el que se repite más abajo, sin tildes ni mayúsculas", () => {
    const existe = fila({ name: "Depilación" })
    const primera = fila({ name: "Corte de pelo" })
    const repetida = fila({ name: "  CORTE  de pelo" })
    const revision = revisarFilas([existe, primera, repetida], ["depilacion"], [])
    expect(revision.errores.get(existe.clave)).toBe(MOTIVO_YA_EXISTE)
    expect(revision.errores.get(repetida.clave)).toBe(MOTIVO_REPETIDO_EN_EL_LOTE)
    expect(revision.errores.has(primera.clave)).toBe(false)
    expect(revision.servicios.map((s) => s.name)).toEqual(["Corte de pelo"])
  })

  it("unifica la categoría con la que ya tiene el negocio", () => {
    const { servicios } = revisarFilas([fila({ name: "Tinte", category: "color" })], [], ["Color"])
    expect(servicios[0].category).toBe("Color")
  })
})

describe("sugeridos", () => {
  const sug = (clave: string, name: string, category: string, yaExiste = false): SugeridoDelRubro => ({
    clave,
    name,
    category,
    duration: 45,
    price: 10000,
    yaExiste,
  })
  const LISTA = [
    sug("corte", "Corte de pelo", "Corte"),
    sug("flequillo", "Corte de flequillo", "Corte", true),
    sug("tinte", "Tintura completa", "Color"),
    sug("depi", "Depilación", "Cera"),
  ]

  it("agrupa por categoría, en el orden en que llegan", () => {
    const vista = vistaDeSugeridos(LISTA, "", [])
    expect(vista.grupos.map((g) => [g.categoria, g.servicios.map((s) => s.clave)])).toEqual([
      ["Corte", ["corte", "flequillo"]],
      ["Color", ["tinte"]],
      ["Cera", ["depi"]],
    ])
    expect(vista.visibles).toBe(4)
  })

  it("los marcables no incluyen los que el negocio ya tiene", () => {
    expect(vistaDeSugeridos(LISTA, "", []).marcables).toEqual(["corte", "tinte", "depi"])
  })

  it("también cuenta como ya tenido lo que se agregó después de pedir la lista", () => {
    const vista = vistaDeSugeridos(LISTA, "", ["TINTURA  completa"])
    expect(vista.marcables).toEqual(["corte", "depi"])
    expect(vista.grupos[1].servicios[0].yaLoTiene).toBe(true)
  })

  it("el buscador mira nombre y categoría, sin tildes ni mayúsculas", () => {
    expect(vistaDeSugeridos(LISTA, "DEPILACION", []).grupos.map((g) => g.categoria)).toEqual(["Cera"])
    expect(vistaDeSugeridos(LISTA, "cera", []).visibles).toBe(1)
    expect(vistaDeSugeridos(LISTA, "corte flequillo", []).visibles).toBe(1)
    expect(vistaDeSugeridos(LISTA, "zzz", []).grupos).toEqual([])
  })

  it("sugeridosParaCargar manda lo marcado tal cual, sin descripción, y deja afuera lo que ya existe", () => {
    const cargar = sugeridosParaCargar(LISTA, new Set(["corte", "flequillo", "tinte", "inexistente"]), ["Tintura Completa"], [])
    expect(cargar).toEqual([{ name: "Corte de pelo", duration: 45, price: 10000, category: "Corte", description: null }])
  })

  it("la categoría del sugerido se escribe como ya la tiene el negocio", () => {
    const cargar = sugeridosParaCargar(LISTA, new Set(["tinte"]), [], ["color"])
    expect(cargar[0].category).toBe("color")
  })
})
