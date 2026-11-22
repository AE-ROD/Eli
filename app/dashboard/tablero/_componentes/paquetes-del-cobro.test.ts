import { describe, it, expect } from "vitest"
import {
  paqueteLibrePara,
  resolverPaquetes,
  sePuedeCubrir,
  separarLoCubiertoPorPaquete,
  usosPorDefecto,
  type LineaParaPaquetes,
  type PaqueteDeLaClienta,
  type PaqueteOfrecido,
  type PaquetesParaCobrar,
} from "./paquetes-del-cobro"

const centavos = (pesos: number) => pesos * 100

/** Una Depilación a 30.000 de lista, salvo lo que se pise. */
const linea = (id: string, datos: Partial<LineaParaPaquetes> = {}): LineaParaPaquetes => ({
  id,
  tipo: "servicio",
  servicioId: "s-laser",
  precio: 30000,
  ...datos,
})

/** Un paquete de 6 Depilaciones de la clienta, a 25.000 la sesión, salvo lo que se pise. */
const comprado = (id: string, restantes: number, datos: Partial<PaqueteDeLaClienta> = {}): PaqueteDeLaClienta => ({
  id,
  servicioId: "s-laser",
  servicio: "Depilación láser",
  sesiones: 6,
  restantes,
  valorPorSesion: 25000,
  venceEl: null,
  ...datos,
})

const OFRECIDO: PaqueteOfrecido = {
  id: "pq-laser",
  servicioId: "s-laser",
  servicio: "Depilación láser",
  sesiones: 6,
  precio: 150000,
  valorPorSesion: 25000,
  vigenciaMeses: null,
}

const para = (datos: Partial<PaquetesParaCobrar> = {}): PaquetesParaCobrar => ({
  tieneClienta: true,
  ofrecidos: [OFRECIDO],
  deLaClienta: [],
  ...datos,
})

const total = (lineas: LineaParaPaquetes[]) => lineas.reduce((suma, una) => suma + centavos(una.precio), 0)

describe("qué líneas se pueden pagar con una sesión", () => {
  it("un servicio del catálogo sí", () => {
    expect(sePuedeCubrir(linea("l1"))).toBe(true)
    expect(sePuedeCubrir(linea("l1", { tipo: undefined }))).toBe(true)
  })

  it("un producto, un abono, un servicio borrado y lo que ya es de un paquete, no", () => {
    expect(sePuedeCubrir(linea("l1", { tipo: "producto", servicioId: null }))).toBe(false)
    expect(sePuedeCubrir(linea("l1", { abono: { protesisId: "p1" } }))).toBe(false)
    expect(sePuedeCubrir(linea("l1", { servicioId: null }))).toBe(false)
    expect(sePuedeCubrir(linea("l1", { conPaquete: true }))).toBe(false)
    expect(sePuedeCubrir(linea("l1", { ventaDePaquete: true }))).toBe(false)
  })
})

describe("lo que queda marcado al abrir", () => {
  it("el servicio para el que tiene paquete usa una sesión; el resto, no", () => {
    const lineas = [linea("l-laser"), linea("l-corte", { servicioId: "s-corte" }), linea("l-crema", { tipo: "producto", servicioId: null })]
    expect(usosPorDefecto(lineas, [comprado("pc-1", 4)])).toEqual({ "l-laser": "pc-1" })
  })

  it("sin paquetes no se marca nada", () => {
    expect(usosPorDefecto([linea("l1")], [])).toEqual({})
  })

  it("más líneas del mismo servicio que sesiones: se marcan las primeras, hasta donde alcanzan", () => {
    const lineas = [linea("l1"), linea("l2"), linea("l3")]
    expect(usosPorDefecto(lineas, [comprado("pc-1", 2)])).toEqual({ l1: "pc-1", l2: "pc-1" })
  })

  it("con dos paquetes del mismo servicio gasta primero el que vence antes, y sigue con el otro", () => {
    const lineas = [linea("l1"), linea("l2")]
    const paquetes = [comprado("pc-sin-vencimiento", 5), comprado("pc-vence", 1, { venceEl: "2026-12-01T00:00:00.000Z" })]
    expect(usosPorDefecto(lineas, paquetes)).toEqual({ l1: "pc-vence", l2: "pc-sin-vencimiento" })
  })

  it("entre dos que no vencen, primero el más antiguo (llegan del más nuevo al más viejo)", () => {
    expect(usosPorDefecto([linea("l1")], [comprado("pc-nuevo", 6), comprado("pc-viejo", 1)])).toEqual({ l1: "pc-viejo" })
  })
})

describe("si una línea se puede marcar", () => {
  it("sí mientras quede una sesión sin repartir en este cobro", () => {
    const paquetes = [comprado("pc-1", 1)]
    expect(paqueteLibrePara(linea("l2"), {}, paquetes)?.id).toBe("pc-1")
    expect(paqueteLibrePara(linea("l2"), { l1: "pc-1" }, paquetes)).toBeNull()
  })

  it("la sesión que ya tiene puesta la propia línea no le juega en contra", () => {
    expect(paqueteLibrePara(linea("l1"), { l1: "pc-1" }, [comprado("pc-1", 1)])?.id).toBe("pc-1")
  })

  it("no con un paquete de otro servicio", () => {
    expect(paqueteLibrePara(linea("l1", { servicioId: "s-corte" }), {}, [comprado("pc-1", 4)])).toBeNull()
  })
})

describe("el total a pagar y lo que se le manda al servidor", () => {
  it("sin paquetes en el cobro, el total de siempre y nada que mandar", () => {
    const lineas = [linea("l1")]
    const resuelto = resolverPaquetes(lineas, total(lineas), para(), {}, [])
    expect(resuelto.aPagarCentavos).toBe(centavos(30000))
    expect(resuelto.pedido).toEqual({ ventas: [], usos: [] })
    expect(resuelto.cubiertas.size).toBe(0)
  })

  it("una línea cubierta por su paquete deja de sumar: queda sólo lo demás", () => {
    const lineas = [linea("l-laser"), linea("l-corte", { servicioId: "s-corte", precio: 8000 })]
    const paquetes = para({ deLaClienta: [comprado("pc-1", 4)] })
    const resuelto = resolverPaquetes(lineas, total(lineas), paquetes, usosPorDefecto(lineas, paquetes.deLaClienta), [])
    expect(resuelto.aPagarCentavos).toBe(centavos(8000))
    expect(resuelto.pedido).toEqual({ ventas: [], usos: [{ lineaId: "l-laser", paqueteDeClienteId: "pc-1" }] })
    expect(resuelto.cubiertas.get("l-laser")).toMatchObject({ origen: "comprado" })
  })

  it("todo cubierto: no hay nada que pagar", () => {
    const lineas = [linea("l1")]
    const resuelto = resolverPaquetes(lineas, total(lineas), para({ deLaClienta: [comprado("pc-1", 1)] }), { l1: "pc-1" }, [])
    expect(resuelto.aPagarCentavos).toBe(0)
  })

  it("vender un paquete y usar la primera sesión hoy: se paga el paquete y no el servicio", () => {
    const lineas = [linea("l1")]
    const resuelto = resolverPaquetes(lineas, total(lineas), para(), {}, [{ clave: "v1", paqueteId: "pq-laser", usarHoy: true }])
    expect(resuelto.aPagarCentavos).toBe(centavos(150000))
    expect(resuelto.pedido).toEqual({ ventas: [{ paqueteId: "pq-laser" }], usos: [{ lineaId: "l1", venta: 0 }] })
    expect(resuelto.cubiertas.get("l1")).toEqual({ origen: "venta", clave: "v1" })
    expect(resuelto.ventas[0].lineaDeHoy).toBe("l1")
  })

  it("vender sin usar hoy: se paga el paquete y también el servicio, y la sesión de hoy se sigue ofreciendo", () => {
    const lineas = [linea("l1")]
    const resuelto = resolverPaquetes(lineas, total(lineas), para(), {}, [{ clave: "v1", paqueteId: "pq-laser", usarHoy: false }])
    expect(resuelto.aPagarCentavos).toBe(centavos(180000))
    expect(resuelto.pedido).toEqual({ ventas: [{ paqueteId: "pq-laser" }], usos: [] })
    expect(resuelto.ventas[0].lineaDeHoy).toBe("l1")
  })

  it("vender un paquete de un servicio que hoy no se hizo: no hay sesión que usar", () => {
    const lineas = [linea("l-corte", { servicioId: "s-corte", precio: 8000 })]
    const resuelto = resolverPaquetes(lineas, total(lineas), para(), {}, [{ clave: "v1", paqueteId: "pq-laser", usarHoy: true }])
    expect(resuelto.ventas[0].lineaDeHoy).toBeNull()
    expect(resuelto.aPagarCentavos).toBe(centavos(158000))
    expect(resuelto.pedido.usos).toEqual([])
  })

  it("la línea que ya cubre un paquete comprado no se ofrece al que se vende: toma la siguiente", () => {
    const lineas = [linea("l1"), linea("l2")]
    const paquetes = para({ deLaClienta: [comprado("pc-1", 1)] })
    const resuelto = resolverPaquetes(lineas, total(lineas), paquetes, { l1: "pc-1" }, [{ clave: "v1", paqueteId: "pq-laser", usarHoy: true }])
    expect(resuelto.pedido).toEqual({
      ventas: [{ paqueteId: "pq-laser" }],
      usos: [
        { lineaId: "l1", paqueteDeClienteId: "pc-1" },
        { lineaId: "l2", venta: 0 },
      ],
    })
    expect(resuelto.aPagarCentavos).toBe(centavos(150000))
  })

  it("dos paquetes vendidos del mismo servicio no usan la misma línea, y el índice es el de la venta", () => {
    const lineas = [linea("l1"), linea("l2")]
    const ventas = [
      { clave: "v1", paqueteId: "pq-laser", usarHoy: false },
      { clave: "v2", paqueteId: "pq-laser", usarHoy: true },
    ]
    const resuelto = resolverPaquetes(lineas, total(lineas), para(), {}, ventas)
    expect(resuelto.pedido.usos).toEqual([{ lineaId: "l1", venta: 1 }])
    expect(resuelto.aPagarCentavos).toBe(centavos(30000 + 300000))
  })

  it("no manda más usos de un paquete que sesiones le quedan, aunque estén marcados", () => {
    const lineas = [linea("l1"), linea("l2")]
    const resuelto = resolverPaquetes(lineas, total(lineas), para({ deLaClienta: [comprado("pc-1", 1)] }), { l1: "pc-1", l2: "pc-1" }, [])
    expect(resuelto.pedido.usos).toEqual([{ lineaId: "l1", paqueteDeClienteId: "pc-1" }])
    expect(resuelto.aPagarCentavos).toBe(centavos(30000))
  })

  it("descarta lo marcado que ya no corresponde: una línea que se quitó, un paquete que no está, otro servicio", () => {
    const lineas = [linea("l-corte", { servicioId: "s-corte", precio: 8000 })]
    const usos = { "l-quitada": "pc-1", "l-corte": "pc-1" }
    const ventas = [{ clave: "v1", paqueteId: "pq-que-no-esta", usarHoy: true }]
    const resuelto = resolverPaquetes(lineas, total(lineas), para({ deLaClienta: [comprado("pc-1", 3)] }), usos, ventas)
    expect(resuelto.pedido).toEqual({ ventas: [], usos: [] })
    expect(resuelto.ventas).toEqual([])
    expect(resuelto.aPagarCentavos).toBe(centavos(8000))
  })

  it("sin clienta de la lista no hay paquetes en el cobro, se haya marcado lo que se haya marcado", () => {
    const lineas = [linea("l1")]
    const paquetes = para({ tieneClienta: false, deLaClienta: [comprado("pc-1", 3)] })
    const resuelto = resolverPaquetes(lineas, total(lineas), paquetes, { l1: "pc-1" }, [{ clave: "v1", paqueteId: "pq-laser", usarHoy: true }])
    expect(resuelto.pedido).toEqual({ ventas: [], usos: [] })
    expect(resuelto.aPagarCentavos).toBe(centavos(30000))
  })

  it("a lo más diez paquetes vendidos en un cobro, como acepta el servidor", () => {
    const ventas = Array.from({ length: 12 }, (_, i) => ({ clave: `v${i}`, paqueteId: "pq-laser", usarHoy: false }))
    const resuelto = resolverPaquetes([], 0, para(), {}, ventas)
    expect(resuelto.pedido.ventas).toHaveLength(10)
    expect(resuelto.aPagarCentavos).toBe(centavos(1500000))
  })
})

describe("los pagos de una atención ya cobrada", () => {
  it("lo que cubrió el paquete va aparte de la plata recibida", () => {
    const pagos = [
      { id: "p1", medio: "paquete", nombreMedio: "Paquete (ya pagado)", monto: 25000 },
      { id: "p2", medio: "efectivo", nombreMedio: "Efectivo", monto: 8000 },
    ]
    expect(separarLoCubiertoPorPaquete(pagos)).toEqual({ recibidos: [pagos[1]], cubiertoCentavos: centavos(25000) })
  })

  it("sin paquete, todo es plata recibida", () => {
    const pagos = [{ medio: "efectivo", monto: 8000 }]
    expect(separarLoCubiertoPorPaquete(pagos)).toEqual({ recibidos: pagos, cubiertoCentavos: 0 })
  })
})
