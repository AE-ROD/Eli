import { CATALOGO, type ContextoDeAyuda, type DePalabras, type PreguntaDelCatalogo } from "@/lib/catalogo-de-preguntas"
import { esRubroDental } from "@/lib/rubros"
import type { AreaDeSoporte } from "@/lib/soporte"
import { vocabularioDe, type PalabrasDelRubro } from "@/lib/vocabulario"

/**
 * Las preguntas frecuentes del centro de ayuda (/dashboard/ayuda y /soporte),
 * agrupadas por las mismas áreas que una solicitud de soporte
 * (`lib/soporte.ts`).
 *
 * El texto de cada pregunta vive en `lib/catalogo-de-preguntas.ts`, escrito
 * con las palabras del rubro. Acá se resuelve para un rubro
 * (`preguntasDelRubro`) y se busca, ya con las palabras puestas: la búsqueda y
 * las palabras clave indexan lo que la persona lee, no el catálogo.
 *
 * `/dashboard/ayuda` pide las preguntas con el rubro del negocio de la sesión;
 * `/soporte`, que es pública y puede no tener sesión, las pide sin rubro, con
 * las palabras neutras (`PREGUNTAS_FRECUENTES`).
 */

/** Una pregunta ya resuelta para un rubro: lo que se muestra, sin funciones. */
export interface PreguntaFrecuente {
  /** Único y estable: es el `id` del acordeón en la página. */
  id: string
  area: AreaDeSoporte
  pregunta: string
  /** Párrafos de la respuesta, en el orden en que se leen. */
  respuesta: readonly string[]
  /** Otras formas de decirlo que la búsqueda también encuentra ("contraseña" → "clave"). */
  palabrasClave: readonly string[]
  /**
   * Si responde a un problema típico ("no aparecen horas", "no me llega el
   * correo"), no a cómo se usa algo. Son las que se sugieren en el camino
   * "Algo no funciona", antes del formulario.
   */
  paraFallas?: true
}

const PALABRAS_NEUTRAS = vocabularioDe(null).palabras

/** Las palabras del rubro que una pregunta puede nombrar, para indexar también cómo se dicen en general. */
const PALABRAS_CON_SINONIMOS = [
  "cliente",
  "profesional",
  "servicio",
  "servicioDeLaReserva",
  "cita",
  "citaParaElCliente",
  "tablero",
] as const satisfies readonly (keyof PalabrasDelRubro)[]

function valorDe<T>(valor: DePalabras<T>, contexto: ContextoDeAyuda): T {
  return typeof valor === "function" ? (valor as (contexto: ContextoDeAyuda) => T)(contexto) : valor
}

/**
 * Las mismas palabras, más un registro de cuáles de ellas se leyeron: lo que
 * una pregunta usa de las palabras del rubro es lo que nombra en su texto.
 */
function observar(palabras: PalabrasDelRubro): { observadas: PalabrasDelRubro; leidas: ReadonlySet<string> } {
  const leidas = new Set<string>()
  const observadas = new Proxy(palabras, {
    get(objetivo, clave, receptor) {
      if (typeof clave === "string") leidas.add(clave)
      return Reflect.get(objetivo, clave, receptor)
    },
  })
  return { observadas, leidas }
}

/**
 * Cómo se dice en general lo que la pregunta dice con una palabra del rubro:
 * quien escribe "cita" en un salón (la pregunta dice "hora") o "cliente" en
 * una clínica (dice "paciente") sigue encontrándola. Suma la palabra neutra de
 * cada palabra del rubro que la pregunta usó (`leidas`) y que el rubro dice
 * distinto; con las palabras neutras no suma nada y las palabras clave quedan
 * como están en el catálogo.
 *
 * Se parte de lo que la pregunta usó y no de lo que el texto contiene: "hora"
 * es la palabra de la reserva en un salón y también la del reloj ("vale una
 * hora"), y buscar la palabra en el texto sumaría "cita" a preguntas que no
 * hablan de citas.
 */
function sinonimosDe(leidas: ReadonlySet<string>, palabras: PalabrasDelRubro): string[] {
  const sinonimos: string[] = []
  for (const clave of PALABRAS_CON_SINONIMOS) {
    if (!leidas.has(clave)) continue
    for (const numero of ["singular", "plural"] as const) {
      if (palabras[clave][numero] !== PALABRAS_NEUTRAS[clave][numero]) sinonimos.push(PALABRAS_NEUTRAS[clave][numero])
    }
  }
  return sinonimos
}

/** Una pregunta del catálogo con las palabras del contexto puestas. */
function resolver(pregunta: PreguntaDelCatalogo, contexto: ContextoDeAyuda): PreguntaFrecuente {
  const { observadas, leidas } = observar(contexto.palabras)
  const vista: ContextoDeAyuda = { ...contexto, palabras: observadas }
  const titulo = valorDe(pregunta.pregunta, vista)
  const respuesta = valorDe(pregunta.respuesta, vista)
  const propias = valorDe(pregunta.palabrasClave, vista)
  const palabrasClave = [...new Set([...propias, ...sinonimosDe(leidas, contexto.palabras)])]

  return {
    id: pregunta.id,
    area: pregunta.area,
    pregunta: titulo,
    respuesta,
    palabrasClave,
    ...(pregunta.paraFallas ? { paraFallas: true as const } : {}),
  }
}

/**
 * Las preguntas con las palabras de un contexto, en el orden del catálogo. En
 * la clínica dental no están las que declaran `sinClinica`. Es la base de
 * `preguntasDelRubro`; se exporta para probar la concordancia con palabras que
 * ningún rubro real tiene.
 */
export function resolverPreguntas(
  contexto: ContextoDeAyuda,
  catalogo: readonly PreguntaDelCatalogo[] = CATALOGO,
): PreguntaFrecuente[] {
  return catalogo
    .filter((pregunta) => !(pregunta.sinClinica && contexto.enLaClinica))
    .map((pregunta) => resolver(pregunta, contexto))
}

/**
 * Las preguntas para el rubro del negocio (`session.user.rubro`): el
 * vocabulario del rubro puesto en cada texto y, en la clínica dental, sin las
 * que explican algo que ahí no existe. Un rubro desconocido, vacío, `null` o
 * `undefined` recibe las palabras neutras, o sea los textos de siempre.
 */
export function preguntasDelRubro(
  rubro: string | null | undefined,
  catalogo: readonly PreguntaDelCatalogo[] = CATALOGO,
): PreguntaFrecuente[] {
  return resolverPreguntas({ palabras: vocabularioDe(rubro).palabras, enLaClinica: esRubroDental(rubro) }, catalogo)
}

/**
 * Las preguntas sin rubro, con las palabras neutras: las de la página pública
 * /soporte y el valor por defecto de las funciones de abajo.
 */
export const PREGUNTAS_FRECUENTES: readonly PreguntaFrecuente[] = preguntasDelRubro(null)

/**
 * Un texto listo para comparar: sin tildes, diéresis ni la virgulilla de la ñ,
 * en minúsculas y con los espacios de más colapsados. "Contraseña",
 * "CONTRASEÑA" y "contrasena" son lo mismo para quien escribe apurado desde el
 * teléfono, que muchas veces no tiene a mano la ñ ni las tildes.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Todo lo que la búsqueda mira de una pregunta, ya normalizado. */
function textoBuscable(pregunta: PreguntaFrecuente): { titulo: string; resto: string } {
  return {
    titulo: normalizarTexto(pregunta.pregunta),
    resto: normalizarTexto([...pregunta.respuesta, ...pregunta.palabrasClave].join(" ")),
  }
}

interface OpcionesDeBusqueda {
  /** Solo las de esta área. Sin área, todas. */
  area?: AreaDeSoporte | null
  /** Por defecto, `PREGUNTAS_FRECUENTES`. */
  preguntas?: readonly PreguntaFrecuente[]
}

/**
 * Las preguntas que responden a lo que se escribió. Cada palabra tiene que
 * aparecer en la pregunta, la respuesta o sus palabras clave (sin importar
 * tildes ni mayúsculas); las que la tienen en la pregunta misma van primero.
 * Una consulta vacía devuelve todas las del área, en su orden.
 */
export function buscarPreguntas(consulta: string, opciones: OpcionesDeBusqueda = {}): PreguntaFrecuente[] {
  const { area = null, preguntas = PREGUNTAS_FRECUENTES } = opciones
  const delArea = area ? preguntas.filter((pregunta) => pregunta.area === area) : [...preguntas]

  const palabras = normalizarTexto(consulta).split(" ").filter(Boolean)
  if (palabras.length === 0) return delArea

  const conPuntaje = delArea.flatMap((pregunta, indice) => {
    const { titulo, resto } = textoBuscable(pregunta)
    let puntaje = 0
    for (const palabra of palabras) {
      if (titulo.includes(palabra)) puntaje += 2
      else if (resto.includes(palabra)) puntaje += 1
      else return []
    }
    return [{ pregunta, puntaje, indice }]
  })

  // A igual puntaje se respeta el orden original: `sort` es estable, pero el
  // índice lo deja explícito.
  conPuntaje.sort((a, b) => b.puntaje - a.puntaje || a.indice - b.indice)
  return conPuntaje.map(({ pregunta }) => pregunta)
}

/** Las primeras `cuantas` preguntas de un área, en su orden. */
export function preguntasDeArea(
  area: AreaDeSoporte,
  cuantas = 3,
  preguntas: readonly PreguntaFrecuente[] = PREGUNTAS_FRECUENTES,
): PreguntaFrecuente[] {
  return preguntas.filter((pregunta) => pregunta.area === area).slice(0, cuantas)
}

/**
 * Las de "Antes de escribirnos, revisa esto" en el camino "Algo no funciona":
 * hasta `cuantas` preguntas del área marcadas `paraFallas`. Un área sin
 * problemas típicos documentados (Otro) no sugiere ninguna.
 */
export function preguntasParaFallas(
  area: AreaDeSoporte,
  cuantas = 3,
  preguntas: readonly PreguntaFrecuente[] = PREGUNTAS_FRECUENTES,
): PreguntaFrecuente[] {
  return preguntas.filter((pregunta) => pregunta.area === area && pregunta.paraFallas).slice(0, cuantas)
}
