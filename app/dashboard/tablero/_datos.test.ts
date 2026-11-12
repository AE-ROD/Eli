import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { zonaDelDispositivo } from "@/lib/fechas"
import { vocabularioDe } from "@/lib/vocabulario"
import {
  anularAtencion,
  buscarClientes,
  guardarServicios,
  leerLineasSinPorcentaje,
  leerTablero,
  marcarLlegada,
  marcarNoVino,
} from "./_datos"

// La zona del dispositivo, fija: la del proceso de los tests depende de la máquina.
vi.mock("@/lib/fechas", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("@/lib/fechas")>()
  return { ...original, zonaDelDispositivo: vi.fn(() => "America/Santiago") }
})

/** El cuerpo JSON con que se llamó a `fetch`. */
const cuerpoEnviado = (fetchFalso: ReturnType<typeof simularRespuesta>) =>
  JSON.parse(String((fetchFalso.mock.calls[0][1] as RequestInit).body))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("marcarLlegada", () => {
  it("manda la reserva y la zona del dispositivo, para que el servidor corte «hoy» en el calendario de quien la marca", async () => {
    const fetchFalso = simularRespuesta(json({ id: "v1" }, 201))

    await marcarLlegada("cita-1")

    expect(fetchFalso).toHaveBeenCalledWith("/api/atenciones", expect.objectContaining({ method: "POST" }))
    expect(cuerpoEnviado(fetchFalso)).toEqual({ citaId: "cita-1", zona: "America/Santiago" })
  })

  it("si el navegador no informa la zona, no la manda: el servidor acepta las de ±24 horas", async () => {
    vi.mocked(zonaDelDispositivo).mockReturnValueOnce("")
    const fetchFalso = simularRespuesta(json({ id: "v1" }, 201))

    await marcarLlegada("cita-1")

    expect(cuerpoEnviado(fetchFalso)).toEqual({ citaId: "cita-1" })
  })

  it("una reserva de otro día vuelve con el mensaje del servidor, como un tablero que quedó viejo", async () => {
    const mensaje = "Esta reserva no es de hoy: solo se marca la llegada de las reservas del día."
    simularRespuesta(json({ error: mensaje }, 409))

    expect(await marcarLlegada("cita-1")).toEqual({ ok: false, error: mensaje, motivo: "desactualizada" })
  })
})

describe("marcarNoVino", () => {
  it("pide a la cita el estado 'no-asistio'", async () => {
    const fetchFalso = simularRespuesta(json({ id: "cita-1", status: "no-asistio" }))

    const resultado = await marcarNoVino("cita-1")

    expect(resultado.ok).toBe(true)
    expect(fetchFalso).toHaveBeenCalledWith("/api/citas/cita-1", expect.objectContaining({ method: "PUT" }))
    expect(cuerpoEnviado(fetchFalso)).toEqual({ status: "no-asistio" })
  })

  it("si ya llegó o cambió, vuelve como un tablero viejo, con el mensaje del servidor", async () => {
    const mensaje = "El cliente ya llegó: la cita tiene una atención en el Tablero."
    simularRespuesta(json({ error: mensaje }, 409))

    expect(await marcarNoVino("cita-1")).toEqual({ ok: false, error: mensaje, motivo: "desactualizada" })
  })
})

describe("buscarClientes", () => {
  it("muestra el teléfono con espacios, como en el resto del panel; sin teléfono, el correo", async () => {
    simularRespuesta(
      json({
        clientes: [
          { id: "c1", name: "María", lastName: "González", email: "m@x.cl", phone: "+56912345678" },
          { id: "c2", name: "Pedro", lastName: null, email: "p@x.cl", phone: null },
          { id: "c3", name: "Ana", lastName: null, email: null, phone: "12345" },
        ],
      })
    )

    const resultado = await buscarClientes("a")

    expect(resultado).toEqual({
      ok: true,
      datos: [
        { id: "c1", nombre: "María González", detalle: "+56 9 1234 5678" },
        { id: "c2", nombre: "Pedro", detalle: "p@x.cl" },
        // Uno que no se puede leer como chileno se muestra tal como está.
        { id: "c3", nombre: "Ana", detalle: "12345" },
      ],
    })
  })
})

describe("anularAtencion", () => {
  it("una atención ya rendida se reconoce por el código del servidor, no por el texto (#117)", async () => {
    const mensaje = "Esta atención ya entró en un cierre de caja: no se anula, corrígelo con un ajuste."
    simularRespuesta(json({ error: mensaje, codigo: "corregir-con-ajuste" }, 409))

    expect(await anularAtencion("v1", "")).toEqual({ ok: false, error: mensaje, motivo: "corregir-con-ajuste" })
  })

  it("pagada al laboratorio también: el modal se queda con el motivo, sin recargar", async () => {
    const mensaje = "Esta atención tiene un abono ya pagado al laboratorio: anula primero ese pago."
    simularRespuesta(json({ error: mensaje, codigo: "pagado-al-laboratorio" }, 409))

    expect(await anularAtencion("v1", "Se cobró dos veces")).toEqual({ ok: false, error: mensaje, motivo: "corregir-con-ajuste" })
  })

  it("un 409 sin ese código es un tablero viejo, aunque el texto diga «ajuste»", async () => {
    simularRespuesta(json({ error: "Esta atención ya está anulada. Haz un ajuste." }, 409))

    const resultado = await anularAtencion("v1", "")

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.motivo).toBe("desactualizada")
  })
})

describe("los mensajes de un pedido que falla sin decir por qué hablan con las palabras del rubro", () => {
  const clinica = vocabularioDe("odontologia").palabras
  const salon = vocabularioDe("salon").palabras
  const falla = () => simularRespuesta(json({}, 500))

  it("sin palabras, o con un rubro desconocido, dicen lo de siempre", async () => {
    const desconocido = vocabularioDe("no-existe").palabras
    falla()
    expect(await leerTablero(new Date())).toEqual({ ok: false, error: "No se pudo cargar el tablero" })
    falla()
    expect(await leerTablero(new Date(), desconocido)).toEqual({ ok: false, error: "No se pudo cargar el tablero" })
    falla()
    expect(await buscarClientes("ana")).toEqual({ ok: false, error: "No se pudieron buscar los clientes" })
    falla()
    expect(await marcarNoVino("c1")).toMatchObject({ ok: false, error: "No se pudo marcar que no vino" })
    falla()
    expect(await guardarServicios("v1", [])).toMatchObject({ ok: false, error: "No se pudieron guardar los servicios" })
    falla()
    expect(await leerLineasSinPorcentaje("v1")).toEqual({
      ok: false,
      error: "No se pudo saber qué servicios quedarán sin porcentaje de comisión",
    })
  })

  it("una clínica dental: la sala de espera, los pacientes, «no asistió» y las prestaciones", async () => {
    falla()
    expect(await leerTablero(new Date(), clinica)).toEqual({ ok: false, error: "No se pudo cargar la sala de espera" })
    falla()
    expect(await buscarClientes("ana", clinica)).toEqual({ ok: false, error: "No se pudieron buscar los pacientes" })
    falla()
    expect(await marcarNoVino("c1", clinica)).toMatchObject({ ok: false, error: "No se pudo marcar que no asistió" })
    falla()
    expect(await guardarServicios("v1", [], clinica)).toMatchObject({ ok: false, error: "No se pudieron guardar las prestaciones" })
    falla()
    expect(await leerLineasSinPorcentaje("v1", clinica)).toEqual({
      ok: false,
      error: "No se pudo saber qué prestaciones quedarán sin porcentaje de comisión",
    })
  })

  it("un salón sigue con tablero y servicios", async () => {
    falla()
    expect(await leerTablero(new Date(), salon)).toEqual({ ok: false, error: "No se pudo cargar el tablero" })
    falla()
    expect(await marcarNoVino("c1", salon)).toMatchObject({ ok: false, error: "No se pudo marcar que no vino" })
  })

  it("el mensaje que manda el servidor sigue ganando sobre el del rubro", async () => {
    simularRespuesta(json({ error: "La atención ya cambió" }, 409))
    expect(await guardarServicios("v1", [], clinica)).toEqual({ ok: false, error: "La atención ya cambió", motivo: "desactualizada" })
  })
})
