import { describe, it, expect } from "vitest"
import { buscarContexto, cambioElContextoDelPanel, contextoDeLaSesion, contextoSinElegir, contextosDe, opcionDeContexto } from "./contextos"

const salon = { id: "negocio-1", name: "Salón Uno", slug: "salon-uno", type: "salon" }
const clinica = { id: "negocio-2", name: "Clínica Dos", slug: "clinica-dos", type: "odontologia" }

describe("contextosDe", () => {
  it("dueña de un negocio, encargada en otro y profesional en el suyo: tres contextos, el de dueña primero", () => {
    const contextos = contextosDe({
      business: salon,
      memberships: [
        { id: "m-clinica", role: "admin", business: clinica },
        { id: "m-salon", role: "worker", business: salon },
      ],
    })

    expect(contextos).toEqual([
      { id: "dueño:negocio-1", rol: "owner", businessId: "negocio-1", businessName: "Salón Uno", businessSlug: "salon-uno", rubro: "salon", memberId: null },
      { id: "miembro:m-clinica", rol: "admin", businessId: "negocio-2", businessName: "Clínica Dos", businessSlug: "clinica-dos", rubro: "odontologia", memberId: "m-clinica" },
      { id: "miembro:m-salon", rol: "worker", businessId: "negocio-1", businessName: "Salón Uno", businessSlug: "salon-uno", rubro: "salon", memberId: "m-salon" },
    ])
  })

  it("un rol de membresía desconocido cuenta como profesional, el de menos permisos", () => {
    const [contexto] = contextosDe({ business: null, memberships: [{ id: "m", role: "superadmin", business: salon }] })
    expect(contexto.rol).toBe("worker")
  })

  it("sin negocio ni membresías, ninguno", () => {
    expect(contextosDe({ business: null, memberships: [] })).toEqual([])
  })
})

describe("buscarContexto y contextoSinElegir", () => {
  const contextos = contextosDe({ business: salon, memberships: [{ id: "m-clinica", role: "worker", business: clinica }] })

  it("encuentra sólo un id de la lista", () => {
    expect(buscarContexto(contextos, "miembro:m-clinica")?.businessId).toBe("negocio-2")
    expect(buscarContexto(contextos, "miembro:m-ajeno")).toBeNull()
    expect(buscarContexto(contextos, "dueño:negocio-2")).toBeNull()
    expect(buscarContexto(contextos, undefined)).toBeNull()
    expect(buscarContexto(contextos, { id: "dueño:negocio-1" })).toBeNull()
  })

  it("se entra sin elegir sólo con un contexto", () => {
    expect(contextoSinElegir(contextos)).toBeNull()
    expect(contextoSinElegir(contextos.slice(0, 1))?.id).toBe("dueño:negocio-1")
    expect(contextoSinElegir([])).toBeNull()
  })
})

describe("contextoDeLaSesion", () => {
  const ambos = contextosDe({ business: salon, memberships: [{ id: "m-clinica", role: "worker", business: clinica }] })
  const soloClinica = ambos.slice(1)

  it("sin contexto previo (login, token que nunca eligió) entra directo sólo si hay uno", () => {
    expect(contextoDeLaSesion(soloClinica, undefined)?.id).toBe("miembro:m-clinica")
    expect(contextoDeLaSesion(soloClinica, null)?.id).toBe("miembro:m-clinica")
    expect(contextoDeLaSesion(soloClinica, "")?.id).toBe("miembro:m-clinica")
    expect(contextoDeLaSesion(ambos, null)).toBeNull()
  })

  it("con un contexto que sigue siendo de la cuenta, sigue en ése", () => {
    expect(contextoDeLaSesion(ambos, "miembro:m-clinica")?.businessId).toBe("negocio-2")
  })

  it("si el contexto que tenía ya no está, queda sin contexto aunque quede uno solo: nunca se cambia sola a otro", () => {
    expect(contextoDeLaSesion(soloClinica, "dueño:negocio-1")).toBeNull()
    expect(contextoDeLaSesion(soloClinica, { id: "miembro:m-clinica" })).toBeNull()
  })
})

describe("opcionDeContexto", () => {
  it("dice el negocio, el rubro y el rol en palabras, con el vocabulario del rubro", () => {
    const [dueña, odontologa] = contextosDe({ business: salon, memberships: [{ id: "m", role: "worker", business: clinica }] })

    expect(opcionDeContexto(dueña)).toEqual({ id: "dueño:negocio-1", negocio: "Salón Uno", rubro: "Salón de belleza", rol: "Dueño" })
    expect(opcionDeContexto(odontologa)).toEqual({ id: "miembro:m", negocio: "Clínica Dos", rubro: "Clínica dental", rol: "Odontólogo" })
  })
})

describe("cambioElContextoDelPanel (una pestaña abierta con otro contexto)", () => {
  it("con el mismo contexto no recarga; con otro, sí", () => {
    expect(cambioElContextoDelPanel("miembro:m-a", "miembro:m-a")).toBe(false)
    expect(cambioElContextoDelPanel("miembro:m-a", "miembro:m-b")).toBe(true)
    expect(cambioElContextoDelPanel("dueño:negocio-1", "miembro:m-propio")).toBe(true)
  })

  it("si la sesión quedó sin contexto, recarga (y el proxy manda a elegir)", () => {
    expect(cambioElContextoDelPanel("miembro:m-a", null)).toBe(true)
    expect(cambioElContextoDelPanel("miembro:m-a", "")).toBe(true)
  })

  it("lo que todavía no se sabe no recarga, y sin contexto en los dos lados tampoco", () => {
    expect(cambioElContextoDelPanel("miembro:m-a", undefined)).toBe(false)
    expect(cambioElContextoDelPanel(null, "")).toBe(false)
    expect(cambioElContextoDelPanel("", null)).toBe(false)
  })
})
