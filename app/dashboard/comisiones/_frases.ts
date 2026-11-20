/**
 * Las frases de Comisiones con las palabras del rubro (`vocabularioDe(rubro)
 * .palabras`, `lib/vocabulario.ts`) y la concordancia de `lib/concordancia.ts`:
 * "Excepciones por prestación" en una clínica dental, "Esta estilista" donde
 * antes se pegaba un "este" a una cadena.
 *
 * Es lógica sin pantalla: las pantallas piden las frases con
 * `frasesDeLasComisiones(palabras)` y no pegan un artículo, un demostrativo ni
 * una terminación a ninguna palabra del vocabulario. Un rubro desconocido o
 * `null` recibe las palabras neutras, y con ellas los textos de siempre, sin un
 * cambio.
 *
 * Lo que NO cambia con el rubro: "Comisión" y "Comisiones" (decisión del dueño,
 * en ningún rubro), "Equipo", "Productos" y lo propio de las prótesis ("la
 * tratante", "la clínica" y "el laboratorio" son las tres partes del reparto).
 */

import { cantidadDe, concordar, el, ese, este, numeroDe, pronombreDe, un } from "@/lib/concordancia"
import { deCentavos } from "@/lib/atenciones"
import { formatearMonto } from "@/lib/dinero"
import { repartirMonto, type RepartoEnPuntosBase } from "@/lib/protesis"
import { conMayuscula, type PalabrasDelRubro } from "@/lib/vocabulario"

/** El monto del ejemplo del reparto cuando no hay un precio a mano: $100.000. */
export const MONTO_DEL_EJEMPLO_CENTS = 100_000_00

/**
 * El reparto dicho en pesos, con la misma función que reparte de verdad
 * (`repartirMonto`, sin la regla de la dueña tratante): "Ejemplo: de $100.000
 * cobrados, tratante $40.000, clínica $40.000 y laboratorio $20.000.". Un monto
 * que no es positivo usa el de ejemplo.
 */
export function ejemploDelReparto(reparto: RepartoEnPuntosBase, montoCents: number = MONTO_DEL_EJEMPLO_CENTS): string {
  const monto = Number.isSafeInteger(montoCents) && montoCents > 0 ? montoCents : MONTO_DEL_EJEMPLO_CENTS
  const partes = repartirMonto(monto, reparto, false)
  const pesos = (centavos: number) => formatearMonto(deCentavos(centavos))
  return `Ejemplo: de ${pesos(monto)} cobrados, tratante ${pesos(partes.odontologoCents)}, clínica ${pesos(partes.clinicaCents)} y laboratorio ${pesos(partes.tecnicoCents)}.`
}

export function frasesDeLasComisiones(palabras: PalabrasDelRubro) {
  const { cliente, profesional, servicio, negocio } = palabras
  // "todos sus servicios" / "todas sus prestaciones": el "sus" no cambia, el "todos", sí.
  const todosSusServicios = `${concordar("todo", servicio, "plural")} sus ${servicio.plural}`

  return {
    /** La línea de arriba de la página: qué es el %. */
    queEsElPorcentaje: `El % es lo que se lleva cada persona de lo que cobra por ${ese(servicio)}.`,
    /** Debajo del título de la página. */
    subtitulo: `El porcentaje de cada ${profesional.singular}, por ${servicio.singular} y por producto.`,
    /** El aviso de que los pendientes no se contaron todos. */
    demasiadosPendientes: `Hay ${concordar("demasiado", servicio, "plural")} ${servicio.plural} pendientes para contar${pronombreDe(servicio)}s de una vez: los números de cada ${profesional.singular} se quedan cortos.`,

    /** La tarjeta de cada persona del equipo. */
    tarjeta: {
      /** "1 servicio ya cobrado espera un porcentaje." / "3 prestaciones ya cobradas esperan un porcentaje." */
      esperanUnPorcentaje: (cantidad: number): string =>
        `${cantidadDe(cantidad, servicio)} ya ${concordar("cobrado", servicio, numeroDe(cantidad))} ${numeroDe(cantidad) === "singular" ? "espera" : "esperan"} un porcentaje.`,
      /** Debajo del campo del % por defecto. */
      seAplicaATodos: `Se aplica a ${todosSusServicios}, salvo las excepciones de abajo. Vacío lo deja sin configurar (no es 0 %).`,
      /** "Excepciones por servicio" / "Excepciones por prestación". */
      excepcionesPor: `Excepciones por ${servicio.singular}`,
      /** Cuando no tiene ninguna. */
      sinExcepciones: `No tiene: en ${todosSusServicios} rige su % por defecto.`,
      /** La etiqueta del selector: "Servicio" / "Prestación". */
      etiquetaDelServicio: conMayuscula(servicio.singular),
      /** La opción vacía del selector: "Elige un servicio" / "Elige una prestación". */
      eligeUno: `Elige ${un(servicio)}`,
      /** Al agregar una excepción sin elegir: "Elige el servicio." / "Elige la prestación." */
      eligeElServicio: `Elige ${el(servicio)}.`,
      /** Al agregar una excepción sin porcentaje: "Escribe el porcentaje para ese servicio." / "…esa prestación." */
      escribeElPorcentaje: `Escribe el porcentaje para ${ese(servicio)}.`,
    },

    /** El historial de cambios. */
    historial: {
      /** La etiqueta del filtro: "Profesional" / "Estilista" / "Odontólogo". */
      profesional: conMayuscula(profesional.singular),
      /** El servicio de un cambio que ya no tiene nombre, para "en un servicio" / "en una prestación". */
      unServicio: un(servicio),
      /** Cuando no hay cambios, con y sin una persona elegida: "…de este profesional." / "…de esta estilista." */
      sinCambios: (deUnaPersona: boolean): string =>
        `Todavía no hay cambios de porcentaje${deUnaPersona ? ` de ${este(profesional)}` : ""}.`,
    },

    /** Clínica dental: el reparto de las prótesis, que habla de sus odontólogos y de lo que se cobra al paciente. */
    protesis: {
      /** La tarjeta de la página de Comisiones que lleva al reparto. */
      tarjeta: `Las prótesis se reparten entre la tratante, la clínica y el laboratorio, según el material. El resto de ${el(servicio, "plural")}, con el % de comisión de abajo.`,
      /** Sobre qué valor se calculan los porcentajes. */
      valorQuePaga: `El valor que paga ${el(cliente)}`,
      /** Cómo se calcula, al pie de la sección. */
      comoSeCalcula: `El resto de ${el(servicio, "plural")} sigue con el % de comisión de cada ${profesional.singular}. Lo que cambies aquí vale para las prótesis nuevas; las de antes no cambian.`,
      /** El título de la sección de excepciones. */
      excepcionesPor: `Excepciones por ${profesional.singular}`,
      /** Cuando no hay nadie a quien darle una excepción. */
      sinProfesionales: `Cuando tengas ${profesional.plural} en el equipo, aquí les puedes dar un reparto propio por material.`,
      /** Cuando nadie tiene excepción: "Todos siguen la regla de cada material." */
      todosSiguenLaRegla: `${conMayuscula(concordar("todo", profesional, "plural"))} siguen la regla de cada material.`,
      /** Al agregar una excepción. */
      mandaSobreLaRegla: `Manda sobre la regla del material para ${ese(profesional)}, en sus prótesis nuevas.`,
      /** Sin materiales todavía: "Agrega los materiales con que trabaja la clínica para poder crear prótesis." */
      agregaLosMateriales: `Agrega los materiales con que trabaja ${el(negocio)} para poder crear prótesis.`,
      /** La etiqueta del selector de la excepción. */
      etiquetaDelProfesional: conMayuscula(profesional.singular),
    },
  }
}
