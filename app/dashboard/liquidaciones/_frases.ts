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
import { conMayuscula, vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"

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

export function frasesDeLasLiquidaciones(palabras: PalabrasDelRubro) {
  const { cliente, profesional, servicio } = palabras
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
        delServidor !== null && delServidor === sinPorcentajeAlCerrar(sinPorcentaje, PALABRAS_NEUTRAS.servicio)
          ? sinPorcentajeAlCerrar(sinPorcentaje, servicio)
          : delServidor,
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
