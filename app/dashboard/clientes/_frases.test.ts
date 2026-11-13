import { describe, expect, it } from "vitest"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeClientes } from "./_frases"

const palabrasDe = (rubro: string | null): PalabrasDelRubro => vocabularioDe(rubro).palabras

const NEUTRAS = palabrasDe(null)

/**
 * Un rubro inventado con otros géneros que los reales: la clienta y el turno
 * (cita masculina), la prestación masculina. Si una frase pegara "nuevo",
 * "los" o "último" a mano, acá se rompe.
 */
const AL_REVES: PalabrasDelRubro = {
  ...NEUTRAS,
  cliente: { singular: "clienta", plural: "clientas", genero: "f" },
  servicio: { singular: "trabajo", plural: "trabajos", genero: "m" },
  cita: { singular: "turno", plural: "turnos", genero: "m" },
  negocio: { singular: "taller", plural: "talleres", genero: "m" },
}

describe("sin rubro: exactamente los textos de siempre", () => {
  const f = frasesDeClientes(NEUTRAS)

  it("la página y la lista", () => {
    expect(f.pagina.titulo).toBe("Clientes")
    expect(f.pagina.subtitulo(0)).toBe("0 clientes registrados")
    expect(f.pagina.subtitulo(1)).toBe("1 cliente registrado")
    expect(f.pagina.subtitulo(12)).toBe("12 clientes registrados")
    expect(f.pagina.nuevo).toBe("Nuevo cliente")
    expect(f.pagina.queVer).toBe("Qué clientes ver")
    expect(f.pagina.vistas).toEqual({ todos: "Todos", seVan: "Se están yendo" })
    expect(f.lista.cargando).toBe("Cargando clientes...")
    expect(f.lista.sinResultados).toBe("No se encontraron clientes")
    expect(f.lista.sinResultadosAyuda).toBe("Intenta cambiar los filtros o agrega un nuevo cliente")
    expect(f.lista.buscar).toBe("Buscar clientes")
    expect(f.lista.comoVer).toBe("Cómo ver los clientes")
  })

  it("la ficha", () => {
    expect(f.ficha.antetitulo).toBe("Ficha del cliente")
    expect(f.ficha.datos).toBe("Datos del cliente")
    expect(f.ficha.eliminar).toBe("Eliminar cliente")
    expect(f.ficha.notasPlaceholder).toBe("Agregar notas sobre el cliente...")
    expect(f.ficha.inasistencias(0)).toBe("Sin inasistencias")
    expect(f.ficha.inasistencias(1)).toBe("1 vez no vino")
    expect(f.ficha.inasistencias(3)).toBe("3 veces no vino")
    expect(f.ficha.proxima).toBe("Próxima cita")
    expect(f.ficha.agendar).toBe("Agendar cita")
    expect(f.ficha.historial).toBe("Últimas citas")
    expect(f.ficha.sinHistorial).toBe("Sin citas registradas")
  })

  it("eliminar", () => {
    expect(f.eliminar.boton).toBe("Eliminar cliente")
    expect(f.eliminar.listo("Ana Pérez")).toBe(
      'Se eliminaron los datos de Ana Pérez. Sus citas y cobros siguen en la agenda y en los reportes, a nombre de "Cliente eliminado".'
    )
    expect(f.eliminar.seBorra).toBe(
      "Su nombre, correo, teléfono, cédula, notas y etiquetas; su nombre en cada cobro, que pasa a decir “Cliente eliminado”; y las notas y comentarios de sus citas y atenciones. Deja de aparecer en Clientes y en los buscadores."
    )
    expect(f.eliminar.queda).toBe(
      "Sus citas y sus cobros, con sus fechas, servicios, profesionales y montos, para que la agenda y los reportes sumen lo mismo."
    )
  })

  it("el formulario", () => {
    expect(f.formulario.titulo(false)).toBe("Nuevo cliente")
    expect(f.formulario.titulo(true)).toBe("Editar cliente")
    expect(f.formulario.nombre).toBe("Nombre del cliente")
    expect(f.formulario.guardar(false)).toBe("Guardar cliente")
    expect(f.formulario.guardar(true)).toBe("Guardar cambios")
  })

  it("exportar", () => {
    expect(f.exportar.titulo).toBe("Clientes")
    expect(f.exportar.descripcion).toBe("Todos los clientes del negocio, con sus datos de contacto y notas.")
    expect(f.exportar.descargar).toBe("Descargar clientes")
    expect(f.exportar.atenciones).toBe(
      "Cada visita al local entre dos días, con sus servicios, quién atendió y lo cobrado. Hasta un año."
    )
  })

  it("se están yendo", () => {
    expect(f.seVan.descripcion("14 días")).toBe(
      "Clientes que no vienen hace al menos una vez y media lo que suelen tardar, y no tienen hora. Al tocar “Escribirle” se abre tu WhatsApp o tu correo con un mensaje listo para cambiar, y el cliente sale de esta lista por 14 días."
    )
    expect(f.seVan.cargando).toBe("Cargando clientes que se están yendo...")
    expect(f.seVan.vacio).toBe(
      "Aparecen acá los clientes con al menos 3 visitas, o cuyo último servicio tiene una frecuencia, cuando se atrasan."
    )
    expect(f.seVan.segunElServicio).toBe("(según el servicio)")
  })

  it("importar", () => {
    expect(f.importar.titulo).toBe("Importar clientes")
    expect(f.importar.volver).toBe("Volver a Clientes")
    expect(f.importar.soloQuienPuede).toBe("Sólo el dueño y el encargado pueden importar clientes.")
    expect(f.importar.sinFilas).toBe("El archivo no tiene clientes: le falta la cabecera o las filas.")
    expect(f.importar.elegirLaColumna).toBe("Elige qué columna tiene el nombre de los clientes.")
    expect(f.importar.ayuda("5.000")).toBe(
      "Un CSV de hasta 2 MB y 5.000 filas, con una primera fila de títulos, o los contactos de tu teléfono en un archivo .vcf (en Google Contactos o iCloud: Exportar vCard). No se crean clientes repetidos: si el teléfono o el correo ya están en Eli (o más arriba en el archivo), la fila se omite."
    )
    expect(f.importar.sinContactos).toBe("No encontramos contactos con nombre en el archivo.")
    expect(f.importar.contactosSinNombre(1)).toBe("1 contacto sin nombre no se importó.")
    expect(f.importar.contactosSinNombre(3)).toBe("3 contactos sin nombre no se importaron.")
    expect(f.importar.sinConsentimiento).toBe(
      "Sin una columna de “Acepta WhatsApp”, los clientes importados quedan sin consentimiento para recibir mensajes."
    )
    expect(f.importar.resumen.resultado(1)).toBe("Se creó 1 cliente.")
    expect(f.importar.resumen.resultado(1234)).toBe("Se crearon 1.234 clientes.")
    expect(f.importar.resumen.resultado(0)).toBe("No se creó ningún cliente.")
    expect(f.importar.resumen.creados).toBe("Creados")
    expect(f.importar.resumen.omitidos).toBe("Omitidos por duplicado")
    expect(f.importar.resumen.conErrores).toBe("Con errores")
  })

  it("los errores de los pedidos", () => {
    expect(f.errores).toEqual({
      cargarClientes: "No se pudieron cargar los clientes",
      crearCliente: "No se pudo crear el cliente",
      guardarCliente: "No se pudo guardar el cliente",
      eliminarCliente: "No se pudo eliminar el cliente",
      descargarPlanilla: "No se pudo descargar la planilla de clientes",
      cargarLosQueSeVan: "No se pudo cargar la lista de clientes que se están yendo",
    })
  })
})

describe("los rubros sin palabras propias hablan como sin rubro", () => {
  it.each(["salud", "fitness", "otro", "", "constructor", undefined])("%s", (rubro) => {
    const texto = (palabras: PalabrasDelRubro) => JSON.stringify(frasesDeClientes(palabras), (_, v) => (typeof v === "function" ? v(3) : v))
    expect(texto(palabrasDe(rubro as string | null))).toBe(texto(NEUTRAS))
  })
})

describe("clínica dental: pacientes, citas y prestaciones", () => {
  const f = frasesDeClientes(palabrasDe("odontologia"))

  it("los pacientes, con su artículo", () => {
    expect(f.pagina.titulo).toBe("Pacientes")
    expect(f.pagina.subtitulo(1)).toBe("1 paciente registrado")
    expect(f.pagina.subtitulo(12)).toBe("12 pacientes registrados")
    expect(f.pagina.nuevo).toBe("Nuevo paciente")
    expect(f.lista.sinResultadosAyuda).toBe("Intenta cambiar los filtros o agrega un nuevo paciente")
    expect(f.lista.comoVer).toBe("Cómo ver los pacientes")
    expect(f.ficha.antetitulo).toBe("Ficha del paciente")
    expect(f.ficha.notasPlaceholder).toBe("Agregar notas sobre el paciente...")
    expect(f.formulario.nombre).toBe("Nombre del paciente")
  })

  it("la reserva sigue siendo una cita y quien no llegó, \"no asistió\"", () => {
    expect(f.ficha.proxima).toBe("Próxima cita")
    expect(f.ficha.agendar).toBe("Agendar cita")
    expect(f.ficha.historial).toBe("Últimas citas")
    expect(f.ficha.sinHistorial).toBe("Sin citas registradas")
    expect(f.ficha.inasistencias(1)).toBe("1 vez no asistió")
    expect(f.ficha.inasistencias(2)).toBe("2 veces no asistió")
  })

  it("las prestaciones son femeninas: \"cuya última prestación\", \"según la prestación\"", () => {
    expect(f.seVan.vacio).toBe(
      "Aparecen acá los pacientes con al menos 3 visitas, o cuya última prestación tiene una frecuencia, cuando se atrasan."
    )
    expect(f.seVan.segunElServicio).toBe("(según la prestación)")
    expect(f.eliminar.queda).toContain("con sus fechas, prestaciones, odontólogos y montos")
  })

  it("el negocio es una clínica", () => {
    expect(f.exportar.descripcion).toBe("Todos los pacientes de la clínica, con sus datos de contacto y notas.")
    expect(f.exportar.atenciones).toBe(
      "Cada visita a la clínica entre dos días, con sus prestaciones, quién atendió y lo cobrado. Hasta un año."
    )
  })

  it("importar y errores", () => {
    expect(f.importar.titulo).toBe("Importar pacientes")
    expect(f.importar.volver).toBe("Volver a Pacientes")
    expect(f.importar.resumen.resultado(1)).toBe("Se creó 1 paciente.")
    expect(f.importar.resumen.resultado(0)).toBe("No se creó ningún paciente.")
    expect(f.errores.descargarPlanilla).toBe("No se pudo descargar la planilla de pacientes")
    expect(f.errores.cargarClientes).toBe("No se pudieron cargar los pacientes")
  })
})

describe("salón, barbería y salón de uñas: la reserva es una hora, sin chocar con el reloj", () => {
  for (const rubro of ["salon", "barberia", "spa-de-unas"]) {
    it(rubro, () => {
      const f = frasesDeClientes(palabrasDe(rubro))
      expect(f.pagina.titulo).toBe("Clientes")
      expect(f.ficha.agendar).toBe("Agendar hora")
      expect(f.ficha.proxima).toBe("Próxima hora")
      // "Últimas horas" y "sus horas" se leerían como reloj o como horario.
      expect(f.ficha.historial).toBe("Últimas horas agendadas")
      expect(f.ficha.sinHistorial).toBe("Sin horas agendadas")
      expect(f.eliminar.listo("Ana")).toContain("Sus horas agendadas y cobros siguen en la agenda")
      expect(f.eliminar.seBorra).toContain("las notas y comentarios de sus horas agendadas y atenciones")
      expect(f.eliminar.queda).toContain("Sus horas agendadas y sus cobros, con sus fechas, servicios, ")
      expect(f.ficha.inasistencias(1)).toBe("1 vez no vino")
    })
  }

  it("el negocio con su artículo y quien atiende con su palabra", () => {
    expect(frasesDeClientes(palabrasDe("salon")).exportar.atenciones).toContain("Cada visita al salón entre dos días")
    expect(frasesDeClientes(palabrasDe("barberia")).exportar.atenciones).toContain("Cada visita a la barbería entre dos días")
    expect(frasesDeClientes(palabrasDe("spa-de-unas")).exportar.atenciones).toContain("Cada visita al salón de uñas entre dos días")
    expect(frasesDeClientes(palabrasDe("salon")).eliminar.queda).toContain("servicios, estilistas y montos")
    expect(frasesDeClientes(palabrasDe("barberia")).eliminar.queda).toContain("servicios, barberos y montos")
    expect(frasesDeClientes(palabrasDe("spa-de-unas")).eliminar.queda).toContain("servicios, manicuristas y montos")
  })
})

describe("la concordancia sale del género y no de las palabras de hoy: una clienta y un turno", () => {
  const f = frasesDeClientes(AL_REVES)

  it("\"nueva clienta\", \"registradas\", \"Todas\", \"ninguna clienta\"", () => {
    expect(f.pagina.nuevo).toBe("Nueva clienta")
    expect(f.pagina.subtitulo(1)).toBe("1 clienta registrada")
    expect(f.pagina.subtitulo(5)).toBe("5 clientas registradas")
    expect(f.pagina.vistas.todos).toBe("Todas")
    expect(f.lista.sinResultadosAyuda).toBe("Intenta cambiar los filtros o agrega una nueva clienta")
    expect(f.lista.comoVer).toBe("Cómo ver las clientas")
    expect(f.ficha.antetitulo).toBe("Ficha de la clienta")
    expect(f.ficha.notasPlaceholder).toBe("Agregar notas sobre la clienta...")
    expect(f.formulario.nombre).toBe("Nombre de la clienta")
    expect(f.exportar.descripcion).toBe("Todas las clientas del taller, con sus datos de contacto y notas.")
    expect(f.importar.resumen.resultado(0)).toBe("No se creó ninguna clienta.")
    expect(f.importar.resumen.creados).toBe("Creadas")
    expect(f.importar.resumen.omitidos).toBe("Omitidas por duplicado")
    expect(f.importar.sinConsentimiento).toBe(
      "Sin una columna de “Acepta WhatsApp”, las clientas importadas quedan sin consentimiento para recibir mensajes."
    )
    expect(f.importar.ayuda("5.000")).toContain("No se crean clientas repetidas")
  })

  it("\"próximo turno\", \"últimos turnos\", \"cuyo último trabajo\"", () => {
    expect(f.ficha.proxima).toBe("Próximo turno")
    expect(f.ficha.historial).toBe("Últimos turnos")
    expect(f.ficha.sinHistorial).toBe("Sin turnos registrados")
    expect(f.seVan.vacio).toContain("las clientas con al menos 3 visitas, o cuyo último trabajo tiene una frecuencia")
    expect(f.seVan.segunElServicio).toBe("(según el trabajo)")
    expect(f.seVan.descripcion("14 días")).toContain("y la clienta sale de esta lista por 14 días")
  })
})
