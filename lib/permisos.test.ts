import { describe, it, expect } from "vitest"
import {
  actorDeSesion,
  mismoNegocio,
  puedeGestionarEquipo,
  puedeCambiarRolDe,
  puedeEditarComisiones,
  puedeVerIngresosDelNegocio,
  puedeVerLiquidacionDe,
  puedeVerTodaLaAgenda,
  puedeEditarHorarioDe,
  filtroDeAgenda,
  type Actor,
  type Rol,
} from "./permisos"

const NEGOCIO = "negocio-1"
const OTRO_NEGOCIO = "negocio-2"

const actor = (rol: Rol, memberId: string | null = rol === "owner" ? null : "yo"): Actor => ({
  rol,
  businessId: NEGOCIO,
  memberId,
})

const dueño = actor("owner")
const encargado = actor("admin")
const profesional = actor("worker")

const miembro = { id: "colega", businessId: NEGOCIO }
const yoMismo = { id: "yo", businessId: NEGOCIO }
const ajeno = { id: "colega", businessId: OTRO_NEGOCIO }

describe("actorDeSesion", () => {
  const sesion = (user: Record<string, unknown>) => ({ user }) as never

  it("traduce una sesión válida", () => {
    expect(actorDeSesion(sesion({ role: "admin", businessId: NEGOCIO, memberId: "yo" }))).toEqual({
      rol: "admin",
      businessId: NEGOCIO,
      memberId: "yo",
    })
  })

  it("el dueño no tiene memberId", () => {
    expect(actorDeSesion(sesion({ role: "owner", businessId: NEGOCIO }))?.memberId).toBeNull()
  })

  it.each([
    ["sin rol", { businessId: NEGOCIO }],
    ["rol desconocido", { role: "gerente", businessId: NEGOCIO }],
    ["sin negocio", { role: "admin" }],
    ["negocio vacío", { role: "admin", businessId: "" }],
  ])("rechaza una sesión %s", (_caso, user) => {
    expect(actorDeSesion(sesion(user))).toBeNull()
  })

  it("rechaza cuando no hay sesión", () => {
    expect(actorDeSesion(null)).toBeNull()
    expect(actorDeSesion(undefined)).toBeNull()
  })
})

describe("jerarquía de roles", () => {
  it.each([
    ["gestionar equipo", puedeGestionarEquipo, true, true, false],
    ["ver toda la agenda", puedeVerTodaLaAgenda, true, true, false],
    ["ver ingresos del negocio", puedeVerIngresosDelNegocio, true, true, false],
    ["editar comisiones", puedeEditarComisiones, true, false, false],
  ])("%s — dueño/encargado/profesional", (_que, puede, esperaDueño, esperaEncargado, esperaProfesional) => {
    expect(puede(dueño)).toBe(esperaDueño)
    expect(puede(encargado)).toBe(esperaEncargado)
    expect(puede(profesional)).toBe(esperaProfesional)
  })

  it("el dinero es sólo del dueño: el encargado no toca comisiones", () => {
    expect(puedeEditarComisiones(encargado)).toBe(false)
  })
})

describe("aislamiento entre negocios", () => {
  it("mismoNegocio compara el negocio del actor", () => {
    expect(mismoNegocio(dueño, NEGOCIO)).toBe(true)
    expect(mismoNegocio(dueño, OTRO_NEGOCIO)).toBe(false)
    expect(mismoNegocio(dueño, null)).toBe(false)
  })

  it("ni el dueño alcanza a un miembro de otro negocio", () => {
    expect(puedeCambiarRolDe(dueño, ajeno)).toBe(false)
    expect(puedeVerLiquidacionDe(dueño, ajeno)).toBe(false)
    expect(puedeEditarHorarioDe(dueño, ajeno)).toBe(false)
  })

  it("el filtro de agenda siempre acota al negocio, incluso para quien ve todo", () => {
    expect(filtroDeAgenda(dueño)).toEqual({ businessId: NEGOCIO })
    expect(filtroDeAgenda(profesional)).toEqual({ businessId: NEGOCIO, memberId: "yo" })
  })
})

describe("sobre un miembro concreto", () => {
  it("dueño y encargado cambian el rol de otro; el profesional no", () => {
    expect(puedeCambiarRolDe(dueño, miembro)).toBe(true)
    expect(puedeCambiarRolDe(encargado, miembro)).toBe(true)
    expect(puedeCambiarRolDe(profesional, miembro)).toBe(false)
  })

  it("nadie se cambia el rol a sí mismo", () => {
    expect(puedeCambiarRolDe(encargado, yoMismo)).toBe(false)
  })

  it("el profesional ve su liquidación, no la de un colega", () => {
    expect(puedeVerLiquidacionDe(profesional, yoMismo)).toBe(true)
    expect(puedeVerLiquidacionDe(profesional, miembro)).toBe(false)
  })

  it("dueño y encargado ven la liquidación de cualquiera", () => {
    expect(puedeVerLiquidacionDe(dueño, miembro)).toBe(true)
    expect(puedeVerLiquidacionDe(encargado, miembro)).toBe(true)
  })

  it("horarios son operación: el encargado edita el de cualquiera y el general", () => {
    expect(puedeEditarHorarioDe(encargado, miembro)).toBe(true)
    expect(puedeEditarHorarioDe(encargado, null)).toBe(true)
  })

  it("el profesional sólo edita su propio horario", () => {
    expect(puedeEditarHorarioDe(profesional, yoMismo)).toBe(true)
    expect(puedeEditarHorarioDe(profesional, miembro)).toBe(false)
    expect(puedeEditarHorarioDe(profesional, null)).toBe(false)
  })
})

describe("falla cerrado", () => {
  it("sin actor, toda función niega", () => {
    expect(puedeGestionarEquipo(null)).toBe(false)
    expect(puedeVerTodaLaAgenda(null)).toBe(false)
    expect(puedeVerIngresosDelNegocio(null)).toBe(false)
    expect(puedeEditarComisiones(null)).toBe(false)
    expect(puedeCambiarRolDe(null, miembro)).toBe(false)
    expect(puedeVerLiquidacionDe(null, miembro)).toBe(false)
    expect(puedeEditarHorarioDe(null, miembro)).toBe(false)
  })

  it("sin actor, el filtro de agenda no devuelve nada", () => {
    expect(filtroDeAgenda(null)).toEqual({ memberId: { in: [] } })
  })

  it("un profesional sin memberId no ve ninguna cita, en vez de verlas todas", () => {
    const roto = actor("worker", null)

    expect(filtroDeAgenda(roto)).toEqual({ businessId: NEGOCIO, memberId: { in: [] } })
    expect(puedeVerLiquidacionDe(roto, yoMismo)).toBe(false)
    expect(puedeEditarHorarioDe(roto, yoMismo)).toBe(false)
  })
})
