import { describe, expect, it } from "vitest"
import { MODULOS } from "@/lib/modulos"
import {
  actorDeSesion,
  puedeEditarComisiones,
  puedeVerCierresDeCaja,
  puedeVerLiquidacionesDelEquipo,
  veMiPlata,
  type Actor,
} from "@/lib/permisos"
import {
  SECCIONES_DE_LA_PLATA,
  SECCIONES_DEL_PANEL,
  SIN_ACCESO_A_LA_PLATA,
  seccionDeLaRuta,
  seccionesDeLaPlata,
  type AccesoALaPlata,
} from "./secciones-del-panel"

describe("seccionDeLaRuta", () => {
  it("el inicio es sólo /dashboard, con o sin barra final", () => {
    expect(seccionDeLaRuta("/dashboard")?.id).toBe("inicio")
    expect(seccionDeLaRuta("/dashboard/")?.id).toBe("inicio")
  })

  it("cada módulo se reconoce por su ruta y lleva su módulo", () => {
    for (const modulo of MODULOS) {
      const seccion = seccionDeLaRuta(modulo.ruta)
      expect(seccion?.id).toBe(modulo.id)
      expect(seccion?.modulo).toBe(modulo.id)
    }
  })

  it("una página que cuelga de un módulo es de ese módulo", () => {
    expect(seccionDeLaRuta("/dashboard/clientes/123")?.id).toBe("clientes")
    expect(seccionDeLaRuta("/dashboard/reportes/")?.id).toBe("reportes")
  })

  it("configuración y ayuda son secciones neutras", () => {
    for (const ruta of ["/dashboard/configuracion", "/dashboard/ayuda"]) {
      const seccion = seccionDeLaRuta(ruta)
      expect(seccion).not.toBeNull()
      expect(seccion?.modulo).toBeUndefined()
    }
  })

  it("una ruta que sólo empieza igual no es de la sección", () => {
    expect(seccionDeLaRuta("/dashboard/agendas")).toBeNull()
    expect(seccionDeLaRuta("/dashboard/configuracionx")).toBeNull()
  })

  it("chats no es una sección mientras está escondido", () => {
    expect(seccionDeLaRuta("/dashboard/chats")).toBeNull()
    expect(seccionDeLaRuta("/dashboard/chats/123")).toBeNull()
  })

  it("fuera del panel no hay sección", () => {
    expect(seccionDeLaRuta("/")).toBeNull()
    expect(seccionDeLaRuta("/reservar/salon")).toBeNull()
    expect(seccionDeLaRuta("/dashboardx")).toBeNull()
  })
})

describe("SECCIONES_DEL_PANEL", () => {
  it("van el inicio, los módulos en su orden y después las neutras", () => {
    expect(SECCIONES_DEL_PANEL.map((seccion) => seccion.id)).toEqual([
      "inicio",
      ...MODULOS.map((modulo) => modulo.id),
      "mi-plata",
      "caja",
      "liquidaciones",
      "comisiones",
      "configuracion",
      "ayuda",
    ])
  })

  it("no llevan a chats: está escondido hasta que exista WhatsApp", () => {
    for (const seccion of SECCIONES_DEL_PANEL) {
      expect(seccion.ruta.startsWith("/dashboard/chats")).toBe(false)
      expect(seccion.nombre).not.toMatch(/chat/i)
    }
  })

  it("no repiten ruta", () => {
    const rutas = SECCIONES_DEL_PANEL.map((seccion) => seccion.ruta)
    expect(new Set(rutas).size).toBe(rutas.length)
  })
})

describe("las secciones de la plata del equipo", () => {
  /** Lo mismo que calcula el layout del panel en el servidor. */
  const accesoDe = (actor: Actor | null): AccesoALaPlata => ({
    miPlata: veMiPlata(actor),
    caja: puedeVerCierresDeCaja(actor),
    liquidaciones: puedeVerLiquidacionesDelEquipo(actor),
    comisiones: puedeEditarComisiones(actor),
  })
  const sesion = (user: Record<string, unknown>) => actorDeSesion({ user } as never)
  const idsPara = (actor: Actor | null) => seccionesDeLaPlata(accesoDe(actor)).map((seccion) => seccion.id)

  it("cada una se reconoce por su ruta, en neutro (no son módulos de la landing)", () => {
    for (const [ruta, id] of [
      ["/dashboard/comisiones", "comisiones"],
      ["/dashboard/liquidaciones/abc", "liquidaciones"],
      ["/dashboard/mi-plata", "mi-plata"],
      ["/dashboard/caja", "caja"],
    ]) {
      expect(seccionDeLaRuta(ruta)?.id).toBe(id)
      expect(seccionDeLaRuta(ruta)?.modulo).toBeUndefined()
    }
    expect(MODULOS.map((modulo) => modulo.ruta)).not.toContain("/dashboard/caja")
  })

  it("la dueña ve caja, liquidaciones y comisiones; Mi plata no, porque no es miembro", () => {
    expect(idsPara(sesion({ role: "owner", businessId: "n1" }))).toEqual(["caja", "liquidaciones", "comisiones"])
  })

  it("el encargado ve Mi plata, caja y liquidaciones, no comisiones", () => {
    expect(idsPara(sesion({ role: "admin", businessId: "n1", memberId: "m1" }))).toEqual(["mi-plata", "caja", "liquidaciones"])
  })

  it("el profesional sólo ve Mi plata", () => {
    expect(idsPara(sesion({ role: "worker", businessId: "n1", memberId: "m2" }))).toEqual(["mi-plata"])
  })

  it("falla cerrado: sin sesión, sin acceso o profesional sin memberId, ninguna", () => {
    expect(idsPara(null)).toEqual([])
    expect(idsPara(sesion({ role: "worker", businessId: "n1" }))).toEqual([])
    expect(seccionesDeLaPlata(undefined)).toEqual([])
    expect(seccionesDeLaPlata(null)).toEqual([])
    expect(seccionesDeLaPlata(SIN_ACCESO_A_LA_PLATA)).toEqual([])
  })

  it("con todo el acceso, las cuatro en su orden", () => {
    const todas = { miPlata: true, caja: true, liquidaciones: true, comisiones: true }
    expect(seccionesDeLaPlata(todas)).toEqual([...SECCIONES_DE_LA_PLATA])
  })
})
