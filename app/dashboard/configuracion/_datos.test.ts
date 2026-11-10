import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import {
  cambiarMensajesAClientes,
  crearServicio,
  cuerpoDeProducto,
  cuerpoDeServicio,
  editarServicio,
  guardarPaginaPublica,
  leerPorcentaje,
  moverSillon,
  type DatosDePaginaPublica,
  type DatosDeServicio,
} from "./_datos"

/** El cuerpo JSON con que se llamó a `fetch`. */
const cuerpoEnviado = (fetchFalso: ReturnType<typeof simularRespuesta>) =>
  JSON.parse(String((fetchFalso.mock.calls[0][1] as RequestInit).body))

const SERVICIO: DatosDeServicio = { name: "Corte", description: "", duration: 30, price: "", category: "", frecuenciaDias: "" }

const precioLeido = (texto: string) => {
  const cuerpo = cuerpoDeServicio({ ...SERVICIO, price: texto })
  return cuerpo.ok ? cuerpo.datos.price : null
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("cuerpoDeServicio", () => {
  it("lee los miles con punto, como se ven en pantalla: 8.000 es ocho mil, no 8", () => {
    expect(precioLeido("8.000")).toBe(8000)
    expect(precioLeido("8000")).toBe(8000)
    expect(precioLeido("8.000,50")).toBe(8000.5)
    expect(precioLeido("25.000")).toBe(25000)
  })

  it("precio y descripción vacíos no se mandan; la categoría vacía se borra", () => {
    expect(cuerpoDeServicio(SERVICIO)).toEqual({
      ok: true,
      datos: { name: "Corte", description: undefined, duration: 30, price: undefined, category: null, frecuenciaDias: null },
    })
  })

  it("la categoría se manda sin los espacios de las puntas", () => {
    const cuerpo = cuerpoDeServicio({ ...SERVICIO, category: "  Color " })
    expect(cuerpo.ok && cuerpo.datos.category).toBe("Color")
  })

  it("un precio que no se puede leer sin adivinar es un error, no otro precio", () => {
    expect(cuerpoDeServicio({ ...SERVICIO, price: "8,000" })).toEqual({
      ok: false,
      error: expect.stringContaining("No se entiende el precio"),
    })
  })
})

describe("cuerpoDeServicio: frecuencia (#75)", () => {
  it("una frecuencia escrita se manda como número de días", () => {
    const cuerpo = cuerpoDeServicio({ ...SERVICIO, frecuenciaDias: " 30 " })
    expect(cuerpo.ok && cuerpo.datos.frecuenciaDias).toBe(30)
  })

  it("vacía se manda como null, para que al editar se borre", () => {
    const cuerpo = cuerpoDeServicio({ ...SERVICIO, frecuenciaDias: "" })
    expect(cuerpo.ok && cuerpo.datos.frecuenciaDias).toBeNull()
  })

  it("fuera de 7 a 365 días es un error, no se manda otra cosa", () => {
    for (const texto of ["6", "366", "0"]) {
      expect(cuerpoDeServicio({ ...SERVICIO, frecuenciaDias: texto })).toEqual({
        ok: false,
        error: expect.stringContaining("entre 7 y 365"),
      })
    }
  })
})

describe("crearServicio y editarServicio", () => {
  it("crear manda 8.000 como 8000", async () => {
    const fetchFalso = simularRespuesta(json({ id: "s1" }, 201))

    await crearServicio({ ...SERVICIO, price: "8.000" })

    expect(cuerpoEnviado(fetchFalso).price).toBe(8000)
  })

  it("editar manda 8.000,50 como 8000,5", async () => {
    const fetchFalso = simularRespuesta(json({ id: "s1" }))

    await editarServicio("s1", { ...SERVICIO, price: "8.000,50" })

    expect(cuerpoEnviado(fetchFalso).price).toBe(8000.5)
  })

  it("crear y editar mandan la frecuencia; editar con el campo vacío manda null", async () => {
    const alCrear = simularRespuesta(json({ id: "s1" }, 201))
    await crearServicio({ ...SERVICIO, frecuenciaDias: "45" })
    expect(cuerpoEnviado(alCrear).frecuenciaDias).toBe(45)
    vi.unstubAllGlobals()

    const alEditar = simularRespuesta(json({ id: "s1" }))
    await editarServicio("s1", { ...SERVICIO, frecuenciaDias: "" })
    expect(cuerpoEnviado(alEditar)).toHaveProperty("frecuenciaDias", null)
  })

  it("editar con precio y descripción vacíos manda null, para borrarlos; crear no los manda", async () => {
    const alEditar = simularRespuesta(json({ id: "s1" }))
    await editarServicio("s1", { ...SERVICIO, price: " ", description: "" })
    expect(cuerpoEnviado(alEditar)).toMatchObject({ price: null, description: null })
    vi.unstubAllGlobals()

    const alCrear = simularRespuesta(json({ id: "s1" }, 201))
    await crearServicio({ ...SERVICIO, price: "", description: "" })
    expect(cuerpoEnviado(alCrear)).not.toHaveProperty("price")
    expect(cuerpoEnviado(alCrear)).not.toHaveProperty("description")
  })

  it("con una frecuencia fuera de rango no llama al servidor", async () => {
    const fetchFalso = simularRespuesta(json({ id: "s1" }))

    const resultado = await crearServicio({ ...SERVICIO, frecuenciaDias: "400" })

    expect(resultado.ok).toBe(false)
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it("con un precio ilegible no llama al servidor y devuelve el motivo", async () => {
    const fetchFalso = simularRespuesta(json({ id: "s1" }))

    const resultado = await editarServicio("s1", { ...SERVICIO, price: "abc" })

    expect(resultado.ok).toBe(false)
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})

describe("productos (#67): cuerpoDeProducto y leerPorcentaje", () => {
  const PRODUCTO = { nombre: " Shampoo ", precio: "12.000", porcentaje: "12,5" }

  it("sin poder fijar el %, no lo manda aunque esté escrito: el servidor lo rechazaría", () => {
    expect(cuerpoDeProducto(PRODUCTO, false)).toEqual({ ok: true, datos: { nombre: "Shampoo", precio: 12000 } })
  })

  it("la dueña lo manda leído con coma; vacío es null (sin configurar), nunca 0", () => {
    expect(cuerpoDeProducto(PRODUCTO, true)).toEqual({ ok: true, datos: { nombre: "Shampoo", precio: 12000, porcentaje: 12.5 } })
    expect(cuerpoDeProducto({ ...PRODUCTO, porcentaje: "" }, true)).toEqual({
      ok: true,
      datos: { nombre: "Shampoo", precio: 12000, porcentaje: null },
    })
    expect(leerPorcentaje("0")).toEqual({ ok: true, porcentaje: 0 })
    expect(leerPorcentaje("10 %")).toEqual({ ok: true, porcentaje: 10 })
  })

  it("el precio vacío es null; uno ilegible es un error y no se manda", () => {
    expect(cuerpoDeProducto({ ...PRODUCTO, precio: "" }, false)).toEqual({ ok: true, datos: { nombre: "Shampoo", precio: null } })
    expect(cuerpoDeProducto({ ...PRODUCTO, precio: "doce" }, false).ok).toBe(false)
  })

  it("un % fuera de 0-100 o con más de dos decimales es un error", () => {
    expect(leerPorcentaje("101").ok).toBe(false)
    expect(leerPorcentaje("-1").ok).toBe(false)
    expect(leerPorcentaje("33,333").ok).toBe(false)
    expect(leerPorcentaje("abc").ok).toBe(false)
  })
})

describe("cambiarMensajesAClientes", () => {
  it("manda sólo lo que cambia, por PUT, a la ruta de mensajes", async () => {
    const fetchFalso = simularRespuesta(json({ interruptores: { listaDeEsperaActiva: true, avisoDeVueltaActivo: false, pideResenas: true } }))

    const resultado = await cambiarMensajesAClientes({ pideResenas: true })

    expect(fetchFalso.mock.calls[0][0]).toBe("/api/configuracion/mensajes")
    expect((fetchFalso.mock.calls[0][1] as RequestInit).method).toBe("PUT")
    expect(cuerpoEnviado(fetchFalso)).toEqual({ pideResenas: true })
    expect(resultado).toEqual({ ok: true, datos: { interruptores: { listaDeEsperaActiva: true, avisoDeVueltaActivo: false, pideResenas: true } } })
  })

  it("el 400 sin enlace vuelve con el mensaje del servidor", async () => {
    simularRespuesta(json({ error: "Para pedir reseñas, primero agrega el enlace" }, 400))

    expect(await cambiarMensajesAClientes({ pideResenas: true })).toEqual({
      ok: false,
      error: "Para pedir reseñas, primero agrega el enlace",
    })
  })
})

describe("guardarPaginaPublica (#113)", () => {
  const ana = { memberId: "m-ana", nombre: "Ana", especialidad: "Colorista" }
  const beto = { memberId: "m-beto", nombre: "Beto", especialidad: "" }
  const pagina = (especialidades: DatosDePaginaPublica["especialidades"]): DatosDePaginaPublica => ({
    address: "",
    comuna: "",
    whatsapp: "",
    instagram: "",
    enlaceResenas: "",
    color: "lima",
    mediosDePago: [],
    especialidades,
  })

  it("manda sólo las especialidades que cambiaron: las demás no se reescriben con lo que tenía la pantalla", async () => {
    const fetchFalso = simularRespuesta(json({}))
    await guardarPaginaPublica(pagina([ana, { ...beto, especialidad: "Barbero" }]), [ana, beto])
    expect(cuerpoEnviado(fetchFalso).especialidades).toEqual([{ memberId: "m-beto", especialidad: "Barbero" }])
  })

  it("sin cambios en las especialidades, no manda ninguna", async () => {
    const fetchFalso = simularRespuesta(json({}))
    await guardarPaginaPublica(pagina([ana, beto]), [ana, beto])
    expect(cuerpoEnviado(fetchFalso).especialidades).toEqual([])
  })

  it("borrar una especialidad también es un cambio: va vacía", async () => {
    const fetchFalso = simularRespuesta(json({}))
    await guardarPaginaPublica(pagina([{ ...ana, especialidad: "" }, beto]), [ana, beto])
    expect(cuerpoEnviado(fetchFalso).especialidades).toEqual([{ memberId: "m-ana", especialidad: "" }])
  })
})

describe("moverSillon", () => {
  const SILLONES = [
    { id: "a", nombre: "Sillón 1", orden: 0, activo: true },
    { id: "b", nombre: "Sillón 2", orden: 1, activo: false },
    { id: "c", nombre: "Sillón 3", orden: 2, activo: true },
  ]

  it("subir cambia de lugar con el de arriba, y sólo esos dos cambian de orden", () => {
    const movido = moverSillon(SILLONES, "b", -1)
    expect(movido?.lista.map((sillon) => [sillon.id, sillon.orden])).toEqual([["b", 0], ["a", 1], ["c", 2]])
    expect(movido?.cambios).toEqual([{ id: "b", orden: 0 }, { id: "a", orden: 1 }])
  })

  it("bajar cambia de lugar con el de abajo", () => {
    expect(moverSillon(SILLONES, "a", 1)?.lista.map((sillon) => sillon.id)).toEqual(["b", "a", "c"])
  })

  it("con órdenes repetidos o con huecos, los vuelve a numerar de 0 en adelante", () => {
    const repetidos = SILLONES.map((sillon) => ({ ...sillon, orden: 5 }))
    const movido = moverSillon(repetidos, "c", -1)
    expect(movido?.lista.map((sillon) => [sillon.id, sillon.orden])).toEqual([["a", 0], ["c", 1], ["b", 2]])
    expect(movido?.cambios).toEqual([{ id: "a", orden: 0 }, { id: "c", orden: 1 }, { id: "b", orden: 2 }])
  })

  it("el primero no sube, el último no baja, y uno que no está no se mueve", () => {
    expect(moverSillon(SILLONES, "a", -1)).toBeNull()
    expect(moverSillon(SILLONES, "c", 1)).toBeNull()
    expect(moverSillon(SILLONES, "x", 1)).toBeNull()
  })

  it("no toca la lista que recibe", () => {
    moverSillon(SILLONES, "b", -1)
    expect(SILLONES.map((sillon) => sillon.id)).toEqual(["a", "b", "c"])
  })
})
