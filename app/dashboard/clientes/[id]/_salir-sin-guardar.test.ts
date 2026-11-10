import { describe, expect, it } from "vitest"
import { destinoInterno, listaDePendientes, type ClicEnLaPagina } from "./_salir-sin-guardar"

const AQUI = {
  href: "https://eli.test/dashboard/clientes/p1",
  origin: "https://eli.test",
  pathname: "/dashboard/clientes/p1",
  search: "",
}

/** Un clic izquierdo, sin teclas, sobre algo dentro de un enlace con `href` (o sobre nada). */
function clic(href: string | null, cambios: Partial<ClicEnLaPagina> = {}, atributos: { target?: string; download?: boolean } = {}): ClicEnLaPagina {
  const enlace = href === null ? null : { href, target: atributos.target ?? "", hasAttribute: (n: string) => n === "download" && !!atributos.download }
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: () => enlace } as unknown as EventTarget,
    ...cambios,
  }
}

describe("destinoInterno", () => {
  it("un enlace a otra página del panel se frena: devuelve adónde iba", () => {
    expect(destinoInterno(clic("/dashboard/agenda"), AQUI)).toBe("/dashboard/agenda")
    expect(destinoInterno(clic("https://eli.test/dashboard/clientes?q=ana#x"), AQUI)).toBe("/dashboard/clientes?q=ana#x")
  })

  it("abrir en otra pestaña, con otro botón o con una tecla, no se frena", () => {
    expect(destinoInterno(clic("/dashboard/agenda", { ctrlKey: true }), AQUI)).toBeNull()
    expect(destinoInterno(clic("/dashboard/agenda", { metaKey: true }), AQUI)).toBeNull()
    expect(destinoInterno(clic("/dashboard/agenda", { button: 1 }), AQUI)).toBeNull()
    expect(destinoInterno(clic("/dashboard/agenda", {}, { target: "_blank" }), AQUI)).toBeNull()
  })

  it("otro sitio, una descarga, la misma página o algo que no es un enlace, no se frenan", () => {
    expect(destinoInterno(clic("https://wa.me/56911111111"), AQUI)).toBeNull()
    expect(destinoInterno(clic("mailto:ana@demo.eli"), AQUI)).toBeNull()
    expect(destinoInterno(clic("/archivo.csv", {}, { download: true }), AQUI)).toBeNull()
    expect(destinoInterno(clic("#plan"), AQUI)).toBeNull()
    expect(destinoInterno(clic(null), AQUI)).toBeNull()
  })

  it("un clic que otro ya frenó no se vuelve a atender", () => {
    expect(destinoInterno(clic("/dashboard/agenda", { defaultPrevented: true }), AQUI)).toBeNull()
  })
})

describe("listaDePendientes", () => {
  it("nombra lo que se perdería, en castellano", () => {
    expect(listaDePendientes(["el odontograma"])).toBe("el odontograma")
    expect(listaDePendientes(["el odontograma", "los antecedentes"])).toBe("el odontograma y los antecedentes")
    expect(listaDePendientes(["a", "b", "c"])).toBe("a, b y c")
    expect(listaDePendientes([])).toBe("la ficha")
  })
})
