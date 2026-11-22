import { afterEach, describe, expect, it, vi } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { vocabularioDe } from "@/lib/vocabulario"
import { crearPaquete, editarPaquete, eliminarPaquete, pausarOReactivarPaquete } from "./_datos"
import {
  cuerpoDePaquete,
  datosDelPaquete,
  detalleDelPaquete,
  frasesDeLosPaquetes,
  leerSesiones,
  opcionesDeVigencia,
  textoDeVigencia,
  tituloDelPaquete,
  vistaPreviaDelPaquete,
  type DatosDePaquete,
  type Paquete,
} from "./_paquetes"

const PALABRAS = vocabularioDe(null).palabras

const LASER: Paquete = {
  id: "pq-1",
  servicioId: "s-laser",
  servicio: "Depilación láser",
  sesiones: 6,
  precio: 150000,
  vigenciaMeses: 6,
  activo: true,
  valorPorSesion: 25000,
  ahorro: 17,
}

const FORM: DatosDePaquete = { servicioId: "s-laser", sesiones: "6", precio: "150.000", vigencia: "6" }

describe("cómo se lee un paquete en la lista", () => {
  it("el nombre: cuántas sesiones y de qué", () => {
    expect(tituloDelPaquete(LASER)).toBe("6 sesiones de Depilación láser")
  })

  it("el detalle: precio, valor por sesión con el ahorro y vigencia", () => {
    expect(detalleDelPaquete(LASER)).toBe("$150.000 · $25.000 por sesión (17 % menos) · Vale 6 meses")
  })

  it("sin ahorro no hay paréntesis, y sin vigencia no vence", () => {
    expect(detalleDelPaquete({ ...LASER, ahorro: null, vigenciaMeses: null })).toBe("$150.000 · $25.000 por sesión · No vence")
  })

  it("la vigencia en singular y en plural", () => {
    expect(textoDeVigencia(null)).toBe("No vence")
    expect(textoDeVigencia(1)).toBe("Vale 1 mes")
    expect(textoDeVigencia(12)).toBe("Vale 12 meses")
  })
})

describe("opcionesDeVigencia", () => {
  it("ofrece no vence, 3, 6 y 12 meses", () => {
    expect(opcionesDeVigencia("")).toEqual([
      { valor: "", texto: "No vence" },
      { valor: "3", texto: "3 meses" },
      { valor: "6", texto: "6 meses" },
      { valor: "12", texto: "12 meses" },
    ])
  })

  it("si el paquete que se edita tiene otra vigencia, la suma en su lugar para no cambiarla sin querer", () => {
    expect(opcionesDeVigencia("5").map((opcion) => opcion.valor)).toEqual(["", "3", "5", "6", "12"])
    expect(opcionesDeVigencia("1")[1]).toEqual({ valor: "1", texto: "1 mes" })
    expect(opcionesDeVigencia("6")).toHaveLength(4)
  })
})

describe("leerSesiones", () => {
  it("sólo enteros de 2 a 50", () => {
    expect(leerSesiones(" 6 ")).toBe(6)
    expect(leerSesiones("2")).toBe(2)
    expect(leerSesiones("50")).toBe(50)
    for (const texto of ["", "1", "51", "6,5", "6.5", "seis", "-6", "1e1"]) expect(leerSesiones(texto), texto).toBeNull()
  })
})

describe("vistaPreviaDelPaquete", () => {
  it("dice en cuánto queda cada sesión y cuánto menos que suelta", () => {
    expect(vistaPreviaDelPaquete(FORM, 30000)).toBe("Cada sesión queda en $25.000 (17 % menos que suelta)")
  })

  it("sin rebaja, o si el servicio no tiene precio, sólo el valor de la sesión", () => {
    expect(vistaPreviaDelPaquete(FORM, 25000)).toBe("Cada sesión queda en $25.000")
    expect(vistaPreviaDelPaquete(FORM, 20000)).toBe("Cada sesión queda en $25.000")
    expect(vistaPreviaDelPaquete(FORM, null)).toBe("Cada sesión queda en $25.000")
  })

  it("reparte hacia abajo, como el servidor", () => {
    expect(vistaPreviaDelPaquete({ sesiones: "6", precio: "125000" }, 25000)).toBe(
      "Cada sesión queda en $20.833,33 (17 % menos que suelta)"
    )
  })

  it("no dice nada mientras falten o no sirvan las sesiones o el precio", () => {
    for (const datos of [
      { sesiones: "", precio: "150000" },
      { sesiones: "6", precio: "" },
      { sesiones: "1", precio: "150000" },
      { sesiones: "6", precio: "0" },
      { sesiones: "6", precio: "abc" },
      { sesiones: "50", precio: "0,3" },
    ]) {
      expect(vistaPreviaDelPaquete(datos, 30000), JSON.stringify(datos)).toBeNull()
    }
  })
})

describe("cuerpoDePaquete", () => {
  it("al crear manda el servicio, las sesiones, el precio en pesos y la vigencia", () => {
    expect(cuerpoDePaquete(FORM, "crear", PALABRAS)).toEqual({
      ok: true,
      datos: { servicioId: "s-laser", sesiones: 6, precio: 150000, vigenciaMeses: 6 },
    })
  })

  it("al editar no manda el servicio (no se cambia), y la vigencia vacía es `null`: no vence", () => {
    expect(cuerpoDePaquete({ ...FORM, vigencia: "" }, "editar", PALABRAS)).toEqual({
      ok: true,
      datos: { sesiones: 6, precio: 150000, vigenciaMeses: null },
    })
  })

  it("sin servicio, con sesiones fuera de 2 a 50 o con un precio que no sirve, dice qué corregir y no manda nada", () => {
    const errores = [
      cuerpoDePaquete({ ...FORM, servicioId: "" }, "crear", PALABRAS),
      cuerpoDePaquete({ ...FORM, sesiones: "1" }, "crear", PALABRAS),
      cuerpoDePaquete({ ...FORM, sesiones: "" }, "crear", PALABRAS),
      cuerpoDePaquete({ ...FORM, precio: "" }, "crear", PALABRAS),
      cuerpoDePaquete({ ...FORM, precio: "0" }, "crear", PALABRAS),
      cuerpoDePaquete({ ...FORM, precio: "150,000" }, "crear", PALABRAS),
      cuerpoDePaquete({ ...FORM, sesiones: "50", precio: "0,3" }, "crear", PALABRAS),
    ]
    for (const resultado of errores) {
      expect(resultado.ok).toBe(false)
      if (!resultado.ok) expect(resultado.error).not.toBe("")
    }
    expect(errores[0]).toEqual({ ok: false, error: "Elige el servicio del paquete." })
  })
})

describe("datosDelPaquete", () => {
  it("el paquete guardado vuelve al formulario tal como se escribiría", () => {
    expect(datosDelPaquete(LASER)).toEqual({ ...FORM, precio: "150000" })
    expect(datosDelPaquete({ ...LASER, vigenciaMeses: null }).vigencia).toBe("")
  })
})

describe("frasesDeLosPaquetes", () => {
  it("el vacío explica qué es un paquete y que se vende al cobrar en el tablero", () => {
    const frases = frasesDeLosPaquetes(PALABRAS)
    expect(frases.vacio).toBe(
      'Un paquete son varias sesiones de un servicio que tu cliente paga de una vez, por ejemplo "6 sesiones por $150.000". Lo creas acá y lo vendes al cobrar en el tablero.'
    )
    expect(frases.sinServicios).toContain("un servicio activo")
  })
})

describe("los pedidos de paquetes (`_datos.ts`)", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("crear manda el precio en pesos por POST y devuelve el paquete guardado", async () => {
    const fetchFalso = simularRespuesta(json(LASER, 201))

    const resultado = await crearPaquete(FORM)

    expect(resultado).toEqual({ ok: true, datos: LASER })
    const [ruta, opciones] = fetchFalso.mock.calls[0]
    expect(ruta).toBe("/api/configuracion/paquetes")
    expect(opciones.method).toBe("POST")
    expect(JSON.parse(opciones.body)).toEqual({ servicioId: "s-laser", sesiones: 6, precio: 150000, vigenciaMeses: 6 })
  })

  it("lo que no sirve no llega al servidor: vuelve el motivo", async () => {
    const fetchFalso = simularRespuesta(json(LASER, 201))

    expect(await crearPaquete({ ...FORM, sesiones: "1" })).toEqual({ ok: false, error: expect.stringContaining("entre 2 y 50") })
    expect(await editarPaquete("pq-1", { ...FORM, precio: "0" })).toEqual({ ok: false, error: expect.any(String) })
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it("editar y pausar van por PATCH al paquete; editar no manda el servicio", async () => {
    const fetchFalso = simularRespuesta(json(LASER))
    await editarPaquete("pq-1", FORM)
    expect(fetchFalso.mock.calls[0][0]).toBe("/api/configuracion/paquetes/pq-1")
    expect(fetchFalso.mock.calls[0][1].method).toBe("PATCH")
    expect(JSON.parse(fetchFalso.mock.calls[0][1].body)).toEqual({ sesiones: 6, precio: 150000, vigenciaMeses: 6 })

    const alPausar = simularRespuesta(json({ ...LASER, activo: false }))
    await pausarOReactivarPaquete("pq-1", false)
    expect(alPausar.mock.calls[0][1].method).toBe("PATCH")
    expect(JSON.parse(alPausar.mock.calls[0][1].body)).toEqual({ activo: false })
  })

  it("eliminar va por DELETE, y si el servidor lo rechaza se muestra su motivo", async () => {
    const fetchFalso = simularRespuesta(json({ mensaje: "Paquete eliminado" }))
    expect((await eliminarPaquete("pq-1")).ok).toBe(true)
    expect(fetchFalso.mock.calls[0]).toEqual(["/api/configuracion/paquetes/pq-1", { method: "DELETE" }])

    simularRespuesta(json({ error: "Paquete no encontrado" }, 404))
    expect(await eliminarPaquete("pq-1")).toEqual({ ok: false, error: "Paquete no encontrado" })
  })
})
