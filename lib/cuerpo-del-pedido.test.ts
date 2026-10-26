import { describe, expect, it } from "vitest"
import { cuerpoConTope, cuerpoDelPedido } from "./cuerpo-del-pedido"

function pedido(cuerpo?: string): Request {
  return new Request("http://localhost/api", { method: "POST", body: cuerpo })
}

describe("cuerpoDelPedido", () => {
  it("devuelve el JSON del pedido", async () => {
    expect(await cuerpoDelPedido(pedido('{"estado":"lista"}'))).toEqual({ estado: "lista" })
  })

  it("un JSON roto da undefined, no una excepción", async () => {
    expect(await cuerpoDelPedido(pedido("{no es json"))).toBeUndefined()
  })

  it("un pedido sin cuerpo da undefined", async () => {
    expect(await cuerpoDelPedido(pedido())).toBeUndefined()
  })
})

describe("cuerpoConTope", () => {
  it("devuelve el JSON si no pasa el tope", async () => {
    expect(await cuerpoConTope(pedido('{"a":1}'), 100)).toEqual({ excedido: false, cuerpo: { a: 1 } })
  })

  it("un Content-Length declarado de más corta sin leer", async () => {
    const conCabecera = new Request("http://localhost/api", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "5000" },
    })
    expect(await cuerpoConTope(conCabecera, 100)).toEqual({ excedido: true })
  })

  it("sin Content-Length, corta al leer más del tope", async () => {
    const sinCabecera = { headers: new Headers(), body: new Response("x".repeat(500)).body } as unknown as Request
    expect(await cuerpoConTope(sinCabecera, 100)).toEqual({ excedido: true })
  })

  it("un JSON roto o un pedido sin cuerpo dan cuerpo undefined", async () => {
    expect(await cuerpoConTope(pedido("{roto"), 100)).toEqual({ excedido: false, cuerpo: undefined })
    expect(await cuerpoConTope(pedido(), 100)).toEqual({ excedido: false, cuerpo: undefined })
  })
})
