import { describe, it, expect, beforeEach, vi } from "vitest"

const enviarMock = vi.fn().mockResolvedValue({ data: { id: "correo-1" } })

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: enviarMock },
  })),
}))

describe("lib/email — escapado de datos de origen humano", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  it("escapa una etiqueta <script> en el nombre del cliente (enviarConfirmacionCliente)", async () => {
    const { enviarConfirmacionCliente } = await import("./email")

    await enviarConfirmacionCliente({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: '<script>alert("hola")</script>',
      nombreNegocio: "Negocio de prueba",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      duracion: 30,
    })

    expect(enviarMock).toHaveBeenCalledTimes(1)
    const html = enviarMock.mock.calls[0][0].html as string

    expect(html).not.toContain("<script>alert(")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("&quot;hola&quot;")
  })

  it("escapa comillas y un enlace falso en el nombre del negocio (enviarConfirmacionCliente)", async () => {
    const { enviarConfirmacionCliente } = await import("./email")

    await enviarConfirmacionCliente({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: "Ana",
      nombreNegocio: `Negocio" onmouseover="robar()`,
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      duracion: 30,
    })

    const html = enviarMock.mock.calls[0][0].html as string

    expect(html).not.toContain(`onmouseover="robar()`)
    expect(html).toContain("&quot;")
    // Las etiquetas <strong> escritas por nosotros siguen intactas.
    expect(html).toContain("<strong>")
  })

  it("no rompe el correo para un nombre normal: sigue mostrando <strong>", async () => {
    const { enviarConfirmacionCliente } = await import("./email")

    await enviarConfirmacionCliente({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: "Ana Pérez",
      nombreNegocio: "Peluquería Sol",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      duracion: 30,
    })

    const html = enviarMock.mock.calls[0][0].html as string

    expect(html).toContain("Hola <strong>Ana Pérez</strong>")
    expect(html).toContain("<strong>Peluquería Sol</strong>")
  })

  it("escapa un enlace falso en el nombre del trabajador invitado (enviarInvitacionTrabajador)", async () => {
    const { enviarInvitacionTrabajador } = await import("./email")

    await enviarInvitacionTrabajador({
      emailTrabajador: "trabajador@ejemplo.com",
      nombreTrabajador: '<a href="http://sitio-falso">Reclamá tu cuenta</a>',
      nombreNegocio: "Negocio de prueba",
      rol: "member",
      enlaceAceptar: "https://eli.app/invitacion/token-real",
    })

    const html = enviarMock.mock.calls[0][0].html as string

    expect(html).not.toContain('<a href="http://sitio-falso">')
    expect(html).toContain("&lt;a href=&quot;http://sitio-falso&quot;&gt;")
    // El enlace real, armado por el servidor, sí llega intacto en su propio <a>.
    expect(html).toContain('href="https://eli.app/invitacion/token-real"')
  })

  it("escapa los comentarios del cliente en el aviso al profesional (enviarAvisoProfesional)", async () => {
    const { enviarAvisoProfesional } = await import("./email")

    await enviarAvisoProfesional({
      emailProfesional: "profesional@ejemplo.com",
      nombreNegocio: "Negocio de prueba",
      nombreCliente: "Ana",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      comentarios: `<img src=x onerror="alert('robo')">`,
    })

    const html = enviarMock.mock.calls[0][0].html as string

    expect(html).not.toContain("<img src=x onerror=")
    expect(html).toContain("&lt;img src=x onerror=")
    expect(html).toContain("&#39;robo&#39;")
  })

  it("escapa el nombre de usuario en la recuperación de contraseña (enviarRecuperacionContrasena)", async () => {
    const { enviarRecuperacionContrasena } = await import("./email")

    await enviarRecuperacionContrasena({
      emailUsuario: "usuario@ejemplo.com",
      nombreUsuario: '"><script>document.location="http://robo"</script>',
      enlaceRestablecer: "https://eli.app/restablecer/token-real",
    })

    const html = enviarMock.mock.calls[0][0].html as string

    expect(html).not.toContain("<script>document.location=")
    expect(html).toContain("&lt;script&gt;")
  })
})

describe("lib/email — inyección de encabezados en el asunto", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  it("quita un \\r\\n del nombre del negocio: el asunto llega en una sola línea", async () => {
    const { enviarConfirmacionCliente } = await import("./email")

    await enviarConfirmacionCliente({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: "Ana",
      nombreNegocio: "Negocio\r\nBcc: atacante@evil.com",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      duracion: 30,
    })

    const subject = enviarMock.mock.calls[0][0].subject as string

    expect(subject).not.toMatch(/[\r\n]/)
    expect(subject).toBe("Cita confirmada — NegocioBcc: atacante@evil.com")
  })

  it("quita un \\r suelto del nombre del cliente", async () => {
    const { enviarAvisoProfesional } = await import("./email")

    await enviarAvisoProfesional({
      emailProfesional: "profesional@ejemplo.com",
      nombreNegocio: "Negocio de prueba",
      nombreCliente: "Ana\rBcc: atacante@evil.com",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
    })

    const subject = enviarMock.mock.calls[0][0].subject as string

    expect(subject).not.toMatch(/[\r\n]/)
    expect(subject).toBe("Nueva reserva — AnaBcc: atacante@evil.com")
  })

  it("quita un \\n suelto del nombre del negocio", async () => {
    const { enviarInvitacionTrabajador } = await import("./email")

    await enviarInvitacionTrabajador({
      emailTrabajador: "trabajador@ejemplo.com",
      nombreTrabajador: "Ana",
      nombreNegocio: "Negocio\nBcc: atacante@evil.com",
      rol: "member",
      enlaceAceptar: "https://eli.app/invitacion/token-real",
    })

    const subject = enviarMock.mock.calls[0][0].subject as string

    expect(subject).not.toMatch(/[\r\n]/)
    expect(subject).toBe("Te invitaron a unirte a NegocioBcc: atacante@evil.com en Eli")
  })

  it("quita separadores de línea/párrafo de Unicode (U+2028 y U+2029)", async () => {
    const { enviarConfirmacionCliente } = await import("./email")

    await enviarConfirmacionCliente({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: "Ana",
      nombreNegocio: "Negocio Bcc: atacante@evil.com ",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      duracion: 30,
    })

    const subject = enviarMock.mock.calls[0][0].subject as string

    expect(subject).not.toMatch(/[\u2028\u2029]/)
    expect(subject).toBe("Cita confirmada — NegocioBcc: atacante@evil.com")
  })

  it("quita caracteres de control (por ejemplo, un BEL) sin tocar el resto del texto", async () => {
    const { enviarConfirmacionCliente } = await import("./email")

    await enviarConfirmacionCliente({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: "Ana",
      nombreNegocio: "Negocio\x07Malicioso",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      duracion: 30,
    })

    const subject = enviarMock.mock.calls[0][0].subject as string

    expect(subject).toBe("Cita confirmada — NegocioMalicioso")
  })

  it("un asunto normal llega tal cual, sin emojis (la guía de diseño no los usa)", async () => {
    const { enviarConfirmacionCliente, enviarRecordatorio, enviarRecuperacionContrasena } = await import("./email")

    await enviarConfirmacionCliente({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: "Ana Pérez",
      nombreNegocio: "Peluquería Sol",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      duracion: 30,
    })
    expect(enviarMock.mock.calls[0][0].subject).toBe("Cita confirmada — Peluquería Sol")

    await enviarRecordatorio({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: "Ana Pérez",
      nombreNegocio: "Peluquería Sol",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
    })
    expect(enviarMock.mock.calls[1][0].subject).toBe("Recordatorio — Tu cita es mañana")

    await enviarRecuperacionContrasena({
      emailUsuario: "usuario@ejemplo.com",
      nombreUsuario: "Ana",
      enlaceRestablecer: "https://eli.app/restablecer/token-real",
    })
    expect(enviarMock.mock.calls[2][0].subject).toBe("Restablece tu contraseña — Eli")
  })
})

describe("lib/email — sin RESEND_API_KEY el aviso no filtra datos personales", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "")
    vi.resetModules()
    enviarMock.mockClear()
  })

  it("avisa sólo el tipo de correo: ni el asunto (con el nombre del cliente) ni el destinatario", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { enviarAvisoProfesional } = await import("./email")

    const resultado = await enviarAvisoProfesional({
      emailProfesional: "carla.privada@ejemplo.com",
      nombreNegocio: "Salón Secreto",
      nombreCliente: "María González",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
    })

    expect(resultado).toBeNull()
    expect(enviarMock).not.toHaveBeenCalled()
    expect(aviso).toHaveBeenCalledTimes(1)
    const texto = aviso.mock.calls[0].map(String).join(" ")
    expect(texto).toContain("aviso-profesional")
    expect(texto).not.toContain("María")
    expect(texto).not.toContain("González")
    expect(texto).not.toContain("carla.privada@ejemplo.com")
    expect(texto).not.toContain("Nueva reserva")
    aviso.mockRestore()
  })
})

const datosDePrueba = {
  emailDueno: "dueno@ejemplo.com",
  nombreDueno: "Ana",
  nombreNegocio: "Peluquería Sol",
  enlacePanel: "https://eli.app/dashboard",
  enlaceReservas: "https://eli.app/reservar/peluqueria-sol",
  enlaceDeBaja: "https://eli.app/baja-de-correos/abc.def",
  ultimoDia: "2026-10-24",
  diasRestantes: 3,
}

describe("lib/email — plantilla con la marca de Eli", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  it("usa los tokens de la marca y no el azul genérico de antes", async () => {
    const { enviarInvitacionTrabajador } = await import("./email")

    await enviarInvitacionTrabajador({
      emailTrabajador: "trabajador@ejemplo.com",
      nombreTrabajador: "Ana",
      nombreNegocio: "Peluquería Sol",
      rol: "member",
      enlaceAceptar: "https://eli.app/invitacion/token-real",
    })

    const html = enviarMock.mock.calls[0][0].html as string
    expect(html).not.toMatch(/#3b82f6/i)
    expect(html).toContain("#FCFBF8") // fondo crema
    expect(html).toContain("#071A31") // navy: botón y títulos
    expect(html).toContain("#E7E3DA") // borde de la tarjeta
    expect(html).toContain("Georgia") // titulares, eco de Fraunces
    expect(html).toMatch(/>Eli<\/td>/) // wordmark en texto, sin imágenes
    expect(html).not.toContain("<img")
    expect(html).toContain('<html lang="es">')
  })

  it("ningún asunto ni título lleva emojis", async () => {
    const email = await import("./email")
    const reserva = { nombreNegocio: "Sol", servicio: "Corte", fecha: "2026-09-10", hora: "10:00" }

    await email.enviarConfirmacionCliente({ ...reserva, emailCliente: "c@e.com", nombreCliente: "Ana", duracion: 30 })
    await email.enviarAvisoProfesional({ ...reserva, emailProfesional: "p@e.com", nombreCliente: "Ana" })
    await email.enviarRecordatorio({ ...reserva, emailCliente: "c@e.com", nombreCliente: "Ana" })
    await email.enviarRecuperacionContrasena({ emailUsuario: "u@e.com", nombreUsuario: "Ana", enlaceRestablecer: "https://eli.app/r/x" })
    for (const tipo of ["bienvenida", "consejo", "quedan-3-dias", "termina-hoy"] as const) {
      await email.enviarCorreoDePrueba(tipo, datosDePrueba)
    }

    const emoji = /\p{Extended_Pictographic}/u
    for (const [argumentos] of enviarMock.mock.calls) {
      expect(argumentos.subject).not.toMatch(emoji)
      expect(argumentos.html).not.toMatch(emoji)
    }
  })

  it("los correos de la cuenta no llevan enlace de baja; los del ciclo de prueba sí", async () => {
    const email = await import("./email")

    await email.enviarRecuperacionContrasena({ emailUsuario: "u@e.com", nombreUsuario: "Ana", enlaceRestablecer: "https://eli.app/r/x" })
    await email.enviarCorreoDePrueba("consejo", datosDePrueba)

    expect(enviarMock.mock.calls[0][0].html).not.toContain("Dejar de recibir")
    const html = enviarMock.mock.calls[1][0].html as string
    expect(html).toContain('href="https://eli.app/baja-de-correos/abc.def"')
    expect(html).toContain("Dejar de recibir estos correos")
  })
})

describe("lib/email — correos del ciclo de prueba", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  it("escapa el nombre del dueño y del negocio, y limpia el asunto", async () => {
    const { enviarCorreoDePrueba } = await import("./email")

    await enviarCorreoDePrueba("termina-hoy", {
      ...datosDePrueba,
      nombreDueno: '<script>alert("x")</script>',
      nombreNegocio: `Sol" onmouseover="robar()`,
    })

    const { html, subject, to } = enviarMock.mock.calls[0][0]
    expect(to).toBe("dueno@ejemplo.com")
    expect(html).not.toContain("<script>alert(")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain(`onmouseover="robar()`)
    expect(subject).toBe("Hoy termina tu prueba de Eli")
  })

  it("escapa un enlace armado con comillas (defensa en profundidad: los arma el servidor)", async () => {
    const { enviarCorreoDePrueba } = await import("./email")

    await enviarCorreoDePrueba("consejo", { ...datosDePrueba, enlaceReservas: `https://eli.app/reservar/x" onclick="robar()` })

    const html = enviarMock.mock.calls[0][0].html as string
    expect(html).not.toContain(`" onclick="robar()`)
    expect(html).toContain("&quot; onclick=&quot;robar()")
  })

  it("bienvenida: los tres pasos y el botón al panel", async () => {
    const { enviarCorreoDePrueba } = await import("./email")

    await enviarCorreoDePrueba("bienvenida", datosDePrueba)

    const { html, subject } = enviarMock.mock.calls[0][0]
    expect(subject).toBe("Te damos la bienvenida a Eli")
    expect(html).toContain("Define tu horario")
    expect(html).toContain("Agrega tus servicios")
    expect(html).toContain("Comparte tu enlace de reservas")
    expect(html).toContain('href="https://eli.app/dashboard"')
  })

  it("consejo: lleva el enlace de reservas del negocio y habla de Instagram y WhatsApp", async () => {
    const { enviarCorreoDePrueba } = await import("./email")

    await enviarCorreoDePrueba("consejo", datosDePrueba)

    const html = enviarMock.mock.calls[0][0].html as string
    expect(html).toContain('href="https://eli.app/reservar/peluqueria-sol"')
    expect(html).toContain("Instagram")
    expect(html).toContain("WhatsApp")
  })

  it("quedan-3-dias: dice cuántos días quedan de verdad y el día en que termina", async () => {
    const { enviarCorreoDePrueba } = await import("./email")

    await enviarCorreoDePrueba("quedan-3-dias", datosDePrueba)
    await enviarCorreoDePrueba("quedan-3-dias", { ...datosDePrueba, diasRestantes: 2 })
    await enviarCorreoDePrueba("quedan-3-dias", { ...datosDePrueba, diasRestantes: 1 })

    expect(enviarMock.mock.calls[0][0].subject).toBe("Te quedan 3 días de prueba en Eli")
    expect(enviarMock.mock.calls[1][0].subject).toBe("Te quedan 2 días de prueba en Eli")
    expect(enviarMock.mock.calls[2][0].subject).toBe("Mañana termina tu prueba de Eli")
    expect(enviarMock.mock.calls[0][0].html).toContain("sábado, 24 de octubre")
  })

  it("los avisos de fin no prometen un cobro que todavía no existe", async () => {
    const { enviarCorreoDePrueba } = await import("./email")

    await enviarCorreoDePrueba("quedan-3-dias", datosDePrueba)
    await enviarCorreoDePrueba("termina-hoy", datosDePrueba)

    for (const [{ html }] of enviarMock.mock.calls) {
      expect(html).toContain("Todavía no se cobra nada")
      expect(html).toContain("$9.990")
      expect(html).toContain("$34.990")
      expect(html).not.toMatch(/elige tu plan|paga ahora|suscríbete/i)
    }
  })
})
