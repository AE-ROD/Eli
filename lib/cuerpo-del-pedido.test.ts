import { describe, expect, it } from "vitest"
import { cuerpoDelPedido } from "./cuerpo-del-pedido"

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
