import { describe, expect, it } from "vitest"
import {
  CuerpoDemasiadoGrande,
  cuerpoConTope,
  leerJsonConTope,
  respuestaDeCuerpoDemasiadoGrande,
  TOPE_DEL_CUERPO_POR_DEFECTO,
} from "./cuerpo-del-pedido"

function pedido(cuerpo?: string, cabeceras?: Record<string, string>): Request {
  return new Request("http://localhost/api", { method: "POST", body: cuerpo, headers: cabeceras })
}

/** Un pedido por partes, sin `Content-Length`: el cuerpo llega en trozos. */
function pedidoSinLargo(trozos: string[]): Request {
  const codificador = new TextEncoder()
  let leidos = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controlador) {
      if (leidos < trozos.length) controlador.enqueue(codificador.encode(trozos[leidos++]))
      else controlador.close()
    },
  })
  return { headers: new Headers(), body } as unknown as Request
}

describe("cuerpoConTope", () => {
  it("devuelve el JSON si no pasa el tope", async () => {
    expect(await cuerpoConTope(pedido('{"a":1}'), 100)).toEqual({ excedido: false, cuerpo: { a: 1 } })
  })

  it("sin tope explícito usa el de por defecto (100 KB)", async () => {
    const justo = JSON.stringify({ x: "a".repeat(TOPE_DEL_CUERPO_POR_DEFECTO - 10) })
    expect((await cuerpoConTope(pedido(justo))).excedido).toBe(false)
    const deMas = JSON.stringify({ x: "a".repeat(TOPE_DEL_CUERPO_POR_DEFECTO) })
    expect(await cuerpoConTope(pedido(deMas))).toEqual({ excedido: true })
  })

  it("un Content-Length declarado de más corta sin leer", async () => {
    expect(await cuerpoConTope(pedido("{}", { "content-length": "5000" }), 100)).toEqual({ excedido: true })
  })

  it("sin Content-Length, corta al leer más del tope", async () => {
    expect(await cuerpoConTope(pedidoSinLargo(["[", "1,".repeat(40), "1,".repeat(40), "1]"]), 100)).toEqual({
      excedido: true,
    })
  })

  it("sin Content-Length y bajo el tope, junta los trozos", async () => {
    expect(await cuerpoConTope(pedidoSinLargo(['{"a":', "[1,2", "]}"]), 100)).toEqual({
      excedido: false,
      cuerpo: { a: [1, 2] },
    })
  })

  it("un JSON roto o un pedido sin cuerpo dan cuerpo undefined", async () => {
    expect(await cuerpoConTope(pedido("{roto"), 100)).toEqual({ excedido: false, cuerpo: undefined })
    expect(await cuerpoConTope(pedido(), 100)).toEqual({ excedido: false, cuerpo: undefined })
  })
})

describe("leerJsonConTope", () => {
  it("devuelve el JSON si no pasa el tope", async () => {
    expect(await leerJsonConTope(pedido('{"estado":"lista"}'))).toEqual({ estado: "lista" })
  })

  it("lanza CuerpoDemasiadoGrande si el Content-Length pasa el tope", async () => {
    await expect(leerJsonConTope(pedido("{}", { "content-length": "5000" }), 100)).rejects.toBeInstanceOf(
      CuerpoDemasiadoGrande
    )
  })

  it("lanza CuerpoDemasiadoGrande si, sin Content-Length, el cuerpo pasa el tope al leerlo", async () => {
    await expect(leerJsonConTope(pedidoSinLargo(["x".repeat(60), "x".repeat(60)]), 100)).rejects.toBeInstanceOf(
      CuerpoDemasiadoGrande
    )
  })

  it("un JSON roto o vacío lanza SyntaxError, como request.json()", async () => {
    await expect(leerJsonConTope(pedido("{roto"))).rejects.toBeInstanceOf(SyntaxError)
    await expect(leerJsonConTope(pedido())).rejects.toBeInstanceOf(SyntaxError)
  })
})

describe("respuestaDeCuerpoDemasiadoGrande", () => {
  it("es un 413 con un mensaje en español", async () => {
    const respuesta = respuestaDeCuerpoDemasiadoGrande()
    expect(respuesta.status).toBe(413)
    expect(await respuesta.json()).toEqual({ error: "El pedido es demasiado grande." })
  })
})
