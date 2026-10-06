import { describe, it, expect } from "vitest"
import { aCentavos } from "./atenciones"
import type { Actor } from "./permisos"
import {
  COLUMNAS_DEL_TABLERO,
  accionAlSoltar,
  accionPrincipal,
  accionesSecundarias,
  atencionesDeColumna,
  destinosDeArrastre,
  estadoAnterior,
  estadoDelCobro,
  estadoSiguiente,
  estaAtrasada,
  faltaAsignar,
  filaDePagoSugerida,
  filaDesdeLinea,
  lineaParaReglas,
  lineasDesdeFilas,
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

  it("un precio de cero vale; uno negativo o con tres decimales no", () => {
    expect(erroresDeFila(fila({ precio: "0" }), true)).toEqual({})
    expect(erroresDeFila(fila({ precio: "-1" }), true).precio).toBeDefined()
    expect(erroresDeFila(fila({ precio: "10.005" }), true).precio).toBeDefined()
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

  it("si ya no falta nada, la fila sugerida va sin monto; si todos los medios se usaron, repite el primero", () => {
    const medios = [{ id: "efectivo" }]
    expect(filaDePagoSugerida(medios, [pago("efectivo", "33000")], TOTAL, "p2")).toEqual({
      clave: "p2",
      medio: "efectivo",
      monto: "",
    })
  })
})
