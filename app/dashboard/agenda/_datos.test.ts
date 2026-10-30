import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { aQuienBloquea, asignarProfesional, citaPorConfirmar, crearBloqueo, crearCita, destacaSinProfesional, hayProfesionales, moverCita, nombreDelProfesional, opcionesDeProfesional, precioDeLaCita, quienCancelo, quitarBloqueo, reactivarCita, type Bloqueo, type DatosDeNuevaCita } from "./_datos"

/** El cuerpo JSON con que se llamó a `fetch`. */
const cuerpoEnviado = (fetchFalso: ReturnType<typeof simularRespuesta>) =>
  JSON.parse(String((fetchFalso.mock.calls[0][1] as RequestInit).body))

const CITA: DatosDeNuevaCita = {
  clienteId: "cliente-1",
  clienteNombre: "Ana",
  servicio: "Corte",
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
