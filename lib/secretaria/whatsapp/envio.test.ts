import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { WASocket } from "baileys"
import { conexiones, type Conexion } from "./registro"
import { TOPE_DE_MENSAJES_POR_MINUTO, WhatsappNoConectado, enviarPorWhatsapp } from "./envio"

/** El envío a ritmo de persona: "escribiendo…", tope por minuto y la última revisión. */

let siguiente = 1
const socket = {
  sendPresenceUpdate: vi.fn(async () => {}),
  sendMessage: vi.fn(async () => ({ key: { id: `ID-${siguiente++}` } })),
}

function conectar(): Conexion {
  const conexion: Conexion = {
    negocioId: "n1",
    canalId: "c1",
    socket: socket as unknown as WASocket,
    qr: null,
    abierta: true,
    cerrando: false,
    intentos: 0,
    enviados: new Set(),
    envios: [],
    guardando: Promise.resolve(),
  }
  conexiones.set("n1", conexion)
  return conexion
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  conexiones.clear()
})
afterEach(() => vi.useRealTimers())

describe("envío por WhatsApp", () => {
  it("muestra escribiendo, manda y recuerda el id", async () => {
    const conexion = conectar()
    const envio = enviarPorWhatsapp("n1", "569@s.whatsapp.net", "hola")
    await vi.runAllTimersAsync()
    expect(await envio).toEqual({ id: "ID-1" })
    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith("composing", "569@s.whatsapp.net")
    expect(conexion.enviados.has("ID-1")).toBe(true)
  })

  it("sin conexión abierta falla; si ya no sigue con Eli, no manda", async () => {
    await expect(enviarPorWhatsapp("otro", "569@s.whatsapp.net", "hola")).rejects.toBeInstanceOf(WhatsappNoConectado)
    conectar()
    const envio = enviarPorWhatsapp("n1", "569@s.whatsapp.net", "hola", async () => false)
    await vi.runAllTimersAsync()
    expect(await envio).toBeNull()
    expect(socket.sendMessage).not.toHaveBeenCalled()
  })

  it("envíos a la vez no se saltan el tope: el que sobra espera al minuto siguiente", async () => {
    const conexion = conectar()
    const inicio = Date.now()
    const envios = Array.from({ length: TOPE_DE_MENSAJES_POR_MINUTO + 1 }, () => enviarPorWhatsapp("n1", "569@s.whatsapp.net", "ok"))
    expect(conexion.envios.filter((t) => t <= inicio)).toHaveLength(TOPE_DE_MENSAJES_POR_MINUTO)
    expect(conexion.envios.at(-1)).toBe(inicio + 60_000)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(socket.sendMessage).toHaveBeenCalledTimes(TOPE_DE_MENSAJES_POR_MINUTO)
    await vi.runAllTimersAsync()
    await Promise.all(envios)
    expect(socket.sendMessage).toHaveBeenCalledTimes(TOPE_DE_MENSAJES_POR_MINUTO + 1)
  })
})
