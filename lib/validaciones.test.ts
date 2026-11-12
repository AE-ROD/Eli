import { describe, it, expect } from "vitest"
import {
  completarPerfilSchema,
  nombreDelNegocioSchema,
  planSchema,
  registroSchema,
  reservaSchema,
  listaDeEsperaSchema,
  filaVirtualSchema,
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
    plan: "equipo",
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

  it.each(["independiente", "equipo"])("acepta el plan %s", (plan) => {
    const resultado = registroSchema.safeParse({ ...datosValidos, plan })
    expect(resultado.success).toBe(true)
    if (resultado.success) expect(resultado.data.plan).toBe(plan)
  })

  it("rechaza un registro sin plan, con el mensaje en español", () => {
    const { plan: _sinPlan, ...sinPlan } = datosValidos
    const resultado = registroSchema.safeParse(sinPlan)
    expect(resultado.success).toBe(false)
    if (!resultado.success) {
      expect(resultado.error.issues).toHaveLength(1)
      expect(resultado.error.issues[0].path).toEqual(["plan"])
      expect(resultado.error.issues[0].message).toBe("Elige un plan")
    }
  })

  it.each(["", "Equipo", "EQUIPO", " equipo", "pro", "clinica", null, 1, ["equipo"], { id: "equipo" }])(
    "rechaza el plan %j: no es uno de la lista",
    (plan) => {
      const resultado = registroSchema.safeParse({ ...datosValidos, plan })
      expect(resultado.success).toBe(false)
      if (!resultado.success) expect(resultado.error.issues[0].message).toBe("Elige un plan")
    }
  )

  describe("cuántas personas trabajan en el negocio (teamSize)", () => {
    it("con el plan Independiente es siempre 1: no se pregunta, y lo que llegue se descarta", () => {
      expect(registroSchema.parse({ ...datosValidos, plan: "independiente" }).teamSize).toBe(1)
      expect(registroSchema.parse({ ...datosValidos, plan: "independiente", teamSize: 1 }).teamSize).toBe(1)
      expect(registroSchema.parse({ ...datosValidos, plan: "independiente", teamSize: 8 }).teamSize).toBe(1)
    })

    it("con el plan Equipo se mantiene lo que se pidió, y 1 si no se pidió nada", () => {
      expect(registroSchema.parse({ ...datosValidos, plan: "equipo", teamSize: 4 }).teamSize).toBe(4)
      expect(registroSchema.parse({ ...datosValidos, plan: "equipo", teamSize: 500 }).teamSize).toBe(500)
      expect(registroSchema.parse({ ...datosValidos, plan: "equipo" }).teamSize).toBe(1)
    })

    it.each([0, -1, 1.5, 501, "3", null, Number.NaN])("con el plan Equipo rechaza %j", (teamSize) => {
      expect(registroSchema.safeParse({ ...datosValidos, plan: "equipo", teamSize }).success).toBe(false)
    })
  })
})

describe("planSchema", () => {
  it("acepta los planes de la lista y nada más", () => {
    expect(planSchema.safeParse("independiente").success).toBe(true)
    expect(planSchema.safeParse("equipo").success).toBe(true)
    expect(planSchema.safeParse("Independiente").success).toBe(false)
    expect(planSchema.safeParse(undefined).success).toBe(false)
  })

  it.each([undefined, null, "", "pro", 0, {}])("dice «Elige un plan» con %j", (valor) => {
    const resultado = planSchema.safeParse(valor)
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error.issues[0].message).toBe("Elige un plan")
  })
})

describe("completarPerfilSchema", () => {
  const datosValidos = { nombreNegocio: "Spa Ana", tipoNegocio: "salon", plan: "equipo" }

  it("acepta datos válidos y recorta el nombre", () => {
    const resultado = completarPerfilSchema.safeParse({ ...datosValidos, nombreNegocio: "  Spa Ana  ", teamSize: 3 })
    expect(resultado.success).toBe(true)
    if (resultado.success) expect(resultado.data).toEqual({ ...datosValidos, teamSize: 3 })
  })

  it("el plan es obligatorio y dice «Elige un plan»", () => {
    const { plan: _sinPlan, ...sinPlan } = datosValidos
    const resultado = completarPerfilSchema.safeParse(sinPlan)
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error.issues[0].message).toBe("Elige un plan")
    expect(completarPerfilSchema.safeParse({ ...datosValidos, plan: "pro" }).success).toBe(false)
  })

  it("con el plan Independiente la cantidad de personas es 1, mande lo que mande el navegador", () => {
    expect(completarPerfilSchema.parse({ ...datosValidos, plan: "independiente" }).teamSize).toBe(1)
    expect(completarPerfilSchema.parse({ ...datosValidos, plan: "independiente", teamSize: 12 }).teamSize).toBe(1)
  })

  it("con el plan Equipo se mantiene como hoy: lo pedido, 1 sin pedir, de 1 a 500 enteros", () => {
    expect(completarPerfilSchema.parse({ ...datosValidos, teamSize: 6 }).teamSize).toBe(6)
    expect(completarPerfilSchema.parse(datosValidos).teamSize).toBe(1)
    for (const teamSize of [0, -2, 2.5, 501, "4"]) {
      expect(completarPerfilSchema.safeParse({ ...datosValidos, teamSize }).success).toBe(false)
    }
  })

  it.each([
    ["sin nombre de negocio", { nombreNegocio: undefined }],
    ["con el nombre de un solo carácter", { nombreNegocio: "A" }],
    ["con el nombre de 81 caracteres", { nombreNegocio: "a".repeat(81) }],
    ["sin rubro", { tipoNegocio: undefined }],
    ["con un rubro que no está en el catálogo", { tipoNegocio: "peluqueria-canina" }],
  ])("rechaza %s", (_caso, cambio) => {
    expect(completarPerfilSchema.safeParse({ ...datosValidos, ...cambio }).success).toBe(false)
  })
})

describe("nombreDelNegocioSchema", () => {
  it("recorta y acepta de 2 a 80 caracteres, el mismo nombre que pide el registro", () => {
    expect(nombreDelNegocioSchema.parse("  Salón Ana  ")).toBe("Salón Ana")
    expect(nombreDelNegocioSchema.safeParse("Ab").success).toBe(true)
    expect(nombreDelNegocioSchema.safeParse("a".repeat(80)).success).toBe(true)
  })

  it.each([
    ["uno de 1 carácter", "A", "al menos 2 caracteres"],
    ["uno de solo espacios", "    ", "al menos 2 caracteres"],
    ["uno de 81 caracteres", "a".repeat(81), "hasta 80 caracteres"],
    ["un número", 7, "no es válido"],
    ["nada", undefined, "Falta el nombre del negocio"],
  ])("rechaza %s con el mensaje en español", (_que, valor, mensaje) => {
    const resultado = nombreDelNegocioSchema.safeParse(valor)
    expect(resultado.success).toBe(false)
    if (!resultado.success) expect(resultado.error.issues[0].message).toContain(mensaje)
  })

  it("el registro usa el mismo: los mensajes de siempre no cambian", () => {
    const datos = { nombre: "Ana", email: "ana@example.com", contrasena: "password123", tipoNegocio: "salon", plan: "equipo" }
    const corto = registroSchema.safeParse({ ...datos, nombreNegocio: "A" })
    expect(corto.success).toBe(false)
    if (!corto.success) expect(corto.error.issues[0].message).toBe("El nombre del negocio tiene que tener al menos 2 caracteres")
    const largo = registroSchema.safeParse({ ...datos, nombreNegocio: "a".repeat(81) })
    expect(largo.success).toBe(false)
    if (!largo.success) expect(largo.error.issues[0].message).toBe("El nombre del negocio puede tener hasta 80 caracteres")
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
    plan: "equipo",
  }
  const texto = (largo: number) => "a".repeat(largo)
  /** Un email válido de `largo` caracteres. */
  const emailDe = (largo: number) => `${texto(largo - "@ejemplo.cl".length)}@ejemplo.cl`

  describe("reservaSchema", () => {
    it.each([
      ["nombre", 100],
      ["apellido", 100],
      ["cedula", 30],
      ["comentarios", 1000],
      ["servicioId", 64],
    ])("%s: acepta %i caracteres y rechaza uno más", (campo, maximo) => {
      expect(reservaSchema.safeParse({ ...reservaValida, [campo]: texto(maximo) }).success).toBe(true)
      expect(reservaSchema.safeParse({ ...reservaValida, [campo]: texto(maximo + 1) }).success).toBe(false)
    })

    it("telefono: se guarda en E.164; lo ilegible o de más de 30 caracteres se rechaza; vacío es null", () => {
      expect(reservaSchema.parse({ ...reservaValida, telefono: "9 1234 5678" }).telefono).toBe("+56912345678")
      expect(reservaSchema.parse({ ...reservaValida, telefono: "" }).telefono).toBeNull()
      expect(reservaSchema.parse({ ...reservaValida }).telefono).toBeNull()
      expect(reservaSchema.safeParse({ ...reservaValida, telefono: "123" }).success).toBe(false)
      expect(reservaSchema.safeParse({ ...reservaValida, telefono: `+56 9 1234 5678${" ".repeat(20)}x` }).success).toBe(false)
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

describe("QA#22: la página pública dice \"correo\", no \"email\"", () => {
  const reserva = { servicioId: "s-corte", fecha: "2030-01-07", hora: "10:00", nombre: "Lucía", apellido: "Pérez" }

  it("reserva, lista de espera y fila virtual", () => {
    const enReserva = reservaSchema.safeParse({ ...reserva, email: "lucia-arroba" })
    expect(enReserva.success).toBe(false)
    expect(enReserva.error?.issues[0].message).toBe("El correo no es válido")

    const enLista = listaDeEsperaSchema.safeParse({ servicioId: "s-corte", fecha: "2030-01-07", nombre: "Lucía", apellido: "Pérez" })
    expect(enLista.error?.issues[0].message).toBe("Falta el correo")
    const invalidaEnLista = listaDeEsperaSchema.safeParse({ servicioId: "s-corte", fecha: "2030-01-07", nombre: "Lucía", apellido: "Pérez", email: "x" })
    expect(invalidaEnLista.error?.issues[0].message).toBe("El correo no es válido")

    // Los servicios como en la reserva (#162): servicioIds, o un servicioId suelto; nunca los dos.
    const contacto = { fecha: "2030-01-07", nombre: "Lucía", apellido: "Pérez", email: "lucia@correo.test" }
    expect(listaDeEsperaSchema.parse({ ...contacto, servicioIds: ["s2", "s1"] }).servicioIds).toEqual(["s2", "s1"])
    expect(listaDeEsperaSchema.parse({ ...contacto, servicioId: "s1" }).servicioIds).toEqual(["s1"])
    expect(listaDeEsperaSchema.safeParse({ ...contacto, servicioId: "s1", servicioIds: ["s1"] }).success).toBe(false)
    expect(listaDeEsperaSchema.safeParse(contacto).success).toBe(false)
    expect(listaDeEsperaSchema.safeParse({ ...contacto, servicioIds: ["s1", "s1"] }).success).toBe(false)

    const enFila = filaVirtualSchema.safeParse({ nombre: "Juan Pérez", email: "juan" })
    expect(enFila.error?.issues[0].message).toBe("El correo no es válido")
  })
})
