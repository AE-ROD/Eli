import { describe, it, expect } from "vitest"
import { z } from "zod"
import { respuestaDeDatosInvalidos } from "./respuesta-de-validacion"

const fallo = (esquema: z.ZodTypeAny, valor: unknown): z.ZodError => {
  const resultado = esquema.safeParse(valor)
  if (resultado.success) throw new Error("el valor tenía que fallar")
  return resultado.error
}

describe("respuestaDeDatosInvalidos", () => {
  it("responde 400 con el primer mensaje escrito para la persona, no con la lista cruda de zod", async () => {
    const esquema = z.object({
      name: z.string().max(3, "El nombre no puede tener más de 3 caracteres"),
      phone: z.string().max(2, "El teléfono no puede tener más de 2 caracteres"),
    })

    const respuesta = respuestaDeDatosInvalidos(fallo(esquema, { name: "Mariana", phone: "12345" }))

    expect(respuesta.status).toBe(400)
    expect(await respuesta.json()).toEqual({ error: "El nombre no puede tener más de 3 caracteres" })
  })

  it("el mensaje de un refine también sirve", async () => {
    const esquema = z.object({ a: z.number(), b: z.number() }).refine((d) => d.b > d.a, "b tiene que ser mayor que a")

    expect(await respuestaDeDatosInvalidos(fallo(esquema, { a: 2, b: 1 })).json()).toEqual({
      error: "b tiene que ser mayor que a",
    })
  })

  it.each([
    ["un campo que falta", z.object({ name: z.string() }), {}],
    ["un tipo equivocado", z.object({ price: z.number() }), { price: "mil" }],
    ["un valor fuera de un enum", z.object({ status: z.enum(["a", "b"]) }), { status: "c" }],
    ["un largo sin mensaje propio", z.object({ name: z.string().max(2) }), { name: "abc" }],
  ])("%s, con el mensaje en inglés que trae zod, cae a \"Datos inválidos\"", async (_caso, esquema, valor) => {
    expect(await respuestaDeDatosInvalidos(fallo(esquema, valor)).json()).toEqual({ error: "Datos inválidos" })
  })
})
