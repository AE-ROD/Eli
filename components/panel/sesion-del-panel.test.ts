import { describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { sesionDelPanel, type ValorDeSesion } from "./sesion-del-panel"

const DEL_SERVIDOR: Session = {
  expires: "",
  user: {
    id: "u1",
    name: "Ana",
    email: "ana@example.com",
    role: "owner",
    businessId: "n1",
    businessName: "Salón Ana",
    businessSlug: "salon-ana",
    rubro: null,
    memberId: null,
    contexto: "c1",
    contextos: 1,
  },
}

const DE_OTRO_MOMENTO: Session = { ...DEL_SERVIDOR, user: { ...DEL_SERVIDOR.user, businessName: "Salón nuevo" } }

const update = vi.fn()

/** Lo que dice el proveedor de la raíz hasta que termina su primera lectura (sin sesión todavía: `undefined`). */
const LEYENDO_POR_PRIMERA_VEZ = { data: undefined, status: "loading", update } as unknown as ValorDeSesion

describe("sesionDelPanel", () => {
  it("durante la primera lectura muestra la sesión del servidor como autenticada", () => {
    const valor = sesionDelPanel(LEYENDO_POR_PRIMERA_VEZ, DEL_SERVIDOR)

    expect(valor?.status).toBe("authenticated")
    expect(valor?.data).toBe(DEL_SERVIDOR)
  })

  it("también si el proveedor dice null en vez de undefined", () => {
    const valor = sesionDelPanel({ data: null, status: "loading", update }, DEL_SERVIDOR)

    expect(valor?.status).toBe("authenticated")
    expect(valor?.data).toBe(DEL_SERVIDOR)
  })

  it("conserva el update() del proveedor de la raíz", () => {
    expect(sesionDelPanel(LEYENDO_POR_PRIMERA_VEZ, DEL_SERVIDOR)?.update).toBe(update)
  })

  it("cuando el proveedor ya leyó, manda él: no se pisa con la del servidor", () => {
    const leida: ValorDeSesion = { data: DE_OTRO_MOMENTO, status: "authenticated", update }

    expect(sesionDelPanel(leida, DEL_SERVIDOR)).toBe(leida)
  })

  it("si la lectura dijo que no hay sesión, no se inventa una", () => {
    const sinSesion: ValorDeSesion = { data: null, status: "unauthenticated", update }

    expect(sesionDelPanel(sinSesion, DEL_SERVIDOR)).toBe(sinSesion)
  })

  it("durante un update() (cargando, pero con la sesión anterior) manda el proveedor, no la sembrada", () => {
    const actualizando = { data: DE_OTRO_MOMENTO, status: "loading", update } as unknown as ValorDeSesion

    expect(sesionDelPanel(actualizando, DEL_SERVIDOR)).toBe(actualizando)
  })

  it("sin sesión del servidor no hay nada que sembrar", () => {
    expect(sesionDelPanel(LEYENDO_POR_PRIMERA_VEZ, null)).toBe(LEYENDO_POR_PRIMERA_VEZ)
    expect(sesionDelPanel(LEYENDO_POR_PRIMERA_VEZ, undefined)).toBe(LEYENDO_POR_PRIMERA_VEZ)
  })

  it("sin proveedor en la raíz devuelve undefined", () => {
    expect(sesionDelPanel(undefined, DEL_SERVIDOR)).toBeUndefined()
  })
})
