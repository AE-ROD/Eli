/**
 * Las frases del Tablero con las palabras del rubro (`vocabularioDe(rubro)
 * .palabras`, `lib/vocabulario.ts`) y la concordancia de `lib/concordancia.ts`:
 * "Tablero" en un salón, "Sala de espera" en una clínica dental;
 * "Servicios" en un salón y "Prestaciones" en una clínica; "No vino" y "No
 * asistió"; "Sin estilista asignada" y "Sin odontólogo asignado".
 *
 * Es lógica sin pantalla: las pantallas piden las frases con
 * `frasesDelTablero(palabras)` y no pegan un artículo, un pronombre ni un
 * adjetivo a ninguna palabra del vocabulario. Un rubro desconocido o `null`
 * recibe las palabras neutras, y con ellas los textos de siempre, sin un cambio.
 *
 * Lo que NO cambia con el rubro: "Reservas de hoy" (la reserva es el acto de
 * reservar, no la cita), "Turno" (el número de la fila virtual), "Equipo",
 * "Sin %" y "Comisiones". "hora" aparece sólo como reloj ("a las 10:00").
 */

import { al, concordar, del, el, pronombreDe, un } from "@/lib/concordancia"
import { conMayuscula, type PalabrasDelRubro, type Sustantivo } from "@/lib/vocabulario"

/**
 * "los" / "las": el artículo (o el pronombre) en plural de la palabra, sin la
 * palabra, para "los de tus compañeros" o "que las cargue". Coincide con el
 * pronombre en plural, así que sale de `pronombreDe` y sigue al género.
 */
const losDe = (sustantivo: Sustantivo): string => `${pronombreDe(sustantivo)}s`

/** Lo que dice cada tipo de línea del editor: un servicio o un producto. */
export interface FrasesDeUnaLinea {
  /** La etiqueta del campo y el comienzo del título para el lector de pantalla: "Servicio" / "Prestación" / "Producto". */
  titulo: string
  /** La opción vacía del selector: "Elegir servicio" / "Elegir prestación" / "Elegir producto". */
  elegir: string
  /** El botón de quitar, para el lector de pantalla: "Quitar el servicio 2" / "Quitar la prestación 2". */
  quitar: (numero: number) => string
  /** Lo que sigue a «X» cuando no está en el catálogo: "elige otro" / "elige otra". */
  eligeOtro: string
}

export function frasesDelTablero(palabras: PalabrasDelRubro) {
  const { cliente, profesional, servicio, tablero, etiquetas } = palabras
  const losServicios = el(servicio, "plural")
  const sinServicios = `Sin ${servicio.plural} todavía.`

  const linea = (deProducto: boolean): FrasesDeUnaLinea =>
    deProducto
      ? {
          titulo: "Producto",
          elegir: "Elegir producto",
          quitar: (numero) => `Quitar el producto ${numero}`,
          eligeOtro: "elige otro",
        }
      : {
          titulo: conMayuscula(servicio.singular),
          elegir: `Elegir ${servicio.singular}`,
          quitar: (numero) => `Quitar ${el(servicio)} ${numero}`,
          eligeOtro: `elige ${concordar("otro", servicio)}`,
        }

  return {
    /** El título de la página y el antetítulo de los modales: "Tablero" / "Sala de espera". */
    titulo: conMayuscula(tablero.singular),
    /** Lo que lee el lector de pantalla mientras carga: "Cargando el tablero…" / "Cargando la sala de espera…". */
    cargando: `Cargando ${el(tablero)}…`,
    /** El aviso de lo que quedó viejo: "La atención cambió; se recargó el tablero." */
    avisoDeCambio: `La atención cambió; se recargó ${el(tablero)}.`,
    /** El mensaje del servidor sobre algo que cambió, seguido de que se recargó. */
    conRecarga: (mensaje: string): string => `${mensaje.replace(/\.$/, "")}. Se recargó ${el(tablero)}.`,
    /** Cuando la recarga automática falla: "No se pudo actualizar el tablero: …". */
    noSePudoActualizar: (motivo: string): string => `No se pudo actualizar ${el(tablero)}: ${motivo}. Se vuelve a intentar solo.`,
    /** Cuando el tope de lo que se muestra de una vez deja atenciones afuera. */
    hayMasAtenciones: `Hay más atenciones de las que ${el(tablero)} muestra de una vez: algunas no se ven.`,

    /** La reserva que no llegó: el botón y el nombre accesible, "No vino" / "No asistió". */
    noVino: {
      boton: etiquetas.noVino,
      etiqueta: (quien: string): string => `${etiquetas.noVino}: ${quien}`,
    },

    /** "Sin cliente" / "Sin paciente": la reserva o la atención sin ficha. */
    sinCliente: `Sin ${cliente.singular}`,
    /** "Sin profesional asignado" / "Sin estilista asignada" / "Sin odontólogo asignado". */
    sinProfesionalAsignado: `Sin ${profesional.singular} ${concordar("asignado", profesional)}`,

    /** La tarjeta de la atención. */
    tarjeta: {
      /** El nombre accesible de la lista de lo que se hace: "Servicios" / "Prestaciones". */
      listaDeServicios: conMayuscula(servicio.plural),
      /** Cuando todavía no se anotó nada: "Sin servicios todavía." */
      sinServicios,
      /** El botón de ícono para cambiar lo que se hizo, con el nombre accesible y el globo. */
      editarDe: (quien: string): string => `Editar ${servicio.plural} de ${quien}`,
      editarGlobo: `Editar ${servicio.plural}`,
    },

    /** El editor de lo que se hizo (el modal de servicios y el de anotar sin reserva). */
    servicios: {
      /** El título del modal: "Servicios de María González" / "Prestaciones de …". */
      deLaAtencion: (nombre: string): string => `${conMayuscula(servicio.plural)} de ${nombre}`,
      /** El título del bloque de servicios de "Anotar sin reserva". */
      titulo: conMayuscula(servicio.plural),
      /** Debajo del título del modal, para quien sólo ve lo suyo. */
      soloLosTuyos: `Ves y cambias solo tus ${servicio.plural}; ${losDe(servicio)} de tus compañeros no se tocan. Quedan a tu nombre.`,
      /** Lo que dicen los abonos de prótesis: "los" se refiere a los abonos, que no cambian de género. */
      losAbonosNoSeEditan: `No se editan aquí y guardar ${losServicios} no los cambia. Se quitan desde la tarjeta, antes de cobrar.`,
      /** "Revisa los servicios marcados." / "Revisa las prestaciones marcadas." */
      revisaLosMarcados: `Revisa ${losServicios} ${concordar("marcado", servicio, "plural")}.`,
      /** Para quien anota sin reserva y no ve todo el tablero. */
      agregaElQueVasAHacer: `Agrega ${el(servicio)} que vas a hacer: la atención queda a tu nombre.`,
      /** El total de quien sólo ve lo suyo. */
      totalDeTusServicios: `Total de tus ${servicio.plural}`,
    },

    editor: {
      linea,
      /** La opción de un servicio dado de baja que la línea todavía tiene. */
      servicioPorDefecto: conMayuscula(servicio.singular),
      /** Cuando el catálogo no tiene ninguno: "Todavía no hay servicios en el catálogo." */
      catalogoVacio: `Todavía no hay ${servicio.plural} en el catálogo.`,
      /** El enlace para quien puede configurarlos: "Agrégalos en Configuración" / "Agrégalas en Configuración". */
      agregalos: `Agréga${pronombreDe(servicio)}s en Configuración`,
      /** Para quien no puede: "…que los cargue en Configuración." */
      pideQueLosCarguen: `Pídele al dueño o al encargado que ${losDe(servicio)} cargue en Configuración.`,
      sinServicios,
      agregarServicio: `Agregar ${servicio.singular}`,
      /** La etiqueta del selector de quien atiende: "Profesional" / "Estilista" / "Odontólogo". */
      profesional: conMayuscula(profesional.singular),
      /** La opción vacía de ese selector: "Elegir profesional" / "Elegir estilista". */
      elegirProfesional: `Elegir ${profesional.singular}`,
    },

    /** El modal de "Anotar sin reserva". */
    anotar: {
      /** Debajo del título, en un rubro sin sala de espera: "Entra al tablero en espera." */
      entraEnEspera: `Entra ${al(tablero)} en espera.`,
      /** Debajo del título, donde se espera en una sala: "Queda esperando en la sala de espera." */
      quedaEsperando: `Queda esperando en ${el(tablero)}.`,
      /** El título del bloque de quien viene: "Cliente" / "Paciente". */
      cliente: conMayuscula(cliente.singular),
      /** El nombre accesible del grupo de opciones: "¿Ya es cliente?" */
      yaEsCliente: `¿Ya es ${cliente.singular}?`,
      /** La opción de quien ya está en la ficha: "Ya es cliente". */
      opcionYaEs: `Ya es ${cliente.singular}`,
      /** La opción de quien llega por primera vez: "Cliente nuevo" / "Paciente nuevo". */
      opcionNuevo: `${conMayuscula(cliente.singular)} ${concordar("nuevo", cliente)}`,
      /** La etiqueta del buscador: "Buscar cliente". */
      buscar: `Buscar ${cliente.singular}`,
      /** Lo que se anuncia al buscar: "1 cliente encontrado." / "3 clientes encontrados." */
      encontrados: (cantidad: number): string =>
        cantidad === 1
          ? `1 ${cliente.singular} ${concordar("encontrado", cliente)}.`
          : `${cantidad} ${cliente.plural} ${concordar("encontrado", cliente, "plural")}.`,
      /** Cuando la búsqueda no trae a nadie. */
      sinResultados: `No hay ${cliente.plural} con ese texto.`,
      /** El botón que pasa a escribirlo: "Anotarlo como cliente nuevo". */
      anotarComoNuevo: `Anotar${pronombreDe(cliente)} como ${cliente.singular} ${concordar("nuevo", cliente)}`,
      /** Falta elegir de la lista: "Elige un cliente de la lista, o anótalo como cliente nuevo." */
      eligeDeLaLista: `Elige ${un(cliente)} de la lista, o anóta${pronombreDe(cliente)} como ${cliente.singular} ${concordar("nuevo", cliente)}.`,
      /** Falta el nombre del nuevo: "Escribe el nombre del cliente (al menos 2 letras)." */
      escribeElNombre: (letras: number): string => `Escribe el nombre ${del(cliente)} (al menos ${letras} letras).`,
    },

    /** Los textos de cuando un pedido al servidor falla sin decir por qué. */
    errores: {
      cargarElTablero: `No se pudo cargar ${el(tablero)}`,
      buscarClientes: `No se pudieron buscar ${el(cliente, "plural")}`,
      marcarNoVino: `No se pudo marcar que ${etiquetas.noVino.toLocaleLowerCase("es")}`,
      guardarServicios: `No se pudieron guardar ${losServicios}`,
      lineasSinPorcentaje: `No se pudo saber qué ${servicio.plural} quedarán sin porcentaje de comisión`,
    },
  }
}
