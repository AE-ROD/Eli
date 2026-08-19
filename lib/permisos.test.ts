import { describe, it, expect } from "vitest"
import type { Session } from "next-auth"
import {
  actorDeSesion,
  perteneceAlNegocio,
  puedeGestionarEquipo,
  puedeCambiarRolDe,
  puedeEditarComisiones,
  puedeVerIngresosDelNegocio,
  puedeVerLiquidacionDe,
  puedeVerTodaLaAgenda,
  puedeEditarHorarioDe,
  filtroDeAgenda,
  type Actor,
  type Role,
} from "./permisos"

const NEGOCIO_A = "negocio-a"
const NEGOCIO_B = "negocio-b"

function crearActor(role: Role, overrides: Partial<Actor> = {}): Actor {
  return {
    role,
    businessId: NEGOCIO_A,
    memberId: role === "owner" ? null : "member-1",
    ...overrides,
  }
}

function sesionDe(user: Partial<Session["user"]>): Pick<Session, "user"> {
  return {
    user: {
      id: "u1",
      name: "Ana",
      email: "ana@negocio.com",
      role: "owner",
      businessId: NEGOCIO_A,
      businessName: "Negocio A",
      businessSlug: "negocio-a",
      memberId: null,
      ...user,
    } as Session["user"],
  }
}

describe("actorDeSesion", () => {
  it("devuelve el actor cuando la sesión es válida", () => {
    const sesion = sesionDe({ role: "admin", memberId: "member-1" })

    const actor = actorDeSesion(sesion)

    expect(actor).toEqual({ role: "admin", businessId: NEGOCIO_A, memberId: "member-1" })
  })

  it("devuelve memberId null para el dueño, que no es BusinessMember", () => {
    const sesion = sesionDe({ role: "owner", memberId: null })

    const actor = actorDeSesion(sesion)

    expect(actor?.memberId).toBeNull()
  })

  it("rechaza una sesión sin businessId", () => {
    const sesion = { user: { role: "admin", memberId: "member-1" } } as unknown as Pick<Session, "user">

    expect(actorDeSesion(sesion)).toBeNull()
  })

  it("rechaza una sesión con rol desconocido", () => {
    const sesion = sesionDe({ role: "gerente" as unknown as Role })

    expect(actorDeSesion(sesion)).toBeNull()
  })

  it("rechaza una sesión sin usuario", () => {
    expect(actorDeSesion({ user: undefined } as unknown as Pick<Session, "user">)).toBeNull()
  })

  it("rechaza una sesión null o undefined", () => {
    expect(actorDeSesion(null)).toBeNull()
    expect(actorDeSesion(undefined)).toBeNull()
  })
})

describe("perteneceAlNegocio", () => {
  it("es true cuando el businessId coincide con el del actor", () => {
    const actor = crearActor("owner")

    expect(perteneceAlNegocio(actor, NEGOCIO_A)).toBe(true)
  })

  it("es false cuando el businessId es de otro negocio", () => {
    const actor = crearActor("owner")

    expect(perteneceAlNegocio(actor, NEGOCIO_B)).toBe(false)
  })

  it("es false cuando no hay actor", () => {
    expect(perteneceAlNegocio(null, NEGOCIO_A)).toBe(false)
  })
})

describe("tres roles distinguibles: owner > admin > worker", () => {
  it("owner y admin gestionan equipo; worker no", () => {
    expect(puedeGestionarEquipo(crearActor("owner"))).toBe(true)
    expect(puedeGestionarEquipo(crearActor("admin"))).toBe(true)
    expect(puedeGestionarEquipo(crearActor("worker"))).toBe(false)
  })

  it("sólo owner edita comisiones, ni siquiera admin", () => {
    expect(puedeEditarComisiones(crearActor("owner"))).toBe(true)
    expect(puedeEditarComisiones(crearActor("admin"))).toBe(false)
    expect(puedeEditarComisiones(crearActor("worker"))).toBe(false)
  })
})

describe("puedeCambiarRolDe", () => {
  it("el dueño puede cambiar el rol de un miembro del equipo", () => {
    const actor = crearActor("owner")

    expect(puedeCambiarRolDe(actor, "member-2")).toBe(true)
  })

  it("el encargado puede cambiar el rol de un miembro del equipo", () => {
    const actor = crearActor("admin")

    expect(puedeCambiarRolDe(actor, "member-2")).toBe(true)
  })

  it("el profesional no puede cambiar el rol de nadie", () => {
    const actor = crearActor("worker")

    expect(puedeCambiarRolDe(actor, "member-2")).toBe(false)
  })

  it("nadie puede cambiarse el rol a sí mismo", () => {
    const admin = crearActor("admin", { memberId: "member-1" })

    expect(puedeCambiarRolDe(admin, "member-1")).toBe(false)
  })
})

describe("puedeEditarComisiones", () => {
  it("es true sólo para owner", () => {
    expect(puedeEditarComisiones(crearActor("owner"))).toBe(true)
  })

  it("es false para admin: el encargado no toca dinero", () => {
    expect(puedeEditarComisiones(crearActor("admin"))).toBe(false)
  })

  it("es false para worker", () => {
    expect(puedeEditarComisiones(crearActor("worker"))).toBe(false)
  })
})

describe("puedeVerIngresosDelNegocio", () => {
  it("es true para owner", () => {
    expect(puedeVerIngresosDelNegocio(crearActor("owner"))).toBe(true)
  })

  it("es true para admin", () => {
    expect(puedeVerIngresosDelNegocio(crearActor("admin"))).toBe(true)
  })

  it("es false para worker", () => {
    expect(puedeVerIngresosDelNegocio(crearActor("worker"))).toBe(false)
  })
})

describe("puedeVerLiquidacionDe", () => {
  it("owner ve la liquidación de cualquier miembro", () => {
    const actor = crearActor("owner")

    expect(puedeVerLiquidacionDe(actor, "member-2")).toBe(true)
  })

  it("admin ve la liquidación de cualquier miembro", () => {
    const actor = crearActor("admin")

    expect(puedeVerLiquidacionDe(actor, "member-2")).toBe(true)
  })

  it("el profesional ve su propia liquidación", () => {
    const actor = crearActor("worker", { memberId: "member-1" })

    expect(puedeVerLiquidacionDe(actor, "member-1")).toBe(true)
  })

  it("el profesional no ve la liquidación de un compañero", () => {
    const actor = crearActor("worker", { memberId: "member-1" })

    expect(puedeVerLiquidacionDe(actor, "member-2")).toBe(false)
  })

  it("falla cerrado: un worker sin memberId no ve ninguna liquidación", () => {
    const actor = crearActor("worker", { memberId: null })

    expect(puedeVerLiquidacionDe(actor, "member-1")).toBe(false)
  })
})

describe("puedeVerTodaLaAgenda", () => {
  it("es true para owner y admin", () => {
    expect(puedeVerTodaLaAgenda(crearActor("owner"))).toBe(true)
    expect(puedeVerTodaLaAgenda(crearActor("admin"))).toBe(true)
  })

  it("es false para worker: sólo ve la suya", () => {
    expect(puedeVerTodaLaAgenda(crearActor("worker"))).toBe(false)
  })
})

describe("puedeEditarHorarioDe", () => {
  it("el dueño edita el horario de cualquier miembro", () => {
    const actor = crearActor("owner")

    expect(puedeEditarHorarioDe(actor, "member-2")).toBe(true)
  })

  it("el dueño edita el horario general del negocio (memberId null)", () => {
    const actor = crearActor("owner")

    expect(puedeEditarHorarioDe(actor, null)).toBe(true)
  })

  it("el encargado edita el horario de cualquier miembro: horarios son operación, no dinero", () => {
    const actor = crearActor("admin", { memberId: "member-1" })

    expect(puedeEditarHorarioDe(actor, "member-2")).toBe(true)
  })

  it("el encargado edita el horario general del negocio (memberId null)", () => {
    const actor = crearActor("admin", { memberId: "member-1" })

    expect(puedeEditarHorarioDe(actor, null)).toBe(true)
  })

  it("el profesional sólo edita su propio horario", () => {
    const actor = crearActor("worker", { memberId: "member-1" })

    expect(puedeEditarHorarioDe(actor, "member-1")).toBe(true)
    expect(puedeEditarHorarioDe(actor, "member-2")).toBe(false)
  })

  it("falla cerrado: un worker sin memberId no edita ni siquiera el horario general", () => {
    const actor = crearActor("worker", { memberId: null })

    expect(puedeEditarHorarioDe(actor, null)).toBe(false)
  })
})

describe("filtroDeAgenda", () => {
  it("devuelve {} para owner: ve toda la agenda del negocio", () => {
    expect(filtroDeAgenda(crearActor("owner"))).toEqual({})
  })

  it("devuelve {} para admin: ve toda la agenda del negocio", () => {
    expect(filtroDeAgenda(crearActor("admin"))).toEqual({})
  })

  it("acota por memberId para el profesional", () => {
    const actor = crearActor("worker", { memberId: "member-1" })

    expect(filtroDeAgenda(actor)).toEqual({ memberId: "member-1" })
  })

  it("falla cerrado: un worker sin memberId no ve nada, no toda la agenda", () => {
    const actor = crearActor("worker", { memberId: null })

    const filtro = filtroDeAgenda(actor)

    expect(filtro).not.toEqual({})
    expect(filtro).toEqual({ id: { in: [] } })
  })

  it("falla cerrado: sin actor no se ve nada", () => {
    expect(filtroDeAgenda(null)).toEqual({ id: { in: [] } })
  })
})

// `null` no es un caso hipotético: es exactamente lo que devuelve
// actorDeSesion() cuando la sesión es inválida o el token venció. Si alguien
// refactoriza `actor?.role` a `actor!.role` sin darse cuenta, estos tests
// tienen que fallar — es la fuga de permisos que evita el fallo cerrado.
describe("sin actor: toda función niega", () => {
  it("puedeGestionarEquipo(null) es false", () => {
    expect(puedeGestionarEquipo(null)).toBe(false)
  })

  it("puedeCambiarRolDe(null, memberId) es false", () => {
    expect(puedeCambiarRolDe(null, "member-1")).toBe(false)
  })

  it("puedeEditarComisiones(null) es false", () => {
    expect(puedeEditarComisiones(null)).toBe(false)
  })

  it("puedeVerIngresosDelNegocio(null) es false", () => {
    expect(puedeVerIngresosDelNegocio(null)).toBe(false)
  })

  it("puedeVerLiquidacionDe(null, memberId) es false", () => {
    expect(puedeVerLiquidacionDe(null, "member-1")).toBe(false)
  })

  it("puedeVerTodaLaAgenda(null) es false", () => {
    expect(puedeVerTodaLaAgenda(null)).toBe(false)
  })

  it("puedeEditarHorarioDe(null, memberId) es false", () => {
    expect(puedeEditarHorarioDe(null, "member-1")).toBe(false)
  })
})
