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

  it("escapa el nombre de usuario en la recuperación de contraseña (enviarRecuperacionPassword)", async () => {
    const { enviarRecuperacionPassword } = await import("./email")

    await enviarRecuperacionPassword({
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
    expect(subject).toBe("✅ Cita confirmada — NegocioBcc: atacante@evil.com")
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
    expect(subject).toBe("📅 Nueva reserva — AnaBcc: atacante@evil.com")
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
    expect(subject).toBe("✅ Cita confirmada — NegocioBcc: atacante@evil.com")
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

    expect(subject).toBe("✅ Cita confirmada — NegocioMalicioso")
  })

  it("un asunto normal se ve exactamente igual que hoy, emojis incluidos", async () => {
    const { enviarConfirmacionCliente, enviarRecordatorio, enviarRecuperacionPassword } = await import("./email")

    await enviarConfirmacionCliente({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: "Ana Pérez",
      nombreNegocio: "Peluquería Sol",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
      duracion: 30,
    })
    expect(enviarMock.mock.calls[0][0].subject).toBe("✅ Cita confirmada — Peluquería Sol")

    await enviarRecordatorio({
      emailCliente: "cliente@ejemplo.com",
      nombreCliente: "Ana Pérez",
      nombreNegocio: "Peluquería Sol",
      servicio: "Corte",
      fecha: "2026-09-10",
      hora: "10:00",
    })
    expect(enviarMock.mock.calls[1][0].subject).toBe("🔔 Recordatorio — Tu cita es mañana")

    await enviarRecuperacionPassword({
      emailUsuario: "usuario@ejemplo.com",
      nombreUsuario: "Ana",
      enlaceRestablecer: "https://eli.app/restablecer/token-real",
    })
    expect(enviarMock.mock.calls[2][0].subject).toBe("🔑 Restablece tu contraseña — Eli")
  })
})
