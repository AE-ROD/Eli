import { describe, it, expect } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDelTablero } from "./_frases"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras
const NEUTRAS = palabrasDe(null)

/**
 * Las frases como texto plano, para compararlas: cada función se llama con un
 * texto, un número y un booleano (las que no reciben ese tipo fallan y se
 * descartan), y lo que devuelve se deja en su lugar.
 */
function comoTexto(frases: unknown): string {
  const probar = (funcion: (entrada: unknown) => unknown) =>
    ["texto", 2, true].map((entrada) => {
      try {
        return funcion(entrada)
      } catch {
        return null
      }
    })
  return JSON.stringify(frases, (_clave, valor) => (typeof valor === "function" ? probar(valor) : valor))
}

/**
 * Un rubro inventado con los géneros al revés: la "sala de espera" es el
 * "tablero" (femenino a masculino), el servicio es femenino y quien atiende es
 * una "estilista". Si una frase pegara un artículo o una terminación a mano,
 * aquí se vería.
 */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  profesional: { singular: "estilista", plural: "estilistas", genero: "f" },
  servicio: { singular: "prestación", plural: "prestaciones", genero: "f" },
  tablero: { singular: "sala de espera", plural: "salas de espera", genero: "f" },
}

describe("sin rubro: exactamente los textos de siempre", () => {
  const f = frasesDelTablero(NEUTRAS)

  it("el título y los avisos del tablero", () => {
    expect(f.titulo).toBe("Tablero")
    expect(f.cargando).toBe("Cargando el tablero…")
    expect(f.avisoDeCambio).toBe("La atención cambió; se recargó el tablero.")
    expect(f.conRecarga("Esta reserva no es de hoy.")).toBe("Esta reserva no es de hoy. Se recargó el tablero.")
    expect(f.conRecarga("Ya llegó")).toBe("Ya llegó. Se recargó el tablero.")
    expect(f.noSePudoActualizar("Sin conexión")).toBe("No se pudo actualizar el tablero: Sin conexión. Se vuelve a intentar solo.")
    expect(f.hayMasAtenciones).toBe("Hay más atenciones de las que el tablero muestra de una vez: algunas no se ven.")
  })

  it("las tarjetas", () => {
    expect(f.noVino.boton).toBe("No vino")
    expect(f.noVino.etiqueta("María González, reserva de las 16:00")).toBe("No vino: María González, reserva de las 16:00")
    expect(f.sinCliente).toBe("Sin cliente")
    expect(f.sinProfesionalAsignado).toBe("Sin profesional asignado")
    expect(f.tarjeta).toEqual({
      listaDeServicios: "Servicios",
      sinServicios: "Sin servicios todavía.",
      editarDe: expect.any(Function),
      editarGlobo: "Editar servicios",
    })
    expect(f.tarjeta.editarDe("María González de las 10:00")).toBe("Editar servicios de María González de las 10:00")
  })

  it("el editor de servicios", () => {
    expect(f.servicios.deLaAtencion("María González")).toBe("Servicios de María González")
    expect(f.servicios.titulo).toBe("Servicios")
    expect(f.servicios.soloLosTuyos).toBe(
      "Ves y cambias solo tus servicios; los de tus compañeros no se tocan. Quedan a tu nombre."
    )
    expect(f.servicios.losAbonosNoSeEditan).toBe(
      "No se editan aquí y guardar los servicios no los cambia. Se quitan desde la tarjeta, antes de cobrar."
    )
    expect(f.servicios.revisaLosMarcados).toBe("Revisa los servicios marcados.")
    expect(f.servicios.agregaElQueVasAHacer).toBe("Agrega el servicio que vas a hacer: la atención queda a tu nombre.")
    expect(f.servicios.totalDeTusServicios).toBe("Total de tus servicios")
    expect(f.editor.catalogoVacio).toBe("Todavía no hay servicios en el catálogo.")
    expect(f.editor.agregalos).toBe("Agrégalos en Configuración")
    expect(f.editor.pideQueLosCarguen).toBe("Pídele al dueño o al encargado que los cargue en Configuración.")
    expect(f.editor.sinServicios).toBe("Sin servicios todavía.")
    expect(f.editor.agregarServicio).toBe("Agregar servicio")
    expect(f.editor.profesional).toBe("Profesional")
    expect(f.editor.elegirProfesional).toBe("Elegir profesional")
    expect(f.editor.servicioPorDefecto).toBe("Servicio")
  })

  it("cada línea del editor: un servicio o un producto", () => {
    const servicio = f.editor.linea(false)
    expect(servicio.titulo).toBe("Servicio")
    expect(servicio.elegir).toBe("Elegir servicio")
    expect(servicio.quitar(2)).toBe("Quitar el servicio 2")
    expect(servicio.eligeOtro).toBe("elige otro")
    const producto = f.editor.linea(true)
    expect(producto.titulo).toBe("Producto")
    expect(producto.elegir).toBe("Elegir producto")
    expect(producto.quitar(1)).toBe("Quitar el producto 1")
    expect(producto.eligeOtro).toBe("elige otro")
  })

  it("anotar sin reserva", () => {
    expect(f.anotar.entraEnEspera).toBe("Entra al tablero en espera.")
    expect(f.anotar.cliente).toBe("Cliente")
    expect(f.anotar.yaEsCliente).toBe("¿Ya es cliente?")
    expect(f.anotar.opcionYaEs).toBe("Ya es cliente")
    expect(f.anotar.opcionNuevo).toBe("Cliente nuevo")
    expect(f.anotar.buscar).toBe("Buscar cliente")
    expect(f.anotar.encontrados(1)).toBe("1 cliente encontrado.")
    expect(f.anotar.encontrados(3)).toBe("3 clientes encontrados.")
    expect(f.anotar.sinResultados).toBe("No hay clientes con ese texto.")
    expect(f.anotar.anotarComoNuevo).toBe("Anotarlo como cliente nuevo")
    expect(f.anotar.eligeDeLaLista).toBe("Elige un cliente de la lista, o anótalo como cliente nuevo.")
    expect(f.anotar.escribeElNombre(2)).toBe("Escribe el nombre del cliente (al menos 2 letras).")
  })

  it("los textos de un pedido que falla sin decir por qué", () => {
    expect(f.errores).toEqual({
      cargarElTablero: "No se pudo cargar el tablero",
      buscarClientes: "No se pudieron buscar los clientes",
      marcarNoVino: "No se pudo marcar que no vino",
      guardarServicios: "No se pudieron guardar los servicios",
      lineasSinPorcentaje: "No se pudo saber qué servicios quedarán sin porcentaje de comisión",
    })
  })
})

describe("clínica dental", () => {
  const f = frasesDelTablero(palabrasDe("odontologia"))

  it("la sala de espera, con su artículo", () => {
    expect(f.titulo).toBe("Sala de espera")
    expect(f.cargando).toBe("Cargando la sala de espera…")
    expect(f.avisoDeCambio).toBe("La atención cambió; se recargó la sala de espera.")
    expect(f.conRecarga("Ya llegó.")).toBe("Ya llegó. Se recargó la sala de espera.")
    expect(f.noSePudoActualizar("Sin conexión")).toBe(
      "No se pudo actualizar la sala de espera: Sin conexión. Se vuelve a intentar solo."
    )
    expect(f.hayMasAtenciones).toBe(
      "Hay más atenciones de las que la sala de espera muestra de una vez: algunas no se ven."
    )
    // La frase de la clínica de siempre sigue igual de natural.
    expect(f.anotar.quedaEsperando).toBe("Queda esperando en la sala de espera.")
    expect(f.anotar.entraEnEspera).toBe("Entra a la sala de espera en espera.")
  })

  it("No asistió, paciente y odontólogo", () => {
    expect(f.noVino.boton).toBe("No asistió")
    expect(f.noVino.etiqueta("Camila Rojas, reserva de las 16:00")).toBe("No asistió: Camila Rojas, reserva de las 16:00")
    expect(f.sinCliente).toBe("Sin paciente")
    expect(f.sinProfesionalAsignado).toBe("Sin odontólogo asignado")
    expect(f.errores.marcarNoVino).toBe("No se pudo marcar que no asistió")
    expect(f.errores.cargarElTablero).toBe("No se pudo cargar la sala de espera")
    expect(f.errores.buscarClientes).toBe("No se pudieron buscar los pacientes")
  })

  it("la prestación es femenina: todo lo que la acompaña concuerda", () => {
    expect(f.servicios.deLaAtencion("Camila Rojas")).toBe("Prestaciones de Camila Rojas")
    expect(f.servicios.soloLosTuyos).toBe(
      "Ves y cambias solo tus prestaciones; las de tus compañeros no se tocan. Quedan a tu nombre."
    )
    expect(f.servicios.losAbonosNoSeEditan).toBe(
      "No se editan aquí y guardar las prestaciones no los cambia. Se quitan desde la tarjeta, antes de cobrar."
    )
    expect(f.servicios.revisaLosMarcados).toBe("Revisa las prestaciones marcadas.")
    expect(f.servicios.agregaElQueVasAHacer).toBe("Agrega la prestación que vas a hacer: la atención queda a tu nombre.")
    expect(f.servicios.totalDeTusServicios).toBe("Total de tus prestaciones")
    expect(f.editor.catalogoVacio).toBe("Todavía no hay prestaciones en el catálogo.")
    expect(f.editor.agregalos).toBe("Agrégalas en Configuración")
    expect(f.editor.pideQueLosCarguen).toBe("Pídele al dueño o al encargado que las cargue en Configuración.")
    expect(f.editor.agregarServicio).toBe("Agregar prestación")
    expect(f.editor.elegirProfesional).toBe("Elegir odontólogo")
    expect(f.editor.profesional).toBe("Odontólogo")
    expect(f.tarjeta.listaDeServicios).toBe("Prestaciones")
    expect(f.tarjeta.sinServicios).toBe("Sin prestaciones todavía.")
    expect(f.tarjeta.editarGlobo).toBe("Editar prestaciones")
    expect(f.errores.guardarServicios).toBe("No se pudieron guardar las prestaciones")
    expect(f.errores.lineasSinPorcentaje).toBe("No se pudo saber qué prestaciones quedarán sin porcentaje de comisión")
  })

  it("cada línea del editor: 'la prestación' y 'elige otra'; el producto no cambia", () => {
    const servicio = f.editor.linea(false)
    expect(servicio.titulo).toBe("Prestación")
    expect(servicio.elegir).toBe("Elegir prestación")
    expect(servicio.quitar(3)).toBe("Quitar la prestación 3")
    expect(servicio.eligeOtro).toBe("elige otra")
    const producto = f.editor.linea(true)
    expect(producto.quitar(1)).toBe("Quitar el producto 1")
    expect(producto.eligeOtro).toBe("elige otro")
  })

  it("el paciente: sin 'cliente' en ninguna frase", () => {
    expect(f.anotar.cliente).toBe("Paciente")
    expect(f.anotar.yaEsCliente).toBe("¿Ya es paciente?")
    expect(f.anotar.opcionNuevo).toBe("Paciente nuevo")
    expect(f.anotar.buscar).toBe("Buscar paciente")
    expect(f.anotar.encontrados(1)).toBe("1 paciente encontrado.")
    expect(f.anotar.encontrados(2)).toBe("2 pacientes encontrados.")
    expect(f.anotar.sinResultados).toBe("No hay pacientes con ese texto.")
    expect(f.anotar.eligeDeLaLista).toBe("Elige un paciente de la lista, o anótalo como paciente nuevo.")
    expect(f.anotar.escribeElNombre(2)).toBe("Escribe el nombre del paciente (al menos 2 letras).")
    // Ni en los textos fijos ni en los que arman las funciones.
    expect(comoTexto(f).replace(/"[a-zA-Z]*[Cc]liente[a-zA-Z]*":/g, "")).not.toMatch(/cliente/i)
  })
})

describe("salón, barbería y salón de uñas", () => {
  it("el tablero se llama tablero y quien atiende, con su palabra", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas"]) {
      const f = frasesDelTablero(palabrasDe(rubro))
      expect(f.titulo).toBe("Tablero")
      expect(f.cargando).toBe("Cargando el tablero…")
      expect(f.noVino.boton).toBe("No vino")
      expect(f.servicios.deLaAtencion("María")).toBe("Servicios de María")
    }
    expect(frasesDelTablero(palabrasDe("salon")).sinProfesionalAsignado).toBe("Sin estilista asignada")
    expect(frasesDelTablero(palabrasDe("salon")).editor.elegirProfesional).toBe("Elegir estilista")
    expect(frasesDelTablero(palabrasDe("barberia")).sinProfesionalAsignado).toBe("Sin barbero asignado")
    expect(frasesDelTablero(palabrasDe("spa-de-unas")).sinProfesionalAsignado).toBe("Sin manicurista asignada")
  })
})

describe("un rubro desconocido o sin rubro dice lo mismo que las palabras neutras", () => {
  it.each([null, "", "salud", "fitness", "otro", "no-existe", "constructor", "__proto__"])("rubro %j", (rubro) => {
    expect(comoTexto(frasesDelTablero(palabrasDe(rubro)))).toBe(comoTexto(frasesDelTablero(NEUTRAS)))
  })
})

describe("la concordancia sigue al género y no a una terminación pegada", () => {
  const f = frasesDelTablero(AL_REVES)

  it("sala de espera femenina, clienta y estilista", () => {
    expect(f.titulo).toBe("Sala de espera")
    expect(f.cargando).toBe("Cargando la sala de espera…")
    expect(f.sinProfesionalAsignado).toBe("Sin estilista asignada")
    expect(f.anotar.opcionNuevo).toBe("Clienta nueva")
    expect(f.anotar.encontrados(1)).toBe("1 clienta encontrada.")
    expect(f.anotar.encontrados(4)).toBe("4 clientas encontradas.")
    expect(f.anotar.anotarComoNuevo).toBe("Anotarla como clienta nueva")
    expect(f.anotar.eligeDeLaLista).toBe("Elige una clienta de la lista, o anótala como clienta nueva.")
    expect(f.anotar.escribeElNombre(3)).toBe("Escribe el nombre de la clienta (al menos 3 letras).")
  })

  it("con el servicio masculino, 'los' y 'elige otro'", () => {
    const masculino = frasesDelTablero({ ...AL_REVES, servicio: { singular: "trabajo", plural: "trabajos", genero: "m" } })
    expect(masculino.servicios.revisaLosMarcados).toBe("Revisa los trabajos marcados.")
    expect(masculino.editor.agregalos).toBe("Agrégalos en Configuración")
    expect(masculino.editor.linea(false).eligeOtro).toBe("elige otro")
    expect(masculino.editor.linea(false).quitar(1)).toBe("Quitar el trabajo 1")
  })
})
