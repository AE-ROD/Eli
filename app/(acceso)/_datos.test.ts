import { describe, it, expect, vi, afterEach } from "vitest"
import { json, simularRespuesta } from "@/pruebas/respuestas"
import { SIN_CONEXION } from "@/lib/peticiones"
import { aceptarInvitacion, crearCuenta, invitacionNoValida, leerInvitacion } from "./_datos"

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
    expect(await aceptarInvitacion("t", "secreta123")).toEqual({ ok: true, datos: { cuentaNueva: true, contexto: null } })

    simularRespuesta(json({ cuentaNueva: false }))
    expect(await aceptarInvitacion("t", "secreta123")).toEqual({ ok: true, datos: { cuentaNueva: false, contexto: null } })
  })

  it("un 200 con una página HTML no es una cuenta creada (QA: mostraba «Cuenta creada» sin cuenta)", async () => {
    simularRespuesta(
      new Response("<html>Conectate al wifi</html>", { status: 200, headers: { "Content-Type": "text/html" } })
    )

    expect(await aceptarInvitacion("t", "secreta123")).toEqual({
      ok: false,
      error: "No se pudo aceptar la invitación",
      requiereSesion: false,
    })
  })

  it("un 200 vacío tampoco; un 204 sí es un éxito", async () => {
    simularRespuesta(new Response(null, { status: 200 }))
    expect((await aceptarInvitacion("t", "secreta123")).ok).toBe(false)

    simularRespuesta(new Response(null, { status: 204 }))
    expect(await aceptarInvitacion("t", "secreta123")).toEqual({ ok: true, datos: { cuentaNueva: true, contexto: null } })
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
      error: "No se pudo aceptar la invitación",
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

describe("aceptarInvitacion: contextos y tokens", () => {
  it("devuelve el contexto nuevo que respondió el servidor", async () => {
    simularRespuesta(json({ cuentaNueva: false, contexto: "miembro:m-1" }))
    expect(await aceptarInvitacion("t")).toEqual({ ok: true, datos: { cuentaNueva: false, contexto: "miembro:m-1" } })
  })

  it("con una cuenta que ya existe no manda contraseña", async () => {
    const fetchFalso = simularRespuesta(json({ cuentaNueva: false }))
    await aceptarInvitacion("t")
    expect(fetchFalso).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: "{}" }))
  })

  it("el token va codificado en la ruta (lote 10a, 13)", async () => {
    const fetchFalso = simularRespuesta(json({ cuentaNueva: true }))
    await aceptarInvitacion("a/b?c#d", "secreta123")
    expect(fetchFalso).toHaveBeenCalledWith("/api/equipo/invitacion/a%2Fb%3Fc%23d/aceptar", expect.anything())
  })
})

describe("leerInvitacion", () => {
  it("el token va codificado en la ruta", async () => {
    const fetchFalso = simularRespuesta(json({ nombre: "Ana", email: "a@x.com", rol: "worker", negocio: "Salón" }))
    await leerInvitacion("a/b?c")
    expect(fetchFalso).toHaveBeenCalledWith("/api/equipo/invitacion/a%2Fb%3Fc", undefined)
  })

  it("distingue un enlace que no sirve (404, 410) de un fallo en el camino (sin red, 5xx, 429)", async () => {
    simularRespuesta(json({ error: "Invitación no encontrada" }, 404))
    const noExiste = await leerInvitacion("t")
    expect(!noExiste.ok && invitacionNoValida(noExiste.codigo)).toBe(true)

    simularRespuesta(json({ error: "Esta invitación ha expirado" }, 410))
    const vencida = await leerInvitacion("t")
    expect(!vencida.ok && invitacionNoValida(vencida.codigo)).toBe(true)

    for (const respuesta of [new Response("<html>502</html>", { status: 502 }), json({ error: "Demasiados intentos" }, 429)]) {
      simularRespuesta(respuesta)
      const fallo = await leerInvitacion("t")
      expect(!fallo.ok && invitacionNoValida(fallo.codigo)).toBe(false)
    }

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    const sinRed = await leerInvitacion("t")
    expect(sinRed).toEqual({ ok: false, error: SIN_CONEXION, codigo: null })
    expect(invitacionNoValida(null)).toBe(false)
  })
})

describe("crearCuenta", () => {
  const datos = { nombre: "Ana", email: "a@x.com", contrasena: "secreta123", nombreNegocio: "Salón", tipoNegocio: "salon" as const }

  it("el error trae el campo que dijo el servidor, para volver a su paso", async () => {
    simularRespuesta(json({ error: "Ya existe una cuenta con ese correo", campo: "email" }, 400))
    expect(await crearCuenta(datos)).toEqual({ ok: false, error: "Ya existe una cuenta con ese correo", campo: "email" })
  })

  it("un campo que no es del registro, o ninguno, da null", async () => {
    simularRespuesta(json({ error: "Algo", campo: "__proto__" }, 400))
    expect(await crearCuenta(datos)).toMatchObject({ ok: false, campo: null })

    simularRespuesta(json({ error: "Demasiados intentos" }, 429))
    expect(await crearCuenta(datos)).toMatchObject({ ok: false, campo: null })
  })

  it("con la cuenta creada, ok", async () => {
    simularRespuesta(json({ id: "u-1" }))
    expect(await crearCuenta(datos)).toEqual({ ok: true, datos: undefined })
  })
})
