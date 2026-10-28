import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { zonaDelDispositivo } from "@/lib/fechas"
import { marcarLlegada, marcarNoVino } from "./_datos"

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
