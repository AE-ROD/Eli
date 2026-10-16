import { describe, it, expect, vi, afterEach } from "vitest"
import { SIN_CONEXION } from "@/lib/peticiones"
import { aceptarInvitacion } from "./_datos"

/** Simula la respuesta que daría el servidor, sin red de por medio. */
function simularRespuesta(respuesta: Response) {
  const fetchFalso = vi.fn().mockResolvedValue(respuesta)
  vi.stubGlobal("fetch", fetchFalso)
  return fetchFalso
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("aceptarInvitacion", () => {
  it("manda la contraseña al endpoint de la invitación", async () => {
    const fetchFalso = simularRespuesta(json({ cuentaNueva: true }, 201))

    await aceptarInvitacion("token-1", "secreta123")

    expect(fetchFalso).toHaveBeenCalledWith(
      "/api/equipo/invitacion/token-1/aceptar",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ contrasena: "secreta123" }) })
    )
  })

  it("con la cuenta creada dice si es nueva o si ya existía", async () => {
    simularRespuesta(json({ cuentaNueva: true }, 201))
    expect(await aceptarInvitacion("t", "secreta123")).toEqual({ ok: true, datos: { cuentaNueva: true } })

    simularRespuesta(json({ cuentaNueva: false }))
    expect(await aceptarInvitacion("t", "secreta123")).toEqual({ ok: true, datos: { cuentaNueva: false } })
  })

  it("un 200 con una página HTML no es una cuenta creada (QA: mostraba «Cuenta creada» sin cuenta)", async () => {
    simularRespuesta(
      new Response("<html>Conectate al wifi</html>", { status: 200, headers: { "Content-Type": "text/html" } })
    )

    expect(await aceptarInvitacion("t", "secreta123")).toEqual({
      ok: false,
      error: "Error al crear la cuenta",
      requiereSesion: false,
    })
  })

  it("un 200 vacío tampoco; un 204 sí es un éxito", async () => {
    simularRespuesta(new Response(null, { status: 200 }))
    expect((await aceptarInvitacion("t", "secreta123")).ok).toBe(false)

    simularRespuesta(new Response(null, { status: 204 }))
    expect(await aceptarInvitacion("t", "secreta123")).toEqual({ ok: true, datos: { cuentaNueva: true } })
  })

  it("si el correo ya tiene cuenta, el error lo dice con requiereSesion", async () => {
    simularRespuesta(json({ error: "Inicia sesión con la cuenta de ese correo", requiereSesion: true }, 401))

    expect(await aceptarInvitacion("t", "secreta123")).toEqual({
      ok: false,
      error: "Inicia sesión con la cuenta de ese correo",
      requiereSesion: true,
    })
  })

  it("un error sin mensaje usa el de siempre, y sin red avisa que no hubo conexión", async () => {
    simularRespuesta(new Response("<html>502</html>", { status: 502 }))
    expect(await aceptarInvitacion("t", "secreta123")).toEqual({
      ok: false,
      error: "Error al crear la cuenta",
      requiereSesion: false,
    })

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    expect(await aceptarInvitacion("t", "secreta123")).toEqual({
      ok: false,
      error: SIN_CONEXION,
      requiereSesion: false,
    })
  })
})
