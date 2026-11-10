import { describe, expect, it } from "vitest"
import { MAXIMO_DE_LINEAS_POR_ATENCION } from "@/lib/atenciones"
import { quedaLugarParaOtraFila } from "./editor-de-servicios"

describe("quedaLugarParaOtraFila: el tope de líneas de la atención", () => {
  it("sin abonos, hasta el tope del servidor", () => {
    expect(quedaLugarParaOtraFila(MAXIMO_DE_LINEAS_POR_ATENCION - 1)).toBe(true)
    expect(quedaLugarParaOtraFila(MAXIMO_DE_LINEAS_POR_ATENCION)).toBe(false)
  })

  it("los abonos de prótesis cuentan: el servidor los suma a las filas", () => {
    // 18 servicios y 2 abonos ya son 20: un servicio más era un 400 al guardar.
    expect(quedaLugarParaOtraFila(MAXIMO_DE_LINEAS_POR_ATENCION - 2, 2)).toBe(false)
    expect(quedaLugarParaOtraFila(MAXIMO_DE_LINEAS_POR_ATENCION - 3, 2)).toBe(true)
  })
})
