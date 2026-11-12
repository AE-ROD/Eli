import { describe, expect, it } from "vitest"
import type { ResumenDeCarga } from "@/lib/carga-de-servicios"
import { MOTIVO_REPETIDO_EN_EL_ARCHIVO, MOTIVO_REPETIDO_EN_EL_LOTE, MOTIVO_YA_EXISTE } from "@/lib/servicios-en-lote"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { OMITIDOS_A_NOMBRAR, frasesDeLosServicios } from "./_frases-de-servicios"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras

const NEUTRAS = palabrasDe(null)

/** Un rubro inventado con el servicio masculino y el motivo femenino: si una frase pegara un artículo a mano, se rompe. */
const AL_REVES: PalabrasDelRubro = {
  ...palabrasDe("odontologia"),
  servicio: { singular: "labor", plural: "labores", genero: "f" },
  servicioDeLaReserva: { singular: "turnito", plural: "turnitos", genero: "m" },
}

const resumen = (cambios: Partial<ResumenDeCarga> = {}): ResumenDeCarga => ({ creados: 0, omitidos: [], sinEnviar: 0, error: null, ...cambios })

describe("sin rubro: servicios", () => {
  const f = frasesDeLosServicios(NEUTRAS)

  it("el estado vacío invita a la carga rápida", () => {
    expect(f.sinServicios.titulo).toBe("Sin servicios aún")
    expect(f.sinServicios.ayuda).toBe("Agrega los servicios que ofreces de una vez con la carga rápida, o crea un servicio a la vez.")
  })

  it("la lista y la selección", () => {
    expect(f.lista.mostrando(5, 40)).toBe("Mostrando 5 de 40 servicios")
    expect(f.lista.mostrando(1, 1)).toBe("Mostrando 1 de 1 servicio")
    expect(f.lista.sinResultados.titulo).toBe("Ningún servicio coincide")
    expect(f.lista.cuantos(12)).toBe("12 servicios")
    expect(f.seleccion.marcarTodos).toBe("Seleccionar todos los servicios")
    expect(f.seleccion.seleccionados(3)).toBe("3 seleccionados")
    expect(f.seleccion.seleccionados(1)).toBe("1 seleccionado")
    expect(f.seleccion.ninguno).toBe("Marca los servicios que quieras cambiar")
  })

  it("cambiar la categoría, activar y desactivar", () => {
    expect(f.cambiarCategoria.descripcion(3)).toBe("Elige la categoría para 3 servicios.")
    expect(f.cambiarCategoria.resultado(3, "Color")).toBe("Se cambió la categoría de 3 servicios a «Color».")
    expect(f.cambiarCategoria.resultado(1, null)).toBe("Se quitó la categoría de 1 servicio.")
    expect(f.activarEnLote.tituloDesactivar(5)).toBe("¿Desactivar 5 servicios?")
    expect(f.activarEnLote.resultadoActivar(1)).toBe("Se activó 1 servicio.")
    expect(f.activarEnLote.resultadoDesactivar(5)).toBe("Se desactivaron 5 servicios.")
    expect(f.activarEnLote.descripcionDesactivar).toBe(
      "Quien reserva por tu página ya no verá los servicios que desactives. Puedes activar los servicios de nuevo cuando quieras."
    )
  })

  it("renombrar y unir categorías", () => {
    expect(f.renombrarCategoria.descripcion("Color", 4)).toBe("Cambia el nombre de «Color», que tiene 4 servicios.")
    expect(f.renombrarCategoria.plan.renombrar("Color", "Tintes")).toBe("«Color» pasará a llamarse «Tintes».")
    expect(f.renombrarCategoria.plan.unir("Color", "Corte", 3)).toBe(
      "Ya existe una categoría «Corte» con 3 servicios. Las dos se unirán en «Corte» y «Color» dejará de existir."
    )
    expect(f.renombrarCategoria.resultadoUnir("Color", "Corte", 4)).toBe("Se unió la categoría «Color» con «Corte»: 4 servicios pasaron a «Corte».")
    expect(f.renombrarCategoria.resultadoUnir("Color", "Corte", 1)).toBe("Se unió la categoría «Color» con «Corte»: 1 servicio pasó a «Corte».")
  })

  it("la carga rápida", () => {
    expect(f.carga.descripcion).toBe("Agrega varios servicios de una vez.")
    expect(f.carga.agregar(12)).toBe("Agregar 12 servicios")
    expect(f.carga.agregar(1)).toBe("Agregar 1 servicio")
    expect(f.carga.sugeridos.yaLoTienes).toBe("Ya lo tienes")
    expect(f.carga.sugeridos.agregar(3)).toBe("Agregar 3 seleccionados")
    expect(f.carga.sugeridos.marcarTodos).toBe("Marcar todos los servicios")
    expect(f.carga.pegar.cuenta(3, 2)).toBe("3 listos, 2 con problemas")
    expect(f.carga.pegar.cuenta(1, 1)).toBe("1 listo, 1 con problema")
    expect(f.carga.pegar.nombreDeLaPlantilla).toBe("plantilla-de-servicios.csv")
    expect(f.carga.varios.intro).toBe(
      "Escribe un servicio por fila. También puedes pegar varias líneas desde una planilla en el nombre de una fila y se reparten solas."
    )
  })

  it("las instrucciones de pegar son tres líneas", () => {
    expect(f.carga.pegar.instrucciones).toHaveLength(3)
  })
})

describe("clínica dental: prestaciones, con su género", () => {
  const f = frasesDeLosServicios(palabrasDe("odontologia"))

  it("todo concuerda en femenino", () => {
    expect(f.sinServicios.titulo).toBe("Sin prestaciones aún")
    expect(f.sinServicios.ayuda).toBe("Agrega las prestaciones que ofreces de una vez con la carga rápida, o crea una prestación a la vez.")
    expect(f.lista.sinResultados.titulo).toBe("Ninguna prestación coincide")
    expect(f.seleccion.marcarTodos).toBe("Seleccionar todas las prestaciones")
    expect(f.seleccion.seleccionados(3)).toBe("3 seleccionadas")
    expect(f.carga.sugeridos.yaLoTienes).toBe("Ya la tienes")
    expect(f.carga.sugeridos.agregar(1)).toBe("Agregar 1 seleccionada")
    expect(f.carga.pegar.cuenta(3, 2)).toBe("3 listas, 2 con problemas")
    expect(f.carga.agregar(2)).toBe("Agregar 2 prestaciones")
    expect(f.carga.pegar.nombreDeLaPlantilla).toBe("plantilla-de-prestaciones.csv")
    expect(f.carga.sugeridos.intro).toContain("las prestaciones que ofreces")
    expect(f.carga.sugeridos.intro).toContain("de cada una")
  })

  it("lo que ve quien reserva se dice con la palabra de la reserva: motivos", () => {
    expect(f.activarEnLote.descripcionDesactivar).toBe(
      "Quien reserva por tu página ya no verá los motivos que desactives. Puedes activar las prestaciones de nuevo cuando quieras."
    )
    expect(f.activarEnLote.descripcionActivar).toBe("Quien reserva por tu página volverá a ver los motivos que actives.")
  })

  it("los motivos del servidor se dicen con la palabra del rubro", () => {
    expect(f.carga.pegar.motivo(MOTIVO_YA_EXISTE)).toBe("Ya existe una prestación con ese nombre")
  })
})

describe("con los géneros al revés: ninguna frase pega un artículo a mano", () => {
  const f = frasesDeLosServicios(AL_REVES)

  it("las frases siguen a la palabra", () => {
    expect(f.sinServicios.ayuda).toBe("Agrega las labores que ofreces de una vez con la carga rápida, o crea una labor a la vez.")
    expect(f.carga.sugeridos.yaLoTienes).toBe("Ya la tienes")
    expect(f.seleccion.marcarTodos).toBe("Seleccionar todas las labores")
    expect(f.lista.sinResultados.titulo).toBe("Ninguna labor coincide")
    expect(f.activarEnLote.descripcionDesactivar).toContain("los turnitos que desactives")
    expect(f.activarEnLote.descripcionDesactivar).toContain("las labores de nuevo")
  })
})

describe("los motivos", () => {
  const { motivo } = frasesDeLosServicios(NEUTRAS).carga.pegar

  it("los del contrato se dicen con las palabras del rubro y sin la jerga", () => {
    expect(motivo(MOTIVO_YA_EXISTE)).toBe("Ya existe un servicio con ese nombre")
    expect(motivo(MOTIVO_REPETIDO_EN_EL_ARCHIVO)).toBe("Repetido en el archivo")
    expect(motivo(MOTIVO_REPETIDO_EN_EL_LOTE)).toBe("Repetido en la lista")
  })

  it("un error de lectura pierde el 'Fila 7:' (la tabla ya tiene su columna) y empieza con mayúscula", () => {
    expect(motivo("Fila 7: la duración tiene que ser de al menos 15 minutos")).toBe("La duración tiene que ser de al menos 15 minutos")
    expect(motivo("otro motivo del servidor")).toBe("Otro motivo del servidor")
  })
})

describe("errorDeLote: el mensaje según el código", () => {
  const { errorDeLote } = frasesDeLosServicios(NEUTRAS)

  it("el del servidor gana, salvo el de un 500", () => {
    expect(errorDeLote(409, "Se pueden tener hasta 300 servicios.", "agregar")).toBe("Se pueden tener hasta 300 servicios.")
    expect(errorDeLote(500, "Error interno del servidor", "agregar")).toBe("No se pudieron agregar los servicios. Inténtalo de nuevo.")
    expect(errorDeLote(null, "Sin conexión con el servidor", "agregar")).toBe("Sin conexión con el servidor")
  })

  it("sin mensaje, uno por código que se entienda", () => {
    expect(errorDeLote(401, "", "agregar")).toMatch(/sesión terminó/)
    expect(errorDeLote(409, "", "agregar")).toMatch(/máximo de servicios/)
    expect(errorDeLote(429, "", "cambiar")).toMatch(/Espera un momento/)
    expect(errorDeLote(503, "", "agregar")).toMatch(/más tarde/)
    expect(errorDeLote(400, "", "agregar")).toMatch(/no se pudo leer/)
    expect(errorDeLote(404, "", "renombrar")).toMatch(/Recarga la página/)
    expect(errorDeLote(413, "", "agregar")).toMatch(/menos filas/)
  })

  it("y sin código, uno por lo que se intentaba", () => {
    expect(errorDeLote(502, "", "agregar")).toBe("No se pudieron agregar los servicios. Inténtalo de nuevo.")
    expect(errorDeLote(null, "", "cambiar")).toBe("No se pudieron cambiar los servicios. Inténtalo de nuevo.")
    expect(errorDeLote(200, "", "renombrar")).toBe("No se pudo cambiar la categoría. Inténtalo de nuevo.")
    expect(errorDeLote(502, "", "sugeridos")).toBe("No se pudieron cargar los servicios sugeridos. Inténtalo de nuevo.")
    expect(frasesDeLosServicios(palabrasDe("odontologia")).errorDeLote(502, "", "agregar")).toBe(
      "No se pudieron agregar las prestaciones. Inténtalo de nuevo."
    )
  })
})

describe("resumenDeCarga", () => {
  const { resumenDeCarga } = frasesDeLosServicios(NEUTRAS)
  const yaExistia = (name: string) => ({ fila: 1, name, motivo: MOTIVO_YA_EXISTE })

  it("todo agregado: un aviso de listo", () => {
    expect(resumenDeCarga(resumen({ creados: 12 }))).toEqual({ tono: "listo", titulo: "Se agregaron 12 servicios.", detalles: [] })
    expect(resumenDeCarga(resumen({ creados: 1 })).titulo).toBe("Se agregó 1 servicio.")
  })

  it("con omitidos que ya existían, lo dice como en el ejemplo y nombra cuáles", () => {
    const r = resumenDeCarga(resumen({ creados: 12, omitidos: [yaExistia("Corte"), yaExistia("Tinte")] }))
    expect(r.tono).toBe("atencion")
    expect(r.titulo).toBe("Se agregaron 12 servicios. Se omitieron 2 porque ya existían.")
    expect(r.detalles).toEqual(["Corte: Ya existe un servicio con ese nombre", "Tinte: Ya existe un servicio con ese nombre"])
    expect(resumenDeCarga(resumen({ creados: 3, omitidos: [yaExistia("Corte")] })).titulo).toBe(
      "Se agregaron 3 servicios. Se omitió 1 porque ya existía."
    )
  })

  it("con omitidos por otros motivos no dice que ya existían", () => {
    const r = resumenDeCarga(resumen({ creados: 1, omitidos: [yaExistia("A"), { fila: 2, name: "B", motivo: "Precio inválido" }] }))
    expect(r.titulo).toBe("Se agregó 1 servicio. Se omitieron 2.")
    expect(r.detalles[1]).toBe("B: Precio inválido")
  })

  it("si no se agregó ninguno, con el género del rubro", () => {
    expect(resumenDeCarga(resumen({ omitidos: [yaExistia("Corte")] })).titulo).toBe(
      "No se agregó ningún servicio. Se omitió 1 porque ya existía."
    )
    expect(frasesDeLosServicios(palabrasDe("odontologia")).resumenDeCarga(resumen()).titulo).toBe("No se agregó ninguna prestación.")
  })

  it("nombra los primeros omitidos y cuenta el resto", () => {
    const muchos = Array.from({ length: OMITIDOS_A_NOMBRAR + 3 }, (_, i) => yaExistia(`S${i}`))
    const { detalles } = resumenDeCarga(resumen({ creados: 1, omitidos: muchos }))
    expect(detalles).toHaveLength(OMITIDOS_A_NOMBRAR + 1)
    expect(detalles.at(-1)).toBe("y 3 más")
  })

  it("un omitido sin nombre se nombra por su fila", () => {
    expect(resumenDeCarga(resumen({ creados: 1, omitidos: [{ fila: 4, name: "", motivo: "x" }] })).detalles).toEqual(["Fila 4: X"])
  })

  it("si se cortó, es un error: dice cuántos entraron, cuántos no y por qué", () => {
    const r = resumenDeCarga(resumen({ creados: 100, sinEnviar: 50, error: "Hiciste varios cambios seguidos." }))
    expect(r.tono).toBe("error")
    expect(r.titulo).toBe("Se agregaron 100 servicios. No se pudieron agregar 50 servicios. Hiciste varios cambios seguidos.")
    expect(resumenDeCarga(resumen({ sinEnviar: 10, error: "Sin conexión con el servidor" })).titulo).toBe("Sin conexión con el servidor")
  })
})

describe("un rubro sin palabras propias habla como sin rubro", () => {
  it.each(["salud", "fitness", "otro", "", "constructor"])("%s", (rubro) => {
    const a = frasesDeLosServicios(palabrasDe(rubro))
    const b = frasesDeLosServicios(NEUTRAS)
    expect(a.carga.agregar(2)).toBe(b.carga.agregar(2))
    expect(a.carga.sugeridos.yaLoTienes).toBe(b.carga.sugeridos.yaLoTienes)
    expect(a.carga.pegar.motivo(MOTIVO_YA_EXISTE)).toBe(b.carga.pegar.motivo(MOTIVO_YA_EXISTE))
    expect(a.resumenDeCarga(resumen({ creados: 2 })).titulo).toBe(b.resumenDeCarga(resumen({ creados: 2 })).titulo)
    expect(a.errorDeLote(502, "", "agregar")).toBe(b.errorDeLote(502, "", "agregar"))
  })
})
