import { describe, it, expect } from "vitest"
import { calcularTotales, motivoParaNoCerrar } from "@/lib/liquidacion"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeLasLiquidaciones } from "./_frases"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras
const NEUTRAS = palabrasDe(null)

/** Las frases como texto plano, para compararlas: cada función se llama con un número y dos booleanos. */
function comoTexto(frases: unknown): string {
  return JSON.stringify(frases, (_clave, valor) =>
    typeof valor === "function" ? [valor(1, false), valor(3, true), valor(null, 0)] : valor
  )
}

/** Un rubro inventado con géneros al revés: la clienta, la estilista y el servicio masculino. */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  profesional: { singular: "estilista", plural: "estilistas", genero: "f" },
  servicio: { singular: "trabajo", plural: "trabajos", genero: "m" },
}

describe("sin rubro: exactamente los textos de siempre", () => {
  const f = frasesDeLasLiquidaciones(NEUTRAS)

  it("la página, el comprobante y el cierre", () => {
    expect(f.subtitulo).toBe("Lo que se le paga a cada profesional por período.")
    expect(f.profesional).toBe("Profesional")
    expect(f.todosLosProfesionales).toBe("Todos")
    expect(f.cliente).toBe("Cliente")
    expect(f.vistaPrevia.lineas(3)).toBe("Servicios y productos (3)")
    expect(f.vistaPrevia.lineas(0)).toBe("Servicios y productos (0)")
    expect(f.vistaPrevia.comisionPorServicios).toBe("Comisión por servicios")
    expect(f.comprobante.serviciosYProductos).toBe("Servicios y productos")
    expect(f.comprobante.noIncluye).toBe("No incluye servicios ni productos.")
    expect(f.comprobante.comisionPorServicios).toBe("Comisión por servicios")
  })

  it("lo que libera anular una liquidación", () => {
    expect(f.anular.descripcion(false, true)).toBe(
      "Los servicios, propinas y movimientos que incluía vuelven a quedar pendientes para la próxima. Lo que se congeló al cerrarla sigue congelado."
    )
    expect(f.anular.descripcion(true, true)).toBe(
      "Los servicios, abonos de prótesis, propinas y movimientos que incluía vuelven a quedar pendientes para la próxima. Lo que se congeló al cerrarla sigue congelado."
    )
    expect(f.anular.descripcion(true, false)).toContain("Los servicios, abonos de prótesis y movimientos")
    expect(f.anular.descripcion(false, false)).toContain("Los servicios y movimientos que incluía")
    expect(f.comprobante.anuladaSinLineas(false, true)).toBe(
      "Anulada: los servicios, productos, propinas y movimientos que incluía volvieron a quedar pendientes para la próxima liquidación."
    )
    expect(f.comprobante.anuladaSinLineas(true, false)).toBe(
      "Anulada: los servicios, productos, abonos de prótesis y movimientos que incluía volvieron a quedar pendientes para la próxima liquidación."
    )
  })

  it("el aviso del cierre dice lo mismo que el servidor, con uno y con varios", () => {
    expect(f.vistaPrevia.sinPorcentaje(1)).toBe("Hay 1 servicio sin porcentaje de comisión: configúralo en Comisiones antes de cerrar.")
    expect(f.vistaPrevia.sinPorcentaje(2)).toBe("Hay 2 servicios sin porcentaje de comisión: configúralos en Comisiones antes de cerrar.")
  })
})

describe("clínica dental", () => {
  const f = frasesDeLasLiquidaciones(palabrasDe("odontologia"))

  it("odontólogo, paciente y prestaciones", () => {
    expect(f.subtitulo).toBe("Lo que se le paga a cada odontólogo por período.")
    expect(f.profesional).toBe("Odontólogo")
    expect(f.todosLosProfesionales).toBe("Todos")
    expect(f.cliente).toBe("Paciente")
    expect(f.vistaPrevia.lineas(2)).toBe("Prestaciones y productos (2)")
    expect(f.vistaPrevia.comisionPorServicios).toBe("Comisión por prestaciones")
    expect(f.comprobante.serviciosYProductos).toBe("Prestaciones y productos")
    expect(f.comprobante.noIncluye).toBe("No incluye prestaciones ni productos.")
    expect(f.comprobante.comisionPorServicios).toBe("Comisión por prestaciones")
  })

  it("la prestación es femenina: 'las prestaciones' donde otros dicen 'los servicios'", () => {
    expect(f.anular.descripcion(true, false)).toBe(
      "Las prestaciones, abonos de prótesis y movimientos que incluía vuelven a quedar pendientes para la próxima. Lo que se congeló al cerrarla sigue congelado."
    )
    expect(f.comprobante.anuladaSinLineas(true, false)).toBe(
      "Anulada: las prestaciones, productos, abonos de prótesis y movimientos que incluía volvieron a quedar pendientes para la próxima liquidación."
    )
  })

  it("el aviso del cierre", () => {
    expect(f.vistaPrevia.sinPorcentaje(1)).toBe("Hay 1 prestación sin porcentaje de comisión: configúralo en Comisiones antes de cerrar.")
    expect(f.vistaPrevia.sinPorcentaje(3)).toBe("Hay 3 prestaciones sin porcentaje de comisión: configúralos en Comisiones antes de cerrar.")
  })

  it("no queda un solo 'cliente' ni 'servicio' en ninguna frase", () => {
    const texto = comoTexto(f).replace(/"[a-zA-Z]*(Cliente|cliente|Servicio|servicio)[a-zA-Z]*":/g, "")
    expect(texto).not.toMatch(/cliente/i)
    expect(texto).not.toMatch(/servicio/i)
  })
})

describe("salón, barbería y salón de uñas", () => {
  it("quien atiende va con su palabra y su género", () => {
    expect(frasesDeLasLiquidaciones(palabrasDe("salon")).subtitulo).toBe("Lo que se le paga a cada estilista por período.")
    expect(frasesDeLasLiquidaciones(palabrasDe("salon")).todosLosProfesionales).toBe("Todas")
    expect(frasesDeLasLiquidaciones(palabrasDe("spa-de-unas")).profesional).toBe("Manicurista")
    expect(frasesDeLasLiquidaciones(palabrasDe("spa-de-unas")).todosLosProfesionales).toBe("Todas")
    expect(frasesDeLasLiquidaciones(palabrasDe("barberia")).profesional).toBe("Barbero")
    expect(frasesDeLasLiquidaciones(palabrasDe("barberia")).todosLosProfesionales).toBe("Todos")
  })

  it("el servicio sigue siendo servicio", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas"]) {
      expect(frasesDeLasLiquidaciones(palabrasDe(rubro)).vistaPrevia.lineas(1)).toBe("Servicios y productos (1)")
    }
  })
})

describe("un rubro desconocido o sin rubro dice lo mismo que las palabras neutras", () => {
  it.each([null, "", "salud", "fitness", "otro", "no-existe", "constructor", "__proto__"])("rubro %j", (rubro) => {
    expect(comoTexto(frasesDeLasLiquidaciones(palabrasDe(rubro)))).toBe(comoTexto(frasesDeLasLiquidaciones(NEUTRAS)))
  })
})

describe("el motivo para no cerrar: lo del servidor, dicho con las palabras del rubro", () => {
  const totales = calcularTotales([], [], [])
  const delServidor = (sinPorcentaje: number, desde = "2026-10-01") =>
    motivoParaNoCerrar({ sinPorcentaje, desde, hoy: "2026-11-03", totales })

  it("el aviso de las líneas sin % se traduce al rubro", () => {
    const dental = frasesDeLasLiquidaciones(palabrasDe("odontologia")).vistaPrevia
    expect(dental.motivoParaNoCerrar(delServidor(1), 1)).toBe(
      "Hay 1 prestación sin porcentaje de comisión: configúralo en Comisiones antes de cerrar."
    )
    expect(dental.motivoParaNoCerrar(delServidor(4), 4)).toBe(
      "Hay 4 prestaciones sin porcentaje de comisión: configúralos en Comisiones antes de cerrar."
    )
  })

  it("lo que no nombra al servicio queda como llegó, y sin motivo no hay motivo", () => {
    const dental = frasesDeLasLiquidaciones(palabrasDe("odontologia")).vistaPrevia
    expect(dental.motivoParaNoCerrar(delServidor(0, "2026-12-01"), 0)).toBe("Este período todavía no empieza.")
    expect(dental.motivoParaNoCerrar("Otro motivo que dijo el servidor", 2)).toBe("Otro motivo que dijo el servidor")
    expect(dental.motivoParaNoCerrar(null, 0)).toBeNull()
  })

  it("con un período futuro y líneas sin %, manda el primero: el servidor dice que no empieza", () => {
    const dental = frasesDeLasLiquidaciones(palabrasDe("odontologia")).vistaPrevia
    expect(dental.motivoParaNoCerrar(delServidor(2, "2026-12-01"), 2)).toBe("Este período todavía no empieza.")
  })

  it("la frase del cliente es la misma que la del servidor, para cada rubro y cada cantidad", () => {
    for (const rubro of [null, "salon", "barberia", "spa-de-unas", "odontologia", "salud"]) {
      const palabras = palabrasDe(rubro)
      for (const cantidad of [1, 2, 7]) {
        expect(frasesDeLasLiquidaciones(palabras).vistaPrevia.sinPorcentaje(cantidad)).toBe(
          motivoParaNoCerrar({ sinPorcentaje: cantidad, desde: "2026-10-01", hoy: "2026-11-03", totales, palabras })
        )
      }
    }
  })

  it("un rubro sin palabras propias deja el motivo del servidor exactamente igual", () => {
    const neutras = frasesDeLasLiquidaciones(NEUTRAS).vistaPrevia
    expect(neutras.motivoParaNoCerrar(delServidor(3), 3)).toBe(delServidor(3))
  })
})

describe("la concordancia sigue al género y no a una terminación pegada", () => {
  const f = frasesDeLasLiquidaciones(AL_REVES)

  it("el servicio masculino y quien atiende femenina", () => {
    expect(f.subtitulo).toBe("Lo que se le paga a cada estilista por período.")
    expect(f.todosLosProfesionales).toBe("Todas")
    expect(f.anular.descripcion(false, false)).toContain("Los trabajos y movimientos que incluía")
    expect(f.comprobante.anuladaSinLineas(false, false)).toContain("Anulada: los trabajos, productos y movimientos")
    expect(f.vistaPrevia.sinPorcentaje(1)).toBe("Hay 1 trabajo sin porcentaje de comisión: configúralo en Comisiones antes de cerrar.")
  })
})
