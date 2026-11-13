import { describe, expect, it } from "vitest"
import {
  CuerpoDemasiadoGrande,
  cuerpoConTope,
  leerBytesConTope,
  leerJsonConTope,
  respuestaDeCuerpoDemasiadoGrande,
  TOPE_DE_CUALQUIER_PEDIDO,
  TOPE_DE_UNA_FOTO,
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

/** Un pedido por partes de bytes crudos, sin `Content-Length` (o con uno que miente). */
function pedidoDeBytes(trozos: Uint8Array[], cabeceras?: Record<string, string>): Request {
  let leidos = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controlador) {
      if (leidos < trozos.length) controlador.enqueue(trozos[leidos++])
      else controlador.close()
    },
  })
  return { headers: new Headers(cabeceras), body } as unknown as Request
}

describe("leerBytesConTope", () => {
  const bytes = (largo: number, valor = 7) => new Uint8Array(largo).fill(valor)

  it("devuelve los bytes tal cual, sin tocarlos (no es texto)", async () => {
    const original = Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0x80, 0xfe, 0x01])
    const leido = await leerBytesConTope(new Request("http://localhost/api", { method: "PUT", body: original }), 100)
    expect(leido.excedido).toBe(false)
    if (!leido.excedido) expect(Array.from(leido.bytes)).toEqual(Array.from(original))
  })

  it("justo en el tope pasa; un byte de más no", async () => {
    const justo = await leerBytesConTope(pedidoDeBytes([bytes(60), bytes(40)]), 100)
    expect(justo.excedido).toBe(false)
    if (!justo.excedido) expect(justo.bytes.byteLength).toBe(100)
    expect(await leerBytesConTope(pedidoDeBytes([bytes(60), bytes(41)]), 100)).toEqual({ excedido: true })
  })

  it("un Content-Length declarado de más corta sin leer el flujo", async () => {
    const pedido = pedidoDeBytes([bytes(10)], { "content-length": "5000" })
    expect(await leerBytesConTope(pedido, 100)).toEqual({ excedido: true })
    // No se tocó el flujo: sigue sin bloquear.
    expect((pedido.body as ReadableStream).locked).toBe(false)
  })

  it("si el Content-Length miente (dice poco y manda mucho), corta al pasar el tope real", async () => {
    let enviados = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controlador) {
        enviados += 50
        controlador.enqueue(bytes(50))
      },
    })
    const mentiroso = { headers: new Headers({ "content-length": "10" }), body } as unknown as Request
    expect(await leerBytesConTope(mentiroso, 120)).toEqual({ excedido: true })
    // Cortó apenas pasó el tope: no siguió leyendo un flujo sin fin.
    expect(enviados).toBeLessThanOrEqual(200)
  })

  it("sin Content-Length (cuerpo por partes) también corta", async () => {
    expect(await leerBytesConTope(pedidoDeBytes([bytes(80), bytes(80)]), 100)).toEqual({ excedido: true })
  })

  it("un pedido sin cuerpo son cero bytes", async () => {
    const leido = await leerBytesConTope(new Request("http://localhost/api", { method: "PUT" }), 100)
    expect(leido.excedido).toBe(false)
    if (!leido.excedido) expect(leido.bytes.byteLength).toBe(0)
  })

  it("un error al leer el flujo se propaga", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controlador) {
        controlador.error(new Error("conexión cortada"))
      },
    })
    await expect(leerBytesConTope({ headers: new Headers(), body } as unknown as Request, 100)).rejects.toThrow("conexión cortada")
  })

  it("el tope de una foto es el techo de la API: 5 MB", () => {
    expect(TOPE_DE_UNA_FOTO).toBe(5 * 1024 * 1024)
    expect(TOPE_DE_UNA_FOTO).toBeLessThanOrEqual(TOPE_DE_CUALQUIER_PEDIDO)
  })
})
