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

  it("en una clínica dental la invitación nombra el rol \"Odontólogo\"; sin rubro, \"Profesional\"", async () => {
    const { enviarInvitacionTrabajador } = await import("./email")
    const base = { emailTrabajador: "t@ejemplo.com", nombreTrabajador: "Ana", nombreNegocio: "Uno", rol: "worker", enlaceAceptar: "https://eli.app/unirse/x" }

    await enviarInvitacionTrabajador({ ...base, rubro: "odontologia" })
    await enviarInvitacionTrabajador(base)

    expect(enviarMock.mock.calls[0][0].html as string).toContain("<strong>Odontólogo</strong>")
    expect(enviarMock.mock.calls[1][0].html as string).toContain("<strong>Profesional</strong>")
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

  it("la fecha del correo es el día calendario recibido, sin importar la zona del servidor", async () => {
    const zonaAntes = process.env.TZ
    process.env.TZ = "America/Santiago"
    try {
      const { enviarRecordatorio } = await import("./email")
      await enviarRecordatorio({
        emailCliente: "cliente@ejemplo.com",
        nombreCliente: "Ana Pérez",
        nombreNegocio: "Peluquería Sol",
        servicio: "Corte",
        fecha: "2026-09-10",
        hora: "10:00",
      })
      const html = enviarMock.mock.calls[0][0].html as string
      expect(html).toContain("10 de septiembre de 2026")
    } finally {
      process.env.TZ = zonaAntes
    }
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
    expect(enviarMock.mock.calls[1][0].subject).toBe("Recordatorio — tu cita es mañana")

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

describe("lib/email — correos de soporte", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  it("el aviso a soporte escapa lo que escribió la persona, limpia el asunto y pone el Reply-To", async () => {
    const { enviarSolicitudASoporte } = await import("./email")

    await enviarSolicitudASoporte({
      para: "soporte@eli.test",
      responderA: "ana@ejemplo.com",
      numero: "#000007",
      tipo: "Falla",
      area: "Agenda",
      asunto: "Hola\r\nBcc: otro@ejemplo.com",
      detalle: [["Descripción", '<img src=x onerror="alert(1)">']],
    })

    const enviado = enviarMock.mock.calls[0][0]
    expect(enviado.to).toBe("soporte@eli.test")
    expect(enviado.replyTo).toBe("ana@ejemplo.com")
    expect(enviado.subject).toBe("[Soporte #000007] Falla · Agenda — HolaBcc: otro@ejemplo.com")
    expect(enviado.html).not.toContain("<img src=x")
    expect(enviado.html).toContain("&lt;img")
  })

  it("el acuse no promete plazos y sin casilla no lleva Reply-To", async () => {
    const { enviarAcuseDeSoporte } = await import("./email")

    await enviarAcuseDeSoporte({ para: "ana@ejemplo.com", responderA: null, numero: "#000007", detalle: [["Caso", "#000007"]] })

    const enviado = enviarMock.mock.calls[0][0]
    expect(enviado.subject).toBe("Recibimos tu solicitud #000007")
    expect(enviado).not.toHaveProperty("replyTo")
    expect(enviado.html).not.toMatch(/\b(horas|días hábiles|24|48)\b/)
  })
})

describe("lib/email — mensajes a clientes (etapa 3)", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  const BAJA = {
    enlaceDeBaja: "https://eli.app/baja-de-correos/cliente/abc.def",
    enlaceDeBajaEnUnClic: "https://eli.app/api/correos/baja-de-cliente?token=abc.def",
  }

  const teToca = {
    emailCliente: "maria@test.com",
    nombreCliente: "María",
    nombreNegocio: "Salón Uno",
    servicio: "Corte",
    enlaceReservar: "https://eli.app/reservar/salon-uno",
    ...BAJA,
  }

  const resena = {
    emailCliente: "maria@test.com",
    nombreCliente: "María",
    nombreNegocio: "Salón Uno",
    enlaceResenas: "https://g.page/r/abc/review",
    ...BAJA,
  }

  const espera = {
    emailCliente: "maria@test.com",
    nombreCliente: "María",
    nombreNegocio: "Salón Uno",
    servicio: "Corte",
    profesional: "Carla",
    fecha: "2026-11-02",
    enlaceReservar: "https://eli.app/reservar/salon-uno?servicio=s1&fecha=2026-11-02",
    enlaceSalir: "https://eli.app/reservar/salon-uno/espera/tok",
    enlaceSalirEnUnClic: "https://eli.app/api/reservar/salon-uno/lista-de-espera/tok",
  }

  it("te toca y la reseña llevan List-Unsubscribe de un clic (RFC 8058) y el pie de baja", async () => {
    const email = await import("./email")

    await email.enviarTeToca(teToca)
    await email.enviarPedirResena(resena)

    for (const [envio] of enviarMock.mock.calls) {
      expect(envio.headers).toEqual({
        "List-Unsubscribe": `<${BAJA.enlaceDeBajaEnUnClic}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      })
      expect(envio.html).toContain(`href="${BAJA.enlaceDeBaja}"`)
      expect(envio.html).toContain("Dejar de recibir estos correos")
      expect(envio.html).toContain("aceptaste recibir avisos y novedades")
    }
  })

  it("el aviso de la lista de espera: botón a la reserva, el día legible y 'Salir de la lista' de un clic", async () => {
    const email = await import("./email")

    await email.enviarAvisoListaDeEspera(espera)

    const envio = enviarMock.mock.calls[0][0]
    expect(envio.headers).toEqual({
      "List-Unsubscribe": `<${espera.enlaceSalirEnUnClic}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    })
    expect(envio.html).toContain("Salir de la lista de espera")
    expect(envio.html).toContain(`href="${espera.enlaceSalir}"`)
    expect(envio.html).toContain("https://eli.app/reservar/salon-uno?servicio=s1&amp;fecha=2026-11-02")
    expect(envio.html).toContain("lunes, 2 de noviembre de 2026")
    expect(envio.html).toContain("quien reserve primero")
  })

  it("los correos de siempre no llevan encabezados de baja", async () => {
    const email = await import("./email")

    await email.enviarRecordatorio({
      emailCliente: "maria@test.com",
      nombreCliente: "María",
      nombreNegocio: "Salón Uno",
      servicio: "Corte",
      fecha: "2026-11-02",
      hora: "10:00",
    })

    expect(enviarMock.mock.calls[0][0]).not.toHaveProperty("headers")
  })

  it("el recordatorio trae el botón de gestión sólo si viene el enlace (#106)", async () => {
    const email = await import("./email")
    const recordatorio = { emailCliente: "maria@test.com", nombreCliente: "María", nombreNegocio: "Salón Uno", servicio: "Corte", fecha: "2026-11-02", hora: "10:00" }

    await email.enviarRecordatorio({ ...recordatorio, enlaceDeGestion: "https://eli.app/reservar/salon-uno/cita/abc", plazoHoras: 24 })
    await email.enviarRecordatorio(recordatorio)

    const [conEnlace, sinEnlace] = enviarMock.mock.calls.map(([envio]) => envio.html as string)
    expect(conEnlace).toContain('href="https://eli.app/reservar/salon-uno/cita/abc"')
    expect(conEnlace).toContain("Cancelar o cambiar mi cita")
    expect(conEnlace).toContain("hasta 24 horas antes")
    expect(sinEnlace).not.toContain("Cancelar o cambiar mi cita")
    expect(sinEnlace).toContain("avísanos con anticipación")
  })

  it("#164: dentro del plazo el recordatorio no ofrece cancelar ni cambiar, aunque venga el enlace", async () => {
    const email = await import("./email")
    const recordatorio = { emailCliente: "maria@test.com", nombreCliente: "María", nombreNegocio: "Salón Uno", servicio: "Corte", fecha: "2026-11-02", hora: "10:00" }

    await email.enviarRecordatorio({ ...recordatorio, enlaceDeGestion: "https://eli.app/reservar/salon-uno/cita/abc", plazoHoras: 24, sePuedeCambiar: false })
    await email.enviarRecordatorio({ ...recordatorio, sePuedeCambiar: false })

    for (const [envio] of enviarMock.mock.calls) {
      const html = envio.html as string
      expect(html).not.toContain("Cancelar o cambiar mi cita")
      expect(html).not.toContain("cita/abc")
      expect(html).toContain("contacta directamente al local")
    }
  })

  it("escapa los datos de personas y limpia el asunto", async () => {
    const email = await import("./email")

    await email.enviarTeToca({ ...teToca, nombreCliente: "<script>x</script>", nombreNegocio: "Salón\r\nBcc: x@y.z", servicio: '"><img>' })
    await email.enviarPedirResena({ ...resena, nombreCliente: "<b>Ana</b>", enlaceResenas: 'https://g.page/"onmouseover="x' })
    await email.enviarAvisoListaDeEspera({ ...espera, servicio: "<i>Corte</i>", profesional: "<u>Carla</u>" })

    const [teTocaEnviado, resenaEnviada, esperaEnviada] = enviarMock.mock.calls.map(([envio]) => envio)
    expect(teTocaEnviado.subject).not.toMatch(/[\r\n]/)
    expect(teTocaEnviado.html).not.toContain("<script>x")
    expect(teTocaEnviado.html).not.toContain('"><img>')
    expect(resenaEnviada.html).not.toContain("<b>Ana</b>")
    expect(resenaEnviada.html).not.toContain('"onmouseover="x')
    expect(esperaEnviada.html).not.toContain("<i>Corte</i>")
    expect(esperaEnviada.html).not.toContain("<u>Carla</u>")
  })

  it.each([
    ["con salto de línea", "https://eli.app/baja?t=a\r\nBcc: x@y.z"],
    ["que se sale de los <>", "https://eli.app/baja?t=a>, <https://otro.test"],
    ["sin http(s)", "javascript:alert(1)"],
  ])("una URL de baja en un clic %s no se manda: lanza antes de llegar a Resend", async (_caso, url) => {
    const email = await import("./email")

    await expect(email.enviarTeToca({ ...teToca, enlaceDeBajaEnUnClic: url })).rejects.toThrow()
    expect(enviarMock).not.toHaveBeenCalled()
  })
})

describe("lib/email — reservas por confirmar (#84)", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  const reserva = {
    emailCliente: "cliente@ejemplo.com",
    nombreCliente: "Lucía Pérez",
    nombreNegocio: "Salón Uno",
    servicio: "Corte",
    fecha: "2026-09-10",
    hora: "10:00",
    duracion: 30,
  }

  it("la confirmación al cliente dice que el local la confirmará, sin hablar de faltas", async () => {
    const { enviarConfirmacionCliente } = await import("./email")

    await enviarConfirmacionCliente({ ...reserva, porConfirmar: true })

    const { subject, html } = enviarMock.mock.calls[0][0]
    expect(subject).toBe("Reserva recibida — Salón Uno")
    expect(html).toContain("confirmará tu reserva")
    expect(html).not.toMatch(/falt|no vino|inasist/i)
    expect(html).not.toContain("¡Tu cita está confirmada!")
  })

  it("sin la marca, la confirmación es la de siempre", async () => {
    const { enviarConfirmacionCliente } = await import("./email")

    await enviarConfirmacionCliente(reserva)

    const { subject, html } = enviarMock.mock.calls[0][0]
    expect(subject).toBe("Cita confirmada — Salón Uno")
    expect(html).toContain("¡Tu cita está confirmada!")
    expect(html).not.toContain("confirmará tu reserva")
  })

  it("el aviso al negocio pide confirmarla o cancelarla en el panel", async () => {
    const { enviarAvisoProfesional } = await import("./email")

    await enviarAvisoProfesional({
      emailProfesional: "duena@uno.test",
      nombreNegocio: "Salón Uno",
      nombreCliente: "Lucía Pérez",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      porConfirmar: true,
    })

    const { subject, html } = enviarMock.mock.calls[0][0]
    expect(subject).toBe("Reserva por confirmar — Lucía Pérez")
    expect(html).toContain("confirmar la reserva o cancelarla")
  })

  it("el aviso de confirmada por el local escapa los datos y dice el día", async () => {
    const { enviarReservaConfirmadaPorElLocal } = await import("./email")

    await enviarReservaConfirmadaPorElLocal({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: "<b>Lucía</b>",
      nombreNegocio: "Salón Uno",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      profesional: "Carla",
    })

    const { subject, html, to } = enviarMock.mock.calls[0][0]
    expect(to).toBe("cliente@ejemplo.com")
    expect(subject).toBe("Reserva confirmada — Salón Uno")
    expect(html).toContain("confirmó tu reserva")
    expect(html).toContain("&lt;b&gt;Lucía&lt;/b&gt;")
    expect(html).toContain("septiembre")
  })
})

describe("el precio en los correos al cliente (#138)", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  const confirmacion = { emailCliente: "ana@test.com", nombreCliente: "Ana", nombreNegocio: "Salón Uno", servicio: "Corte + Color", fecha: "2026-11-02", hora: "10:00", duracion: 90 }
  const html = (i: number) => (enviarMock.mock.calls[i][0] as { html: string }).html

  it("con hora valle: el precio rebajado y el normal", async () => {
    const email = await import("./email")
    await email.enviarConfirmacionCliente({ ...confirmacion, precio: 31400, precioNormal: 33000 })
    expect(html(0)).toContain("$31.400 (hora valle; precio normal $33.000)")
  })

  it("sin rebaja: sólo el precio; con un servicio sin precio, '+ a consultar'; sin precio, ninguna fila", async () => {
    const email = await import("./email")
    await email.enviarConfirmacionCliente({ ...confirmacion, precio: 33000, precioNormal: null })
    await email.enviarConfirmacionCliente({ ...confirmacion, precio: 8000, precioIncompleto: true })
    await email.enviarConfirmacionCliente({ ...confirmacion, precio: null })
    expect(html(0)).toContain("$33.000")
    expect(html(0)).not.toContain("hora valle")
    expect(html(1)).toContain("$8.000 + a consultar")
    expect(html(2)).not.toContain("Precio")
  })

  it("la reserva confirmada por el local lleva el precio de la cita", async () => {
    const email = await import("./email")
    await email.enviarReservaConfirmadaPorElLocal({ emailCliente: "ana@test.com", nombreCliente: "Ana", nombreNegocio: "Salón Uno", servicio: "Corte", fecha: "2026-11-02", hora: "10:00", precio: 6400 })
    expect(html(0)).toContain("$6.400")
  })
})

describe("enviarConfirmacionCliente: reservada dentro del plazo (QA#8)", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  const datos = {
    emailCliente: "cliente@ejemplo.com",
    nombreCliente: "Ana",
    nombreNegocio: "Salón",
    servicio: "Corte",
    fecha: "2026-09-10",
    hora: "10:00",
    duracion: 30,
    enlaceDeGestion: "https://eli.test/reservar/salon/cita/token-de-prueba",
    plazoHoras: 24,
  }

  it("sin botón para cancelar o cambiar: dice que se contacte al local", async () => {
    const { enviarConfirmacionCliente } = await import("./email")
    await enviarConfirmacionCliente({ ...datos, sePuedeCambiar: false })
    const html = enviarMock.mock.calls[0][0].html as string
    expect(html).not.toContain("token-de-prueba")
    expect(html).not.toContain("Cancelar o cambiar mi cita")
    expect(html).toContain("no se puede cancelar ni cambiar por el enlace")
    expect(html).toContain("contacta directamente al local")
  })

  it("fuera del plazo, el botón de siempre", async () => {
    const { enviarConfirmacionCliente } = await import("./email")
    await enviarConfirmacionCliente({ ...datos, sePuedeCambiar: true })
    const html = enviarMock.mock.calls[0][0].html as string
    expect(html).toContain("token-de-prueba")
    expect(html).toContain("Cancelar o cambiar mi cita")
  })
})

// ─── Cada rubro con sus palabras (E5) ────────────────────────────────────────
//
// El rubro llega desde `Business.type` a cada función de envío y pone las
// palabras del correo (`lib/vocabulario.ts`) con la concordancia de
// `lib/concordancia.ts`. La tabla escribe a mano lo que tiene que decir cada
// rubro: no calcula nada con el vocabulario, así que un error de género o de
// palabra en la plantilla no se compensa con el mismo error en el test.

/** Lo que lee quien abre el correo: sin etiquetas, sin el título del documento y sin el pie. */
function textoVisible(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<\/?strong>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .split("Enviado por Eli")[0]
    .trim()
}

interface CorreoEnviado {
  subject: string
  texto: string
}

/** Manda un correo de cada plantilla que habla del rubro y devuelve lo que salió, por nombre. */
async function correosDe(rubro: string | null | undefined): Promise<Record<string, CorreoEnviado>> {
  vi.resetModules()
  const email = await import("./email")
  const r = { rubro }
  const cliente = { emailCliente: "ana@ejemplo.com", nombreCliente: "Ana" }
  const reserva = { nombreNegocio: "Estudio Sol", servicio: "Limpieza", fecha: "2026-11-02", hora: "10:00" }
  const gestion = { enlaceDeGestion: "https://eli.app/reservar/estudio-sol/cita/abc" }
  const baja = { enlaceDeBaja: "https://eli.app/baja/x", enlaceDeBajaEnUnClic: "https://eli.app/api/baja?token=x" }
  const cambio = { emailNegocio: "dueno@ejemplo.com", ...reserva, nombreCliente: "Ana", profesional: "Carla", fechaAnterior: "2026-11-01", horaAnterior: "09:00" }
  const prueba = {
    ...r,
    emailDueno: "dueno@ejemplo.com",
    nombreDueno: "Ana",
    nombreNegocio: "Estudio Sol",
    enlacePanel: "https://eli.app/dashboard",
    enlaceReservas: "https://eli.app/reservar/estudio-sol",
    enlaceDeBaja: "https://eli.app/baja-de-correos/abc.def",
    ultimoDia: "2026-10-24",
    diasRestantes: 3,
  }
  const aviso = { ...r, ...reserva, emailProfesional: "carla@ejemplo.com", nombreCliente: "Ana", profesional: "Carla" }

  const envios: Array<[string, () => unknown]> = [
    ["confirmacion", () => email.enviarConfirmacionCliente({ ...r, ...cliente, ...reserva, ...gestion, duracion: 30, profesional: "Carla", plazoHoras: 24, sePuedeCambiar: true })],
    ["confirmacion-sin-plazo", () => email.enviarConfirmacionCliente({ ...r, ...cliente, ...reserva, ...gestion, duracion: 30, plazoHoras: 0, sePuedeCambiar: true })],
    ["confirmacion-dentro-del-plazo", () => email.enviarConfirmacionCliente({ ...r, ...cliente, ...reserva, ...gestion, duracion: 30, plazoHoras: 24, sePuedeCambiar: false })],
    ["confirmacion-sin-enlace", () => email.enviarConfirmacionCliente({ ...r, ...cliente, ...reserva, duracion: 30 })],
    ["confirmacion-por-confirmar", () => email.enviarConfirmacionCliente({ ...r, ...cliente, ...reserva, duracion: 30, porConfirmar: true })],
    ["confirmada-por-el-local", () => email.enviarReservaConfirmadaPorElLocal({ ...r, ...cliente, ...reserva, profesional: "Carla" })],
    ["recordatorio", () => email.enviarRecordatorio({ ...r, ...cliente, ...reserva, ...gestion, plazoHoras: 24 })],
    ["recordatorio-sin-plazo", () => email.enviarRecordatorio({ ...r, ...cliente, ...reserva, ...gestion, plazoHoras: 0 })],
    ["recordatorio-dentro-del-plazo", () => email.enviarRecordatorio({ ...r, ...cliente, ...reserva, ...gestion, plazoHoras: 24, sePuedeCambiar: false })],
    ["recordatorio-sin-enlace", () => email.enviarRecordatorio({ ...r, ...cliente, ...reserva })],
    ["lista-de-espera", () => email.enviarAvisoListaDeEspera({ ...r, ...cliente, nombreNegocio: "Estudio Sol", servicio: "Limpieza", profesional: "Carla", fecha: "2026-11-02", enlaceReservar: "https://eli.app/reservar/estudio-sol", enlaceSalir: "https://eli.app/espera/tok", enlaceSalirEnUnClic: "https://eli.app/api/espera/tok" })],
    ["te-toca", () => email.enviarTeToca({ ...r, ...cliente, nombreNegocio: "Estudio Sol", servicio: "Limpieza", enlaceReservar: "https://eli.app/reservar/estudio-sol", ...baja })],
    ["te-toca-sin-servicio", () => email.enviarTeToca({ ...r, ...cliente, nombreNegocio: "Estudio Sol", enlaceReservar: "https://eli.app/reservar/estudio-sol", ...baja })],
    ["resena", () => email.enviarPedirResena({ ...r, ...cliente, nombreNegocio: "Estudio Sol", enlaceResenas: "https://g.page/r/estudio-sol/review", ...baja })],
    ["fila", () => email.enviarAvisoFilaVirtual({ ...r, ...cliente, nombreNegocio: "Estudio Sol", numero: 4 })],
    ["aviso-profesional", () => email.enviarAvisoProfesional(aviso)],
    ["aviso-profesional-por-confirmar", () => email.enviarAvisoProfesional({ ...aviso, porConfirmar: true })],
    ["aviso-cancelo", () => email.enviarAvisoDeCambioDelCliente({ ...r, ...cambio, tipo: "cancelo" })],
    ["aviso-reagendo", () => email.enviarAvisoDeCambioDelCliente({ ...r, ...cambio, tipo: "reagendo" })],
    ["invitacion", () => email.enviarInvitacionTrabajador({ ...r, emailTrabajador: "tomas@ejemplo.com", nombreTrabajador: "Tomás", nombreNegocio: "Estudio Sol", rol: "worker", enlaceAceptar: "https://eli.app/unirse/x" })],
    ["bienvenida", () => email.enviarCorreoDePrueba("bienvenida", prueba)],
    ["consejo", () => email.enviarCorreoDePrueba("consejo", prueba)],
    ["quedan-3-dias", () => email.enviarCorreoDePrueba("quedan-3-dias", prueba)],
    ["termina-hoy", () => email.enviarCorreoDePrueba("termina-hoy", prueba)],
  ]

  const salida: Record<string, CorreoEnviado> = {}
  for (const [nombre, enviar] of envios) {
    enviarMock.mockClear()
    await enviar()
    const envio = enviarMock.mock.calls[0][0] as { subject: string; html: string }
    salida[nombre] = { subject: envio.subject, texto: textoVisible(envio.html) }
  }
  return salida
}

/** Lo que dice un rubro, escrito a mano, con el género y el número ya resueltos. */
interface PalabrasEsperadas {
  nombre: string
  rubro: string | null
  /** Las etiquetas de las tablas: quien se atiende, lo que se atiende y quien atiende (panel). */
  cliente: string
  servicioDelPanel: string
  profesional: string
  /** La etiqueta de lo que eligió quien reservó. */
  servicioDeLaReserva: string
  /** Quien reservó lee su reserva como... */
  suCita: string
  unaCita: string
  citaConfirmada: string
  alLocal: string
  hastaSinPlazo: string
  /** El negocio lee la reserva como... */
  unaNuevaCita: string
  citasAnteriores: string
  citaCancelada: string
  citaReagendada: string
  tituloCancelo: string
  tituloCambio: string
  introCancelo: string
  introCambio: string
  /** El negocio mismo. */
  negocio: string
  conMayusculaNegocio: string
  lo: string
  tocaVolver: string
  clientes: string
  servicios: string
  elServicioDeLaReserva: string
  laCitaEnLaAgenda: string
  /** Las palabras que NO pueden aparecer en ningún correo de este rubro. */
  prohibidas: RegExp
}

const DE_UN_SALON_DE_BELLEZA = {
  cliente: "Cliente",
  servicioDelPanel: "Servicio",
  servicioDeLaReserva: "Servicio",
  suCita: "hora",
  unaCita: "una hora",
  citaConfirmada: "Hora confirmada",
  hastaSinPlazo: "hasta que llegue la hora",
  unaNuevaCita: "una nueva hora",
  citasAnteriores: "horas anteriores",
  citaCancelada: "Hora cancelada",
  citaReagendada: "Hora reagendada",
  tituloCancelo: "Un cliente canceló su hora",
  tituloCambio: "Un cliente cambió su hora",
  introCancelo: "Ana canceló su hora en Estudio Sol",
  introCambio: "Ana cambió su hora en Estudio Sol",
  clientes: "clientes",
  servicios: "servicios",
  elServicioDeLaReserva: "el servicio",
  laCitaEnLaAgenda: "esa hora",
  tocaVolver: "Ya te toca volver",
  prohibidas: /paciente|odontólog|prestaci|clínica|motivo|control|\bcita\b|\blocal\b/i,
}

const RUBROS_CON_PALABRAS: PalabrasEsperadas[] = [
  {
    ...DE_UN_SALON_DE_BELLEZA,
    nombre: "salón",
    rubro: "salon",
    profesional: "Estilista",
    alLocal: "al salón",
    negocio: "salón",
    conMayusculaNegocio: "Salón",
    lo: "lo",
  },
  {
    ...DE_UN_SALON_DE_BELLEZA,
    nombre: "barbería",
    rubro: "barberia",
    profesional: "Barbero",
    alLocal: "a la barbería",
    negocio: "barbería",
    conMayusculaNegocio: "Barbería",
    lo: "la",
  },
  {
    ...DE_UN_SALON_DE_BELLEZA,
    nombre: "salón de uñas",
    rubro: "spa-de-unas",
    profesional: "Manicurista",
    alLocal: "al salón de uñas",
    negocio: "salón de uñas",
    conMayusculaNegocio: "Salón de uñas",
    lo: "lo",
  },
  {
    // En la clínica el panel dice "cita" y "prestación"; quien reserva lee "hora" y "motivo".
    nombre: "clínica dental",
    rubro: "odontologia",
    cliente: "Paciente",
    servicioDelPanel: "Prestación",
    profesional: "Odontólogo",
    servicioDeLaReserva: "Motivo",
    suCita: "hora",
    unaCita: "una hora",
    citaConfirmada: "Hora confirmada",
    alLocal: "a la clínica",
    hastaSinPlazo: "hasta que llegue la hora",
    unaNuevaCita: "una nueva cita",
    citasAnteriores: "citas anteriores",
    citaCancelada: "Cita cancelada",
    citaReagendada: "Cita reagendada",
    tituloCancelo: "Un paciente canceló su cita",
    tituloCambio: "Un paciente cambió su cita",
    introCancelo: "Ana canceló su cita en Estudio Sol",
    introCambio: "Ana cambió la hora de su cita en Estudio Sol",
    negocio: "clínica",
    conMayusculaNegocio: "Clínica",
    lo: "la",
    tocaVolver: "Ya te toca tu control",
    clientes: "pacientes",
    servicios: "prestaciones",
    elServicioDeLaReserva: "el motivo",
    laCitaEnLaAgenda: "la cita",
    prohibidas: /cliente|estilista|barbero|manicurista|salón|barbería|\blocal\b|servicio/i,
  },
  {
    // Las palabras de siempre: lo que decían los correos antes del vocabulario.
    nombre: "sin rubro",
    rubro: null,
    cliente: "Cliente",
    servicioDelPanel: "Servicio",
    profesional: "Profesional",
    servicioDeLaReserva: "Servicio",
    suCita: "cita",
    unaCita: "una cita",
    citaConfirmada: "Cita confirmada",
    alLocal: "al local",
    hastaSinPlazo: "hasta la hora de la cita",
    unaNuevaCita: "una nueva cita",
    citasAnteriores: "citas anteriores",
    citaCancelada: "Cita cancelada",
    citaReagendada: "Cita reagendada",
    tituloCancelo: "Un cliente canceló su cita",
    tituloCambio: "Un cliente cambió su cita",
    introCancelo: "Ana canceló su cita en Estudio Sol",
    introCambio: "Ana cambió la hora de su cita en Estudio Sol",
    negocio: "negocio",
    conMayusculaNegocio: "Negocio",
    lo: "lo",
    tocaVolver: "Ya te toca volver",
    clientes: "clientes",
    servicios: "servicios",
    elServicioDeLaReserva: "el servicio",
    laCitaEnLaAgenda: "la cita",
    prohibidas: /paciente|odontólog|estilista|barbero|manicurista|salón|barbería|clínica|prestaci|motivo|control/i,
  },
]

describe.each(RUBROS_CON_PALABRAS)("lib/email — los correos de $nombre", (p) => {
  let correos: Record<string, CorreoEnviado>

  beforeEach(async () => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    correos = await correosDe(p.rubro)
  })

  describe("a quien reservó", () => {
    it("la confirmación: el asunto, el título y las etiquetas con las palabras del rubro", () => {
      const { subject, texto } = correos["confirmacion"]
      expect(subject).toBe(`${p.citaConfirmada} — Estudio Sol`)
      expect(texto).toContain(`¡Tu ${p.suCita} está confirmada!`)
      expect(texto).toContain(`${p.servicioDeLaReserva}: Limpieza`)
      // "Con" es una preposición y "Hora" la hora del reloj: no cambian con el rubro.
      expect(texto).toContain("Con: Carla")
      expect(texto).toContain("Hora: 10:00")
      expect(texto).toContain(`Cancelar o cambiar mi ${p.suCita}`)
      expect(texto).toContain(`Puedes cancelar o cambiar tu ${p.suCita} con el botón hasta 24 horas antes. Después, contacta directamente ${p.alLocal}.`)
    })

    it("la confirmación, sin plazo, dentro del plazo, sin enlace y por confirmar", () => {
      expect(correos["confirmacion-sin-plazo"].texto).toContain(`Puedes cancelar o cambiar tu ${p.suCita} con el botón ${p.hastaSinPlazo}.`)
      expect(correos["confirmacion-dentro-del-plazo"].texto).toContain(
        `Tu hora es en menos de 24 horas, así que no se puede cancelar ni cambiar por el enlace. Si lo necesitas, contacta directamente ${p.alLocal}.`,
      )
      expect(correos["confirmacion-sin-enlace"].texto).toContain(`Si necesitas cancelar o cambiar tu ${p.suCita}, contáctanos con anticipación.`)
      // "Reserva" es el acto de reservar, no la cita: no depende del rubro.
      expect(correos["confirmacion-por-confirmar"].subject).toBe("Reserva recibida — Estudio Sol")
      expect(correos["confirmacion-por-confirmar"].texto).toContain("Recibimos tu reserva")
    })

    it("el recordatorio: 'tu hora es mañana' / 'tu cita es mañana'", () => {
      const { subject, texto } = correos["recordatorio"]
      expect(subject).toBe(`Recordatorio — tu ${p.suCita} es mañana`)
      expect(texto).toContain(`Tu ${p.suCita} es mañana`)
      expect(texto).toContain(`te recordamos que tienes ${p.unaCita} mañana en Estudio Sol`)
      expect(texto).toContain(`${p.servicioDeLaReserva}: Limpieza`)
      expect(texto).toContain(`Cancelar o cambiar mi ${p.suCita}`)
      expect(texto).toContain(`cancela o cambia tu ${p.suCita} con el botón hasta 24 horas antes. Después, contacta directamente ${p.alLocal}.`)
      expect(correos["recordatorio-sin-plazo"].texto).toContain(`cancela o cambia tu ${p.suCita} con el botón ${p.hastaSinPlazo}.`)
      expect(correos["recordatorio-dentro-del-plazo"].texto).toContain(`Si no puedes asistir, contacta directamente ${p.alLocal}.`)
      expect(correos["recordatorio-sin-enlace"].texto).toContain("por favor avísanos con anticipación")
    })

    it("la reserva confirmada por el local", () => {
      const { subject, texto } = correos["confirmada-por-el-local"]
      expect(subject).toBe("Reserva confirmada — Estudio Sol")
      expect(texto).toContain(`${p.servicioDeLaReserva}: Limpieza`)
      expect(texto).toContain(`Si necesitas cancelar o cambiar tu ${p.suCita}, usa el enlace del correo de tu reserva o contacta ${p.alLocal}.`)
    })

    it("la lista de espera: 'se liberó una hora' en todos los rubros", () => {
      const { subject, texto } = correos["lista-de-espera"]
      expect(subject).toBe("Se liberó una hora — Estudio Sol")
      expect(texto).toContain("Se liberó una hora Hola Ana, se liberó una hora en Estudio Sol")
      expect(texto).toContain(`${p.servicioDeLaReserva}: Limpieza`)
      expect(texto).toContain("Reservar la hora")
      expect(texto).toContain("la hora es de quien reserve primero. Si ya no la necesitas, puedes salir de la lista.")
    })

    it("te toca volver: la clínica lo llama control", () => {
      const conServicio = correos["te-toca"]
      expect(conServicio.subject).toBe("¿Agendamos tu próxima hora? — Estudio Sol")
      expect(conServicio.texto).toContain(p.tocaVolver)
      expect(conServicio.texto).toContain("desde tu último Limpieza en Estudio Sol. Cuando quieras, reserva tu próxima hora.")
      expect(conServicio.texto).toContain("Reservar mi hora")
      expect(correos["te-toca-sin-servicio"].texto).toContain("desde tu última visita a Estudio Sol. Cuando quieras, reserva tu próxima hora.")
    })

    it("la reseña: el pronombre sigue el género del negocio", () => {
      expect(correos["resena"].texto).toContain(`ayuda a que más personas ${p.lo} conozcan.`)
    })

    it("la fila: el local con su palabra, y el turno sigue siendo el turno", () => {
      const { subject, texto } = correos["fila"]
      expect(subject).toBe("Ya casi es tu turno — Estudio Sol")
      expect(texto).toContain("Ya casi es tu turno")
      expect(texto).toContain("Tu número: 4")
      expect(texto).toContain(`Acércate ${p.alLocal} para no perderlo.`)
    })
  })

  describe("al negocio y a quien atiende", () => {
    it("el aviso de reserva: las etiquetas y la cita con las palabras del panel", () => {
      const { subject, texto } = correos["aviso-profesional"]
      expect(subject).toBe("Nueva reserva — Ana")
      expect(texto).toContain(`Tienes ${p.unaNuevaCita} en Estudio Sol.`)
      expect(texto).toContain(`${p.cliente}: Ana`)
      expect(texto).toContain(`${p.servicioDelPanel}: Limpieza`)
      expect(texto).toContain(`${p.profesional}: Carla`)
      expect(texto).toContain("Hora: 10:00")
    })

    it("el aviso de reserva por confirmar: 'faltó a horas anteriores' / 'a citas anteriores'", () => {
      const { subject, texto } = correos["aviso-profesional-por-confirmar"]
      expect(subject).toBe("Reserva por confirmar — Ana")
      expect(texto).toContain(`Este contacto faltó a ${p.citasAnteriores}. Entra a la agenda de tu panel para confirmar la reserva o cancelarla.`)
    })

    it("el cliente canceló: asunto, título, introducción y etiquetas", () => {
      const { subject, texto } = correos["aviso-cancelo"]
      expect(subject).toBe(`${p.citaCancelada} — Ana`)
      expect(texto).toContain(p.tituloCancelo)
      expect(texto).toContain(`${p.introCancelo} desde su enlace. El horario quedó libre.`)
      expect(texto).toContain(`${p.cliente}: Ana ${p.servicioDelPanel}: Limpieza ${p.profesional}: Carla`)
    })

    it("el cliente reagendó: asunto, título, introducción y etiquetas", () => {
      const { subject, texto } = correos["aviso-reagendo"]
      expect(subject).toBe(`${p.citaReagendada} — Ana`)
      expect(texto).toContain(p.tituloCambio)
      expect(texto).toContain(`${p.introCambio} desde su enlace.`)
      expect(texto).toContain(`${p.cliente}: Ana ${p.servicioDelPanel}: Limpieza ${p.profesional}: Carla`)
      expect(texto).toContain("Antes: domingo, 1 de noviembre de 2026, 09:00")
    })

    it("la invitación al equipo: la etiqueta del negocio con la palabra del rubro", () => {
      // El rol ("Tu rol: Odontólogo") sale de `nombreDelRol` (`lib/nombres-de-roles.ts`),
      // que también usa el panel y todavía distingue sólo la clínica: lo prueba el test de la invitación.
      expect(correos["invitacion"].texto).toContain(`${p.conMayusculaNegocio}: Estudio Sol Tu rol:`)
    })

    it("la bienvenida: el negocio, los clientes, los servicios y la cita con sus palabras", () => {
      const { texto } = correos["bienvenida"]
      expect(texto).toContain(`Tu ${p.negocio} ya está en Eli`)
      expect(texto).toContain(`Tus ${p.clientes} solo ven horas libres dentro de ese horario.`)
      expect(texto).toContain(`Agrega tus ${p.servicios}`)
      expect(texto).toContain(`Tus ${p.clientes} eligen ${p.elServicioDeLaReserva} y la hora, y ${p.laCitaEnLaAgenda} aparece en tu agenda.`)
    })

    it("el consejo: a quién le pega el enlace", () => {
      const { texto } = correos["consejo"]
      expect(texto).toContain(`es que tus ${p.clientes} reserven solos.`)
      expect(texto).toContain("cuando alguien te pregunte por una hora.")
    })
  })

  it("ningún correo dice una palabra de otro rubro", () => {
    for (const [nombre, { subject, texto }] of Object.entries(correos)) {
      expect(`${subject} ${texto}`, nombre).not.toMatch(p.prohibidas)
    }
  })
})

describe("lib/email — el rubro cambia las palabras, no el resto", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
  })

  it("un rubro desconocido, vacío o ausente (los viejos salud, fitness y otro) sale con las palabras de siempre", async () => {
    const deSiempre = await correosDe(null)
    for (const rubro of [undefined, "", "salud", "fitness", "otro", "inexistente", "constructor"]) {
      expect(await correosDe(rubro), `rubro ${JSON.stringify(rubro)}`).toEqual(deSiempre)
    }
  })

  it("las palabras de siempre siguen siendo las de los textos de antes del vocabulario", async () => {
    const c = await correosDe(null)
    expect(c["confirmacion"].subject).toBe("Cita confirmada — Estudio Sol")
    expect(c["confirmacion"].texto).toContain("¡Tu cita está confirmada! Hola Ana, te esperamos en Estudio Sol. Servicio: Limpieza Con: Carla Fecha:")
    expect(c["confirmacion-dentro-del-plazo"].texto).toContain("Tu hora es en menos de 24 horas")
    expect(c["recordatorio"].subject).toBe("Recordatorio — tu cita es mañana")
    expect(c["recordatorio"].texto).toContain("te recordamos que tienes una cita mañana en Estudio Sol")
    expect(c["aviso-profesional"].texto).toContain("Tienes una nueva cita en Estudio Sol. Cliente: Ana Servicio: Limpieza Profesional: Carla")
    expect(c["aviso-cancelo"].subject).toBe("Cita cancelada — Ana")
    expect(c["aviso-reagendo"].texto).toContain("Ana cambió la hora de su cita en Estudio Sol desde su enlace.")
    expect(c["lista-de-espera"].subject).toBe("Se liberó una hora — Estudio Sol")
    expect(c["te-toca"].texto).toContain("Ya te toca volver")
    expect(c["resena"].texto).toContain("ayuda a que más personas lo conozcan.")
    expect(c["fila"].texto).toContain("Acércate al local para no perderlo.")
    expect(c["invitacion"].texto).toContain("Negocio: Estudio Sol Tu rol: Profesional")
    expect(c["bienvenida"].texto).toContain("Tu negocio ya está en Eli")
    expect(c["bienvenida"].texto).toContain("Tus clientes eligen el servicio y la hora, y la cita aparece en tu agenda.")
  })

  it("los dos avisos de fin de la prueba no dependen del rubro", async () => {
    const deSiempre = await correosDe(null)
    for (const rubro of ["salon", "barberia", "spa-de-unas", "odontologia"]) {
      const c = await correosDe(rubro)
      expect(c["quedan-3-dias"], rubro).toEqual(deSiempre["quedan-3-dias"])
      expect(c["termina-hoy"], rubro).toEqual(deSiempre["termina-hoy"])
    }
  })

  it("lo que escribió una persona se sigue escapando con el rubro puesto", async () => {
    vi.resetModules()
    const { enviarRecordatorio } = await import("./email")
    enviarMock.mockClear()

    await enviarRecordatorio({
      rubro: "odontologia",
      emailCliente: "ana@ejemplo.com",
      nombreCliente: "<script>x</script>",
      nombreNegocio: "Clínica\r\nBcc: x@y.z",
      servicio: '"><img>',
      fecha: "2026-11-02",
      hora: "10:00",
    })

    const { html, subject } = enviarMock.mock.calls[0][0]
    expect(html).not.toContain("<script>x")
    expect(html).not.toContain('"><img>')
    expect(subject).not.toMatch(/[\r\n]/)
  })
})
