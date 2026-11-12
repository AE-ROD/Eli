import { esRubroDental, RUBRO_DENTAL, type RubroId } from "@/lib/rubros"

/**
 * El género gramatical de un sustantivo. Sólo hay dos porque la interfaz no
 * necesita más: el español no usa un tercer género con sustantivos comunes, y
 * así `lib/concordancia.ts` nunca tiene que decidir qué hacer con uno que no
 * conoce.
 */
export type Genero = "m" | "f"

/**
 * Una palabra de la interfaz con lo que hace falta para concordar con ella:
 * cómo se escribe en singular, en plural y de qué género es.
 *
 * Todo va en minúscula, como va en medio de una frase; para un título o un
 * menú, `conMayuscula`. El plural viene escrito en los datos y no se calcula:
 * en español no es una regla mecánica ("salón" → "salones", "vez" → "veces",
 * "sala de espera" → "salas de espera", "salón de uñas" → "salones de uñas"),
 * y un pluralizador sería código que puede fallar donde un dato escrito a
 * mano no falla.
 *
 * El artículo, el demostrativo y los adjetivos que van con ella los pone
 * `lib/concordancia.ts` a partir del género.
 */
export interface Sustantivo {
  singular: string
  plural: string
  genero: Genero
}

/**
 * Las palabras del rubro, cada una con su género y su número. Es lo que usan
 * las pantallas para escribir "una estilista", "ningún paciente" o "la sala de
 * espera" con concordancia (`lib/concordancia.ts`) en vez de pegar un artículo
 * a una cadena.
 */
export interface PalabrasDelRubro {
  /** Quien se atiende: cliente / paciente. */
  cliente: Sustantivo
  /** Quien atiende: estilista / barbero / manicurista / odontólogo / profesional. */
  profesional: Sustantivo
  /** Lo que se atiende y se cobra, en el panel: servicio / prestación. */
  servicio: Sustantivo
  /** Lo que elige quien reserva en la reserva pública: servicio / motivo. */
  servicioDeLaReserva: Sustantivo
  /** La reserva, en el panel: hora / cita. */
  cita: Sustantivo
  /**
   * La reserva, en lo que lee quien reserva (la reserva pública y los
   * correos): hora / cita. En la clínica dental el panel dice "cita" pero
   * quien reserva lee "hora", por eso son dos palabras distintas.
   */
  citaParaElCliente: Sustantivo
  /** Qué es el negocio: salón / barbería / salón de uñas / clínica / negocio. */
  negocio: Sustantivo
  /** La sección de quienes ya llegaron: tablero / sala de espera. */
  tablero: Sustantivo
  /** La primera visita de alguien: primera vez / primera consulta. */
  primeraVez: Sustantivo
  /**
   * Dos etiquetas que se muestran tal cual, ya escritas (con su mayúscula
   * inicial): no son un sustantivo que concuerde con nada.
   */
  etiquetas: {
    /** Quien tenía hora y no llegó: "No vino" / "No asistió". */
    noVino: string
    /** El aviso de que le toca volver: "Te toca volver" / "Control". */
    seguimiento: string
  }
}

/**
 * Las palabras de la interfaz que cambian con el rubro (docs/PRODUCTO.md,
 * sección 1, "Vocabulario"). Cada rubro habla con las suyas: el salón, la
 * barbería y el salón de uñas con palabras propias ("estilista", "barbero",
 * "manicurista"), la clínica dental como una clínica ("pacientes", "sala de
 * espera", "odontólogo", "motivo"). Un rubro desconocido o ninguno (una sesión
 * de antes del rubro, o los viejos `salud`, `fitness` y `otro`) usa las
 * palabras neutras, así que en un negocio sin rubro conocido no aparece nunca
 * "paciente" ni "estilista".
 *
 * Lo nuevo es `palabras`: cada palabra con su género y su número, para que la
 * interfaz concuerde ("una estilista", "ninguna manicurista", "al paciente").
 * Las seis cadenas sueltas de antes se conservan, con los mismos valores,
 * mientras las pantallas se migran de a poco a `palabras`.
 *
 * El rubro sale de la sesión (`session.user.rubro`) o del negocio
 * (`Business.type`). Qué se muestra o no lo decide `lib/permisos.ts`; esto
 * sólo cambia palabras.
 */
export interface Vocabulario {
  /**
   * "clientes" / "pacientes": la sección y la lista.
   * @deprecated Se retira en la última oleada, cuando todas las pantallas usen `palabras`: usa `palabras.cliente.plural`.
   */
  clientes: string
  /**
   * "cliente" / "paciente".
   * @deprecated Se retira en la última oleada, cuando todas las pantallas usen `palabras`: usa `palabras.cliente.singular`.
   */
  cliente: string
  /**
   * "tablero" / "sala de espera": la sección de quienes ya llegaron. Cuidado
   * con el artículo: "el tablero", pero "la sala de espera".
   * @deprecated Se retira en la última oleada, cuando todas las pantallas usen `palabras`: usa `palabras.tablero` con `lib/concordancia.ts`.
   */
  tablero: string
  /**
   * "profesional" / "odontólogo": quien atiende. Sigue diciendo "profesional"
   * en el salón, la barbería y el salón de uñas, que ya tienen su palabra en
   * `palabras.profesional`.
   * @deprecated Se retira en la última oleada, cuando todas las pantallas usen `palabras`: usa `palabras.profesional.singular`.
   */
  profesional: string
  /**
   * "profesionales" / "odontólogos".
   * @deprecated Se retira en la última oleada, cuando todas las pantallas usen `palabras`: usa `palabras.profesional.plural`.
   */
  profesionales: string
  /**
   * "servicio" / "motivo": lo que se elige en la reserva pública.
   * @deprecated Se retira en la última oleada, cuando todas las pantallas usen `palabras`: usa `palabras.servicioDeLaReserva.singular`.
   */
  servicioDeLaReserva: string
  /** Las palabras con género y número, para escribir con concordancia. */
  palabras: PalabrasDelRubro
}

/** Las seis cadenas de siempre: lo que `Vocabulario` tenía antes de `palabras`. */
type CadenasSueltas = Omit<Vocabulario, "palabras">

const DE_SIEMPRE: CadenasSueltas = {
  clientes: "clientes",
  cliente: "cliente",
  tablero: "tablero",
  profesional: "profesional",
  profesionales: "profesionales",
  servicioDeLaReserva: "servicio",
}

const DE_LA_CLINICA_DENTAL: CadenasSueltas = {
  clientes: "pacientes",
  cliente: "paciente",
  tablero: "sala de espera",
  profesional: "odontólogo",
  profesionales: "odontólogos",
  servicioDeLaReserva: "motivo",
}

/**
 * Los ids de los rubros que tienen palabras propias. Cada uno lleva
 * `satisfies RubroId`: si el catálogo (`lib/rubros.ts`) cambia un id, esto deja
 * de compilar en vez de dejar al rubro hablando como uno desconocido.
 */
const ID_DEL_SALON = "salon" satisfies RubroId
const ID_DE_LA_BARBERIA = "barberia" satisfies RubroId
const ID_DEL_SALON_DE_UNAS = "spa-de-unas" satisfies RubroId

/*
 * Las tablas de palabras con género y número. Los datos salen de la
 * investigación de vocabulario del dueño (noviembre de 2026).
 *
 * Cada tabla es una función y no una constante a propósito: construye objetos
 * nuevos en cada llamada, así que quien recibe las palabras puede cambiarlas
 * sin tocar las de los demás (copia profunda sin copiar nada a mano).
 */

/**
 * Salón de belleza. Confianza Media: `tablero`. Las demás filas se tomaron tal
 * cual de la investigación. Barbería y salón de uñas parten de esta tabla y
 * cambian lo suyo.
 */
function palabrasDelSalon(): PalabrasDelRubro {
  return {
    cliente: { singular: "cliente", plural: "clientes", genero: "m" },
    profesional: { singular: "estilista", plural: "estilistas", genero: "f" },
    servicio: { singular: "servicio", plural: "servicios", genero: "m" },
    servicioDeLaReserva: { singular: "servicio", plural: "servicios", genero: "m" },
    cita: { singular: "hora", plural: "horas", genero: "f" },
    citaParaElCliente: { singular: "hora", plural: "horas", genero: "f" },
    negocio: { singular: "salón", plural: "salones", genero: "m" },
    tablero: { singular: "tablero", plural: "tableros", genero: "m" },
    primeraVez: { singular: "primera vez", plural: "primeras veces", genero: "f" },
    etiquetas: { noVino: "No vino", seguimiento: "Te toca volver" },
  }
}

/**
 * Barbería: como el salón, salvo quien atiende ("barbero") y el negocio
 * ("barbería", femenino). Confianza Media: `tablero` (heredado del salón).
 */
function palabrasDeLaBarberia(): PalabrasDelRubro {
  return {
    ...palabrasDelSalon(),
    profesional: { singular: "barbero", plural: "barberos", genero: "m" },
    negocio: { singular: "barbería", plural: "barberías", genero: "f" },
  }
}

/**
 * Salón de uñas: como el salón, salvo quien atiende ("manicurista") y el
 * negocio ("salón de uñas", donde sólo "salón" se pluraliza). Confianza Media:
 * `tablero` (heredado del salón).
 */
function palabrasDelSalonDeUnas(): PalabrasDelRubro {
  return {
    ...palabrasDelSalon(),
    profesional: { singular: "manicurista", plural: "manicuristas", genero: "f" },
    negocio: { singular: "salón de uñas", plural: "salones de uñas", genero: "m" },
  }
}

/**
 * Clínica dental. Confianza Media: `servicio` → "prestación", `noVino` → "No
 * asistió", `seguimiento` → "Control" y `tablero` → "sala de espera". Las
 * demás filas se tomaron tal cual de la investigación. En el panel la reserva
 * es una "cita", pero quien reserva lee "hora" (`citaParaElCliente`).
 */
function palabrasDeLaClinicaDental(): PalabrasDelRubro {
  return {
    cliente: { singular: "paciente", plural: "pacientes", genero: "m" },
    profesional: { singular: "odontólogo", plural: "odontólogos", genero: "m" },
    servicio: { singular: "prestación", plural: "prestaciones", genero: "f" },
    servicioDeLaReserva: { singular: "motivo", plural: "motivos", genero: "m" },
    cita: { singular: "cita", plural: "citas", genero: "f" },
    citaParaElCliente: { singular: "hora", plural: "horas", genero: "f" },
    negocio: { singular: "clínica", plural: "clínicas", genero: "f" },
    tablero: { singular: "sala de espera", plural: "salas de espera", genero: "f" },
    primeraVez: { singular: "primera consulta", plural: "primeras consultas", genero: "f" },
    etiquetas: { noVino: "No asistió", seguimiento: "Control" },
  }
}

/**
 * Las palabras neutras, para cualquier rubro que no tenga las suyas: uno
 * desconocido, vacío, `null`, `undefined` y los viejos `salud`, `fitness` y
 * `otro`. Confianza Media: `tablero`. Las demás filas se tomaron tal cual de la
 * investigación.
 */
function palabrasNeutras(): PalabrasDelRubro {
  return {
    cliente: { singular: "cliente", plural: "clientes", genero: "m" },
    profesional: { singular: "profesional", plural: "profesionales", genero: "m" },
    servicio: { singular: "servicio", plural: "servicios", genero: "m" },
    servicioDeLaReserva: { singular: "servicio", plural: "servicios", genero: "m" },
    cita: { singular: "cita", plural: "citas", genero: "f" },
    citaParaElCliente: { singular: "cita", plural: "citas", genero: "f" },
    negocio: { singular: "negocio", plural: "negocios", genero: "m" },
    tablero: { singular: "tablero", plural: "tableros", genero: "m" },
    primeraVez: { singular: "primera vez", plural: "primeras veces", genero: "f" },
    etiquetas: { noVino: "No vino", seguimiento: "Te toca volver" },
  }
}

/**
 * Las palabras con género para el rubro. Compara con el id exacto (`switch`
 * usa `===`) y no busca en un objeto indexado por rubro, como `nombreDeRubro`:
 * un rubro como `constructor` o `__proto__` no puede traer otra cosa que las
 * palabras neutras. Recibe `unknown` porque el rubro viene de una sesión que
 * puede traer cualquier cosa.
 */
function palabrasDe(rubro: unknown): PalabrasDelRubro {
  switch (rubro) {
    case ID_DEL_SALON:
      return palabrasDelSalon()
    case ID_DE_LA_BARBERIA:
      return palabrasDeLaBarberia()
    case ID_DEL_SALON_DE_UNAS:
      return palabrasDelSalonDeUnas()
    case RUBRO_DENTAL:
      return palabrasDeLaClinicaDental()
    default:
      return palabrasNeutras()
  }
}

/**
 * El vocabulario del rubro: las seis cadenas de siempre y, en `palabras`, las
 * mismas ideas con género y número. Las cadenas sueltas se eligen con
 * `esRubroDental` (id exacto, como las palabras) y valen lo mismo que antes
 * para todos los rubros. Copia nueva y profunda en cada llamada: quien la
 * recibe no cambia la de los demás.
 */
export function vocabularioDe(rubro: string | null | undefined): Vocabulario {
  return {
    ...(esRubroDental(rubro) ? DE_LA_CLINICA_DENTAL : DE_SIEMPRE),
    palabras: palabrasDe(rubro),
  }
}

/** "sala de espera" → "Sala de espera": para títulos, menús y comienzos de frase. */
export function conMayuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase("es-CL") + texto.slice(1)
}
