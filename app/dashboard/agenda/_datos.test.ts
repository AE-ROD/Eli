import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { vocabularioDe } from "@/lib/vocabulario"
import { aQuienBloquea, asignarProfesional, cambiarEstadoDeCita, citaPorConfirmar, conEstadoNuevo, precioDeLosServicios, crearBloqueo, crearCita, destacaSinProfesional, hayProfesionales, moverCita, nombreDelProfesional, opcionesDeProfesional, precioDeLaCita, quienCancelo, serviciosParaElProfesional, idsDeServiciosElegidos, quitarBloqueo, reactivarCita, leerCatalogoDeLaCita, leerCitas, buscarClientes, leerClienteParaLaCita, llegadaALaAgenda, type Bloqueo, type Cita, type DatosDeNuevaCita } from "./_datos"

/** El cuerpo JSON con que se llamó a `fetch`. */
const cuerpoEnviado = (fetchFalso: ReturnType<typeof simularRespuesta>) =>
  JSON.parse(String((fetchFalso.mock.calls[0][1] as RequestInit).body))

const CITA: DatosDeNuevaCita = {
  clienteId: "cliente-1",
  clienteNombre: "Ana",
  servicio: "Corte",
  servicioIds: "",
  fecha: "2026-10-20",
  horaInicio: "10:00",
  horaFin: "10:30",
  precio: "",
  notas: "",
  memberId: "",
}

/** La zona del negocio: las horas se escriben en ella, no en la del navegador (#99). */
const ZONA = "America/Santiago"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("citaPorConfirmar", () => {
  it("pendiente con la marca: por confirmar; si el cliente ya llegó al Tablero, ya no", () => {
    expect(citaPorConfirmar({ status: "pendiente", confirmacionPorFaltas: true })).toBe(true)
    expect(citaPorConfirmar({ status: "pendiente", confirmacionPorFaltas: true, conAtencion: true })).toBe(false)
    expect(citaPorConfirmar({ status: "confirmada", confirmacionPorFaltas: true })).toBe(false)
    expect(citaPorConfirmar({ status: "pendiente" })).toBe(false)
  })
})

describe("precioDeLaCita", () => {
  it("lee los miles con punto, como se ven en pantalla: 8.000 es ocho mil, no 8", () => {
    expect(precioDeLaCita("8.000")).toEqual({ ok: true, datos: 8000 })
    expect(precioDeLaCita("8000")).toEqual({ ok: true, datos: 8000 })
    expect(precioDeLaCita("8.000,50")).toEqual({ ok: true, datos: 8000.5 })
    expect(precioDeLaCita("15.000")).toEqual({ ok: true, datos: 15000 })
  })

  it("vacío es sin precio", () => {
    expect(precioDeLaCita("")).toEqual({ ok: true, datos: undefined })
    expect(precioDeLaCita("  ")).toEqual({ ok: true, datos: undefined })
  })

  it("lo que no se puede leer sin adivinar es un error, no otro precio", () => {
    expect(precioDeLaCita("8,000")).toEqual({ ok: false, error: expect.stringContaining("No se entiende el precio") })
    expect(precioDeLaCita("abc").ok).toBe(false)
  })
})

describe("crearCita", () => {
  it("con servicios del catálogo manda sus ids y no el texto (#159)", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }, 201))

    await crearCita({ ...CITA, servicio: "lo escrito", servicioIds: "s-corte,s-color" }, ZONA)

    expect(cuerpoEnviado(fetchFalso).servicioIds).toEqual(["s-corte", "s-color"])
    expect(cuerpoEnviado(fetchFalso)).not.toHaveProperty("title")
  })

  it("sin servicios del catálogo manda el texto libre y no servicioIds", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }, 201))

    await crearCita(CITA, ZONA)

    expect(cuerpoEnviado(fetchFalso).title).toBe("Corte")
    expect(cuerpoEnviado(fetchFalso)).not.toHaveProperty("servicioIds")
  })

  it("manda 8.000 como 8000", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }, 201))

    await crearCita({ ...CITA, precio: "8.000" }, ZONA)

    expect(cuerpoEnviado(fetchFalso).price).toBe(8000)
  })

  it("sin precio no manda el campo", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }, 201))

    await crearCita(CITA, ZONA)

    expect(cuerpoEnviado(fetchFalso)).not.toHaveProperty("price")
  })

  it("con un precio ilegible no llama al servidor y devuelve el motivo", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }, 201))

    const resultado = await crearCita({ ...CITA, precio: "8,000" }, ZONA)

    expect(resultado.tipo).toBe("error")
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it("creada: 'guardada'", async () => {
    simularRespuesta(json({ id: "c1" }, 201))

    expect(await crearCita(CITA, ZONA)).toEqual({ tipo: "guardada" })
  })

  it("un 409 con advertencias las devuelve para preguntar, sin dar la cita por creada", async () => {
    const advertencias = [{ tipo: "bloqueo", mensaje: "Carla tiene bloqueado de 13:00 a 14:00." }]
    simularRespuesta(json({ error: advertencias[0].mensaje, advertencias }, 409))

    expect(await crearCita(CITA, ZONA)).toEqual({ tipo: "advertencias", advertencias })
  })

  it("el primer envío no confirma; 'guardar igual' manda confirmarAdvertencias", async () => {
    const primero = simularRespuesta(json({ id: "c1" }, 201))
    await crearCita(CITA, ZONA)
    expect(cuerpoEnviado(primero)).not.toHaveProperty("confirmarAdvertencias")

    const segundo = simularRespuesta(json({ id: "c1" }, 201))
    await crearCita(CITA, ZONA, { confirmar: true })
    expect(cuerpoEnviado(segundo).confirmarAdvertencias).toBe(true)
  })

  it("las horas son las del negocio: 10:00 en Santiago y 10:00 en Tokio son instantes distintos (#99)", async () => {
    const enSantiago = simularRespuesta(json({ id: "c1" }, 201))
    await crearCita(CITA, ZONA)
    expect(cuerpoEnviado(enSantiago)).toMatchObject({
      startTime: "2026-10-20T13:00:00.000Z",
      endTime: "2026-10-20T13:30:00.000Z",
    })

    const enTokio = simularRespuesta(json({ id: "c1" }, 201))
    await crearCita(CITA, "Asia/Tokyo")
    expect(cuerpoEnviado(enTokio).startTime).toBe("2026-10-20T01:00:00.000Z")
  })

  it("una fecha u hora que no existe no llama al servidor", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }, 201))
    expect(await crearCita({ ...CITA, fecha: "2026-02-30" }, ZONA)).toEqual({ tipo: "error", error: "La fecha o la hora no son válidas" })
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it("otro error del servidor es un error, con su mensaje", async () => {
    simularRespuesta(json({ error: "Cliente no encontrado" }, 404))

    expect(await crearCita(CITA, ZONA)).toEqual({ tipo: "error", error: "Cliente no encontrado" })
  })
})

describe("bloqueos", () => {
  const BLOQUEO = {
    memberId: "m-carla",
    fechaDesde: "2026-10-20",
    horaDesde: "13:00",
    fechaHasta: "2026-10-20",
    horaHasta: "14:00",
    motivo: "  Almuerzo ",
  }

  it("crear manda el profesional, el tramo en ISO y el motivo sin espacios", async () => {
    const fetchFalso = simularRespuesta(json({ id: "b1" }, 201))

    const resultado = await crearBloqueo(BLOQUEO, ZONA)

    expect(resultado.ok).toBe(true)
    const cuerpo = cuerpoEnviado(fetchFalso)
    expect(cuerpo).toMatchObject({ memberId: "m-carla", motivo: "Almuerzo" })
    // Las 13:00 y las 14:00 de Santiago (UTC-3 en octubre), no las del navegador (#99).
    expect(cuerpo.startTime).toBe("2026-10-20T16:00:00.000Z")
    expect(cuerpo.endTime).toBe("2026-10-20T17:00:00.000Z")
  })

  it("sin profesional es todo el negocio (null), y sin motivo no manda el campo", async () => {
    const fetchFalso = simularRespuesta(json({ id: "b1" }, 201))

    await crearBloqueo({ ...BLOQUEO, memberId: "", motivo: " " }, ZONA)

    expect(cuerpoEnviado(fetchFalso).memberId).toBeNull()
    expect(cuerpoEnviado(fetchFalso)).not.toHaveProperty("motivo")
  })

  it("un hasta que no es después del desde no llama al servidor", async () => {
    const fetchFalso = simularRespuesta(json({ id: "b1" }, 201))

    const resultado = await crearBloqueo({ ...BLOQUEO, horaHasta: "13:00" }, ZONA)

    expect(resultado).toEqual({ ok: false, error: "El bloqueo tiene que terminar después de empezar" })
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it("quitar pide DELETE al bloqueo", async () => {
    const fetchFalso = simularRespuesta(json({ mensaje: "Bloqueo quitado" }))

    await quitarBloqueo("b-1")

    expect(fetchFalso.mock.calls[0][0]).toBe("/api/bloqueos/b-1")
    expect((fetchFalso.mock.calls[0][1] as RequestInit).method).toBe("DELETE")
  })

  it("de quién es: el profesional, o todo el negocio", () => {
    const base: Bloqueo = { id: "b", memberId: null, startTime: "", endTime: "", motivo: null, member: null }
    expect(aQuienBloquea(base)).toBe("Todo el negocio")
    expect(aQuienBloquea({ ...base, memberId: "m", member: { user: { name: "Carla" } } })).toBe("Carla")
  })
})

describe("moverCita", () => {
  it("manda el nuevo horario en la hora del negocio (#99)", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }))

    await moverCita("c1", { fecha: "2026-10-20", horaInicio: "10:00", horaFin: "11:00", memberId: "" }, ZONA, {
      confirmar: false,
      asignaProfesional: false,
    })

    expect(fetchFalso.mock.calls[0][0]).toBe("/api/citas/c1")
    expect(cuerpoEnviado(fetchFalso)).toEqual({ startTime: "2026-10-20T13:00:00.000Z", endTime: "2026-10-20T14:00:00.000Z" })
  })
})

describe("citas sin profesional (#103)", () => {
  it("hay profesionales si alguien del equipo tiene rol profesional; un encargado solo no cuenta", () => {
    expect(hayProfesionales([{ id: "m1", nombre: "Carla", rol: "worker" }])).toBe(true)
    expect(hayProfesionales([{ id: "m2", nombre: "Enzo", rol: "admin" }])).toBe(false)
    expect(hayProfesionales([])).toBe(false)
  })

  it("el selector ofrece al equipo que atiende y, si la cita está con alguien de fuera de esa lista, también a él (#140)", () => {
    const equipo = [{ id: "m1", nombre: "Carla", rol: "worker" }]
    expect(opcionesDeProfesional(equipo, { memberId: "m1", member: null })).toEqual([{ valor: "m1", texto: "Carla" }])
    expect(opcionesDeProfesional(equipo, { memberId: null, member: null })).toEqual([{ valor: "m1", texto: "Carla" }])
    expect(
      opcionesDeProfesional(equipo, { memberId: "m-enc", member: { id: "m-enc", user: { name: "Enzo" } } })
    ).toEqual([
      { valor: "m1", texto: "Carla" },
      { valor: "m-enc", texto: "Enzo" },
    ])
  })

  it("se destaca la sin asignar que todavía se puede cambiar, sólo si hay a quién asignarla", () => {
    expect(destacaSinProfesional({ memberId: null, status: "pendiente" }, true)).toBe(true)
    expect(destacaSinProfesional({ memberId: undefined, status: "confirmada" }, true)).toBe(true)
    expect(destacaSinProfesional({ memberId: "m1", status: "pendiente" }, true)).toBe(false)
    expect(destacaSinProfesional({ memberId: null, status: "pendiente" }, false)).toBe(false)
    for (const cerrada of ["cancelada", "completada", "no-asistio"]) {
      expect(destacaSinProfesional({ memberId: null, status: cerrada }, true)).toBe(false)
    }
  })

  it("el nombre del profesional, o null sin asignar", () => {
    expect(nombreDelProfesional({ memberId: "m1", member: { id: "m1", user: { name: "Carla" } } })).toBe("Carla")
    expect(nombreDelProfesional({ memberId: "m1", member: { id: "m1", user: { name: " " } } })).toBe("Profesional")
    expect(nombreDelProfesional({ memberId: null, member: null })).toBeNull()
  })
})

describe("asignarProfesional (#103)", () => {
  it("manda sólo el profesional: el horario guardado no se toca", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1" }))

    expect(await asignarProfesional("c1", "m-carla", { confirmar: false })).toEqual({ tipo: "guardada" })

    expect(fetchFalso.mock.calls[0][0]).toBe("/api/citas/c1")
    expect((fetchFalso.mock.calls[0][1] as RequestInit).method).toBe("PUT")
    expect(cuerpoEnviado(fetchFalso)).toEqual({ memberId: "m-carla" })
  })

  it("si choca, devuelve las advertencias; 'asignar igual' manda confirmarAdvertencias", async () => {
    const advertencias = [{ tipo: "choque", mensaje: "Carla ya tiene una cita de 10:00 a 11:00." }]
    simularRespuesta(json({ error: advertencias[0].mensaje, advertencias }, 409))
    expect(await asignarProfesional("c1", "m-carla", { confirmar: false })).toEqual({ tipo: "advertencias", advertencias })

    const segundo = simularRespuesta(json({ id: "c1" }))
    await asignarProfesional("c1", "m-carla", { confirmar: true })
    expect(cuerpoEnviado(segundo)).toEqual({ memberId: "m-carla", confirmarAdvertencias: true })
  })
})

describe("reactivarCita", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lista: manda confirmada, sin confirmarAdvertencias en el primer envío", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c1", status: "confirmada" }))
    expect(await reactivarCita("c1", { confirmar: false })).toEqual({ tipo: "lista" })
    expect(cuerpoEnviado(fetchFalso)).toEqual({ status: "confirmada" })
  })

  it("si choca, devuelve las advertencias; 'igual' manda confirmarAdvertencias", async () => {
    const advertencias = [{ tipo: "choque", mensaje: "Carla ya tiene una cita de 10:00 a 11:00." }]
    simularRespuesta(json({ error: advertencias[0].mensaje, advertencias }, 409))
    expect(await reactivarCita("c1", { confirmar: false })).toEqual({ tipo: "advertencias", advertencias })

    const segundo = simularRespuesta(json({ id: "c1", status: "confirmada" }))
    await reactivarCita("c1", { confirmar: true })
    expect(cuerpoEnviado(segundo)).toEqual({ status: "confirmada", confirmarAdvertencias: true })
  })

  it("el 409 con código corregir-con-ajuste se reconoce por el código, con el mensaje del servidor (#134)", async () => {
    const mensaje = "Un texto que puede cambiar"
    simularRespuesta(json({ error: mensaje, codigo: "corregir-con-ajuste" }, 409))
    expect(await reactivarCita("c1", { confirmar: false })).toEqual({ tipo: "corregir-con-ajuste", error: mensaje })
  })

  it("otro 409, aunque hable de ajustes, es un error común", async () => {
    const mensaje = "La cita cambió mientras la reactivabas. Corrígelo con un ajuste"
    simularRespuesta(json({ error: mensaje }, 409))
    expect(await reactivarCita("c1", { confirmar: false })).toEqual({ tipo: "error", error: mensaje })
  })
})

describe("quienCancelo", () => {
  it("dice quién canceló una cancelada (#134)", () => {
    expect(quienCancelo({ status: "cancelada", canceladaPor: "cliente" })).toBe("El cliente")
    expect(quienCancelo({ status: "cancelada", canceladaPor: "negocio" })).toBe("El negocio")
  })

  it("nada si no se sabe o si ya no está cancelada", () => {
    expect(quienCancelo({ status: "cancelada", canceladaPor: null })).toBeNull()
    expect(quienCancelo({ status: "cancelada" })).toBeNull()
    expect(quienCancelo({ status: "cancelada", canceladaPor: "otro" })).toBeNull()
    expect(quienCancelo({ status: "confirmada", canceladaPor: "cliente" })).toBeNull()
  })
})

describe("nombreDeCliente y buscarClientes: nombre y apellido (clientes viejos de la reserva pública)", () => {
  it("la cita muestra `name` + `lastName`, o \"Sin cliente\"", async () => {
    const { nombreDeCliente } = await import("./_datos")
    type Cita = Parameters<typeof nombreDeCliente>[0]
    const conApellido = { customer: { id: "c", name: "Lucía", lastName: "Pérez", email: null, phone: null } } as unknown as Cita
    const sinApellido = { customer: { id: "c", name: "Lucía Pérez", email: null, phone: null } } as unknown as Cita
    expect(nombreDeCliente(conApellido)).toBe("Lucía Pérez")
    expect(nombreDeCliente(sinApellido)).toBe("Lucía Pérez")
    expect(nombreDeCliente({ customer: null } as unknown as Cita)).toBe("Sin cliente")
    // Con la palabra del rubro: en una clínica dental.
    expect(nombreDeCliente({ customer: null } as unknown as Cita, "paciente")).toBe("Sin paciente")
  })

  it("el buscador de \"Nueva cita\" muestra el nombre completo", async () => {
    const { buscarClientes } = await import("./_datos")
    vi.stubGlobal("fetch", simularRespuesta(json({ clientes: [{ id: "c", name: "Lucía", lastName: "Pérez", email: "lucia@correo.test" }] })))
    const resultado = await buscarClientes("lucía pérez")
    expect(resultado).toEqual({ ok: true, datos: [{ id: "c", nombre: "Lucía Pérez", email: "lucia@correo.test" }] })
  })
})

describe("catálogo de la cita nueva (#159)", () => {
  const servicio = (id: string) => ({ id, name: id, description: null, duration: 30, price: 1000 })
  const catalogo = {
    servicios: [servicio("s-corte"), servicio("s-color")],
    serviciosPorProfesional: { "m-pedro": ["s-corte"] },
  }

  it("ofrece lo que hace el profesional si lo tiene acotado; si no, o sin asignar, todo", () => {
    expect(serviciosParaElProfesional(catalogo, "m-pedro").map((s) => s.id)).toEqual(["s-corte"])
    expect(serviciosParaElProfesional(catalogo, "m-carla").map((s) => s.id)).toEqual(["s-corte", "s-color"])
    expect(serviciosParaElProfesional(catalogo, "").map((s) => s.id)).toEqual(["s-corte", "s-color"])
  })

  it("los ids elegidos, en orden; vacío es ninguno", () => {
    expect(idsDeServiciosElegidos("s-color,s-corte")).toEqual(["s-color", "s-corte"])
    expect(idsDeServiciosElegidos("")).toEqual([])
  })
})

describe("precioDeLosServicios: el precio que se precarga al elegir del catálogo", () => {
  it("suma en centavos: sin el ruido del punto flotante", () => {
    // Con `+`, 0,1 + 0,2 era 0,30000000000000004.
    expect(precioDeLosServicios([{ price: 0.1 }, { price: 0.2 }])).toBe("0,30")
    expect(precioDeLosServicios([{ price: 1.15 }, { price: 2.3 }])).toBe("3,45")
  })

  it("los enteros van sin decimales, y lo escrito lo lee leerMonto igual", () => {
    expect(precioDeLosServicios([{ price: 8000 }, { price: 12500 }])).toBe("20500")
    expect(precioDeLaCita(precioDeLosServicios([{ price: 8000.5 }, { price: 0.25 }]))).toEqual({ ok: true, datos: 8000.75 })
  })

  it("los que no tienen precio no suman; si ninguno tiene, queda vacío", () => {
    expect(precioDeLosServicios([{ price: 8000 }, { price: null }])).toBe("8000")
    expect(precioDeLosServicios([{ price: null }])).toBe("")
    expect(precioDeLosServicios([])).toBe("")
  })
})

describe("cancelar desde el detalle: quién y cuándo, sin recargar", () => {
  const cita: Cita = {
    id: "c1",
    title: "Corte",
    startTime: "2026-11-10T13:00:00.000Z",
    endTime: "2026-11-10T14:00:00.000Z",
    status: "confirmada",
    notes: null,
    price: null,
    customerId: "cl1",
    customer: { id: "cl1", name: "Ana", email: null, phone: null },
    conAtencion: false,
  }

  it("cambiarEstadoDeCita devuelve la cita como quedó en el servidor", async () => {
    simularRespuesta(json({ ...cita, status: "cancelada", canceladaPor: "negocio", canceladaEn: "2026-11-10T12:00:00.000Z" }))

    const resultado = await cambiarEstadoDeCita("c1", "cancelada")

    expect(resultado.ok && resultado.datos).toMatchObject({ status: "cancelada", canceladaPor: "negocio" })
  })

  it("conEstadoNuevo trae el estado y la cancelación, y deja lo demás de la lista", () => {
    const nueva = conEstadoNuevo(cita, { status: "cancelada", canceladaPor: "negocio", canceladaEn: "2026-11-10T12:00:00.000Z" })

    expect(nueva).toMatchObject({ status: "cancelada", canceladaPor: "negocio", canceladaEn: "2026-11-10T12:00:00.000Z", conAtencion: false })
    expect(quienCancelo(nueva)).toBe("El negocio")
  })

  it("sin datos de cancelación en la respuesta, no queda la de antes", () => {
    const vieja = { ...cita, status: "cancelada", canceladaPor: "cliente", canceladaEn: "2026-11-01T12:00:00.000Z" }
    expect(conEstadoNuevo(vieja, { status: "confirmada" })).toMatchObject({ canceladaPor: null, canceladaEn: null })
  })
})

describe("llegar a la agenda con ?nueva=1&cliente=<id>", () => {
  it("lee los dos y deja la consulta sin ellos", () => {
    expect(llegadaALaAgenda("?nueva=1&cliente=c-1&vista=dia")).toEqual({ nueva: true, clienteId: "c-1", resto: "vista=dia" })
    expect(llegadaALaAgenda("?nueva=1")).toEqual({ nueva: true, clienteId: null, resto: "" })
  })

  it("sin nueva=1 no abre nada, aunque venga un cliente", () => {
    expect(llegadaALaAgenda("?cliente=c-1")).toMatchObject({ nueva: false, clienteId: null })
    expect(llegadaALaAgenda("")).toMatchObject({ nueva: false, clienteId: null })
  })

  it("con 200, el cliente queda elegido con su nombre completo, pedido a /api/clientes/<id>", async () => {
    const fetchFalso = simularRespuesta(json({ id: "c 1", name: "Ana", lastName: "Pérez", email: null, appointments: [] }))
    expect(await leerClienteParaLaCita("c 1")).toEqual({ id: "c 1", nombre: "Ana Pérez", email: "" })
    expect(fetchFalso.mock.calls[0][0]).toBe("/api/clientes/c%201")
  })

  it("con 404 (otro negocio, eliminado o inexistente) se ignora: sin cliente", async () => {
    simularRespuesta(json({ error: "Cliente no encontrado" }, 404))
    expect(await leerClienteParaLaCita("ajeno")).toBeNull()
  })

  it("sin conexión, también sin cliente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    expect(await leerClienteParaLaCita("c-1")).toBeNull()
  })
})

describe("con las palabras del rubro", () => {
  const salon = vocabularioDe("salon").palabras
  const clinica = vocabularioDe("odontologia").palabras
  const barberia = vocabularioDe("barberia").palabras

  it("quién canceló: el cliente o el negocio, con su artículo", () => {
    const cancelada = (canceladaPor: string) => ({ status: "cancelada", canceladaPor })
    expect(quienCancelo(cancelada("cliente"), salon)).toBe("El cliente")
    expect(quienCancelo(cancelada("negocio"), salon)).toBe("El salón")
    expect(quienCancelo(cancelada("negocio"), barberia)).toBe("La barbería")
    expect(quienCancelo(cancelada("cliente"), clinica)).toBe("El paciente")
    expect(quienCancelo(cancelada("negocio"), clinica)).toBe("La clínica")
    expect(quienCancelo({ status: "confirmada", canceladaPor: "cliente" }, clinica)).toBeNull()
  })

  it("de quién es el bloqueo: todo el lugar, o el profesional con la palabra del rubro", () => {
    const base: Bloqueo = { id: "b", memberId: null, startTime: "", endTime: "", motivo: null, member: null }
    expect(aQuienBloquea(base, salon)).toBe("Todo el salón")
    expect(aQuienBloquea(base, barberia)).toBe("Toda la barbería")
    expect(aQuienBloquea(base, clinica)).toBe("Toda la clínica")
    expect(aQuienBloquea({ ...base, memberId: "m", member: { user: { name: " " } } }, salon)).toBe("Estilista")
    expect(aQuienBloquea({ ...base, memberId: "m", member: { user: { name: null } } }, clinica)).toBe("Odontólogo")
    expect(aQuienBloquea({ ...base, memberId: "m", member: { user: { name: "Carla" } } }, salon)).toBe("Carla")
  })

  it("el profesional sin nombre se llama como el rubro lo llama", () => {
    const sinNombre = { memberId: "m1", member: { id: "m1", user: { name: "" } } }
    expect(nombreDelProfesional(sinNombre, "Estilista")).toBe("Estilista")
    expect(nombreDelProfesional(sinNombre)).toBe("Profesional")
    expect(nombreDelProfesional({ memberId: null, member: null }, "Estilista")).toBeNull()
    expect(opcionesDeProfesional([], { memberId: "m1", member: null }, "Estilista")).toEqual([{ valor: "m1", texto: "Estilista" }])
  })

  it("los mensajes de error dicen qué no se pudo hacer con las palabras del rubro", async () => {
    const falla = () => simularRespuesta(json({}, 500))

    falla()
    expect(await leerCitas(new Date(2026, 9, 20), "dia", salon)).toEqual({ ok: false, error: "No se pudieron cargar las horas" })
    falla()
    expect(await leerCitas(new Date(2026, 9, 20), "dia")).toEqual({ ok: false, error: "No se pudieron cargar las citas" })
    falla()
    expect(await crearCita(CITA, ZONA, { confirmar: false }, salon)).toEqual({ tipo: "error", error: "No se pudo crear la hora" })
    falla()
    expect(await crearCita(CITA, ZONA)).toEqual({ tipo: "error", error: "No se pudo crear la cita" })
    falla()
    expect(
      await moverCita("c1", { fecha: "2026-10-20", horaInicio: "10:00", horaFin: "11:00", memberId: "" }, ZONA, { confirmar: false, asignaProfesional: false }, salon)
    ).toEqual({ tipo: "error", error: "No se pudo mover la hora" })
    falla()
    expect(await asignarProfesional("c1", "m1", { confirmar: false }, salon)).toEqual({ tipo: "error", error: "No se pudo asignar la estilista" })
    falla()
    expect(await asignarProfesional("c1", "m1", { confirmar: false }, clinica)).toEqual({ tipo: "error", error: "No se pudo asignar el odontólogo" })
    falla()
    expect(await reactivarCita("c1", { confirmar: false }, clinica)).toEqual({ tipo: "error", error: "No se pudo reactivar la cita" })
    falla()
    expect(await reactivarCita("c1", { confirmar: false }, salon)).toEqual({ tipo: "error", error: "No se pudo reactivar la hora" })
    falla()
    expect(await leerCatalogoDeLaCita(clinica)).toEqual({ ok: false, error: "No se pudo cargar el catálogo de prestaciones" })
    falla()
    expect(await leerCatalogoDeLaCita()).toEqual({ ok: false, error: "No se pudo cargar el catálogo de servicios" })
    falla()
    expect(await buscarClientes("ana", clinica)).toEqual({ ok: false, error: "No se pudieron buscar los pacientes" })
    falla()
    expect(await buscarClientes("ana")).toEqual({ ok: false, error: "No se pudieron buscar los clientes" })
  })

  it("el mensaje que manda el servidor sigue ganando sobre el del rubro", async () => {
    simularRespuesta(json({ error: "Ese horario ya pasó" }, 400))
    expect(await crearCita(CITA, ZONA, { confirmar: false }, salon)).toEqual({ tipo: "error", error: "Ese horario ya pasó" })
  })
})
