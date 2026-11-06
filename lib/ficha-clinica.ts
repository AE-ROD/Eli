import { z } from "zod"
import {
  TIPOS_DE_PIEZA,
  carasDe,
  errorDeMarca,
  esTipoDePieza,
  nombreDeCara,
  nombreDeTipo,
  piezasDe,
  type MarcaDelOdontograma,
} from "@/lib/odontograma"
import { esFechaCalendario } from "@/lib/zona-horaria"

/**
 * La ficha clínica de un paciente de una clínica dental: antecedentes,
 * odontograma y evoluciones (docs/PRODUCTO.md, "Clínica dental"). Acá van las
 * reglas puras y los esquemas de los endpoints
 * `app/api/clientes/[id]/{ficha,odontograma,evoluciones}`; lo que lee y
 * escribe la base está en `lib/ficha-clinica-servidor.ts`, y quién ve y
 * escribe cada cosa, en `lib/permisos.ts`.
 *
 * Los tipos `…Respuesta` son la forma exacta del JSON de cada endpoint (las
 * fechas ya como texto): la pantalla los importa con `import type`.
 */

// ─── Antecedentes ────────────────────────────────────────────────────────────

/** La base repite la lista en `fichas_clinicas_prevision_check`. */
export const PREVISIONES = [
  { id: "fonasa", nombre: "Fonasa" },
  { id: "isapre", nombre: "Isapre" },
  { id: "particular", nombre: "Particular" },
  { id: "otra", nombre: "Otra" },
] as const

export type Prevision = (typeof PREVISIONES)[number]["id"]

const IDS_DE_PREVISION = PREVISIONES.map((prevision) => prevision.id) as [Prevision, ...Prevision[]]

export function esPrevision(valor: unknown): valor is Prevision {
  return PREVISIONES.some((prevision) => prevision.id === valor)
}

/** "Isapre"… Busca con `find`, como `nombreDeRubro`. */
export function nombreDePrevision(id: string): string {
  return PREVISIONES.find((prevision) => prevision.id === id)?.nombre ?? "Previsión desconocida"
}

/** Topes de los textos de la ficha. La base no los tiene: los pone el esquema. */
export const MAXIMO_DE_ALERGIAS = 500
export const MAXIMO_DE_ANTECEDENTES = 4000
export const MAXIMO_DE_EVOLUCION = 4000

/** Desde cuándo vale una fecha de nacimiento (`fichas_clinicas_fechaNacimiento_check`). */
export const NACIMIENTO_MINIMO = "1900-01-01"

/**
 * Un texto clínico opcional: recortado, con tope, y vacío (o sólo espacios)
 * se guarda como `null`, igual que `textoOpcional` de los campos del panel.
 */
const textoClinico = (campo: string, maximo: number) =>
  z
    .string({ invalid_type_error: `${campo} tienen que ser texto` })
    .trim()
    .max(maximo, `${campo} no pueden tener más de ${maximo} caracteres`)
    .transform((valor) => (valor === "" ? null : valor))

/**
 * Por qué una fecha de nacimiento ("AAAA-MM-DD"; vacía es "sin anotar") no
 * se puede guardar, o `null`: tiene que existir, ser desde 1900 (el CHECK de
 * la base) y no ser posterior a `hoy`.
 */
export function errorDeFechaDeNacimiento(fecha: string, hoy: string): string | null {
  if (fecha === "") return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "La fecha de nacimiento no es válida"
  if (fecha < NACIMIENTO_MINIMO) return "La fecha de nacimiento no puede ser anterior a 1900"
  if (!esFechaCalendario(fecha)) return "La fecha de nacimiento no es válida"
  if (fecha > hoy) return "La fecha de nacimiento no puede ser futura"
  return null
}

/**
 * Lo que manda el formulario de antecedentes. Todo opcional: lo que no viene
 * no se toca; `null` o vacío lo borra. `hoy` es el día del negocio
 * ("AAAA-MM-DD"): una fecha de nacimiento no puede ser posterior.
 */
export function antecedentesSchema(hoy: string) {
  const fecha = z
    .string({ invalid_type_error: "La fecha de nacimiento no es válida" })
    .trim()
    .superRefine((valor, ctx) => {
      const error = errorDeFechaDeNacimiento(valor, hoy)
      if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error })
    })
    .transform((valor) => (valor === "" ? null : valor))

  return z.object({
    fechaNacimiento: fecha.nullable().optional(),
    prevision: z
      .union([z.enum(IDS_DE_PREVISION), z.literal("")], {
        errorMap: () => ({ message: "La previsión tiene que ser Fonasa, Isapre, Particular u Otra" }),
      })
      .transform((valor) => (valor === "" ? null : valor))
      .nullable()
      .optional(),
    alergias: textoClinico("Las alergias", MAXIMO_DE_ALERGIAS).nullable().optional(),
    antecedentes: textoClinico("Los antecedentes", MAXIMO_DE_ANTECEDENTES).nullable().optional(),
  })
}

export type Antecedentes = z.infer<ReturnType<typeof antecedentesSchema>>

/** Una fecha "AAAA-MM-DD" en sus tres números. Sólo para fechas ya validadas. */
function partes(fecha: string): [number, number, number] {
  const [anio, mes, dia] = fecha.split("-").map(Number)
  return [anio, mes, dia]
}

/**
 * Los años cumplidos el día `hoy` por alguien nacido el día `nacimiento`, los
 * dos como "AAAA-MM-DD" (`hoy`, en la zona del negocio). Aritmética de
 * calendario, sin zonas ni horas. Quien nació un 29 de febrero cumple el 1 de
 * marzo en los años que no son bisiestos. `null` si alguna fecha no es válida
 * o el nacimiento es posterior a `hoy`.
 */
export function edadEn(nacimiento: string, hoy: string): number | null {
  if (!esFechaCalendario(nacimiento) || !esFechaCalendario(hoy) || nacimiento > hoy) return null
  const [anioN, mesN, diaN] = partes(nacimiento)
  const [anio, mes, dia] = partes(hoy)
  const yaCumplio = mes > mesN || (mes === mesN && dia >= diaN)
  return anio - anioN - (yaCumplio ? 0 : 1)
}

export interface FichaClinicaRespuesta {
  /** "AAAA-MM-DD" o `null` si no se anotó. */
  fechaNacimiento: string | null
  /** Años cumplidos hoy en la zona del negocio; `null` sin fecha de nacimiento. */
  edad: number | null
  prevision: Prevision | null
  alergias: string | null
  antecedentes: string | null
  /** Quién escribió la ficha por última vez (antecedentes u odontograma); `null` si nunca se escribió. */
  actualizadaPor: string | null
  /** ISO; `null` si nunca se escribió. */
  updatedAt: string | null
}

// ─── Odontograma ─────────────────────────────────────────────────────────────

/**
 * Cuántas marcas puede tener un odontograma como mucho: cada pieza (32
 * permanentes y 20 temporales) con sus cinco caras marcadas y cada marca de
 * pieza. Más que eso no es un odontograma, y el pedido se rechaza antes de
 * revisar marca por marca.
 */
export const MAXIMO_DE_MARCAS = (piezasDe("permanente").length + piezasDe("temporal").length) * (5 + TIPOS_DE_PIEZA.length)

/** Una marca tal como llega en el pedido: `cara` puede faltar en las de pieza. */
const marcaPedidaSchema = z.object({
  pieza: z.number({ invalid_type_error: "Esa pieza no existe en el odontograma." }),
  cara: z.string().max(2).nullable().optional(),
  tipo: z.string().max(20),
})

/**
 * Por qué un conjunto de marcas no se puede guardar, o `null` si se puede:
 * cada marca, con las reglas de `errorDeMarca` (las de los CHECKs de la
 * base); y sin repetidas, como los únicos de `odontograma_marcas`: una sola
 * marca por cara, y una marca de pieza no se repite en la misma pieza.
 */
export function errorDelOdontograma(marcas: readonly { pieza: unknown; cara: unknown; tipo: unknown }[]): string | null {
  const caras = new Set<string>()
  const dePieza = new Set<string>()
  for (const marca of marcas) {
    const error = errorDeMarca(marca)
    if (error) return error
    const { pieza, cara, tipo } = marca as MarcaDelOdontograma
    if (esTipoDePieza(tipo)) {
      const clave = `${pieza}:${tipo}`
      if (dePieza.has(clave)) return `La pieza ${pieza} tiene dos veces ${nombreDeTipo(tipo)}.`
      dePieza.add(clave)
    } else {
      const clave = `${pieza}:${cara}`
      if (caras.has(clave)) return `La cara ${nombreDeCara(cara ?? "")} de la pieza ${pieza} tiene dos marcas: una cara lleva una sola.`
      caras.add(clave)
    }
  }
  return null
}

/** El cuerpo de `PUT /odontograma`: el conjunto completo de marcas, que reemplaza al que había. */
export const odontogramaSchema = z
  .object({
    marcas: z
      .array(marcaPedidaSchema, { required_error: "Faltan las marcas del odontograma", invalid_type_error: "Faltan las marcas del odontograma" })
      .max(MAXIMO_DE_MARCAS, `Un odontograma no puede tener más de ${MAXIMO_DE_MARCAS} marcas`),
  })
  .transform(({ marcas }) => ({
    marcas: marcas.map((marca): MarcaDelOdontograma => ({ pieza: marca.pieza, cara: marca.cara ?? null, tipo: marca.tipo })),
  }))
  .superRefine(({ marcas }, ctx) => {
    const error = errorDelOdontograma(marcas)
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ["marcas"] })
  })

/** Una marca como clave de texto: dos marcas son la misma si coinciden pieza, cara y tipo. */
const claveDeMarca = (marca: MarcaDelOdontograma) => `${marca.pieza}:${marca.cara ?? ""}:${marca.tipo}`

/**
 * Qué cambia al reemplazar las marcas `actuales` (con su id) por `nuevas`: se
 * borran las que ya no vienen y se crean las que no estaban. Una marca que
 * sigue igual no se toca. Si en una cara cambia el tipo (de caries a
 * obturación), se borra la vieja y se crea la nueva: por eso hay que borrar
 * antes de crear, o el único "una marca por cara" choca.
 */
export function cambiosDelOdontograma(
  actuales: readonly (MarcaDelOdontograma & { id: string })[],
  nuevas: readonly MarcaDelOdontograma[]
): { borrar: string[]; crear: MarcaDelOdontograma[] } {
  const claves = new Set(nuevas.map(claveDeMarca))
  const yaEstan = new Set(actuales.map(claveDeMarca))
  return {
    borrar: actuales.filter((marca) => !claves.has(claveDeMarca(marca))).map((marca) => marca.id),
    crear: nuevas.filter((marca) => !yaEstan.has(claveDeMarca(marca))),
  }
}

/**
 * Las marcas en el orden en que se devuelven: por pieza, después las de cara
 * (en el orden de `carasDe`) y al final las de pieza, por tipo.
 */
export function ordenarMarcas<T extends MarcaDelOdontograma>(marcas: readonly T[]): T[] {
  const posicionDeCara = (marca: MarcaDelOdontograma) => {
    if (marca.cara === null) return 99
    const posicion = (carasDe(marca.pieza) as string[]).indexOf(marca.cara)
    return posicion === -1 ? 98 : posicion
  }
  return [...marcas].sort(
    (a, b) => a.pieza - b.pieza || posicionDeCara(a) - posicionDeCara(b) || a.tipo.localeCompare(b.tipo)
  )
}

export interface OdontogramaRespuesta {
  /** Todas las marcas del paciente: `cara` null es una marca de la pieza entera. */
  marcas: MarcaDelOdontograma[]
  /** ISO; `null` si nunca se marcó. */
  odontogramaActualizadoEn: string | null
  odontogramaActualizadoPor: string | null
}

// ─── Evoluciones ─────────────────────────────────────────────────────────────

/** Cuántas evoluciones trae cada página, de la más nueva a la más vieja. */
export const EVOLUCIONES_POR_PAGINA = 30

const idSchema = (mensaje: string) =>
  z.string({ invalid_type_error: mensaje }).trim().min(1, mensaje).max(100, mensaje)

/** El cuerpo de `POST /evoluciones`. Sólo se agregan: no hay edición ni borrado. */
export const evolucionSchema = z.object({
  texto: z
    .string({ required_error: "Escribe la evolución", invalid_type_error: "Escribe la evolución" })
    .trim()
    .min(1, "Escribe la evolución")
    .max(MAXIMO_DE_EVOLUCION, `La evolución no puede tener más de ${MAXIMO_DE_EVOLUCION} caracteres`),
  /** La cita en que se atendió, si la hay: tiene que ser de este paciente. */
  appointmentId: idSchema("La cita no es válida").nullable().optional(),
})

export interface EvolucionRespuesta {
  id: string
  texto: string
  /** Copia del nombre de quien la anotó. */
  autorNombre: string
  /** ISO. */
  createdAt: string
  appointmentId: string | null
}

export interface EvolucionesRespuesta {
  /** De la más nueva a la más vieja. */
  evoluciones: EvolucionRespuesta[]
  /** Si hay más, el id que se manda como `?antes=` para traer la página siguiente; si no, `null`. */
  siguiente: string | null
}
