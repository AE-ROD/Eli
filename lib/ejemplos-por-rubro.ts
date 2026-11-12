import type { RubroId } from "./rubros"

/**
 * Los ejemplos que las pantallas ponen de `placeholder` ("Ej.: Corte,
 * Coloración..."), según el rubro del negocio. Única fuente de verdad: antes
 * cada pantalla escribía los suyos y una barbería leía "Manicura", un salón de
 * uñas "Colorista" y una clínica dental "Shampoo".
 *
 * Son sólo texto de ayuda dentro de un campo vacío. No se guardan, no se
 * validan y no cambian lo que hace ninguna pantalla; los servicios con que
 * nace un negocio son otra cosa (`lib/servicios-de-ejemplo.ts`).
 *
 * Un rubro desconocido, vacío o ausente (una sesión de antes del rubro, o los
 * viejos `salud`, `fitness` y `otro`) recibe ejemplos neutros, que no nombran
 * ningún oficio.
 */
export interface EjemplosDelRubro {
  /** Nombres de servicio (o de motivo, en una clínica dental). */
  servicios: string[]
  /** Categorías con que se agrupan los servicios en la página pública. */
  categorias: string[]
  /** Lo que se escribe bajo el nombre de quien atiende, en "Equipo". */
  especialidad: string
  /** El nombre del negocio, tal como se escribiría en el registro. */
  negocio: string
  /** Un usuario de Instagram. */
  instagram: string
  /** Nombres de producto del catálogo. */
  productos: string[]
}

const EJEMPLOS_POR_RUBRO: Record<RubroId, EjemplosDelRubro> = {
  salon: {
    servicios: ["Corte", "Coloración", "Retoque de raíz", "Alisado"],
    categorias: ["Corte", "Color", "Tratamientos"],
    especialidad: "Colorista",
    negocio: "Salón María",
    instagram: "@tu.negocio",
    productos: ["Shampoo", "Mascarilla"],
  },
  barberia: {
    servicios: ["Corte", "Perfilado de barba", "Corte y barba"],
    categorias: ["Corte", "Barba", "Corte y barba"],
    especialidad: "Degradados",
    negocio: "Barbería Don Pedro",
    instagram: "@tu.negocio",
    productos: ["Cera para el pelo", "Aceite para barba"],
  },
  "spa-de-unas": {
    servicios: ["Manicure", "Esmaltado permanente", "Retoque", "Relleno"],
    categorias: ["Manos", "Pies", "Extras"],
    especialidad: "Uñas acrílicas",
    negocio: "Salón de uñas Carla",
    instagram: "@tu.negocio",
    productos: ["Esmalte", "Aceite de cutículas"],
  },
  odontologia: {
    servicios: ["Limpieza", "Control", "Extracción", "Urgencia"],
    categorias: ["Prevención", "Endodoncia", "Urgencias"],
    especialidad: "Endodoncista",
    negocio: "Clínica Dental Sonrisa",
    instagram: "@tu.clinica",
    productos: ["Pasta dental", "Cepillo de dientes"],
  },
}

/** Para cualquier rubro que no tenga los suyos: nada que suene a un oficio. */
const EJEMPLOS_NEUTROS: EjemplosDelRubro = {
  servicios: ["Consulta", "Sesión", "Evaluación"],
  categorias: ["Consultas", "Sesiones", "Extras"],
  especialidad: "Atención de niños",
  negocio: "Mi negocio",
  instagram: "@tu.negocio",
  productos: ["Crema", "Aceite"],
}

/**
 * Los ejemplos del rubro. Recibe `unknown` porque el rubro sale de una sesión
 * que puede traer cualquier cosa, y compara con el id exacto (`Object.hasOwn`,
 * no un índice directo): `constructor` o `__proto__` no son un rubro y caen a
 * los neutros. Copia nueva en cada llamada: quien la recibe no cambia la de los
 * demás.
 */
export function ejemplosDe(rubro: unknown): EjemplosDelRubro {
  const ejemplos =
    typeof rubro === "string" && Object.hasOwn(EJEMPLOS_POR_RUBRO, rubro)
      ? EJEMPLOS_POR_RUBRO[rubro as RubroId]
      : EJEMPLOS_NEUTROS
  return {
    ...ejemplos,
    servicios: [...ejemplos.servicios],
    categorias: [...ejemplos.categorias],
    productos: [...ejemplos.productos],
  }
}

/**
 * El texto de un `placeholder` con ejemplos: una lista ("Ej.: Corte, Color...")
 * o un único valor ("Ej.: Colorista"). La lista termina en puntos suspensivos
 * porque hay más que decir; el valor único, no.
 */
export function textoDeEjemplo(ejemplos: string | readonly string[]): string {
  return typeof ejemplos === "string" ? `Ej.: ${ejemplos}` : `Ej.: ${ejemplos.join(", ")}...`
}
