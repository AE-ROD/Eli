import { describe, it, expect } from "vitest"
import { coincideConWhere } from "@/pruebas/where-simple"
import {
  HOLGURA_ENTRE_SEDES_MIN,
  MAX_SEDES,
  WHERE_HORARIO_VIGENTE,
  choquesEntreSedes,
  direccionDeLaCita,
  filasDeLaSede,
  modoDeSedes,
  ordenarSedes,
  resumenDeHorarioPorSede,
  sedeParaReservar,
  whereDelHorarioDeLaSede,
  type FranjaDeSede,
  type SedeDelNegocio,
} from "./sedes"

const LUNES = 1
const MARTES = 2
const MIERCOLES = 3
const JUEVES = 4
const VIERNES = 5
const SABADO = 6
const DOMINGO = 0

const sede = (id: string, extra: Partial<SedeDelNegocio> = {}): SedeDelNegocio => ({
  id,
  nombre: `Sede ${id}`,
  direccion: `Calle ${id} 123`,
  comuna: "Providencia",
  telefono: null,
  orden: 0,
  activo: true,
  ...extra,
})

describe("constantes", () => {
  it("hasta 5 sedes, y 0 minutos de holgura entre sedes (tocarse está permitido)", () => {
    expect(MAX_SEDES).toBe(5)
    expect(HOLGURA_ENTRE_SEDES_MIN).toBe(0)
  })
})

describe("modoDeSedes", () => {
  const activas = (n: number) => Array.from({ length: n }, (_, i) => sede(`s${i}`))

  it.each([
    // [plan, sedes activas, modo]
    ["independiente", 0, "una"], // sede implícita: la dirección del negocio
    ["independiente", 1, "una"], // una sola sede: como hoy
    ["independiente", 2, "varias"],
    ["independiente", 5, "varias"],
    ["equipo", 0, "una"],
    ["equipo", 1, "una"],
    ["equipo", 3, "una"], // imposible en la base; falla cerrado
    ["premium", 3, "una"], // un plan que no se conoce
    ["", 3, "una"],
    [null, 3, "una"],
    [undefined, 3, "una"],
  ] as const)("plan %s con %i sedes activas: %s", (plan, cuantas, modo) => {
    expect(modoDeSedes(plan, activas(cuantas))).toBe(modo)
  })

  it("las sedes inactivas no cuentan, aunque lleguen en la lista", () => {
    expect(modoDeSedes("independiente", [sede("a"), sede("b", { activo: false })])).toBe("una")
    expect(modoDeSedes("independiente", [sede("a"), sede("b", { activo: false }), sede("c")])).toBe("varias")
  })

  it("una sede sin el dato de activa no cuenta (falla cerrado)", () => {
    expect(modoDeSedes("independiente", [{ activo: true }, {} as { activo: boolean }])).toBe("una")
  })
})

describe("ordenarSedes", () => {
  it("por orden, y a igual orden por nombre sin distinguir mayúsculas ni tildes", () => {
    const sedes = [
      sede("c", { nombre: "Ñuñoa", orden: 1 }),
      sede("b", { nombre: "centro", orden: 0 }),
      sede("a", { nombre: "Zona Sur", orden: 0 }),
      sede("d", { nombre: "Árbol", orden: 0 }),
    ]
    expect(ordenarSedes(sedes).map((s) => s.id)).toEqual(["d", "b", "a", "c"])
  })

  it("es estable: lo que empata en orden y nombre queda como venía", () => {
    const sedes = [sede("x", { nombre: "Centro" }), sede("y", { nombre: "centro" }), sede("z", { nombre: "CENTRO" })]
    expect(ordenarSedes(sedes).map((s) => s.id)).toEqual(["x", "y", "z"])
  })

  it("no toca el arreglo que recibe, y una lista vacía sale vacía", () => {
    const sedes = [sede("b", { orden: 2 }), sede("a", { orden: 1 })]
    ordenarSedes(sedes)
    expect(sedes.map((s) => s.id)).toEqual(["b", "a"])
    expect(ordenarSedes([])).toEqual([])
  })
})

describe("filasDeLaSede", () => {
  const filas = [
    { id: "1", sedeId: "s1" },
    { id: "2", sedeId: null },
    { id: "3", sedeId: "s2" },
    { id: "4" },
    { id: "5", sedeId: "s1" },
  ]

  it("las de la sede pedida, en su orden", () => {
    expect(filasDeLaSede(filas, "s1").map((f) => f.id)).toEqual(["1", "5"])
    expect(filasDeLaSede(filas, "s2").map((f) => f.id)).toEqual(["3"])
  })

  it("con null, las que no tienen sede (también las que no traen el campo)", () => {
    expect(filasDeLaSede(filas, null).map((f) => f.id)).toEqual(["2", "4"])
  })

  it("una sede que no tiene filas, o una lista vacía, no da nada", () => {
    expect(filasDeLaSede(filas, "s9")).toEqual([])
    expect(filasDeLaSede([], "s1")).toEqual([])
  })
})

describe("choquesEntreSedes", () => {
  const franja = (sedeId: string, dayOfWeek: number, startTime: string, endTime: string, extra: Partial<FranjaDeSede> = {}): FranjaDeSede => ({
    sedeId,
    dayOfWeek,
    startTime,
    endTime,
    ...extra,
  })

  it("una sola sede, o ninguna franja: nada se pisa (como hoy)", () => {
    expect(choquesEntreSedes([])).toEqual([])
    expect(choquesEntreSedes([franja("a", LUNES, "09:00", "13:00")])).toEqual([])
    // Dos franjas de la misma sede no se comparan, ni siquiera si se pisan.
    expect(choquesEntreSedes([franja("a", LUNES, "09:00", "13:00"), franja("a", LUNES, "12:00", "15:00")])).toEqual([])
  })

  it.each([
    // [descripción, franja de A, franja de B, ¿se pisan?]
    ["tocarse (una termina cuando la otra empieza) está permitido", ["09:00", "13:00"], ["13:00", "18:00"], false],
    ["tocarse al revés también", ["13:00", "18:00"], ["09:00", "13:00"], false],
    ["un minuto de superposición ya es pisarse", ["09:00", "13:01"], ["13:00", "18:00"], true],
    ["una dentro de la otra", ["09:00", "18:00"], ["11:00", "12:00"], true],
    ["la misma franja", ["09:00", "13:00"], ["09:00", "13:00"], true],
    ["separadas", ["09:00", "12:00"], ["14:00", "18:00"], false],
    ["se pisan a medias", ["09:00", "13:00"], ["12:00", "16:00"], true],
    ["horas sin cero a la izquierda se miden como horas, no como texto", ["9:00", "10:00"], ["10:00", "11:00"], false],
    ["lo mismo con superposición", ["9:00", "10:30"], ["10:00", "11:00"], true],
  ] as const)("el mismo día, sedes distintas: %s", (_descripcion, [inicioA, finA], [inicioB, finB], seIPisan) => {
    const a = franja("a", LUNES, inicioA, finA)
    const b = franja("b", LUNES, inicioB, finB)
    expect(choquesEntreSedes([a, b])).toEqual(seIPisan ? [{ dayOfWeek: LUNES, a, b }] : [])
    expect(choquesEntreSedes([b, a])).toHaveLength(seIPisan ? 1 : 0)
  })

  it("días distintos no se pisan aunque las horas coincidan", () => {
    expect(choquesEntreSedes([franja("a", LUNES, "09:00", "13:00"), franja("b", MARTES, "09:00", "13:00")])).toEqual([])
  })

  it("las franjas que no están vigentes (inactivas o de una sede inactiva) se ignoran", () => {
    const vigente = franja("a", LUNES, "09:00", "13:00")
    expect(choquesEntreSedes([vigente, franja("b", LUNES, "10:00", "14:00", { vigente: false })])).toEqual([])
    expect(choquesEntreSedes([franja("b", LUNES, "10:00", "14:00", { vigente: false }), vigente])).toEqual([])
    // Con `vigente: true` o sin el dato, cuenta.
    expect(choquesEntreSedes([vigente, franja("b", LUNES, "10:00", "14:00", { vigente: true })])).toHaveLength(1)
  })

  it("las franjas que no se pueden medir se ignoran", () => {
    const buena = franja("a", LUNES, "09:00", "13:00")
    expect(choquesEntreSedes([buena, franja("b", LUNES, "18:00", "09:00")])).toEqual([])
    expect(choquesEntreSedes([buena, franja("b", LUNES, "10:00", "10:00")])).toEqual([])
    expect(choquesEntreSedes([buena, franja("b", LUNES, "mañana", "tarde")])).toEqual([])
  })

  it("con tres sedes, todos los pares que se pisan, en el orden de las franjas, y conservan sus otros campos", () => {
    const a = { ...franja("a", VIERNES, "09:00", "13:00"), id: "fa" }
    const b = { ...franja("b", VIERNES, "12:00", "16:00"), id: "fb" }
    const c = { ...franja("c", VIERNES, "15:00", "19:00"), id: "fc" }
    const d = { ...franja("c", LUNES, "09:00", "19:00"), id: "fd" }

    const choques = choquesEntreSedes([a, b, c, d])

    expect(choques).toEqual([
      { dayOfWeek: VIERNES, a, b },
      { dayOfWeek: VIERNES, a: b, b: c },
    ])
    expect(choques[0].a.id).toBe("fa")
  })
})

describe("sedeParaReservar", () => {
  const centro = sede("centro")
  const norte = sede("norte")
  const cerrada = sede("cerrada", { activo: false })

  it.each([
    // [descripción, sedes del negocio, elegida, id esperado (null = nada)]
    ["negocio sin sedes: sin sede", [], undefined, null],
    ["negocio sin sedes: el id que llegue se ignora", [], "centro", null],
    ["una sola sede activa y sin elegir: ella", [centro], undefined, "centro"],
    ["una sola sede activa, sin elegir (null)", [centro], null, "centro"],
    ["una sola sede activa, sin elegir (texto vacío)", [centro], "", "centro"],
    ["una sola sede activa y la elige", [centro], "centro", "centro"],
    ["una sola sede activa y llega otro id: se rechaza", [centro], "otra", null],
    ["dos sedes activas y no elige: hay que elegir", [centro, norte], undefined, null],
    ["dos sedes activas y elige una", [centro, norte], "norte", "norte"],
    ["dos sedes activas y elige un id que no es del negocio", [centro, norte], "sede-de-otro-negocio", null],
    ["una inactiva no se puede elegir", [centro, norte, cerrada], "cerrada", null],
    ["las inactivas no cuentan: con una activa y una inactiva, la activa", [centro, cerrada], undefined, "centro"],
    ["con una activa y una inactiva, elegir la inactiva se rechaza", [centro, cerrada], "cerrada", null],
    ["sólo inactivas: sin sede", [cerrada], undefined, null],
    ["sólo inactivas: elegirla no sirve", [cerrada], "cerrada", null],
  ] as const)("%s", (_descripcion, sedes, elegida, esperada) => {
    expect(sedeParaReservar(sedes, elegida)?.id ?? null).toBe(esperada)
  })

  it("devuelve la sede entera, con lo que traiga", () => {
    expect(sedeParaReservar([centro, norte], "norte")).toBe(norte)
  })

  it("un id que no es texto no vale", () => {
    expect(sedeParaReservar([centro, norte], 7 as unknown as string)).toBeNull()
    expect(sedeParaReservar([centro, norte], { id: "norte" } as unknown as string)).toBeNull()
  })
})

describe("direccionDeLaCita", () => {
  const negocio = { address: "Av. Siempre Viva 742", comuna: "Ñuñoa" }

  it("con sede: la de la sede, con su nombre", () => {
    expect(direccionDeLaCita({ sede: sede("centro", { nombre: "Centro", direccion: "Huérfanos 1", comuna: "Santiago" }), negocio })).toEqual({
      nombre: "Centro",
      direccion: "Huérfanos 1",
      comuna: "Santiago",
    })
  })

  it("sin sede (null o undefined): la dirección del negocio, sin nombre", () => {
    expect(direccionDeLaCita({ sede: null, negocio })).toEqual({ direccion: "Av. Siempre Viva 742", comuna: "Ñuñoa" })
    expect(direccionDeLaCita({ sede: undefined, negocio })).toEqual({ direccion: "Av. Siempre Viva 742", comuna: "Ñuñoa" })
    expect(Object.keys(direccionDeLaCita({ sede: null, negocio }))).not.toContain("nombre")
  })

  it("el negocio sin dirección da null, y los textos salen recortados (un texto vacío es null)", () => {
    expect(direccionDeLaCita({ sede: null, negocio: { address: null, comuna: null } })).toEqual({ direccion: null, comuna: null })
    expect(direccionDeLaCita({ sede: null, negocio: {} })).toEqual({ direccion: null, comuna: null })
    expect(direccionDeLaCita({ sede: null, negocio: { address: "  Calle 1  ", comuna: "   " } })).toEqual({ direccion: "Calle 1", comuna: null })
  })

  it("con sede no se mezcla nada del negocio", () => {
    const lugar = direccionDeLaCita({ sede: sede("a", { direccion: "Calle A", comuna: "Maipú" }), negocio: { address: null, comuna: null } })
    expect(lugar).toEqual({ nombre: "Sede a", direccion: "Calle A", comuna: "Maipú" })
  })

  it("una sede desactivada sigue sirviendo a las citas que ya tenía", () => {
    const lugar = direccionDeLaCita({ sede: sede("vieja", { activo: false, direccion: "Calle Vieja 1" }), negocio })
    expect(lugar.direccion).toBe("Calle Vieja 1")
  })
})

describe("resumenDeHorarioPorSede", () => {
  const fila = (sedeId: string | null, dayOfWeek: number, startTime: string, endTime: string, extra: { active?: boolean } = {}) => ({
    sedeId,
    dayOfWeek,
    startTime,
    endTime,
    ...extra,
  })
  const centro = sede("centro", { nombre: "Centro", orden: 0 })
  const norte = sede("norte", { nombre: "Norte", orden: 1 })

  it("los días de lunes a domingo y los que comparten franjas, agrupados: 'Lun, Mié: 09:00–13:00'", () => {
    const [resumen] = resumenDeHorarioPorSede(
      [centro],
      [
        fila("centro", MIERCOLES, "09:00", "13:00"),
        fila("centro", DOMINGO, "10:00", "12:00"),
        fila("centro", LUNES, "09:00", "13:00"),
        fila("centro", VIERNES, "09:00", "13:00"),
        fila("centro", VIERNES, "15:00", "19:00"),
      ]
    )

    expect(resumen.sede).toBe(centro)
    expect(resumen.dias).toEqual([
      { dayOfWeek: LUNES, franjas: [{ startTime: "09:00", endTime: "13:00" }] },
      { dayOfWeek: MIERCOLES, franjas: [{ startTime: "09:00", endTime: "13:00" }] },
      {
        dayOfWeek: VIERNES,
        franjas: [
          { startTime: "09:00", endTime: "13:00" },
          { startTime: "15:00", endTime: "19:00" },
        ],
      },
      { dayOfWeek: DOMINGO, franjas: [{ startTime: "10:00", endTime: "12:00" }] },
    ])
    expect(resumen.grupos.map((g) => g.texto)).toEqual([
      "Lun, Mié: 09:00–13:00",
      "Vie: 09:00–13:00 y 15:00–19:00",
      "Dom: 10:00–12:00",
    ])
    expect(resumen.grupos.map((g) => g.dias)).toEqual([[LUNES, MIERCOLES], [VIERNES], [DOMINGO]])
  })

  it("fusiona las franjas contiguas o que se pisan el mismo día, y las deja ordenadas", () => {
    const [resumen] = resumenDeHorarioPorSede(
      [centro],
      [
        fila("centro", MARTES, "12:00", "15:00"),
        fila("centro", MARTES, "09:00", "12:00"),
        fila("centro", MARTES, "14:00", "16:00"),
        fila("centro", MARTES, "18:00", "20:00"),
      ]
    )

    expect(resumen.dias).toEqual([
      {
        dayOfWeek: MARTES,
        franjas: [
          { startTime: "09:00", endTime: "16:00" },
          { startTime: "18:00", endTime: "20:00" },
        ],
      },
    ])
    expect(resumen.grupos.map((g) => g.texto)).toEqual(["Mar: 09:00–16:00 y 18:00–20:00"])
  })

  it("tres franjas se enumeran 'a, b y c'", () => {
    const [resumen] = resumenDeHorarioPorSede(
      [centro],
      [fila("centro", SABADO, "08:00", "09:00"), fila("centro", SABADO, "10:00", "11:00"), fila("centro", SABADO, "12:00", "13:00")]
    )
    expect(resumen.grupos[0].texto).toBe("Sáb: 08:00–09:00, 10:00–11:00 y 12:00–13:00")
  })

  it("dos sedes, en el orden de la lista; cada una con sus filas y nada de la otra", () => {
    const resumen = resumenDeHorarioPorSede(
      [norte, centro],
      [
        fila("norte", JUEVES, "14:00", "20:00"),
        fila("centro", LUNES, "09:00", "13:00"),
        fila("centro", MARTES, "09:00", "13:00"),
      ]
    )

    expect(resumen.map((r) => r.sede.id)).toEqual(["centro", "norte"])
    expect(resumen[0].grupos.map((g) => g.texto)).toEqual(["Lun, Mar: 09:00–13:00"])
    expect(resumen[1].grupos.map((g) => g.texto)).toEqual(["Jue: 14:00–20:00"])
  })

  it("las sedes inactivas no salen, ni las filas sin sede, de otra sede o inactivas", () => {
    const cerrada = sede("cerrada", { nombre: "Cerrada", activo: false })
    const resumen = resumenDeHorarioPorSede(
      [centro, cerrada],
      [
        fila("centro", LUNES, "09:00", "13:00"),
        fila("centro", MARTES, "09:00", "13:00", { active: false }),
        fila(null, MIERCOLES, "09:00", "13:00"),
        fila("cerrada", JUEVES, "09:00", "13:00"),
        fila("sede-de-otro-negocio", VIERNES, "09:00", "13:00"),
      ]
    )

    expect(resumen.map((r) => r.sede.id)).toEqual(["centro"])
    expect(resumen[0].dias.map((d) => d.dayOfWeek)).toEqual([LUNES])
  })

  it("una sede activa sin horario cargado sale vacía; sin sedes, no sale nada", () => {
    expect(resumenDeHorarioPorSede([centro], [])).toEqual([{ sede: centro, dias: [], grupos: [] }])
    expect(resumenDeHorarioPorSede([], [fila("centro", LUNES, "09:00", "13:00")])).toEqual([])
  })

  it("las franjas que no se pueden medir no aparecen", () => {
    const [resumen] = resumenDeHorarioPorSede([centro], [fila("centro", LUNES, "18:00", "09:00")])
    expect(resumen.dias).toEqual([])
  })
})

describe("WHERE_HORARIO_VIGENTE y whereDelHorarioDeLaSede", () => {
  const sedes = [
    { id: "centro", businessId: "n1", activo: true },
    { id: "cerrada", businessId: "n1", activo: false },
    { id: "ajena", businessId: "n2", activo: true },
  ]
  const fila = (id: string, sedeId: string | null, businessId = "n1") => ({ id, businessId, sedeId, active: true })
  const filas = [fila("sin-sede", null), fila("del-centro", "centro"), fila("de-la-cerrada", "cerrada"), fila("de-la-ajena", "ajena", "n2")]
  const salen = (where: unknown) =>
    filas.filter((registro) => coincideConWhere("workSchedule", registro, where, { sede: sedes })).map((registro) => registro.id)

  it("vigente: las sin sede y las de una sede activa; no las de una sede desactivada", () => {
    expect(salen(WHERE_HORARIO_VIGENTE)).toEqual(["sin-sede", "del-centro", "de-la-ajena"])
  })

  it("sin sede en la consulta (undefined o null): el vigente", () => {
    expect(whereDelHorarioDeLaSede()).toEqual(WHERE_HORARIO_VIGENTE)
    expect(whereDelHorarioDeLaSede(null)).toEqual(WHERE_HORARIO_VIGENTE)
  })

  it("con una sede: sólo sus filas, y sólo si está activa", () => {
    expect(salen(whereDelHorarioDeLaSede("centro"))).toEqual(["del-centro"])
    expect(salen(whereDelHorarioDeLaSede("cerrada"))).toEqual([])
    expect(salen(whereDelHorarioDeLaSede("no-existe"))).toEqual([])
  })

  it("se combina con el negocio: la sede de otro negocio no trae nada de éste", () => {
    const delNegocio = (where: unknown) => salen({ ...(where as object), businessId: "n1" })
    expect(delNegocio(whereDelHorarioDeLaSede("ajena"))).toEqual([])
    expect(delNegocio(WHERE_HORARIO_VIGENTE)).toEqual(["sin-sede", "del-centro"])
  })
})
