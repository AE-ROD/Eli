/**
 * Las frases de Liquidaciones y del comprobante con las palabras del rubro
 * (`vocabularioDe(rubro).palabras`, `lib/vocabulario.ts`) y la concordancia de
 * `lib/concordancia.ts`: "Odontólogo" y "Paciente" en una clínica dental,
 * "Prestaciones y productos" donde otros rubros dicen "Servicios y productos",
 * "Todas" donde un salón elige entre las estilistas.
 *
 * Es lógica sin pantalla: las pantallas piden las frases con
 * `frasesDeLasLiquidaciones(palabras)` y no pegan un artículo, un pronombre ni
 * una terminación a ninguna palabra del vocabulario. Un rubro desconocido o
 * `null` recibe las palabras neutras, y con ellas los textos de siempre, sin un
 * cambio.
 *
 * Lo que NO cambia con el rubro: "Comisión" (en ningún rubro), "Equipo",
 * "Adelantos y vales", y lo propio de las prótesis ("Parte de la odontóloga":
 * la tratante es parte del reparto que decidió el dueño).
 */

import { cantidadDe, concordar, el, numeroDe } from "@/lib/concordancia"
import { formatearMonto } from "@/lib/dinero"
import { conMayuscula, vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"

/** Centavos a `$45.000`, igual que `pesos` de las piezas (que es de la pantalla). */
const pesosDe = (centavos: number) => formatearMonto(centavos / 100)

const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

/**
 * "Hay 2 servicios sin porcentaje de comisión: configúralos en Comisiones antes
 * de cerrar." Es el aviso del cierre cuando a alguna línea le falta su %. El
 * verbo concuerda con el porcentaje (que es masculino siempre), no con el
 * servicio: con una sola, "configúralo"; con varias, "configúralos".
 */
function sinPorcentajeAlCerrar(cantidad: number, servicio: PalabrasDelRubro["servicio"]): string {
  const configuralo = numeroDe(cantidad) === "singular" ? "configúralo" : "configúralos"
  return `Hay ${cantidadDe(cantidad, servicio)} sin porcentaje de comisión: ${configuralo} en Comisiones antes de cerrar.`
}

/**
 * Lo mismo que `sinPorcentajeAlCerrar`, dicho para quien no sabe dónde se
 * configura: qué falta y qué hacer, sin "configúralos". La pantalla le suma el
 * enlace a Comisiones.
 */
function sinPorcentajeEnPantalla(cantidad: number, servicio: PalabrasDelRubro["servicio"]): string {
  const ponle = numeroDe(cantidad) === "singular" ? "Ponle" : "Ponles"
  return `Hay ${cantidadDe(cantidad, servicio)} sin porcentaje de comisión. ${ponle} su porcentaje en Comisiones y vuelve a cerrar.`
}

export function frasesDeLasLiquidaciones(palabras: PalabrasDelRubro) {
  const { cliente, profesional, servicio } = palabras
  /** El servidor lo dice con las palabras neutras o con las del rubro: cualquiera de las dos es "falta el %". */
  const faltaPorcentaje = (delServidor: string | null, sinPorcentaje: number): boolean =>
    delServidor !== null &&
    sinPorcentaje > 0 &&
    (delServidor === sinPorcentajeAlCerrar(sinPorcentaje, PALABRAS_NEUTRAS.servicio) ||
      delServidor === sinPorcentajeAlCerrar(sinPorcentaje, servicio))
  const losServicios = el(servicio, "plural")
  const serviciosYProductos = `${conMayuscula(servicio.plural)} y productos`

  return {
    /** Debajo del título de la página de Liquidaciones. */
    subtitulo: `Lo que se le paga a cada ${profesional.singular} por período.`,

    /** "Profesional" / "Estilista" / "Odontólogo": el filtro del historial y el dato del comprobante. */
    profesional: conMayuscula(profesional.singular),
    /** La opción que no filtra: "Todos" / "Todas", según el género de quien atiende. */
    todosLosProfesionales: conMayuscula(concordar("todo", profesional, "plural")),
    /** "Cliente" / "Paciente": el encabezado de la columna. */
    cliente: conMayuscula(cliente.singular),

    /** La vista previa del cierre. */
    vistaPrevia: {
      /** "Servicios y productos (3)". */
      lineas: (cantidad: number): string => `${serviciosYProductos} (${cantidad})`,
      /** "Comisión por servicios" / "Comisión por prestaciones". */
      comisionPorServicios: `Comisión por ${servicio.plural}`,
      /** El aviso que frena el cierre, con las palabras del rubro. */
      sinPorcentaje: (cantidad: number): string => sinPorcentajeAlCerrar(cantidad, servicio),
      /**
       * Lo que impide cerrar, tal como lo dijo el servidor. El servidor ya lo
       * dice con las palabras del rubro de la sesión; si llegara con las de
       * siempre (una respuesta armada sin rubro), se dice con las del rubro.
       * Cualquier otro motivo ("Este período todavía no empieza") no nombra al
       * servicio y queda como llegó.
       */
      motivoParaNoCerrar: (delServidor: string | null, sinPorcentaje: number): string | null =>
        faltaPorcentaje(delServidor, sinPorcentaje) ? sinPorcentajeEnPantalla(sinPorcentaje, servicio) : delServidor,
      /** El motivo es que faltan porcentajes: la pantalla suma el enlace a Comisiones. */
      faltaPorcentaje: (delServidor: string | null, sinPorcentaje: number): boolean =>
        faltaPorcentaje(delServidor, sinPorcentaje),
      /** El enlace del aviso: Comisiones no tiene ancla por persona, así que se dice a quién buscar. */
      irAComisiones: (nombre: string): string => `Ir a Comisiones (busca la tarjeta de ${nombre})`,
      /**
       * El resumen grande de arriba: "Le pagas $45.000 a Ana". Con el total en
       * contra no se puede cerrar, y se dice así.
       */
      resumen: (totalCents: number, nombre: string): string =>
        totalCents >= 0 ? `Le pagas ${pesosDe(totalCents)} a ${nombre}` : `${nombre} queda debiendo ${pesosDe(-totalCents)}`,
    },

    /** El comprobante. */
    comprobante: {
      /** El título de la sección de líneas. */
      serviciosYProductos,
      /** Cuando la liquidación no tiene ninguna línea. */
      noIncluye: `No incluye ${servicio.plural} ni productos.`,
      /** En una anulada: lo que incluía volvió a quedar pendiente. */
      anuladaSinLineas: (conProtesis: boolean, conPropinas: boolean): string =>
        `Anulada: ${losServicios}, productos${conProtesis ? ", abonos de prótesis" : ""}${conPropinas ? ", propinas" : ""} y movimientos que incluía volvieron a quedar pendientes para la próxima liquidación.`,
      comisionPorServicios: `Comisión por ${servicio.plural}`,
    },

    /** El modal de anular una liquidación. */
    anular: {
      descripcion: (conProtesis: boolean, conPropinas: boolean): string =>
        `${conMayuscula(losServicios)}${conProtesis ? ", abonos de prótesis" : ""}${conPropinas ? ", propinas" : ""} y movimientos que incluía vuelven a quedar pendientes para la próxima. Lo que se congeló al cerrarla sigue congelado.`,
    },
  }
}
