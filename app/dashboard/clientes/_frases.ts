/**
 * Las frases de Clientes (la lista, la ficha del lado, el formulario, "Se están
 * yendo", exportar e importar) con las palabras del rubro
 * (`vocabularioDe(rubro).palabras`, `lib/vocabulario.ts`) y la concordancia de
 * `lib/concordancia.ts`: "Nuevo cliente" en un salón, "Nuevo paciente" en una
 * clínica dental; "12 pacientes registrados"; "Ficha del paciente".
 *
 * Es lógica sin pantalla: las pantallas piden las frases con
 * `frasesDeClientes(palabras)` y no pegan un artículo, un adjetivo ni un
 * participio a ninguna palabra del vocabulario. Un rubro desconocido o `null`
 * recibe las palabras neutras, y con ellas los textos de siempre, sin un cambio.
 *
 * Qué no se migra, a propósito:
 * - "tienen hora" en "Se están yendo": es el modismo de tener una hora
 *   agendada y hoy lo dicen así todos los rubros.
 * - "Cliente eliminado": es el nombre que queda guardado en la base
 *   (`lib/clientes-eliminados.ts`), no una palabra de la interfaz.
 * - "Ficha del paciente" y "Ficha clínica" conviven en la clínica y no son lo
 *   mismo: la primera es la hoja de al lado de la lista, con el contacto, las
 *   notas, editar y eliminar; la segunda es la ficha clínica (odontograma, plan,
 *   evoluciones), a la que lleva el botón "Abrir ficha clínica".
 *
 * "hora" es también la hora del reloj: donde "Últimas horas" o "sus horas" se
 * leerían como minutos o como horario, la frase se escribe de otra forma
 * (`seLlamaHora`, de `../_frases`).
 */

import { al, concordar, del, el, ningun, numeroDe, todos, un } from "@/lib/concordancia"
import { conMayuscula, type PalabrasDelRubro, type Sustantivo } from "@/lib/vocabulario"
import { cantidadDe, elLocal, seLlamaHora } from "../_frases"

/** El mismo sustantivo con un adjetivo antes, concordado: "nuevo cliente" / "nuevos clientes" / "nueva clienta". */
function conAdjetivoAntes(adjetivo: string, sustantivo: Sustantivo): Sustantivo {
  return {
    ...sustantivo,
    singular: `${concordar(adjetivo, sustantivo)} ${sustantivo.singular}`,
    plural: `${concordar(adjetivo, sustantivo, "plural")} ${sustantivo.plural}`,
  }
}

/** "1 cliente" / "1.234 clientes": la cantidad con el separador de miles de Chile. */
function cuantos(cantidad: number, sustantivo: Sustantivo): string {
  return cantidad === 1 ? `1 ${sustantivo.singular}` : `${cantidad.toLocaleString("es-CL")} ${sustantivo.plural}`
}

export function frasesDeClientes(palabras: PalabrasDelRubro) {
  const { cliente, profesional, servicio, cita, negocio, etiquetas } = palabras
  const nuevo = conAdjetivoAntes("nuevo", cliente)
  const agendadas = concordar("agendado", cita, "plural")
  // "sus citas" y, donde la reserva es una hora, "sus horas agendadas": "sus horas" se lee como horario.
  const susCitas = seLlamaHora(cita) ? `sus ${cita.plural} ${agendadas}` : `sus ${cita.plural}`
  const ultimas = conMayuscula(concordar("último", cita, "plural"))

  return {
    /** El título, el subtítulo y el botón de arriba de la página. */
    pagina: {
      /** "Clientes" / "Pacientes". */
      titulo: conMayuscula(cliente.plural),
      /** "1 cliente registrado" / "12 clientes registrados" / "0 pacientes registrados". */
      subtitulo: (total: number): string => `${cantidadDe(total, cliente)} ${concordar("registrado", cliente, numeroDe(total))}`,
      /** El botón de arriba y el título del formulario: "Nuevo cliente" / "Nuevo paciente". */
      nuevo: conMayuscula(nuevo.singular),
      /** El nombre accesible de las vistas: "Qué clientes ver". */
      queVer: `Qué ${cliente.plural} ver`,
      vistas: {
        /** "Todos" / "Todas": todos los clientes. */
        todos: conMayuscula(concordar("todo", cliente, "plural")),
        seVan: "Se están yendo",
      },
    },

    /** La lista y su buscador. */
    lista: {
      cargando: `Cargando ${cliente.plural}...`,
      sinResultados: `No se encontraron ${cliente.plural}`,
      /** "Intenta cambiar los filtros o agrega un nuevo cliente". */
      sinResultadosAyuda: `Intenta cambiar los filtros o agrega ${un(nuevo)}`,
      /** La etiqueta del buscador, para el lector de pantalla: "Buscar clientes". */
      buscar: `Buscar ${cliente.plural}`,
      /** "Cómo ver los clientes": el nombre accesible de cuadrícula y lista. */
      comoVer: `Cómo ver ${el(cliente, "plural")}`,
    },

    /** La ficha de al lado de la lista (la hoja con el contacto y las notas). */
    ficha: {
      /** "Ficha del cliente" / "Ficha del paciente". */
      antetitulo: `Ficha ${del(cliente)}`,
      /** "Datos del cliente": el nombre accesible del bloque de contacto. */
      datos: `Datos ${del(cliente)}`,
      /** "Eliminar cliente" / "Eliminar paciente". */
      eliminar: `Eliminar ${cliente.singular}`,
      /** "Agregar notas sobre el cliente...". */
      notasPlaceholder: `Agregar notas sobre ${el(cliente)}...`,
      /** "Sin inasistencias" / "1 vez no vino" / "3 veces no asistió". */
      inasistencias: (cantidad: number): string =>
        cantidad === 0
          ? "Sin inasistencias"
          : `${cantidad === 1 ? "1 vez" : `${cantidad} veces`} ${etiquetas.noVino.toLocaleLowerCase("es-CL")}`,
      /** "Próxima cita" / "Próxima hora": lo que sigue a la fecha relativa, "En 3 días". */
      proxima: `${conMayuscula(concordar("próximo", cita))} ${cita.singular}`,
      /** El botón que abre la agenda con la reserva nueva: "Agendar cita" / "Agendar hora". */
      agendar: `Agendar ${cita.singular}`,
      /** El título del historial: "Últimas citas"; en un salón, "Últimas horas agendadas" ("Últimas horas" se lee como reloj). */
      historial: seLlamaHora(cita) ? `${ultimas} ${cita.plural} ${agendadas}` : `${ultimas} ${cita.plural}`,
      /** El historial vacío: "Sin citas registradas"; en un salón, "Sin horas agendadas". */
      sinHistorial: `Sin ${cita.plural} ${seLlamaHora(cita) ? agendadas : concordar("registrado", cita, "plural")}`,
    },

    /** Eliminar al cliente: la confirmación y el aviso de después. */
    eliminar: {
      boton: `Eliminar ${cliente.singular}`,
      /** "Sus citas y cobros siguen en la agenda y en los reportes, a nombre de "Cliente eliminado"." */
      listo: (nombre: string): string =>
        `Se eliminaron los datos de ${nombre}. ${conMayuscula(susCitas)} y cobros siguen en la agenda y en los reportes, a nombre de "Cliente eliminado".`,
      /** Lo que se borra; termina diciendo dónde deja de aparecer. */
      seBorra: `Su nombre, correo, teléfono, cédula, notas y etiquetas; su nombre en cada cobro, que pasa a decir “Cliente eliminado”; y las notas y comentarios de ${susCitas} y atenciones. Deja de aparecer en ${conMayuscula(cliente.plural)} y en los buscadores.`,
      /** Lo que queda: las reservas y los cobros, con las palabras del rubro. */
      queda: `${conMayuscula(susCitas)} y sus cobros, con sus fechas, ${servicio.plural}, ${profesional.plural} y montos, para que la agenda y los reportes sumen lo mismo.`,
    },

    /** El formulario del cliente nuevo o editado. */
    formulario: {
      /** "Nuevo cliente" / "Editar cliente". */
      titulo: (editando: boolean): string => (editando ? `Editar ${cliente.singular}` : conMayuscula(nuevo.singular)),
      /** "Nombre del cliente" / "Nombre del paciente". */
      nombre: `Nombre ${del(cliente)}`,
      /** "Guardar cliente" / "Guardar cambios". */
      guardar: (editando: boolean): string => (editando ? "Guardar cambios" : `Guardar ${cliente.singular}`),
    },

    /** Descargar las planillas. */
    exportar: {
      /** "Clientes" / "Pacientes": el título del bloque. */
      titulo: conMayuscula(cliente.plural),
      /** "Todos los clientes del negocio, con sus datos de contacto y notas." */
      descripcion: `${conMayuscula(todos(cliente))} ${del(negocio)}, con sus datos de contacto y notas.`,
      descargar: `Descargar ${cliente.plural}`,
      /** "Cada visita al local entre dos días, con sus servicios, quién atendió y lo cobrado. Hasta un año." */
      atenciones: `Cada visita ${al(elLocal(palabras))} entre dos días, con sus ${servicio.plural}, quién atendió y lo cobrado. Hasta un año.`,
    },

    /** "Se están yendo" (#76). */
    seVan: {
      /** Quiénes aparecen y qué pasa al escribirles. */
      descripcion: (diasOculto: string): string =>
        `${conMayuscula(cliente.plural)} que no vienen hace al menos una vez y media lo que suelen tardar, y no tienen hora. Al tocar “Escribirle” se abre tu WhatsApp o tu correo con un mensaje listo para cambiar, y ${el(cliente)} sale de esta lista por ${diasOculto}.`,
      cargando: `Cargando ${cliente.plural} que se están yendo...`,
      /** El vacío: "Aparecen acá los clientes con al menos 3 visitas, o cuyo último servicio tiene una frecuencia, cuando se atrasan." */
      vacio: `Aparecen acá ${el(cliente, "plural")} con al menos 3 visitas, o ${concordar("cuyo", servicio)} ${concordar("último", servicio)} ${servicio.singular} tiene una frecuencia, cuando se atrasan.`,
      /** "(según el servicio)" / "(según la prestación)": de dónde sale cada cuánto vuelve. */
      segunElServicio: `(según ${el(servicio)})`,
    },

    /** Importar clientes desde un CSV. */
    importar: {
      /** "Importar clientes": el título, el botón y el enlace de vuelta (con mayúscula). */
      titulo: `Importar ${cliente.plural}`,
      volver: `Volver a ${conMayuscula(cliente.plural)}`,
      soloQuienPuede: `Sólo el dueño y el encargado pueden importar ${cliente.plural}.`,
      sinFilas: `El archivo no tiene ${cliente.plural}: le falta la cabecera o las filas.`,
      elegirLaColumna: `Elige qué columna tiene el nombre ${del(cliente, "plural")}.`,
      /** "Un CSV de hasta 2 MB y 5.000 filas, con una primera fila de títulos, o los contactos de tu teléfono (.vcf). No se crean clientes repetidos: …" */
      ayuda: (filasMaximas: string): string =>
        `Un CSV de hasta 2 MB y ${filasMaximas} filas, con una primera fila de títulos, o los contactos de tu teléfono en un archivo .vcf (en Google Contactos o iCloud: Exportar vCard). No se crean ${cliente.plural} ${concordar("repetido", cliente, "plural")}: si el teléfono o el correo ya están en Eli (o más arriba en el archivo), la fila se omite.`,
      /** El archivo no es ni CSV ni de contactos. */
      archivoNoValido: "El archivo tiene que ser un CSV (.csv) o de contactos (.vcf). Desde Excel: Guardar como → CSV.",
      /** Un .vcf sin ningún contacto con nombre. */
      sinContactos: "No encontramos contactos con nombre en el archivo.",
      /** Contactos que no se importan por no tener nombre: "1 contacto sin nombre no se importó." */
      contactosSinNombre: (cuantos: number): string =>
        cuantos === 1 ? "1 contacto sin nombre no se importó." : `${cuantos} contactos sin nombre no se importaron.`,
      /** Sin columna de consentimiento: "los clientes importados quedan sin consentimiento…". */
      sinConsentimiento: `Sin una columna de “Acepta WhatsApp”, ${el(cliente, "plural")} ${concordar("importado", cliente, "plural")} quedan sin consentimiento para recibir mensajes.`,
      resumen: {
        /** "Se creó 1 cliente." / "Se crearon 12 clientes." / "No se creó ningún cliente." */
        resultado: (creados: number): string =>
          creados > 0
            ? `Se ${creados === 1 ? "creó" : "crearon"} ${cuantos(creados, cliente)}.`
            : `No se creó ${ningun(cliente)}.`,
        /** Los rótulos de las tres cifras; concuerdan con el cliente: "Creados" / "Omitidos por duplicado". */
        creados: conMayuscula(concordar("creado", cliente, "plural")),
        omitidos: `${conMayuscula(concordar("omitido", cliente, "plural"))} por duplicado`,
        conErrores: "Con errores",
      },
    },

    /** Lo que dicen los pedidos al servidor cuando algo falla, con las palabras del rubro. */
    errores: {
      cargarClientes: `No se pudieron cargar ${el(cliente, "plural")}`,
      crearCliente: `No se pudo crear ${el(cliente)}`,
      guardarCliente: `No se pudo guardar ${el(cliente)}`,
      eliminarCliente: `No se pudo eliminar ${el(cliente)}`,
      descargarPlanilla: `No se pudo descargar la planilla de ${cliente.plural}`,
      cargarLosQueSeVan: `No se pudo cargar la lista de ${cliente.plural} que se están yendo`,
    },
  }
}
