import { describe, expect, it } from "vitest"
import { MODULOS } from "@/lib/modulos"
import { SECCIONES_DEL_PANEL, seccionDeLaRuta } from "./secciones-del-panel"

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

  it("chats, configuración y ayuda son secciones neutras", () => {
    for (const ruta of ["/dashboard/chats", "/dashboard/configuracion", "/dashboard/ayuda"]) {
      const seccion = seccionDeLaRuta(ruta)
      expect(seccion).not.toBeNull()
      expect(seccion?.modulo).toBeUndefined()
    }
  })

  it("una ruta que sólo empieza igual no es de la sección", () => {
    expect(seccionDeLaRuta("/dashboard/agendas")).toBeNull()
    expect(seccionDeLaRuta("/dashboard/chatsx")).toBeNull()
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
      "chats",
      "configuracion",
      "ayuda",
    ])
  })

  it("no repiten ruta", () => {
    const rutas = SECCIONES_DEL_PANEL.map((seccion) => seccion.ruta)
    expect(new Set(rutas).size).toBe(rutas.length)
  })
})
