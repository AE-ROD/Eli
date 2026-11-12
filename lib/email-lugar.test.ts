import { describe, it, expect, beforeEach, vi } from "vitest"

/**
 * La fila "Dónde" de los correos que hablan de UNA hora concreta (etapa 9,
 * plan Independiente con varias sedes). Sin `lugar`, cada correo sale
 * idéntico al de siempre; con él suma "Dónde: <nombre> · <dirección>,
 * <comuna>" en el bloque de la hora, escapada como el resto.
 */

const enviarMock = vi.fn().mockResolvedValue({ data: { id: "correo-1" } })

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: enviarMock },
  })),
}))

const LUGAR = { nombre: "Providencia", direccion: "Av. Providencia 1234, of. 5", comuna: "Providencia" }
const LINEA = "<strong>Dónde:</strong> Providencia · Av. Providencia 1234, of. 5, Providencia"

const confirmacion = {
  emailCliente: "cliente@ejemplo.com",
  nombreCliente: "Ana",
  nombreNegocio: "Peluquería Sol",
  servicio: "Corte",
  fecha: "2026-09-10",
  hora: "10:00",
  duracion: 30,
}

const avisoProfesional = {
  emailProfesional: "duena@ejemplo.com",
  nombreNegocio: "Peluquería Sol",
  nombreCliente: "Ana",
  servicio: "Corte",
  fecha: "2026-09-10",
  hora: "10:00",
}

const reservaConfirmada = {
  emailCliente: "cliente@ejemplo.com",
  nombreCliente: "Ana",
  nombreNegocio: "Peluquería Sol",
  servicio: "Corte",
  fecha: "2026-09-10",
  hora: "10:00",
}

const avisoDeCambio = {
  tipo: "reagendo" as const,
  emailNegocio: "duena@ejemplo.com",
  nombreNegocio: "Peluquería Sol",
  nombreCliente: "Ana",
  servicio: "Corte",
  fecha: "2026-09-11",
  hora: "11:00",
  fechaAnterior: "2026-09-10",
  horaAnterior: "10:00",
}

const recordatorio = {
  emailCliente: "cliente@ejemplo.com",
  nombreCliente: "Ana",
  nombreNegocio: "Peluquería Sol",
  servicio: "Corte",
  fecha: "2026-09-10",
  hora: "10:00",
}

/** El HTML del único correo enviado. */
const htmlEnviado = () => enviarMock.mock.calls[0][0].html as string

describe("lib/email: dónde queda la hora (varias sedes)", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  describe("sin `lugar` el correo es el de siempre", () => {
    it.each([
      ["la confirmación al cliente", "enviarConfirmacionCliente", confirmacion],
      ["el aviso a quien atiende", "enviarAvisoProfesional", avisoProfesional],
      ["la reserva confirmada por el local", "enviarReservaConfirmadaPorElLocal", reservaConfirmada],
      ["el aviso de cambio del cliente", "enviarAvisoDeCambioDelCliente", avisoDeCambio],
      ["el recordatorio", "enviarRecordatorio", recordatorio],
    ] as const)("%s no dice dónde", async (_nombre, funcion, datos) => {
      const correo = await import("./email")
      await (correo[funcion] as (datos: unknown) => Promise<unknown>)(datos)

      expect(htmlEnviado()).not.toContain("Dónde")
    })

    it("un `lugar` nulo o vacío tampoco suma la fila", async () => {
      const { enviarConfirmacionCliente } = await import("./email")

      await enviarConfirmacionCliente({ ...confirmacion, lugar: null })
      await enviarConfirmacionCliente({ ...confirmacion, lugar: { nombre: "  ", direccion: "", comuna: null } })

      for (const llamada of enviarMock.mock.calls) expect(llamada[0].html as string).not.toContain("Dónde")
    })

    it("el HTML con `lugar` undefined es idéntico al de antes de existir el parámetro", async () => {
      const { enviarConfirmacionCliente } = await import("./email")

      await enviarConfirmacionCliente(confirmacion)
      await enviarConfirmacionCliente({ ...confirmacion, lugar: undefined })

      expect(enviarMock.mock.calls[1][0].html).toBe(enviarMock.mock.calls[0][0].html)
    })
  })

  describe("con `lugar` suma una línea en el bloque de la hora", () => {
    it("la confirmación al cliente, entre la duración y el precio", async () => {
      const { enviarConfirmacionCliente } = await import("./email")

      await enviarConfirmacionCliente({ ...confirmacion, precio: 8000, lugar: LUGAR })

      const html = htmlEnviado()
      expect(html).toContain(LINEA)
      expect(html.indexOf("Duración")).toBeLessThan(html.indexOf("Dónde"))
      expect(html.indexOf("Dónde")).toBeLessThan(html.indexOf("Precio"))
    })

    it("el aviso a quien atiende", async () => {
      const { enviarAvisoProfesional } = await import("./email")

      await enviarAvisoProfesional({ ...avisoProfesional, comentarios: "Primera vez", lugar: LUGAR })

      const html = htmlEnviado()
      expect(html).toContain(LINEA)
      expect(html.indexOf("Hora:")).toBeLessThan(html.indexOf("Dónde"))
      expect(html.indexOf("Dónde")).toBeLessThan(html.indexOf("Comentarios"))
    })

    it("la reserva confirmada por el local", async () => {
      const { enviarReservaConfirmadaPorElLocal } = await import("./email")

      await enviarReservaConfirmadaPorElLocal({ ...reservaConfirmada, lugar: LUGAR })

      expect(htmlEnviado()).toContain(LINEA)
    })

    it("el aviso de cambio del cliente, cuando reagenda y cuando cancela", async () => {
      const { enviarAvisoDeCambioDelCliente } = await import("./email")

      await enviarAvisoDeCambioDelCliente({ ...avisoDeCambio, lugar: LUGAR })
      await enviarAvisoDeCambioDelCliente({ ...avisoDeCambio, tipo: "cancelo", lugar: LUGAR })

      for (const llamada of enviarMock.mock.calls) expect(llamada[0].html as string).toContain(LINEA)
    })

    it("el recordatorio", async () => {
      const { enviarRecordatorio } = await import("./email")

      await enviarRecordatorio({ ...recordatorio, lugar: LUGAR })

      const html = htmlEnviado()
      expect(html).toContain(LINEA)
      expect(html.indexOf("Hora:")).toBeLessThan(html.indexOf("Dónde"))
    })
  })

  describe("la línea con lo que haya", () => {
    it("sin nombre de sede, sólo la dirección y la comuna", async () => {
      const { enviarRecordatorio } = await import("./email")

      await enviarRecordatorio({ ...recordatorio, lugar: { direccion: "Calle 1", comuna: "Ñuñoa" } })

      expect(htmlEnviado()).toContain("<strong>Dónde:</strong> Calle 1, Ñuñoa<")
    })

    it("sin comuna, la dirección sola, sin coma colgando", async () => {
      const { enviarRecordatorio } = await import("./email")

      await enviarRecordatorio({ ...recordatorio, lugar: { nombre: "Centro", direccion: "Calle 1", comuna: null } })

      expect(htmlEnviado()).toContain("<strong>Dónde:</strong> Centro · Calle 1<")
    })
  })

  describe("un dato con HTML se escapa", () => {
    const sucio = {
      nombre: '<img src=x onerror="robar()">',
      direccion: "<script>alert(1)</script> & Cía",
      comuna: `Ñuñoa" onmouseover="x`,
    }

    it.each([
      ["la confirmación al cliente", "enviarConfirmacionCliente", confirmacion],
      ["el aviso a quien atiende", "enviarAvisoProfesional", avisoProfesional],
      ["la reserva confirmada por el local", "enviarReservaConfirmadaPorElLocal", reservaConfirmada],
      ["el aviso de cambio del cliente", "enviarAvisoDeCambioDelCliente", avisoDeCambio],
      ["el recordatorio", "enviarRecordatorio", recordatorio],
    ] as const)("%s", async (_nombre, funcion, datos) => {
      const correo = await import("./email")
      await (correo[funcion] as (datos: unknown) => Promise<unknown>)({ ...datos, lugar: sucio })

      const html = htmlEnviado()
      expect(html).not.toContain("<img src=x")
      expect(html).not.toContain("<script>alert(1)")
      expect(html).not.toContain(`onmouseover="x`)
      expect(html).toContain("&lt;img src=x onerror=&quot;robar()&quot;&gt;")
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cía")
    })
  })
})

describe("lib/email: el aviso de cambio cuando cambió el profesional", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "clave-de-prueba")
    vi.resetModules()
    enviarMock.mockClear()
  })

  const textoDe = () => (enviarMock.mock.calls[0][0].html as string).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

  it("dice quién la tenía antes y con quién queda, en 'Antes' y en 'Ahora'", async () => {
    const { enviarAvisoDeCambioDelCliente } = await import("./email")

    await enviarAvisoDeCambioDelCliente({ ...avisoDeCambio, profesional: "Bea", profesionalAnterior: "Ana" })

    const texto = textoDe()
    expect(texto).toMatch(/Antes: jueves, 10 de septiembre de 2026, 10:00 · con Ana/i)
    expect(texto).toMatch(/Ahora: viernes, 11 de septiembre de 2026, 11:00 · con Bea/i)
  })

  it("si sólo cambió la persona (misma fecha y hora), las dos filas ya no son iguales", async () => {
    const { enviarAvisoDeCambioDelCliente } = await import("./email")

    await enviarAvisoDeCambioDelCliente({
      ...avisoDeCambio,
      fecha: avisoDeCambio.fechaAnterior,
      hora: avisoDeCambio.horaAnterior,
      profesional: "Bea",
      profesionalAnterior: "Ana",
    })

    const texto = textoDe()
    expect(texto).toContain("10:00 · con Ana")
    expect(texto).toContain("10:00 · con Bea")
  })

  it("sin profesional anterior, o con el mismo, el correo es el de siempre", async () => {
    const { enviarAvisoDeCambioDelCliente } = await import("./email")

    await enviarAvisoDeCambioDelCliente({ ...avisoDeCambio, profesional: "Ana" })
    await enviarAvisoDeCambioDelCliente({ ...avisoDeCambio, profesional: "Ana", profesionalAnterior: "Ana" })

    for (const llamada of enviarMock.mock.calls) expect(llamada[0].html as string).not.toContain(" · con ")
  })

  it("un nombre con HTML se escapa", async () => {
    const { enviarAvisoDeCambioDelCliente } = await import("./email")

    await enviarAvisoDeCambioDelCliente({ ...avisoDeCambio, profesional: "Bea", profesionalAnterior: "<img src=x onerror=robar()>" })

    expect(enviarMock.mock.calls[0][0].html as string).not.toContain("<img src=x")
  })
})
