import { z } from "zod"
import { esFechaCalendario } from "@/lib/zona-horaria"
import {
  IDS_DE_ARCADAS,
  IDS_DE_ESTADOS,
  IDS_DE_TIPOS,
  IDS_DE_TONOS,
  IDS_DE_UNIDADES,
  IDS_DE_ZONAS,
  PUNTOS_BASE_DEL_TOTAL,
  TOPE_DE_CENTAVOS,
  errorDeTiposDelMaterial,
  esRepartoValido,
  type Arcada,
  type EstadoDeProtesis,
  type OrigenDelReparto,
  type GrupoDeTono,
  type PasoDelSeguimiento,
  type SituacionDeEtapa,
  type TipoDeProtesis,
  type TonoVita,
  type Unidad,
  type ZonaDeLaBase,
} from "@/lib/protesis"

/**
 * Cómo se escriben las prótesis por la API: los esquemas de cada pedido y la
 * forma exacta de cada respuesta (fechas como texto ISO; la pantalla importa
 * los tipos con `import type`). Las reglas están en `lib/protesis.ts`; lo que
 * lee y escribe la base, en `lib/protesis-servidor.ts`.
 *
 * Dinero en centavos enteros y porcentajes en puntos base (10.000 = 100 %):
 * la pantalla convierte. Ningún pedido de la ficha trae precios ni
 * porcentajes: si los trae, se ignoran (zod descarta las claves que no
 * conoce) y el servidor los calcula del catálogo.
 */

// ─── Campos ──────────────────────────────────────────────────────────────────

export const LARGO_MAXIMO_DEL_NOMBRE = 80
export const LARGO_MAXIMO_DEL_CONTACTO = 200

const id = (mensaje: string) => z.string({ required_error: mensaje, invalid_type_error: mensaje }).trim().min(1, mensaje).max(100, mensaje)

const nombre = (de: string) =>
  z
    .string({ required_error: `Escribe el nombre ${de}`, invalid_type_error: `Escribe el nombre ${de}` })
    .trim()
    .min(1, `Escribe el nombre ${de}`)
    .max(LARGO_MAXIMO_DEL_NOMBRE, `El nombre ${de} no puede tener más de ${LARGO_MAXIMO_DEL_NOMBRE} caracteres`)

/** Texto libre opcional: vacío o `null` lo borra. */
const contacto = () =>
  z
    .string({ invalid_type_error: "El contacto tiene que ser texto" })
    .trim()
    .max(LARGO_MAXIMO_DEL_CONTACTO, `El contacto no puede tener más de ${LARGO_MAXIMO_DEL_CONTACTO} caracteres`)
    .transform((valor) => (valor === "" ? null : valor))
    .nullable()

const activo = () => z.boolean({ invalid_type_error: "Activo tiene que ser sí o no" })

const orden = () =>
  z
    .number({ invalid_type_error: "El orden tiene que ser un número" })
    .int("El orden tiene que ser un número entero")
    .min(0, "El orden no puede ser negativo")
    .max(999, "El orden no puede ser mayor que 999")

const centavos = () =>
  z
    .number({ required_error: "Escribe el precio", invalid_type_error: "El precio no es válido" })
    .int("El precio va en centavos enteros")
    .min(0, "El precio no puede ser negativo")
    .max(TOPE_DE_CENTAVOS, "El precio es demasiado alto")

const parte = (de: string) =>
  z
    .number({ required_error: `Falta la parte ${de}`, invalid_type_error: `La parte ${de} no es válida` })
    .int(`La parte ${de} va en puntos base enteros`)
    .min(0, `La parte ${de} no puede ser negativa`)
    .max(PUNTOS_BASE_DEL_TOTAL, `La parte ${de} no puede pasar del 100 %`)

const partes = {
  pbOdontologo: parte("de la odontóloga"),
  pbClinica: parte("de la clínica"),
  pbTecnico: parte("del técnico"),
}

export const MENSAJE_REPARTO_NO_SUMA = "Las tres partes tienen que sumar 100 %."
export const MENSAJE_REPARTO_INCOMPLETO = "Indica las tres partes del reparto juntas."

/** Una fecha "AAAA-MM-DD" desde el año 2000 (`protesis_entregaEstimada_check`), o `null` para quitarla. */
const fecha = () =>
  z
    .string({ invalid_type_error: "La fecha de entrega no es válida" })
    .trim()
    .refine((valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor) && esFechaCalendario(valor) && valor >= "2000-01-01", "La fecha de entrega no es válida")
    .nullable()

/** Un tono de la guía VITA classical por su id ("A3.5", no "A3,5"), o `null` para quitarlo. */
const tono = () =>
  z.enum(IDS_DE_TONOS, { errorMap: () => ({ message: "Ese tono no está en la guía VITA classical" }) }).nullable()

// ─── Configuración: laboratorios ─────────────────────────────────────────────

export const laboratorioNuevoSchema = z.object({
  nombre: nombre("del laboratorio"),
  contacto: contacto().optional(),
  activo: activo().optional(),
})

export const edicionDeLaboratorioSchema = z
  .object({
    nombre: nombre("del laboratorio").optional(),
    contacto: contacto().optional(),
    activo: activo().optional(),
  })
  .refine((datos) => Object.values(datos).some((valor) => valor !== undefined), "No hay nada que cambiar")

// ─── Configuración: materiales y reparto ─────────────────────────────────────

export const materialNuevoSchema = z
  .object({
    nombre: nombre("del material"),
    unidad: z.enum(IDS_DE_UNIDADES, { errorMap: () => ({ message: "La unidad tiene que ser por arcada o por pieza" }) }),
    tipos: z.array(z.enum(IDS_DE_TIPOS, { errorMap: () => ({ message: "Ese tipo de prótesis no existe" }) })).max(IDS_DE_TIPOS.length),
    precioCents: centavos(),
    ...partes,
    laboratorioPorDefectoId: id("El laboratorio no es válido").nullable().optional(),
    orden: orden().optional(),
    activo: activo().optional(),
  })
  .superRefine((datos, ctx) => {
    const error = errorDeTiposDelMaterial(datos.unidad, datos.tipos)
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ["tipos"] })
    if (!esRepartoValido(datos)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_REPARTO_NO_SUMA, path: ["pbTecnico"] })
  })

export type MaterialNuevo = z.infer<typeof materialNuevoSchema>

/**
 * Cambiar un material: cualquier campo. Las tres partes del reparto van
 * juntas (cambiar una sola dejaría de sumar 100 %). Que los tipos sirvan
 * para la unidad se mira sobre cómo queda el material (puede cambiar sólo
 * uno de los dos), en el servidor.
 */
export const edicionDeMaterialSchema = z
  .object({
    nombre: nombre("del material").optional(),
    unidad: z.enum(IDS_DE_UNIDADES, { errorMap: () => ({ message: "La unidad tiene que ser por arcada o por pieza" }) }).optional(),
    tipos: z
      .array(z.enum(IDS_DE_TIPOS, { errorMap: () => ({ message: "Ese tipo de prótesis no existe" }) }))
      .max(IDS_DE_TIPOS.length)
      .optional(),
    precioCents: centavos().optional(),
    pbOdontologo: partes.pbOdontologo.optional(),
    pbClinica: partes.pbClinica.optional(),
    pbTecnico: partes.pbTecnico.optional(),
    laboratorioPorDefectoId: id("El laboratorio no es válido").nullable().optional(),
    orden: orden().optional(),
    activo: activo().optional(),
  })
  .superRefine((datos, ctx) => {
    if (!Object.values(datos).some((valor) => valor !== undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No hay nada que cambiar" })
      return
    }
    const dadas = [datos.pbOdontologo, datos.pbClinica, datos.pbTecnico].filter((valor) => valor !== undefined).length
    if (dadas > 0 && dadas < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_REPARTO_INCOMPLETO, path: ["pbTecnico"] })
    else if (dadas === 3 && !esRepartoValido(datos)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_REPARTO_NO_SUMA, path: ["pbTecnico"] })
    }
  })

export type EdicionDeMaterial = z.infer<typeof edicionDeMaterialSchema>

const repartoCompleto = z.object(partes).refine(esRepartoValido, { message: MENSAJE_REPARTO_NO_SUMA, path: ["pbTecnico"] })

export const excepcionNuevaSchema = z
  .object({ memberId: id("Elige el odontólogo"), materialId: id("Elige el material"), ...partes })
  .refine(esRepartoValido, { message: MENSAJE_REPARTO_NO_SUMA, path: ["pbTecnico"] })

export const edicionDeExcepcionSchema = repartoCompleto

// ─── La ficha: prótesis del paciente ─────────────────────────────────────────

/** Los ids de los dos lados de la arcada: hasta 32 piezas, enteros (que sean FDI de la arcada lo mira `errorDelDiseno`). */
const piezas = (mensaje: string) =>
  z.array(z.number({ invalid_type_error: mensaje }).int(mensaje), { invalid_type_error: mensaje }).max(32, mensaje)

/**
 * Una prótesis nueva. Sin precios ni porcentajes: el valor, las unidades y el
 * reparto los pone el servidor. `tratante` es `"duenio"` o el id de un
 * miembro; sólo la dueña elige (el odontólogo queda siempre como tratante, lo
 * mande o no). Sin laboratorio, el del material por defecto, si está activo.
 */
export const protesisNuevaSchema = z.object({
  tipo: z.enum(IDS_DE_TIPOS, { errorMap: () => ({ message: "Elige el tipo de prótesis" }) }),
  arcada: z.enum(IDS_DE_ARCADAS, { errorMap: () => ({ message: "Elige la arcada: superior, inferior o ambas" }) }),
  piezas: piezas("Las piezas no son válidas").default([]),
  pilares: piezas("Los pilares no son válidos").default([]),
  zonas: z
    .array(z.string().max(20), { invalid_type_error: "Las zonas de la base no son válidas" })
    .max(IDS_DE_ZONAS.length, "Las zonas de la base no son válidas")
    .default([]),
  materialId: id("Elige el material"),
  laboratorioId: id("El laboratorio no es válido").nullable().optional(),
  entregaEstimada: fecha().optional(),
  tono: tono().optional(),
  tratante: id("La tratante no es válida").optional(),
})

export type ProtesisNueva = z.infer<typeof protesisNuevaSchema>

/**
 * Cambiar una prótesis: avanzar el seguimiento por los pasos de su tipo
 * (`PASOS_POR_TIPO`; "Entregada" fija la fecha de entrega; "anulada" sólo
 * antes de entregar y sin abonos), y el laboratorio, la entrega estimada o el
 * tono mientras no esté entregada ni anulada.
 */
export const edicionDeProtesisSchema = z
  .object({
    estado: z.enum(IDS_DE_ESTADOS, { errorMap: () => ({ message: "Ese paso del seguimiento no existe" }) }).optional(),
    laboratorioId: id("El laboratorio no es válido").nullable().optional(),
    entregaEstimada: fecha().optional(),
    tono: tono().optional(),
  })
  .refine((datos) => Object.values(datos).some((valor) => valor !== undefined), "No hay nada que cambiar")

export type EdicionDeProtesis = z.infer<typeof edicionDeProtesisSchema>

/** "Agregar al plan": en qué etapa (por aprobar) del plan vigente. Sin etapa, la última por aprobar, o una nueva. */
export const alPlanSchema = z
  .object({ etapaId: id("La etapa no es válida").optional() })
  .optional()
  .transform((datos) => datos ?? {})

// ─── Mensajes ────────────────────────────────────────────────────────────────

export const MENSAJE_LABORATORIO_REPETIDO = "Ya hay un laboratorio con ese nombre"
export const MENSAJE_MATERIAL_REPETIDO = "Ya hay un material con ese nombre"
export const MENSAJE_EXCEPCION_REPETIDA = "Ese odontólogo ya tiene una regla para ese material: cámbiala en vez de crear otra."
export const MENSAJE_MATERIAL_INACTIVO = "Ese material está desactivado: actívalo en Comisiones o elige otro."
export const MENSAJE_MATERIAL_NO_SIRVE = "Ese material no sirve para este tipo de prótesis."
export const MENSAJE_LABORATORIO_INACTIVO = "Ese laboratorio está desactivado: actívalo en Configuración o elige otro."
export const MENSAJE_CON_ABONOS =
  "La prótesis ya tiene abonos en la Sala de espera: no se anula. Si hay que devolver algo, anula primero esos cobros."
export const MENSAJE_YA_EN_EL_PLAN = "La prótesis ya está en el plan vigente."
export const MENSAJE_PROTESIS_ANULADA = "Una prótesis anulada no se agrega al plan."
export const MENSAJE_SIN_MIEMBRO = "Para crear una prótesis tienes que ser parte del equipo de la clínica."
export const MENSAJE_TRATANTE_NO_ODONTOLOGO = "La tratante tiene que ser la dueña o un odontólogo de la clínica."

/** El nombre de la etapa que se crea si el plan no tiene ninguna por aprobar. */
export const NOMBRE_DE_LA_ETAPA_DE_PROTESIS = "Prótesis"

// ─── Respuestas ──────────────────────────────────────────────────────────────

export interface LaboratorioRespuesta {
  id: string
  nombre: string
  contacto: string | null
  activo: boolean
}

export interface MaterialRespuesta {
  id: string
  nombre: string
  unidad: Unidad
  tipos: TipoDeProtesis[]
  precioCents: number
  pbOdontologo: number
  pbClinica: number
  pbTecnico: number
  laboratorioPorDefecto: { id: string; nombre: string } | null
  orden: number
  activo: boolean
}

export interface ExcepcionRespuesta {
  id: string
  memberId: string
  memberNombre: string
  materialId: string
  materialNombre: string
  pbOdontologo: number
  pbClinica: number
  pbTecnico: number
}

/** Una parte del reparto: su porcentaje (puntos base, el efectivo) y su monto sobre el valor de la prótesis. */
export interface ParteDelReparto {
  pb: number
  cents: number
}

/**
 * Lo que quien mira ve del reparto (`veMontosDelReparto`): la dueña, las tres
 * partes y de dónde salió la regla; la odontóloga tratante, sólo la suya;
 * cualquier otro, nada (`null`). Si la tratante es la dueña, su parte ya
 * está sumada a la clínica (`repartoEfectivo`).
 */
export type RepartoRespuesta =
  | { visible: "todo"; origen: OrigenDelReparto; odontologo: ParteDelReparto; clinica: ParteDelReparto; tecnico: ParteDelReparto }
  | { visible: "suyo"; odontologo: ParteDelReparto }

export interface EventoRespuesta {
  estado: EstadoDeProtesis
  autorNombre: string
  createdAt: string
}

/** Una etapa del seguimiento que le toca a la prótesis por su tipo (`etapasDeLaProtesis`). */
export interface EtapaRespuesta {
  id: PasoDelSeguimiento
  /** "Toma de impresión", "Prueba de rodete", "Prueba de enfilado", "Prueba", "Entregada". */
  nombre: string
  situacion: SituacionDeEtapa
  /** Cuándo se registró (ISO) y quién, o `null` si no se pasó por ella. */
  fecha: string | null
  autorNombre: string | null
}

/** El tono elegido, con lo que hace falta para mostrarlo (`TONOS_VITA`; el color es aproximado). */
export interface TonoRespuesta {
  id: TonoVita
  /** "A3,5". */
  etiqueta: string
  grupo: GrupoDeTono
  /** Hex aproximado, sólo de referencia: manda la guía física. */
  color: string
}

export interface ProtesisRespuesta {
  id: string
  tipo: TipoDeProtesis
  arcada: Arcada
  piezas: number[]
  pilares: number[]
  zonas: ZonaDeLaBase[]
  material: { id: string; nombre: string; unidad: Unidad; precioUnitarioCents: number }
  unidades: number
  valorCents: number
  /** Lo cobrado en abonos (atenciones finalizadas) y lo que falta. Hasta que exista el cobro por abonos, 0 y el valor. */
  pagadoCents: number
  saldoCents: number
  /**
   * El nombre es el copiado al elegirlo; el contacto, el actual del catálogo
   * (`null` si no tiene).
   */
  laboratorio: { id: string; nombre: string; contacto: string | null } | null
  /** "AAAA-MM-DD". */
  entregaEstimada: string | null
  /** Tono VITA classical, o `null` si no se eligió. */
  tono: TonoRespuesta | null
  estado: EstadoDeProtesis
  /** El paso que sigue según el tipo (el que ofrece la pantalla); `null` si está entregada o anulada. */
  siguienteEstado: PasoDelSeguimiento | null
  /** Los pasos que le tocan según el tipo, en orden, con su situación y su evento. */
  etapas: EtapaRespuesta[]
  entregadaEn: string | null
  anuladaEn: string | null
  anuladaPorNombre: string | null
  /** `memberId` null y `esLaDuena` false: alguien que ya no está en el equipo. */
  tratante: { memberId: string | null; nombre: string; esLaDuena: boolean }
  creadoPorNombre: string
  createdAt: string
  /** El seguimiento, del más viejo al más nuevo. */
  eventos: EventoRespuesta[]
  /** Si hay una prestación del plan vigente ligada a esta prótesis. */
  enElPlan: boolean
  /** Cómo se llamaría en el plan ("Removible parcial · Acrílico termocurado (45, 46, 47)"). */
  nombreParaElPlan: string
  reparto: RepartoRespuesta | null
}

export interface ProtesisDelPacienteRespuesta {
  protesis: ProtesisRespuesta[]
  puedeEditar: boolean
}

/** El catálogo para armar una prótesis en la ficha (`GET /api/clientes/[id]/protesis/opciones`). */
export interface OpcionesDeProtesisRespuesta {
  materiales: {
    id: string
    nombre: string
    unidad: Unidad
    tipos: TipoDeProtesis[]
    precioCents: number
    laboratorioPorDefectoId: string | null
    /** Sólo para la dueña: la regla del material. */
    reparto?: { pbOdontologo: number; pbClinica: number; pbTecnico: number }
    /** Sólo para el odontólogo: su parte en este material (con su excepción, si tiene). */
    miPartePb?: number
  }[]
  laboratorios: { id: string; nombre: string }[]
  /** A quién puede poner de tratante: la dueña, a ella misma y a cada odontólogo; el odontólogo, sólo a sí mismo. `id` es "duenio" o un memberId. */
  tratantes: { id: string; nombre: string }[]
  /** Sólo para la dueña: las excepciones, para previsualizar el reparto de cada tratante. */
  excepciones?: { memberId: string; materialId: string; pbOdontologo: number; pbClinica: number; pbTecnico: number }[]
  puedeEditar: boolean
}

export interface AlPlanRespuesta {
  prestacionId: string
  etapaId: string
  protesis: ProtesisRespuesta
}
