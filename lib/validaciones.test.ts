import { describe, it, expect } from "vitest"
import {
  registroSchema,
  reservaSchema,
  recuperarContrasenaSchema,
  restablecerContrasenaSchema,
  tipoNegocioSchema,
} from "./validaciones"
import { RUBROS } from "./rubros"

describe("registroSchema", () => {
  const datosValidos = {
    nombre: "Ana",
    email: "ana@example.com",
    contrasena: "password123",
    nombreNegocio: "Spa Ana",
    tipoNegocio: "salon",
  }

  it("acepta datos válidos", () => {
    expect(registroSchema.safeParse(datosValidos).success).toBe(true)
  })

  it("rechaza un email inválido", () => {
    const resultado = registroSchema.safeParse({ ...datosValidos, email: "no-es-un-email" })
    expect(resultado.success).toBe(false)
  })

  it("rechaza una contraseña de menos de 8 caracteres", () => {
    const resultado = registroSchema.safeParse({ ...datosValidos, contrasena: "1234567" })
    expect(resultado.success).toBe(false)
  })

  it("rechaza un nombre de negocio vacío", () => {
    const resultado = registroSchema.safeParse({ ...datosValidos, nombreNegocio: "" })
    expect(resultado.success).toBe(false)
  })

  it.each(RUBROS.map((rubro) => rubro.id))("acepta el rubro %s del catálogo", (tipoNegocio) => {
    expect(registroSchema.safeParse({ ...datosValidos, tipoNegocio }).success).toBe(true)
  })

  it.each(["salud", "fitness", "otro", "peluqueria-canina", ""])(
    "rechaza el rubro %j: no está en el catálogo",
    (tipoNegocio) => {
      expect(registroSchema.safeParse({ ...datosValidos, tipoNegocio }).success).toBe(false)
    }
  )

  it("rechaza un registro sin rubro", () => {
    const { tipoNegocio: _sinRubro, ...sinRubro } = datosValidos
    expect(registroSchema.safeParse(sinRubro).success).toBe(false)
  })
})

describe("tipoNegocioSchema", () => {
  it("acepta los ids del catálogo y nada más", () => {
    expect(tipoNegocioSchema.safeParse("barberia").success).toBe(true)
    expect(tipoNegocioSchema.safeParse("Barbería").success).toBe(false)
    expect(tipoNegocioSchema.safeParse(undefined).success).toBe(false)
  })
})

describe("reservaSchema", () => {
  const datosValidos = {
    servicioId: "clx123",
    fecha: "2026-08-15",
    hora: "14:30",
    nombre: "Juan",
    apellido: "Pérez",
  }

  it("acepta datos válidos sin campos opcionales", () => {
    expect(reservaSchema.safeParse(datosValidos).success).toBe(true)
  })

  it("acepta un email vacío (opcional)", () => {
    expect(reservaSchema.safeParse({ ...datosValidos, email: "" }).success).toBe(true)
  })

  it("rechaza una fecha con formato incorrecto", () => {
    const resultado = reservaSchema.safeParse({ ...datosValidos, fecha: "15/08/2026" })
    expect(resultado.success).toBe(false)
  })

  it("rechaza una hora con formato incorrecto", () => {
    const resultado = reservaSchema.safeParse({ ...datosValidos, hora: "2:30 PM" })
    expect(resultado.success).toBe(false)
  })
})

describe("recuperarContrasenaSchema", () => {
  it("acepta un email válido", () => {
    expect(recuperarContrasenaSchema.safeParse({ email: "user@example.com" }).success).toBe(true)
  })

  it("rechaza un email inválido", () => {
    expect(recuperarContrasenaSchema.safeParse({ email: "no-valido" }).success).toBe(false)
  })
})

describe("restablecerContrasenaSchema", () => {
  it("acepta un token y una contraseña válidos", () => {
    expect(
      restablecerContrasenaSchema.safeParse({ token: "abc123", contrasena: "nuevaClave1" }).success
    ).toBe(true)
  })

  it("rechaza una contraseña corta", () => {
    expect(
      restablecerContrasenaSchema.safeParse({ token: "abc123", contrasena: "corta" }).success
    ).toBe(false)
  })

  it("rechaza un token vacío", () => {
    expect(
      restablecerContrasenaSchema.safeParse({ token: "", contrasena: "nuevaClave1" }).success
    ).toBe(false)
  })

  it("rechaza el cuerpo de antes: la contraseña ahora viaja en `contrasena`, no en `password`", () => {
    expect(
      restablecerContrasenaSchema.safeParse({ token: "abc123", password: "nuevaClave1" }).success
    ).toBe(false)
  })
})

/**
 * Largos máximos (M10/F-06). Sin tope, la página pública y el registro
 * guardaban textos de cualquier largo (megas en un nombre o un comentario).
 * La contraseña, hasta 72: bcrypt ignora lo que sigue.
 */
describe("largos máximos", () => {
  const reservaValida = { servicioId: "clx123", fecha: "2026-08-15", hora: "14:30", nombre: "Juan", apellido: "Pérez" }
  const registroValido = {
    nombre: "Ana",
    email: "ana@example.com",
    contrasena: "password123",
    nombreNegocio: "Spa Ana",
    tipoNegocio: "salon",
  }
  const texto = (largo: number) => "a".repeat(largo)
  /** Un email válido de `largo` caracteres. */
  const emailDe = (largo: number) => `${texto(largo - "@ejemplo.cl".length)}@ejemplo.cl`

  describe("reservaSchema", () => {
    it.each([
      ["nombre", 100],
      ["apellido", 100],
      ["cedula", 30],
      ["telefono", 30],
      ["comentarios", 1000],
      ["servicioId", 64],
    ])("%s: acepta %i caracteres y rechaza uno más", (campo, maximo) => {
      expect(reservaSchema.safeParse({ ...reservaValida, [campo]: texto(maximo) }).success).toBe(true)
      expect(reservaSchema.safeParse({ ...reservaValida, [campo]: texto(maximo + 1) }).success).toBe(false)
    })

    it("email: rechaza más de 254 caracteres", () => {
      expect(reservaSchema.safeParse({ ...reservaValida, email: emailDe(60) }).success).toBe(true)
      expect(reservaSchema.safeParse({ ...reservaValida, email: emailDe(255) }).success).toBe(false)
    })

    it("nombre y apellido se guardan sin espacios alrededor, y sólo espacios no cuenta como nombre", () => {
      const resultado = reservaSchema.parse({ ...reservaValida, nombre: "  Juan  ", apellido: " Pérez " })
      expect(resultado).toMatchObject({ nombre: "Juan", apellido: "Pérez" })
      expect(reservaSchema.safeParse({ ...reservaValida, nombre: "     " }).success).toBe(false)
    })
  })

  describe("registroSchema", () => {
    it.each([
      ["nombre", 100],
      ["nombreNegocio", 80],
      ["contrasena", 72],
    ])("%s: acepta %i caracteres y rechaza uno más", (campo, maximo) => {
      expect(registroSchema.safeParse({ ...registroValido, [campo]: texto(maximo) }).success).toBe(true)
      expect(registroSchema.safeParse({ ...registroValido, [campo]: texto(maximo + 1) }).success).toBe(false)
    })

    it("email: rechaza más de 254 caracteres", () => {
      expect(registroSchema.safeParse({ ...registroValido, email: emailDe(60) }).success).toBe(true)
      expect(registroSchema.safeParse({ ...registroValido, email: emailDe(255) }).success).toBe(false)
    })

    it("los mensajes de error están en español", () => {
      const resultado = registroSchema.safeParse({ ...registroValido, nombreNegocio: texto(81) })
      expect(resultado.success).toBe(false)
      expect(resultado.error?.issues[0].message).toMatch(/nombre del negocio/i)
    })
  })
})
