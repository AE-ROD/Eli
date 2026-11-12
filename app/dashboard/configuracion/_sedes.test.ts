import { describe, expect, it } from "vitest"
import type { Sede } from "./_datos"
import {
  choquesConOtrasSedes,
  choquesDelCuerpo,
  cupoDeSedes,
  datosDeLaSede,
  diasConAtencion,
  diasDeLosChoques,
  diasParaGuardar,
  franjaNueva,
  horarioEnPalabras,
  huboCambios,
  mismoNombre,
  problemasDeLaSemana,
  revisarConversion,
  revisarSede,
  sedeDeLaRespuesta,
  sedesDeLaRespuesta,
  semanaFusionada,
  semanaParaEditar,
  textoDeChoque,
  textosDeChoquesDelServidor,
  SEDE_VACIA,
  SEMANA_DE_LUNES_A_DOMINGO,
  type DiaDeLaSemana,
} from "./_sedes"

const franja = (startTime: string, endTime: string) => ({ startTime, endTime })

const sede = (id: string, extra: Partial<Sede> = {}): Sede => ({
  id,
  nombre: `Sede ${id}`,
  direccion: "Av. Providencia 1234",
  comuna: "Providencia",
  telefono: null,
  orden: 0,
  activo: true,
  horarios: [],
  horasFuturas: 0,
  ...extra,
})

const semana = (dias: Record<number, [string, string][]>): DiaDeLaSemana[] =>
  semanaParaEditar(Object.entries(dias).map(([dia, franjas]) => ({ dayOfWeek: Number(dia), franjas: franjas.map(([a, b]) => franja(a, b)) })))

describe("revisarSede", () => {
  const completa = { nombre: "  Consulta Providencia ", direccion: " Av. Providencia 1234 ", comuna: " Providencia ", telefono: "" }

  it("recorta los textos y deja el teléfono vacío en null", () => {
    expect(revisarSede(completa)).toEqual({
      ok: true,
      cuerpo: { nombre: "Consulta Providencia", direccion: "Av. Providencia 1234", comuna: "Providencia", telefono: null },
    })
  })

  it("el teléfono se manda en E.164 aunque se escriba con espacios", () => {
    const revisada = revisarSede({ ...completa, telefono: "+56 9 1234 5678" })
    expect(revisada.ok && revisada.cuerpo.telefono).toBe("+56912345678")
  })

  it("un teléfono que no se puede leer es un error junto a su campo", () => {
    expect(revisarSede({ ...completa, telefono: "12" })).toEqual({
      ok: false,
      errores: { telefono: expect.stringContaining("No pudimos leer el teléfono") },
    })
  })

  it("nombre, dirección y comuna son obligatorios", () => {
    expect(revisarSede(SEDE_VACIA)).toEqual({
      ok: false,
      errores: {
        nombre: "Escribe el nombre de la sede",
        direccion: "Escribe la dirección de la sede",
        comuna: "Escribe la comuna",
      },
    })
    expect(revisarSede({ ...completa, nombre: "   " }).ok).toBe(false)
  })

  it("respeta los largos que exige la base (40, 200 y 80)", () => {
    const revisada = revisarSede({ ...completa, nombre: "a".repeat(41), direccion: "b".repeat(201), comuna: "c".repeat(81) })
    expect(revisada.ok).toBe(false)
    if (!revisada.ok) expect(Object.keys(revisada.errores).sort()).toEqual(["comuna", "direccion", "nombre"])
    expect(revisarSede({ ...completa, nombre: "a".repeat(40), direccion: "b".repeat(200), comuna: "c".repeat(80) }).ok).toBe(true)
  })

  it("el nombre no puede repetir el de otra sede, sin mirar mayúsculas ni tildes", () => {
    const otras = [sede("a", { nombre: "Maipú" }), sede("b", { nombre: "Consulta Providencia" })]
    expect(revisarSede({ ...completa, nombre: "consulta providencia" }, otras)).toEqual({
      ok: false,
      errores: { nombre: "Ya tienes una sede con ese nombre" },
    })
    expect(revisarSede({ ...completa, nombre: "MAIPU" }, otras).ok).toBe(false)
  })

  it("al editar, su propio nombre no cuenta como repetido", () => {
    const otras = [sede("b", { nombre: "Consulta Providencia" })]
    expect(revisarSede(completa, otras, "b").ok).toBe(true)
  })
})

describe("revisarConversion", () => {
  const una = { nombre: "Consulta Providencia", direccion: "Av. Providencia 1234", comuna: "Providencia", telefono: "" }
  const otra = { nombre: "Consulta Ñuñoa", direccion: "Irarrázaval 3000", comuna: "Ñuñoa", telefono: "" }

  it("las dos bien: los dos cuerpos", () => {
    const revisada = revisarConversion(una, otra)
    expect(revisada.ok && [revisada.principal.nombre, revisada.nueva.nombre]).toEqual(["Consulta Providencia", "Consulta Ñuñoa"])
  })

  it("el error de cada una queda en la suya", () => {
    const revisada = revisarConversion({ ...una, direccion: "" }, { ...otra, comuna: "" })
    expect(revisada).toEqual({
      ok: false,
      errores: { principal: { direccion: expect.any(String) }, nueva: { comuna: expect.any(String) } },
    })
  })

  it("las dos tienen que llamarse distinto", () => {
    const revisada = revisarConversion(una, { ...otra, nombre: "consulta providencia" })
    expect(revisada).toEqual({ ok: false, errores: { principal: {}, nueva: { nombre: "Elige un nombre distinto al de la otra sede" } } })
  })
})

describe("datosDeLaSede y mismoNombre", () => {
  it("el formulario de una sede guardada; sin teléfono, vacío", () => {
    expect(datosDeLaSede(sede("a", { telefono: "+56912345678" })).telefono).toBe("+56912345678")
    expect(datosDeLaSede(sede("a")).telefono).toBe("")
  })

  it("mismoNombre ignora mayúsculas, tildes y espacios de las puntas", () => {
    expect(mismoNombre(" Maipú ", "maipu")).toBe(true)
    expect(mismoNombre("Ñuñoa", "ñuñoa")).toBe(true)
    expect(mismoNombre("Centro", "Centro 2")).toBe(false)
  })
})

describe("cupoDeSedes", () => {
  it("cuenta sólo las activas contra el máximo de 5", () => {
    const sedes = [sede("a"), sede("b", { activo: false }), sede("c")]
    expect(cupoDeSedes(sedes)).toEqual({ activas: 2, maximo: 5, quedan: 3, hayCupo: true })
  })

  it("con 5 activas no queda cupo, aunque haya más desactivadas", () => {
    const sedes = [..."abcde"].map((id) => sede(id)).concat(sede("f", { activo: false }))
    expect(cupoDeSedes(sedes)).toEqual({ activas: 5, maximo: 5, quedan: 0, hayCupo: false })
  })

  it("sin sedes quedan las 5", () => {
    expect(cupoDeSedes([])).toEqual({ activas: 0, maximo: 5, quedan: 5, hayCupo: true })
  })
})

describe("horarioEnPalabras", () => {
  it("agrupa los días con las mismas franjas, como la página pública", () => {
    const conHorario = sede("a", {
      horarios: [
        { dayOfWeek: 1, franjas: [franja("09:00", "13:00")] },
        { dayOfWeek: 3, franjas: [franja("09:00", "13:00")] },
        { dayOfWeek: 5, franjas: [franja("09:00", "12:00"), franja("15:00", "19:00")] },
      ],
    })
    expect(horarioEnPalabras(conHorario)).toEqual(["Lun, Mié: 09:00–13:00", "Vie: 09:00–12:00 y 15:00–19:00"])
  })

  it("sin horario, nada; y una sede desactivada también dice el horario que dejó", () => {
    expect(horarioEnPalabras(sede("a"))).toEqual([])
    expect(horarioEnPalabras(sede("a", { activo: false, horarios: [{ dayOfWeek: 2, franjas: [franja("10:00", "14:00")] }] }))).toEqual(["Mar: 10:00–14:00"])
  })
})

describe("semanaParaEditar", () => {
  it("siempre los siete días de lunes a domingo; los que faltan, sin franjas", () => {
    const editable = semanaParaEditar([{ dayOfWeek: 6, franjas: [franja("10:00", "14:00")] }])
    expect(editable.map((dia) => dia.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(editable.map((dia) => dia.franjas.length)).toEqual([0, 0, 0, 0, 0, 1, 0])
  })

  it("ordena las franjas de un día por hora de inicio y no toca lo guardado", () => {
    const guardado = [{ dayOfWeek: 1, franjas: [franja("15:00", "19:00"), franja("09:00", "13:00")] }]
    const editable = semanaParaEditar(guardado)
    expect(editable[0].franjas).toEqual([franja("09:00", "13:00"), franja("15:00", "19:00")])
    editable[0].franjas[0].startTime = "08:00"
    expect(guardado[0].franjas[1]).toEqual(franja("09:00", "13:00"))
  })
})

describe("franjaNueva", () => {
  it("la primera de un día es de 09:00 a 18:00", () => {
    expect(franjaNueva([])).toEqual({ startTime: "09:00", endTime: "18:00" })
  })

  it("la siguiente empieza una hora después de que termina la última, por tres horas", () => {
    expect(franjaNueva([franja("09:00", "13:00")])).toEqual({ startTime: "14:00", endTime: "17:00" })
    expect(franjaNueva([franja("15:00", "19:00"), franja("09:00", "13:00")])).toEqual({ startTime: "20:00", endTime: "23:00" })
  })

  it("no pasa de las 23:55", () => {
    expect(franjaNueva([franja("09:00", "21:30")])).toEqual({ startTime: "22:30", endTime: "23:55" })
  })

  it("un día acepta como mucho 4 franjas (lo que acepta el servidor): con 4, ya no se agrega otra", () => {
    const cuatro = [franja("06:00", "07:00"), franja("08:00", "09:00"), franja("10:00", "11:00"), franja("12:00", "13:00")]
    expect(franjaNueva(cuatro.slice(0, 3))).toEqual({ startTime: "14:00", endTime: "17:00" })
    expect(franjaNueva(cuatro)).toBeNull()
  })

  it("si ya no queda lugar en el día, null", () => {
    expect(franjaNueva([franja("09:00", "22:30")])).toBeNull()
    expect(franjaNueva([franja("00:00", "23:55")])).toBeNull()
  })

  it("las franjas al revés no cuentan para saber dónde termina el día", () => {
    expect(franjaNueva([franja("13:00", "09:00")])).toEqual({ startTime: "09:00", endTime: "18:00" })
  })
})

describe("problemasDeLaSemana, semanaFusionada y diasParaGuardar", () => {
  it("una franja que termina antes o justo cuando empieza es un problema, con su día y su lugar", () => {
    const con = semana({ 1: [["09:00", "13:00"], ["16:00", "15:00"]], 3: [["10:00", "10:00"]] })
    expect(problemasDeLaSemana(con)).toEqual([
      { dayOfWeek: 1, indice: 1, mensaje: expect.stringContaining("después de la de inicio") },
      { dayOfWeek: 3, indice: 0, mensaje: expect.stringContaining("después de la de inicio") },
    ])
  })

  it("una semana bien escrita no tiene problemas, aunque las franjas se pisen (se fusionan)", () => {
    expect(problemasDeLaSemana(semana({ 1: [["09:00", "13:00"], ["12:00", "15:00"]] }))).toEqual([])
  })

  it("fusiona las franjas que se pisan o se tocan: 09–12 y 12–15 son 09–15", () => {
    const fusionada = semanaFusionada(semana({ 1: [["09:00", "12:00"], ["12:00", "15:00"], ["17:00", "19:00"]] }))
    expect(fusionada[0].franjas).toEqual([franja("09:00", "15:00"), franja("17:00", "19:00")])
  })

  it("se guardan sólo los días con atención", () => {
    const dias = diasParaGuardar(semana({ 1: [["09:00", "13:00"]], 6: [["10:00", "14:00"]] }))
    expect(dias).toEqual([
      { dayOfWeek: 1, franjas: [franja("09:00", "13:00")] },
      { dayOfWeek: 6, franjas: [franja("10:00", "14:00")] },
    ])
    expect(diasParaGuardar(semana({}))).toEqual([])
  })

  it("cuenta los días con atención", () => {
    expect(diasConAtencion(semana({ 1: [["09:00", "13:00"]], 2: [["09:00", "13:00"]] }))).toBe(2)
    expect(diasConAtencion(semana({}))).toBe(0)
  })
})

describe("huboCambios", () => {
  const guardada = semana({ 1: [["09:00", "13:00"], ["15:00", "19:00"]] })

  it("igual a lo guardado: sin cambios, también si las franjas se escribieron en otro orden", () => {
    expect(huboCambios(guardada, semana({ 1: [["15:00", "19:00"], ["09:00", "13:00"]] }))).toBe(false)
    expect(huboCambios(guardada, semanaParaEditar([]))).toBe(true)
  })

  it("cualquier hora, franja o día distinto es un cambio, también una franja a medio escribir", () => {
    expect(huboCambios(guardada, semana({ 1: [["09:00", "13:00"], ["15:00", "20:00"]] }))).toBe(true)
    expect(huboCambios(guardada, semana({ 1: [["09:00", "13:00"], ["15:00", "19:00"]], 2: [["09:00", "10:00"]] }))).toBe(true)
    expect(huboCambios(guardada, semana({ 1: [["09:00", "13:00"], ["15:00", "14:00"]] }))).toBe(true)
  })
})

describe("choquesConOtrasSedes", () => {
  const providencia = sede("prov", {
    nombre: "Providencia",
    horarios: [
      { dayOfWeek: 1, franjas: [franja("09:00", "13:00")] },
      { dayOfWeek: 2, franjas: [franja("09:00", "13:00")] },
    ],
  })
  const nunoa = sede("nun", { nombre: "Ñuñoa" })

  it("una franja que se pisa con la de otra sede activa el mismo día es un choque, con el nombre de la otra", () => {
    const choques = choquesConOtrasSedes("nun", semana({ 1: [["12:00", "15:00"]] }), [providencia, nunoa])
    expect(choques).toEqual([
      { dayOfWeek: 1, conSede: "Providencia", estaFranja: franja("12:00", "15:00"), suFranja: franja("09:00", "13:00") },
    ])
  })

  it("tocarse no es chocar, y otro día tampoco", () => {
    expect(choquesConOtrasSedes("nun", semana({ 1: [["13:00", "17:00"]], 3: [["09:00", "13:00"]] }), [providencia, nunoa])).toEqual([])
  })

  it("una sede desactivada no cuenta como la otra", () => {
    const apagada = { ...providencia, activo: false }
    expect(choquesConOtrasSedes("nun", semana({ 1: [["09:00", "13:00"]] }), [apagada, nunoa])).toEqual([])
  })

  it("la sede que se edita cuenta aunque esté desactivada: se ve el choque antes de reactivarla", () => {
    const apagada = { ...nunoa, activo: false }
    expect(choquesConOtrasSedes("nun", semana({ 1: [["10:00", "11:00"]] }), [providencia, apagada])).toHaveLength(1)
  })

  it("lo que ya está guardado de la propia sede no se compara con lo que se edita", () => {
    const conHorario = { ...nunoa, horarios: [{ dayOfWeek: 1, franjas: [franja("09:00", "13:00")] }] }
    expect(choquesConOtrasSedes("nun", semana({ 1: [["10:00", "11:00"]] }), [conHorario])).toEqual([])
  })

  it("dos franjas propias que se pisan se fusionan antes: un solo choque, no dos", () => {
    const choques = choquesConOtrasSedes("nun", semana({ 1: [["12:00", "14:00"], ["13:30", "16:00"]] }), [providencia, nunoa])
    expect(choques).toHaveLength(1)
    expect(choques[0].estaFranja).toEqual(franja("12:00", "16:00"))
  })

  it("salen de lunes a domingo (el domingo al final) y por hora", () => {
    const todos = sede("prov2", {
      nombre: "Centro",
      horarios: [
        { dayOfWeek: 0, franjas: [franja("09:00", "13:00")] },
        { dayOfWeek: 1, franjas: [franja("09:00", "13:00")] },
        { dayOfWeek: 6, franjas: [franja("09:00", "13:00")] },
      ],
    })
    const choques = choquesConOtrasSedes("nun", semana({ 0: [["10:00", "11:00"]], 1: [["10:00", "11:00"]], 6: [["10:00", "11:00"]] }), [todos, nunoa])
    expect(choques.map((choque) => choque.dayOfWeek)).toEqual([1, 6, 0])
  })

  it("las franjas al revés (sin medir) no producen choques", () => {
    expect(choquesConOtrasSedes("nun", semana({ 1: [["14:00", "10:00"]] }), [providencia, nunoa])).toEqual([])
  })

  it("lo dice en palabras: día, las dos franjas y la otra sede", () => {
    const [choque] = choquesConOtrasSedes("nun", semana({ 1: [["12:00", "15:00"]] }), [providencia, nunoa])
    expect(textoDeChoque(choque)).toBe("Lunes: 12:00–15:00 se pisa con 09:00–13:00 de «Providencia»")
  })

  it("los días de los choques, sin repetir y de lunes a domingo", () => {
    expect(diasDeLosChoques([{ dayOfWeek: 0 }, { dayOfWeek: 1 }, { dayOfWeek: 1 }, { dayOfWeek: 6 }])).toEqual(["Lunes", "Sábado", "Domingo"])
    expect(diasDeLosChoques([])).toEqual([])
  })
})

describe("choques que dice el servidor", () => {
  it("se leen del cuerpo del 409; lo que no se entiende se descarta", () => {
    expect(
      choquesDelCuerpo({
        error: "Se pisa",
        choques: [{ dayOfWeek: 1, conSede: "Providencia" }, { dayOfWeek: 9, conSede: "x" }, "mal", { dayOfWeek: 3 }],
      })
    ).toEqual([
      { dayOfWeek: 1, conSede: "Providencia" },
      { dayOfWeek: 3, conSede: "" },
    ])
    expect(choquesDelCuerpo(null)).toEqual([])
    expect(choquesDelCuerpo({ error: "x" })).toEqual([])
  })

  it("se dicen con el nombre de la sede, venga como id o como nombre", () => {
    const sedes = [sede("abc", { nombre: "Providencia" })]
    expect(
      textosDeChoquesDelServidor(
        [{ dayOfWeek: 1, conSede: "abc" }, { dayOfWeek: 0, conSede: "Las Condes" }],
        sedes
      )
    ).toEqual(["Lunes: con «Providencia»", "Domingo: con «Las Condes»"])
  })
})

describe("sedeDeLaRespuesta y sedesDeLaRespuesta", () => {
  const cruda = {
    id: "s1",
    nombre: "Providencia",
    direccion: "Av. Providencia 1234",
    comuna: "Providencia",
    telefono: "+56912345678",
    orden: 2,
    activo: true,
    horarios: [{ dayOfWeek: 1, franjas: [{ start: "09:00", end: "13:00" }] }],
    horasFuturas: 4,
  }

  it("lee el contrato: las franjas {start, end} pasan a {startTime, endTime}", () => {
    expect(sedeDeLaRespuesta(cruda)).toEqual({
      ...cruda,
      horarios: [{ dayOfWeek: 1, franjas: [franja("09:00", "13:00")] }],
    })
  })

  it("también lee las franjas con el nombre de lib/horario-dia", () => {
    const sede = sedeDeLaRespuesta({ ...cruda, horarios: [{ dayOfWeek: 2, franjas: [{ startTime: "10:00", endTime: "11:00" }] }] })
    expect(sede?.horarios).toEqual([{ dayOfWeek: 2, franjas: [franja("10:00", "11:00")] }])
  })

  it("sin teléfono es null, sin horarios es una lista vacía, y lo malformado se descarta", () => {
    const sede = sedeDeLaRespuesta({
      id: "s2",
      nombre: "Ñuñoa",
      telefono: "",
      horarios: [{ dayOfWeek: 9, franjas: [] }, { dayOfWeek: 1, franjas: [{ start: "9:00", end: "13:00" }] }, "x"],
      horasFuturas: -2,
    })
    expect(sede).toMatchObject({ telefono: null, horarios: [], horasFuturas: 0, activo: true, direccion: "", orden: 0 })
  })

  it("sin id o sin nombre no es una sede", () => {
    expect(sedeDeLaRespuesta({ nombre: "x" })).toBeNull()
    expect(sedeDeLaRespuesta({ id: "x" })).toBeNull()
    expect(sedeDeLaRespuesta(null)).toBeNull()
    expect(sedeDeLaRespuesta("sede")).toBeNull()
  })

  it("una lista se ordena por orden y nombre; si trae una sede a medias o no es una lista, null", () => {
    expect(sedesDeLaRespuesta([{ ...cruda, id: "b", orden: 1 }, { ...cruda, id: "a", orden: 0 }])?.map((s) => s.id)).toEqual(["a", "b"])
    expect(sedesDeLaRespuesta([cruda, { nombre: "sin id" }])).toBeNull()
    expect(sedesDeLaRespuesta({ sedes: [] })).toBeNull()
    expect(sedesDeLaRespuesta([])).toEqual([])
  })
})

describe("la semana", () => {
  it("empieza el lunes y termina el domingo", () => {
    expect([...SEMANA_DE_LUNES_A_DOMINGO]).toEqual([1, 2, 3, 4, 5, 6, 0])
  })
})
