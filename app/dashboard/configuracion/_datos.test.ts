import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { vocabularioDe } from "@/lib/vocabulario"
import {
  cambiarMensajesAClientes,
  cambiarServiciosEnLote,
  cargarServiciosEnLote,
  crearServicio,
  cuerpoDeProducto,
  cuerpoDeServicio,
  editarServicio,
  guardarNombreDelNegocio,
  guardarPaginaPublica,
  guardarZonaHoraria,
  leerPorcentaje,
  leerServicios,
  leerSugeridos,
  moverSillon,
  quitarFotoDelNegocio,
  renombrarCategoria,
  subirFotoDelNegocio,
  type DatosDePaginaPublica,
  type DatosDeServicio,
} from "./_datos"

/** El cuerpo JSON con que se llamó a `fetch`. */
const cuerpoEnviado = (fetchFalso: ReturnType<typeof simularRespuesta>) =>
  JSON.parse(String((fetchFalso.mock.calls[0][1] as RequestInit).body))

const SERVICIO: DatosDeServicio = { name: "Corte", description: "", duration: 30, price: "", category: "", frecuenciaDias: "", esUrgencia: false }

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

describe("cuerpoDeServicio: urgencia (clínica dental)", () => {
  it("sin permiso para marcarla no se manda ni como false: el servidor la rechaza fuera de una clínica dental", () => {
    for (const esUrgencia of [false, true]) {
      const cuerpo = cuerpoDeServicio({ ...SERVICIO, esUrgencia })
      expect(cuerpo.ok && cuerpo.datos).not.toHaveProperty("esUrgencia")
      const deEdicion = cuerpoDeServicio({ ...SERVICIO, esUrgencia }, "editar", false)
      expect(deEdicion.ok && deEdicion.datos).not.toHaveProperty("esUrgencia")
    }
  })

  it("con permiso se manda tal cual, también desmarcada: así se desmarca al editar", () => {
    const marcada = cuerpoDeServicio({ ...SERVICIO, esUrgencia: true }, "crear", true)
    expect(marcada.ok && marcada.datos.esUrgencia).toBe(true)
    const desmarcada = cuerpoDeServicio({ ...SERVICIO, esUrgencia: false }, "editar", true)
    expect(desmarcada.ok && desmarcada.datos.esUrgencia).toBe(false)
  })
})

describe("crearServicio y editarServicio", () => {
  it("crear y editar mandan la urgencia sólo cuando se les dice que se puede", async () => {
    const sin = simularRespuesta(json({ id: "s1" }, 201))
    await crearServicio({ ...SERVICIO, esUrgencia: true })
    expect(cuerpoEnviado(sin)).not.toHaveProperty("esUrgencia")
    vi.unstubAllGlobals()

    const alCrear = simularRespuesta(json({ id: "s1" }, 201))
    await crearServicio({ ...SERVICIO, esUrgencia: true }, undefined, true)
    expect(cuerpoEnviado(alCrear)).toHaveProperty("esUrgencia", true)
    vi.unstubAllGlobals()

    const alEditar = simularRespuesta(json({ id: "s1" }))
    await editarServicio("s1", { ...SERVICIO, esUrgencia: false }, undefined, true)
    expect(cuerpoEnviado(alEditar)).toHaveProperty("esUrgencia", false)
  })

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

describe("guardarNombreDelNegocio", () => {
  it("manda el nombre por PUT a su ruta y devuelve cómo quedó", async () => {
    const fetchFalso = simularRespuesta(json({ nombre: "Salón Ana" }))

    const resultado = await guardarNombreDelNegocio("  Salón Ana ")

    expect(fetchFalso.mock.calls[0][0]).toBe("/api/configuracion/nombre")
    expect((fetchFalso.mock.calls[0][1] as RequestInit).method).toBe("PUT")
    expect(cuerpoEnviado(fetchFalso)).toEqual({ nombre: "  Salón Ana " })
    expect(resultado).toEqual({ ok: true, datos: { nombre: "Salón Ana" } })
  })

  it("el 400 vuelve con el mensaje del servidor", async () => {
    simularRespuesta(json({ error: "El nombre del negocio tiene que tener al menos 2 caracteres" }, 400))

    expect(await guardarNombreDelNegocio("A")).toEqual({
      ok: false,
      error: "El nombre del negocio tiene que tener al menos 2 caracteres",
    })
  })

  it("sin respuesta del servidor, un mensaje y no una excepción", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fallo de red")))

    const resultado = await guardarNombreDelNegocio("Salón Ana")

    expect(resultado.ok).toBe(false)
  })
})

describe("guardarZonaHoraria", () => {
  it("manda la zona por PUT a su ruta y devuelve la que quedó", async () => {
    const fetchFalso = simularRespuesta(json({ zona: "Pacific/Easter" }))

    const resultado = await guardarZonaHoraria("Pacific/Easter")

    expect(fetchFalso.mock.calls[0][0]).toBe("/api/configuracion/zona-horaria")
    expect((fetchFalso.mock.calls[0][1] as RequestInit).method).toBe("PUT")
    expect(cuerpoEnviado(fetchFalso)).toEqual({ zona: "Pacific/Easter" })
    expect(resultado).toEqual({ ok: true, datos: { zona: "Pacific/Easter" } })
  })

  it("el 401 de quien no es la dueña vuelve con el mensaje del servidor", async () => {
    simularRespuesta(json({ error: "No autorizado" }, 401))

    expect(await guardarZonaHoraria("Pacific/Easter")).toEqual({ ok: false, error: "No autorizado" })
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

describe("fotos del negocio", () => {
  const FOTO = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" })

  it("el logo y la portada suben a su propia ruta, con los bytes crudos y el tipo de la imagen", async () => {
    for (const tipo of ["logo", "portada"] as const) {
      const fetchFalso = simularRespuesta(json({ url: `/fotos/negocios/n1/${tipo}.webp` }))
      expect(await subirFotoDelNegocio(tipo, FOTO)).toEqual({ ok: true, url: `/fotos/negocios/n1/${tipo}.webp` })
      const [ruta, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
      expect(ruta).toBe(`/api/configuracion/fotos/${tipo}`)
      expect(opciones.method).toBe("PUT")
      expect(opciones.body).toBe(FOTO)
      expect(opciones.headers).toEqual({ "Content-Type": "image/webp" })
    }
  })

  it("quitar hace DELETE a la ruta del tipo y devuelve url null", async () => {
    const fetchFalso = simularRespuesta(json({ url: null }))
    expect(await quitarFotoDelNegocio("portada")).toEqual({ ok: true, url: null })
    const [ruta, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(ruta).toBe("/api/configuracion/fotos/portada")
    expect(opciones.method).toBe("DELETE")
  })

  it("el mensaje del servidor llega tal cual a la pantalla", async () => {
    simularRespuesta(json({ error: "La foto pesa más de 5 MB. Sube una más liviana." }, 413))
    expect(await subirFotoDelNegocio("logo", FOTO)).toEqual({
      ok: false,
      error: "La foto pesa más de 5 MB. Sube una más liviana.",
    })
  })
})

// ─── Servicios en lote ───────────────────────────────────────────────────────

/** Varias respuestas en orden, una por pedido. */
const simularRespuestas = (...respuestas: Response[]) => {
  const fetchFalso = vi.fn()
  for (const respuesta of respuestas) fetchFalso.mockResolvedValueOnce(respuesta)
  vi.stubGlobal("fetch", fetchFalso)
  return fetchFalso
}

const cuerpoDeLaLlamada = (fetchFalso: ReturnType<typeof vi.fn>, n: number) => JSON.parse(String((fetchFalso.mock.calls[n][1] as RequestInit).body))

const paraCargar = (cuantos: number) =>
  Array.from({ length: cuantos }, (_, i) => ({ name: `Servicio ${i + 1}`, duration: 30, price: null, category: null, description: null }))

const PRESTACIONES = vocabularioDe("odontologia").palabras

describe("cargarServiciosEnLote", () => {
  it("manda una sola carga si caben en 100 y cuenta lo creado y lo omitido", async () => {
    const fetchFalso = simularRespuesta(json({ creados: 2, omitidos: [{ fila: 3, name: "Corte", motivo: "Ya existe un servicio con ese nombre" }] }, 201))
    const resultado = await cargarServiciosEnLote(paraCargar(3))
    expect(fetchFalso).toHaveBeenCalledTimes(1)
    expect(fetchFalso.mock.calls[0][0]).toBe("/api/configuracion/servicios/lote")
    expect((fetchFalso.mock.calls[0][1] as RequestInit).method).toBe("POST")
    expect(cuerpoEnviado(fetchFalso).servicios).toHaveLength(3)
    expect(resultado).toEqual({
      ok: true,
      creados: 2,
      omitidos: [{ fila: 3, name: "Corte", motivo: "Ya existe un servicio con ese nombre" }],
      sinEnviar: 0,
      error: null,
    })
  })

  it("250 servicios van en tres tandas (100, 100 y 50) y se juntan los resultados, con la fila de la carga entera", async () => {
    const fetchFalso = simularRespuestas(
      json({ creados: 100, omitidos: [] }, 201),
      json({ creados: 99, omitidos: [{ fila: 4, name: "Servicio 104", motivo: "x" }] }, 201),
      json({ creados: 50, omitidos: [] }, 201)
    )
    const resultado = await cargarServiciosEnLote(paraCargar(250))
    expect(fetchFalso).toHaveBeenCalledTimes(3)
    expect([0, 1, 2].map((n) => cuerpoDeLaLlamada(fetchFalso, n).servicios.length)).toEqual([100, 100, 50])
    // Una tanda no repite lo que mandó la anterior.
    expect(cuerpoDeLaLlamada(fetchFalso, 1).servicios[0].name).toBe("Servicio 101")
    expect(resultado).toMatchObject({ ok: true, creados: 249, omitidos: [{ fila: 104, name: "Servicio 104" }], sinEnviar: 0 })
  })

  it("si una tanda falla, corta: dice lo que sí se creó y cuántos quedaron sin enviar", async () => {
    const fetchFalso = simularRespuestas(json({ creados: 100, omitidos: [] }, 201), new Response("<html>", { status: 429 }), json({ creados: 1 }))
    const resultado = await cargarServiciosEnLote(paraCargar(250))
    expect(fetchFalso).toHaveBeenCalledTimes(2)
    expect(resultado).toEqual({
      ok: false,
      creados: 100,
      omitidos: [],
      sinEnviar: 150,
      error: "Hiciste varios cambios seguidos. Espera un momento e inténtalo de nuevo.",
    })
  })

  it("el 409 del tope trae el mensaje del servidor", async () => {
    simularRespuesta(json({ error: "Se pueden tener hasta 300 servicios y ya tienes 290." }, 409))
    expect(await cargarServiciosEnLote(paraCargar(20))).toMatchObject({
      ok: false,
      creados: 0,
      sinEnviar: 20,
      error: "Se pueden tener hasta 300 servicios y ya tienes 290.",
    })
  })

  it("sin mensaje del servidor, el del código, con las palabras del rubro", async () => {
    simularRespuesta(new Response("", { status: 401 }))
    expect(await cargarServiciosEnLote(paraCargar(1), PRESTACIONES)).toMatchObject({ ok: false, error: expect.stringContaining("sesión terminó") })
    simularRespuesta(new Response("", { status: 502 }))
    expect(await cargarServiciosEnLote(paraCargar(1), PRESTACIONES)).toMatchObject({
      error: "No se pudieron agregar las prestaciones. Inténtalo de nuevo.",
    })
  })

  it("sin conexión no lanza: devuelve el aviso", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")))
    expect(await cargarServiciosEnLote(paraCargar(2))).toMatchObject({ ok: false, creados: 0, sinEnviar: 2, error: "Sin conexión con el servidor" })
  })

  it("sin nada que cargar no pide nada", async () => {
    const fetchFalso = simularRespuesta(json({}))
    expect(await cargarServiciosEnLote([])).toMatchObject({ ok: true, creados: 0 })
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})

describe("cambiarServiciosEnLote", () => {
  it("manda los ids y el cambio con PATCH y devuelve cuántos actualizó", async () => {
    const fetchFalso = simularRespuesta(json({ actualizados: 2 }))
    const resultado = await cambiarServiciosEnLote(["a", "b"], { category: "Color" })
    expect(fetchFalso.mock.calls[0][0]).toBe("/api/configuracion/servicios/lote")
    expect((fetchFalso.mock.calls[0][1] as RequestInit).method).toBe("PATCH")
    expect(cuerpoEnviado(fetchFalso)).toEqual({ ids: ["a", "b"], category: "Color" })
    expect(resultado).toEqual({ ok: true, actualizados: 2 })
  })

  it("quitar la categoría manda null; activar o desactivar manda active", async () => {
    const fetchFalso = simularRespuesta(json({ actualizados: 1 }))
    await cambiarServiciosEnLote(["a"], { category: null })
    expect(cuerpoEnviado(fetchFalso)).toEqual({ ids: ["a"], category: null })
    await cambiarServiciosEnLote(["a"], { active: false })
    expect(JSON.parse(String((fetchFalso.mock.calls[1][1] as RequestInit).body))).toEqual({ ids: ["a"], active: false })
  })

  it("hasta 200 ids van en un solo pedido; más, en tandas que se suman (el servidor acepta 200 por pedido)", async () => {
    const unPedido = simularRespuesta(json({ actualizados: 200 }))
    expect(await cambiarServiciosEnLote(Array.from({ length: 200 }, (_, i) => `id${i}`), { active: true })).toEqual({ ok: true, actualizados: 200 })
    expect(unPedido).toHaveBeenCalledTimes(1)

    const ids = Array.from({ length: 430 }, (_, i) => `id${i}`)
    const fetchFalso = simularRespuestas(json({ actualizados: 200 }), json({ actualizados: 200 }), json({ actualizados: 30 }))
    expect(await cambiarServiciosEnLote(ids, { active: true })).toEqual({ ok: true, actualizados: 430 })
    expect([0, 1, 2].map((n) => cuerpoDeLaLlamada(fetchFalso, n).ids.length)).toEqual([200, 200, 30])
  })

  it("si falla a la mitad, dice cuántos alcanzó a cambiar", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`)
    simularRespuestas(json({ actualizados: 200 }), json({ error: "Error interno" }, 500))
    expect(await cambiarServiciosEnLote(ids, { active: false }, PRESTACIONES)).toEqual({
      ok: false,
      actualizados: 200,
      error: "No se pudieron cambiar las prestaciones. Inténtalo de nuevo.",
    })
  })

  it("sin ids no pide nada", async () => {
    const fetchFalso = simularRespuesta(json({}))
    expect(await cambiarServiciosEnLote([], { active: true })).toEqual({ ok: true, actualizados: 0 })
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})

describe("renombrarCategoria", () => {
  it("manda de y a, y null es sin categoría", async () => {
    const fetchFalso = simularRespuesta(json({ actualizados: 4 }))
    expect(await renombrarCategoria("Color", "Tintes")).toEqual({ ok: true, datos: { actualizados: 4 } })
    expect(fetchFalso.mock.calls[0][0]).toBe("/api/configuracion/servicios/categorias")
    expect((fetchFalso.mock.calls[0][1] as RequestInit).method).toBe("POST")
    expect(cuerpoEnviado(fetchFalso)).toEqual({ de: "Color", a: "Tintes" })
    await renombrarCategoria(null, "Otros")
    expect(JSON.parse(String((fetchFalso.mock.calls[1][1] as RequestInit).body))).toEqual({ de: null, a: "Otros" })
  })

  it("un fallo es un { ok: false } con el mensaje, no una excepción", async () => {
    simularRespuesta(new Response("", { status: 429 }))
    expect(await renombrarCategoria("Color", "Tintes")).toEqual({
      ok: false,
      error: "Hiciste varios cambios seguidos. Espera un momento e inténtalo de nuevo.",
    })
  })
})

describe("leerSugeridos y leerServicios", () => {
  const SUGERIDO = { clave: "corte", name: "Corte", duration: 45, price: 15000, category: "Corte", yaExiste: false }

  it("leerSugeridos devuelve la lista de { sugeridos }", async () => {
    const fetchFalso = simularRespuesta(json({ sugeridos: [SUGERIDO] }))
    expect(await leerSugeridos()).toEqual({ ok: true, datos: [SUGERIDO] })
    expect(fetchFalso.mock.calls[0][0]).toBe("/api/configuracion/servicios/sugeridos")
  })

  it("una respuesta que no es la esperada es un error, no una pantalla rota", async () => {
    simularRespuesta(json({ otra: 1 }))
    expect(await leerSugeridos()).toEqual({ ok: false, error: "No se pudieron cargar los servicios sugeridos. Inténtalo de nuevo." })
    simularRespuesta(json({ error: "No autorizado" }, 401))
    expect(await leerSugeridos(PRESTACIONES)).toEqual({ ok: false, error: "No autorizado" })
  })

  it("leerServicios devuelve la lista del servidor", async () => {
    const fetchFalso = simularRespuesta(json([{ id: "a" }]))
    expect(await leerServicios()).toEqual({ ok: true, datos: [{ id: "a" }] })
    expect(fetchFalso.mock.calls[0][0]).toBe("/api/configuracion/servicios")
    simularRespuesta(json({ no: "es una lista" }))
    expect(await leerServicios()).toMatchObject({ ok: false })
  })
})
