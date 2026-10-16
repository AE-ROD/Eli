import { describe, it, expect } from "vitest"
import { aCentavos } from "./atenciones"
import type { Actor } from "./permisos"
import {
  COLUMNAS_DEL_TABLERO,
  accionAlSoltar,
  accionPrincipal,
  accionesSecundarias,
  atencionesDeColumna,
  consecuenciasDeAnular,
  destinosDeArrastre,
  estadoAnterior,
  estadoDelCobro,
  estadoSiguiente,
  estaAtrasada,
  errorDeMontoDePago,
  faltaAsignar,
  filaDePagoSugerida,
  filaDesdeLinea,
  filaDesdeReserva,
  lineaParaReglas,
  lineasDesdeFilas,
  nombreConHora,
  nombresSinRepetir,
  ofreceDeshacerLlegada,
  requisitoParaPasarA,
  textoDeMovimiento,
  totalDeFilasEnCentavos,
  erroresDeFila,
  type FilaDePago,
  type FilaDeServicio,
} from "./acciones-del-tablero"

const NEGOCIO = "negocio-1"
// El dueño no es miembro del equipo: no tiene memberId.
const dueño: Actor = { rol: "owner", businessId: NEGOCIO, memberId: null }
const encargado: Actor = { rol: "admin", businessId: NEGOCIO, memberId: "yo" }
const profesional: Actor = { rol: "worker", businessId: NEGOCIO, memberId: "yo" }

const linea = (profesionalId: string | null, precio = 8000) => ({ profesional: { id: profesionalId }, precio })

describe("COLUMNAS_DEL_TABLERO", () => {
  it("son las cinco de la ficha, en orden, y ninguna para las anuladas", () => {
    expect(COLUMNAS_DEL_TABLERO.map((columna) => columna.titulo)).toEqual([
      "Reservas de hoy",
      "En espera",
      "En atención",
      "Por cobrar",
      "Finalizado",
    ])
    expect(COLUMNAS_DEL_TABLERO.map((columna) => columna.id)).not.toContain("anulada")
  })
})

describe("atencionesDeColumna", () => {
  const atencion = (id: string, estado: string, tiempos: Partial<Record<string, string | null>> = {}) => ({
    id,
    estado,
    llegoEn: "2026-10-06T12:00:00.000Z",
    empezoEn: null,
    terminoEn: null,
    cobradaEn: null,
    ...tiempos,
  })

  it("filtra por estado: las de otra columna y las anuladas no entran", () => {
    const todas = [atencion("a", "en-espera"), atencion("b", "en-atencion"), atencion("c", "anulada")]
    expect(atencionesDeColumna(todas, "en-espera").map((a) => a.id)).toEqual(["a"])
    expect(atencionesDeColumna(todas, "en-atencion").map((a) => a.id)).toEqual(["b"])
  })

  it("en espera, arriba la que llegó primero", () => {
    const todas = [
      atencion("tarde", "en-espera", { llegoEn: "2026-10-06T14:00:00.000Z" }),
      atencion("temprano", "en-espera", { llegoEn: "2026-10-06T11:00:00.000Z" }),
    ]
    expect(atencionesDeColumna(todas, "en-espera").map((a) => a.id)).toEqual(["temprano", "tarde"])
  })

  it("en atención ordena por cuándo empezó; por cobrar, por cuándo terminó", () => {
    const enAtencion = [
      atencion("empezo-despues", "en-atencion", { llegoEn: "2026-10-06T10:00:00.000Z", empezoEn: "2026-10-06T13:00:00.000Z" }),
      atencion("empezo-antes", "en-atencion", { llegoEn: "2026-10-06T11:00:00.000Z", empezoEn: "2026-10-06T12:00:00.000Z" }),
    ]
    expect(atencionesDeColumna(enAtencion, "en-atencion").map((a) => a.id)).toEqual(["empezo-antes", "empezo-despues"])

    const porCobrar = [
      atencion("termino-despues", "por-cobrar", { terminoEn: "2026-10-06T15:00:00.000Z" }),
      atencion("termino-antes", "por-cobrar", { terminoEn: "2026-10-06T14:00:00.000Z" }),
    ]
    expect(atencionesDeColumna(porCobrar, "por-cobrar").map((a) => a.id)).toEqual(["termino-antes", "termino-despues"])
  })

  it("en finalizado, arriba la última cobrada", () => {
    const todas = [
      atencion("primera", "finalizada", { cobradaEn: "2026-10-06T12:00:00.000Z" }),
      atencion("ultima", "finalizada", { cobradaEn: "2026-10-06T16:00:00.000Z" }),
    ]
    expect(atencionesDeColumna(todas, "finalizada").map((a) => a.id)).toEqual(["ultima", "primera"])
  })

  it("no reordena la lista que recibe", () => {
    const todas = [
      atencion("tarde", "en-espera", { llegoEn: "2026-10-06T14:00:00.000Z" }),
      atencion("temprano", "en-espera", { llegoEn: "2026-10-06T11:00:00.000Z" }),
    ]
    atencionesDeColumna(todas, "en-espera")
    expect(todas.map((a) => a.id)).toEqual(["tarde", "temprano"])
  })
})

describe("estaAtrasada", () => {
  const ahora = new Date("2026-10-06T15:00:00.000Z").getTime()

  it("si la hora de inicio ya pasó", () => {
    expect(estaAtrasada("2026-10-06T14:59:00.000Z", ahora)).toBe(true)
  })

  it("si todavía no es la hora, o es justo ahora, no", () => {
    expect(estaAtrasada("2026-10-06T15:30:00.000Z", ahora)).toBe(false)
    expect(estaAtrasada("2026-10-06T15:00:00.000Z", ahora)).toBe(false)
  })
})

describe("lineaParaReglas", () => {
  it("traduce el profesional como lo entienden las reglas: miembro, dueño o nadie", () => {
    expect(lineaParaReglas(linea("m-carla"))).toEqual({ memberId: "m-carla", byOwner: false, price: 8000 })
    expect(lineaParaReglas(linea("duenio"))).toEqual({ memberId: null, byOwner: true, price: 8000 })
    expect(lineaParaReglas(linea(null))).toEqual({ memberId: null, byOwner: false, price: 8000 })
  })

  it("sólo la línea de alguien que dejó el equipo falta asignar", () => {
    expect(faltaAsignar(linea(null))).toBe(true)
    expect(faltaAsignar(linea("duenio"))).toBe(false)
    expect(faltaAsignar(linea("m-carla"))).toBe(false)
  })
})

describe("requisitoParaPasarA", () => {
  it("para empezar hace falta al menos un servicio con profesional, con el mensaje del servidor", () => {
    expect(requisitoParaPasarA([], "en-atencion")).toBe(
      "Para empezar la atención hace falta al menos un servicio con su profesional."
    )
    expect(requisitoParaPasarA([linea(null)], "en-atencion")).not.toBeNull()
    expect(requisitoParaPasarA([linea(null), linea("duenio")], "en-atencion")).toBeNull()
  })

  it("para pasar a cobro o cobrar, todas las líneas con profesional", () => {
    expect(requisitoParaPasarA([linea("m-carla"), linea(null)], "por-cobrar")).toBe(
      "Hay servicios sin profesional: indica quién hizo cada uno antes de cobrar."
    )
    expect(requisitoParaPasarA([linea("m-carla"), linea(null)], "finalizada")).not.toBeNull()
    expect(requisitoParaPasarA([linea("m-carla"), linea("duenio", 0)], "finalizada")).toBeNull()
  })

  it("volver a en espera no pide nada", () => {
    expect(requisitoParaPasarA([], "en-espera")).toBeNull()
  })
})

describe("estadoSiguiente y estadoAnterior", () => {
  it("recorren las columnas activas de a un paso", () => {
    expect(estadoSiguiente("en-espera")).toBe("en-atencion")
    expect(estadoSiguiente("en-atencion")).toBe("por-cobrar")
    expect(estadoAnterior("por-cobrar")).toBe("en-atencion")
    expect(estadoAnterior("en-atencion")).toBe("en-espera")
  })

  it("de por cobrar se sale cobrando, y de en espera no se vuelve a las reservas", () => {
    expect(estadoSiguiente("por-cobrar")).toBeNull()
    expect(estadoAnterior("en-espera")).toBeNull()
  })

  it("las finales y los estados desconocidos no se mueven", () => {
    for (const estado of ["finalizada", "anulada", "inventado"]) {
      expect(estadoSiguiente(estado)).toBeNull()
      expect(estadoAnterior(estado)).toBeNull()
    }
  })
})

describe("textoDeMovimiento", () => {
  it("hacia adelante dice la acción; hacia atrás, a dónde vuelve", () => {
    expect(textoDeMovimiento("en-espera", "en-atencion")).toBe("Empezar atención")
    expect(textoDeMovimiento("en-atencion", "por-cobrar")).toBe("Pasar a cobro")
    expect(textoDeMovimiento("por-cobrar", "en-atencion")).toBe("Volver a En atención")
    expect(textoDeMovimiento("en-atencion", "en-espera")).toBe("Volver a En espera")
  })
})

describe("accionPrincipal", () => {
  it("lleva a la columna siguiente, para cualquier rol", () => {
    for (const quien of [dueño, encargado, profesional]) {
      expect(accionPrincipal(quien, "en-espera")).toEqual({ tipo: "mover", hacia: "en-atencion", texto: "Empezar atención" })
      expect(accionPrincipal(quien, "en-atencion")).toEqual({ tipo: "mover", hacia: "por-cobrar", texto: "Pasar a cobro" })
    }
  })

  it("en por cobrar es cobrar, y sólo para dueño y encargado", () => {
    expect(accionPrincipal(dueño, "por-cobrar")).toEqual({ tipo: "cobrar", texto: "Cobrar" })
    expect(accionPrincipal(encargado, "por-cobrar")).toEqual({ tipo: "cobrar", texto: "Cobrar" })
    expect(accionPrincipal(profesional, "por-cobrar")).toBeNull()
  })

  it("lo finalizado no tiene acción principal, y sin sesión no hay ninguna", () => {
    expect(accionPrincipal(dueño, "finalizada")).toBeNull()
    expect(accionPrincipal(null, "en-espera")).toBeNull()
  })
})

describe("accionesSecundarias", () => {
  it("una atención activa se edita y vuelve un paso, para cualquier rol que la ve", () => {
    for (const quien of [dueño, encargado, profesional]) {
      expect(accionesSecundarias(quien, "en-atencion")).toMatchObject({ editar: true, volverA: "en-espera" })
      expect(accionesSecundarias(quien, "por-cobrar")).toMatchObject({ editar: true, volverA: "en-atencion" })
      expect(accionesSecundarias(quien, "en-espera")).toMatchObject({ editar: true, volverA: null })
    }
  })

  it("anular antes de cobrar: dueño y encargado, no el profesional", () => {
    expect(accionesSecundarias(dueño, "en-espera").anular).toBe(true)
    expect(accionesSecundarias(encargado, "por-cobrar").anular).toBe(true)
    expect(accionesSecundarias(profesional, "en-atencion").anular).toBe(false)
  })

  it("una cobrada no se edita ni se mueve, y anularla es sólo del dueño", () => {
    expect(accionesSecundarias(dueño, "finalizada")).toEqual({ editar: false, volverA: null, anular: true })
    expect(accionesSecundarias(encargado, "finalizada")).toEqual({ editar: false, volverA: null, anular: false })
    expect(accionesSecundarias(profesional, "finalizada")).toEqual({ editar: false, volverA: null, anular: false })
  })

  it("sin sesión no ofrece nada", () => {
    expect(accionesSecundarias(null, "en-espera")).toEqual({ editar: false, volverA: null, anular: false })
  })
})

describe("accionAlSoltar y destinosDeArrastre", () => {
  const reserva = { tipo: "reserva" } as const
  const en = (estado: string) => ({ tipo: "atencion", estado }) as const

  it("una reserva sólo se suelta en espera, y es marcar que llegó", () => {
    expect(accionAlSoltar(dueño, reserva, "en-espera")).toEqual({ tipo: "llegar" })
    expect(accionAlSoltar(dueño, reserva, "en-atencion")).toBeNull()
    expect(destinosDeArrastre(profesional, reserva)).toEqual(["en-espera"])
  })

  it("una atención va a la columna siguiente o a la anterior, nunca salta", () => {
    expect(accionAlSoltar(encargado, en("en-atencion"), "por-cobrar")).toEqual({ tipo: "mover", hacia: "por-cobrar" })
    expect(accionAlSoltar(encargado, en("en-atencion"), "en-espera")).toEqual({ tipo: "mover", hacia: "en-espera" })
    expect(accionAlSoltar(encargado, en("en-espera"), "por-cobrar")).toBeNull()
    expect(accionAlSoltar(encargado, en("en-atencion"), "reservas")).toBeNull()
    expect(destinosDeArrastre(encargado, en("en-espera"))).toEqual(["en-atencion"])
  })

  it("soltar en finalizado es cobrar: sólo si quien arrastra puede cobrar", () => {
    expect(accionAlSoltar(dueño, en("por-cobrar"), "finalizada")).toEqual({ tipo: "cobrar" })
    expect(destinosDeArrastre(dueño, en("por-cobrar"))).toEqual(["en-atencion", "finalizada"])
    expect(accionAlSoltar(profesional, en("por-cobrar"), "finalizada")).toBeNull()
    expect(destinosDeArrastre(profesional, en("por-cobrar"))).toEqual(["en-atencion"])
  })

  it("lo cobrado no se arrastra a ningún lado, y sin sesión nada se arrastra", () => {
    expect(destinosDeArrastre(dueño, en("finalizada"))).toEqual([])
    expect(destinosDeArrastre(null, reserva)).toEqual([])
  })

  it("soltar en la misma columna no hace nada", () => {
    expect(accionAlSoltar(dueño, en("en-espera"), "en-espera")).toBeNull()
  })
})

describe("editor de servicios", () => {
  const fila = (cambios: Partial<FilaDeServicio> = {}): FilaDeServicio => ({
    clave: "f1",
    servicioId: "s-corte",
    profesional: "m-carla",
    precio: "8000",
    ...cambios,
  })

  it("filaDesdeLinea conserva los nombres y deja sin elegir lo que ya no está", () => {
    expect(
      filaDesdeLinea({
        id: "l1",
        servicioId: null,
        servicio: "Color",
        profesional: { id: null, nombre: "Pedro" },
        precio: 25000,
      })
    ).toEqual({
      clave: "l1",
      servicioId: "",
      profesional: "",
      precio: "25000",
      servicioOriginal: "Color",
      profesionalOriginal: "Pedro",
    })
  })

  it("una fila completa no tiene errores", () => {
    expect(erroresDeFila(fila(), true)).toEqual({})
  })

  it("marca cada campo que falta, con un mensaje para mostrar al lado", () => {
    expect(erroresDeFila(fila({ servicioId: "", profesional: "", precio: "" }), true)).toEqual({
      servicio: "Elige el servicio.",
      profesional: "Elige quién lo hace.",
      precio: "Escribe el precio.",
    })
  })

  it("quien no elige profesional no necesita elegirlo", () => {
    expect(erroresDeFila(fila({ profesional: "" }), false)).toEqual({})
  })

  it("un precio de cero vale; uno negativo, con tres decimales o sobre el tope no", () => {
    expect(erroresDeFila(fila({ precio: "0" }), true)).toEqual({})
    expect(erroresDeFila(fila({ precio: "-1" }), true).precio).toBeDefined()
    expect(erroresDeFila(fila({ precio: "10,005" }), true).precio).toBeDefined()
    expect(erroresDeFila(fila({ precio: "20000000,01" }), true).precio).toContain("$20.000.000")
    expect(erroresDeFila(fila({ precio: "20.000.000" }), true)).toEqual({})
  })

  it("acepta el precio con coma decimal y con miles, como se escribe en español", () => {
    expect(erroresDeFila(fila({ precio: "8000,50" }), true)).toEqual({})
    expect(erroresDeFila(fila({ precio: "8.000,50" }), true)).toEqual({})
    expect(lineasDesdeFilas([fila({ precio: "8.000,50" })], true)).toEqual({
      ok: true,
      lineas: [{ servicioId: "s-corte", profesional: "m-carla", precio: 8000.5 }],
    })
  })

  it("un precio que no se entiende dice cómo escribirlo, no que falta", () => {
    expect(erroresDeFila(fila({ precio: "8,000" }), true).precio).toBe(
      "No se entiende el precio. Escríbelo así: 8000 o 8000,50."
    )
    expect(erroresDeFila(fila({ precio: "abc" }), true).precio).toContain("No se entiende")
    expect(erroresDeFila(fila({ precio: "  " }), true).precio).toBe("Escribe el precio.")
  })

  it("filaDesdeLinea escribe el precio con coma, como lo lee el campo", () => {
    const desdeLinea = filaDesdeLinea({
      id: "l2",
      servicioId: "s-corte",
      servicio: "Corte",
      profesional: { id: "m-carla", nombre: "Carla" },
      precio: 8000.5,
    })
    expect(desdeLinea.precio).toBe("8000,50")
    expect(erroresDeFila(desdeLinea, true)).toEqual({})
  })

  it("lineasDesdeFilas arma el pedido, con el profesional sólo si se elige", () => {
    const filas = [fila(), fila({ clave: "f2", servicioId: "s-color", profesional: "duenio", precio: "25000.5" })]
    expect(lineasDesdeFilas(filas, true)).toEqual({
      ok: true,
      lineas: [
        { servicioId: "s-corte", profesional: "m-carla", precio: 8000 },
        { servicioId: "s-color", profesional: "duenio", precio: 25000.5 },
      ],
    })
    expect(lineasDesdeFilas(filas, false)).toEqual({
      ok: true,
      lineas: [
        { servicioId: "s-corte", precio: 8000 },
        { servicioId: "s-color", precio: 25000.5 },
      ],
    })
  })

  it("si alguna fila tiene errores no arma nada y dice cuáles, por clave", () => {
    const resultado = lineasDesdeFilas([fila(), fila({ clave: "mala", precio: "" })], true)
    expect(resultado).toEqual({ ok: false, errores: { mala: { precio: "Escribe el precio." } } })
  })

  it("sin filas es una lista vacía: dueño y encargado pueden anotar sin servicios", () => {
    expect(lineasDesdeFilas([], true)).toEqual({ ok: true, lineas: [] })
  })

  it("el total en vivo suma en centavos sólo los precios válidos", () => {
    const filas = [fila({ precio: "0.1" }), fila({ clave: "f2", precio: "0.2" }), fila({ clave: "f3", precio: "" })]
    expect(totalDeFilasEnCentavos(filas)).toBe(30)
    expect(totalDeFilasEnCentavos([fila(), fila({ clave: "f2", precio: "-5" })])).toBe(aCentavos(8000))
  })
})

describe("filaDesdeReserva", () => {
  const catalogo = {
    servicios: [
      { id: "s-corte", nombre: "Corte", precio: 8000 },
      { id: "s-color", nombre: "Color", precio: 25000 },
      { id: "s-barba", nombre: "Barba", precio: null },
      { id: "s-lavado-1", nombre: "Lavado", precio: 3000 },
      { id: "s-lavado-2", nombre: "lavado ", precio: 3500 },
    ],
    profesionales: [
      { id: "m-carla", nombre: "Carla" },
      { id: "m-juan", nombre: "Juan" },
      { id: "duenio", nombre: "Ana (dueña)" },
    ],
  }
  const reserva = (cambios: Partial<Parameters<typeof filaDesdeReserva>[0]> = {}) => ({
    servicioId: "s-corte",
    titulo: "Corte",
    precio: 9000,
    profesional: { id: "m-carla", nombre: "Carla" },
    ...cambios,
  })

  it("con servicio del catálogo y profesional del equipo, precarga todo con el precio de la reserva", () => {
    expect(filaDesdeReserva(reserva(), catalogo, "r1")).toEqual({
      clave: "r1",
      servicioId: "s-corte",
      profesional: "m-carla",
      precio: "9000",
    })
  })

  it("sin precio en la reserva usa el del catálogo; sin ninguno, queda para escribir", () => {
    expect(filaDesdeReserva(reserva({ precio: null }), catalogo, "r1").precio).toBe("8000")
    expect(filaDesdeReserva(reserva({ servicioId: "s-barba", titulo: "Barba", precio: null }), catalogo, "r1").precio).toBe("")
    expect(filaDesdeReserva(reserva({ precio: 9000.5 }), catalogo, "r1").precio).toBe("9000,50")
  })

  it("si la agenda guardó el servicio como texto, lo busca por nombre sin mayúsculas ni espacios al borde", () => {
    const fila = filaDesdeReserva(reserva({ servicioId: null, titulo: "  COLOR ", precio: null }), catalogo, "r1")
    expect(fila.servicioId).toBe("s-color")
    expect(fila.precio).toBe("25000")
  })

  it("un nombre repetido en el catálogo no se adivina", () => {
    const fila = filaDesdeReserva(reserva({ servicioId: null, titulo: "Lavado" }), catalogo, "r1")
    expect(fila.servicioId).toBe("")
    expect(fila.servicioOriginal).toBe("Lavado")
  })

  it("un servicio dado de baja (fuera del catálogo) no se precarga, ni su precio: queda su nombre como ayuda", () => {
    expect(filaDesdeReserva(reserva({ servicioId: "s-inactivo", titulo: "Alisado" }), catalogo, "r1")).toEqual({
      clave: "r1",
      servicioId: "",
      profesional: "m-carla",
      precio: "",
      servicioOriginal: "Alisado",
    })
  })

  it("un profesional que ya no se puede asignar queda sin elegir, con su nombre como ayuda", () => {
    const fila = filaDesdeReserva(reserva({ profesional: { id: "m-se-fue", nombre: "Pedro" } }), catalogo, "r1")
    expect(fila.profesional).toBe("")
    expect(fila.profesionalOriginal).toBe("Pedro")
  })

  it("sin profesional en la reserva, el único posible ya viene elegido", () => {
    const soloYo = { ...catalogo, profesionales: [{ id: "m-yo", nombre: "Yo" }] }
    expect(filaDesdeReserva(reserva({ profesional: null }), soloYo, "r1").profesional).toBe("m-yo")
    expect(filaDesdeReserva(reserva({ profesional: { id: "m-carla", nombre: "Carla" } }), soloYo, "r1")).toEqual({
      clave: "r1",
      servicioId: "s-corte",
      profesional: "m-yo",
      precio: "9000",
    })
    expect(filaDesdeReserva(reserva({ profesional: null }), catalogo, "r1").profesional).toBe("")
  })
})

describe("nombreConHora", () => {
  // Ida y vuelta por la zona local, como en los tests de fechas: da lo mismo en cualquier huso.
  const a = (hora: number, minuto: number) => new Date(2026, 6, 15, hora, minuto).toISOString()
  const atencion = { cliente: { nombre: "María González" }, llegoEn: a(10, 30), cobradaEn: null }

  it("lleva la hora de llegada mientras está abierta", () => {
    expect(nombreConHora({ ...atencion, estado: "en-espera" })).toBe("María González de las 10:30")
    expect(nombreConHora({ ...atencion, estado: "por-cobrar" })).toBe("María González de las 10:30")
  })

  it("lo cobrado lleva la hora del cobro", () => {
    expect(nombreConHora({ ...atencion, estado: "finalizada", cobradaEn: a(11, 45) })).toBe("María González de las 11:45")
  })

  it("dos visitas de la misma clienta no se llaman igual", () => {
    const otra = { ...atencion, estado: "en-espera", llegoEn: a(13, 0) }
    expect(nombreConHora({ ...atencion, estado: "en-espera" })).not.toBe(nombreConHora(otra))
  })
})

describe("nombresSinRepetir", () => {
  const a = (hora: number, minuto: number, segundo = 0) => new Date(2026, 6, 15, hora, minuto, segundo).toISOString()
  const visita = (id: string, nombre: string, llegoEn: string, estado = "en-espera", cobradaEn: string | null = null) => ({
    id,
    estado,
    cliente: { nombre },
    llegoEn,
    cobradaEn,
  })

  it("sin repetidos, cada una con el nombre de siempre", () => {
    const lucia = visita("v1", "Lucía Pérez", a(2, 51))
    const maria = visita("v2", "María González", a(2, 51))
    const nombres = nombresSinRepetir([lucia, maria])
    expect(nombres.get("v1")).toBe("Lucía Pérez de las 02:51")
    expect(nombres.get("v2")).toBe("María González de las 02:51")
  })

  it("dos llegadas de la misma clienta en el mismo minuto: la segunda lleva (2) (QA: dos «Empezar atención» iguales)", () => {
    const primera = visita("v-b", "Lucía Pérez 24440", a(2, 51, 5))
    const segunda = visita("v-a", "Lucía Pérez 24440", a(2, 51, 40))
    // Ni el orden de la lista ni el id deciden: decide quién llegó primero.
    const nombres = nombresSinRepetir([segunda, primera])
    expect(nombres.get("v-b")).toBe("Lucía Pérez 24440 de las 02:51")
    expect(nombres.get("v-a")).toBe("Lucía Pérez 24440 de las 02:51 (2)")
  })

  it("el ordinal no cambia cuando una pasa a otra columna", () => {
    const primera = visita("v1", "Lucía Pérez", a(2, 51, 5))
    const segunda = visita("v2", "Lucía Pérez", a(2, 51, 40))
    const antes = nombresSinRepetir([primera, segunda])
    const despues = nombresSinRepetir([{ ...segunda, estado: "en-atencion" }, primera])
    expect(despues).toEqual(antes)
  })

  it("en el mismo instante desempata el id, así el nombre no cambia entre recargas", () => {
    const una = visita("v-2", "Lucía Pérez", a(2, 51))
    const otra = visita("v-1", "Lucía Pérez", a(2, 51))
    expect(nombresSinRepetir([una, otra])).toEqual(nombresSinRepetir([otra, una]))
    expect(nombresSinRepetir([una, otra]).get("v-2")).toBe("Lucía Pérez de las 02:51 (2)")
  })

  it("con tres, (2) y (3); lo cobrado se distingue por la hora del cobro", () => {
    const atenciones = [
      visita("v1", "Lucía Pérez", a(10, 30, 1)),
      visita("v2", "Lucía Pérez", a(10, 30, 2)),
      visita("v3", "Lucía Pérez", a(10, 30, 3)),
      visita("v4", "Lucía Pérez", a(9, 0, 1), "finalizada", a(9, 45, 10)),
      visita("v5", "Lucía Pérez", a(9, 10, 1), "finalizada", a(9, 45, 50)),
    ]
    const nombres = nombresSinRepetir(atenciones)
    expect([...nombres.values()]).toHaveLength(new Set(nombres.values()).size)
    expect(nombres.get("v3")).toBe("Lucía Pérez de las 10:30 (3)")
    expect(nombres.get("v4")).toBe("Lucía Pérez de las 09:45")
    expect(nombres.get("v5")).toBe("Lucía Pérez de las 09:45 (2)")
  })
})

describe("consecuenciasDeAnular", () => {
  const cliente = { nombre: "María González" }

  it("lo cobrado otro día dice cuándo y por cuánto, y que no se puede deshacer", () => {
    const cobradaEn = new Date(2026, 9, 5, 10, 30).toISOString()
    expect(consecuenciasDeAnular({ estado: "finalizada", cliente, total: 25000, cobradaEn })).toBe(
      "Se cobró el lunes, 5 de octubre a las 10:30, por $25.000. Al anularla deja de sumar a los ingresos del negocio y queda en el historial como anulada. No se puede deshacer."
    )
  })

  it("lo cobrado hoy dice hoy", () => {
    const hoy = new Date()
    hoy.setHours(9, 15, 0, 0)
    expect(consecuenciasDeAnular({ estado: "finalizada", cliente, total: 8000.5, cobradaEn: hoy.toISOString() })).toMatch(
      /^Se cobró hoy a las 09:15, por \$8000,50\./
    )
  })

  it("sin fecha ni total, igual avisa que está cobrada", () => {
    expect(consecuenciasDeAnular({ estado: "finalizada", cliente })).toMatch(/^Esta atención ya está cobrada\. Al anularla/)
  })

  it("sin cobrar, sale del tablero; si venía de una reserva, la cita queda cancelada", () => {
    expect(consecuenciasDeAnular({ estado: "en-espera", cliente, citaId: "c1" })).toBe(
      "La atención sale del tablero y queda en el historial como anulada. La reserva de la agenda queda cancelada. No se puede deshacer."
    )
    expect(consecuenciasDeAnular({ estado: "por-cobrar", cliente, citaId: null })).not.toContain("reserva")
  })
})

describe("ofreceDeshacerLlegada", () => {
  // La reserva como la manda el servidor: al profesional, sólo si la cita es suya.
  const deReserva = (profesionalId: string | null) => ({
    profesional: profesionalId === null ? null : { id: profesionalId, nombre: profesionalId },
  })
  const enEspera = { estado: "en-espera", citaId: "cita-1", empezoEn: null, reserva: deReserva("colega") }
  const suya = { ...enEspera, reserva: deReserva("yo") }
  const empezo = "2026-10-09T13:05:00.000Z"

  it("dueño y encargado, con la reserva de cualquiera, en espera y sin empezar", () => {
    for (const quien of [dueño, encargado]) {
      expect(ofreceDeshacerLlegada(quien, enEspera)).toBe(true)
      expect(ofreceDeshacerLlegada(quien, suya)).toBe(true)
      expect(ofreceDeshacerLlegada(quien, { ...enEspera, reserva: deReserva(null) })).toBe(true)
    }
  })

  it("el profesional, sólo con su propia reserva, en espera y sin empezar", () => {
    expect(ofreceDeshacerLlegada(profesional, suya)).toBe(true)
    expect(ofreceDeshacerLlegada(profesional, { ...suya, empezoEn: empezo })).toBe(false)
    expect(ofreceDeshacerLlegada(profesional, { ...suya, estado: "en-atencion" })).toBe(false)
  })

  it("el profesional no deshace la reserva de una colega, aunque vea la atención por tener un servicio en ella", () => {
    // El servidor no le manda la reserva de una colega: sin ella no se sabe de quién es, y es que no.
    expect(ofreceDeshacerLlegada(profesional, { ...enEspera, reserva: null })).toBe(false)
    // Y si llegara igual, no es suya.
    expect(ofreceDeshacerLlegada(profesional, enEspera)).toBe(false)
    expect(ofreceDeshacerLlegada(profesional, { ...enEspera, reserva: deReserva(null) })).toBe(false)
  })

  it("nadie la deshace si ya empezó, aunque haya vuelto a espera: eso se anula", () => {
    for (const quien of [dueño, encargado, profesional]) {
      expect(ofreceDeshacerLlegada(quien, { ...suya, empezoEn: empezo })).toBe(false)
    }
  })

  it("sólo en espera y si nació de una reserva", () => {
    for (const estado of ["en-atencion", "por-cobrar", "finalizada", "anulada"]) {
      expect(ofreceDeshacerLlegada(dueño, { ...enEspera, estado })).toBe(false)
    }
    expect(ofreceDeshacerLlegada(dueño, { ...enEspera, citaId: null, reserva: null })).toBe(false)
  })

  it("sin sesión, o un profesional sin memberId, no", () => {
    expect(ofreceDeshacerLlegada(null, suya)).toBe(false)
    expect(ofreceDeshacerLlegada({ ...profesional, memberId: null }, suya)).toBe(false)
    expect(ofreceDeshacerLlegada({ ...profesional, memberId: null }, { ...enEspera, reserva: deReserva(null) })).toBe(false)
  })
})

describe("cobro", () => {
  const pago = (medio: string, monto: string, clave = medio): FilaDePago => ({ clave, medio, monto })
  const TOTAL = aCentavos(33000)

  it("con los pagos justos no hay error ni diferencia", () => {
    const estado = estadoDelCobro(TOTAL, [pago("efectivo", "20000"), pago("tarjeta-debito", "13000")])
    expect(estado.error).toBeNull()
    expect(estado.diferenciaCentavos).toBe(0)
    expect(estado.pagos).toEqual([
      { medio: "efectivo", monto: 20000 },
      { medio: "tarjeta-debito", monto: 13000 },
    ])
  })

  it("dice cuánto falta o cuánto sobra, en centavos", () => {
    expect(estadoDelCobro(TOTAL, [pago("efectivo", "20000")]).diferenciaCentavos).toBe(aCentavos(13000))
    expect(estadoDelCobro(TOTAL, [pago("efectivo", "40000")]).diferenciaCentavos).toBe(-aCentavos(7000))
  })

  it("con diferencia no se puede cobrar: el error es el del servidor", () => {
    expect(estadoDelCobro(TOTAL, [pago("efectivo", "20000")]).error).toContain("tienen que coincidir")
  })

  it("compara en centavos: 0,10 + 0,20 paga un total de 0,30", () => {
    const estado = estadoDelCobro(30, [pago("efectivo", "0.1"), pago("transferencia", "0.2")])
    expect(estado.error).toBeNull()
    expect(estado.diferenciaCentavos).toBe(0)
  })

  it("un monto vacío o en cero no suma y no deja cobrar", () => {
    const vacio = estadoDelCobro(TOTAL, [pago("efectivo", "33000"), pago("transferencia", "")])
    expect(vacio.diferenciaCentavos).toBe(0)
    expect(vacio.error).not.toBeNull()

    expect(estadoDelCobro(TOTAL, [pago("efectivo", "33000"), pago("transferencia", "0")]).error).not.toBeNull()
  })

  it("un total de cero se cobra sin pagos", () => {
    expect(estadoDelCobro(0, [])).toEqual({ diferenciaCentavos: 0, error: null, pagos: [] })
  })

  it("la fila sugerida usa el primer medio libre y lo que falta para el total", () => {
    const medios = [{ id: "efectivo" }, { id: "tarjeta-debito" }, { id: "transferencia" }]
    expect(filaDePagoSugerida(medios, [], TOTAL, "p1")).toEqual({ clave: "p1", medio: "efectivo", monto: "33000" })
    expect(filaDePagoSugerida(medios, [pago("efectivo", "20000")], TOTAL, "p2")).toEqual({
      clave: "p2",
      medio: "tarjeta-debito",
      monto: "13000",
    })
  })

  it("la fila sugerida escribe lo que falta con coma decimal", () => {
    const medios = [{ id: "efectivo" }, { id: "tarjeta-debito" }]
    expect(filaDePagoSugerida(medios, [pago("efectivo", "20000")], aCentavos(33000.5), "p2").monto).toBe("13000,50")
  })

  it("los montos con coma decimal y con miles cuadran el cobro", () => {
    const estado = estadoDelCobro(aCentavos(33000.5), [pago("efectivo", "20.000"), pago("tarjeta-debito", "13000,50")])
    expect(estado.error).toBeNull()
    expect(estado.diferenciaCentavos).toBe(0)
  })

  it("errorDeMontoDePago: vacío no es error del campo; ilegible, cero, negativo o sobre el tope sí", () => {
    expect(errorDeMontoDePago("")).toBeNull()
    expect(errorDeMontoDePago("8000,50")).toBeNull()
    expect(errorDeMontoDePago("8.000,50")).toBeNull()
    expect(errorDeMontoDePago("8000.50")).toBeNull()
    expect(errorDeMontoDePago("8,000")).toBe("No se entiende el monto. Escríbelo así: 8000 o 8000,50.")
    expect(errorDeMontoDePago("0")).toContain("mayor que cero")
    expect(errorDeMontoDePago("-5")).toContain("mayor que cero")
    expect(errorDeMontoDePago("20000000,01")).toContain("$20.000.000")
  })

  it("si ya no falta nada, la fila sugerida va sin monto; si todos los medios se usaron, repite el primero", () => {
    const medios = [{ id: "efectivo" }]
    expect(filaDePagoSugerida(medios, [pago("efectivo", "33000")], TOTAL, "p2")).toEqual({
      clave: "p2",
      medio: "efectivo",
      monto: "",
    })
  })
})
