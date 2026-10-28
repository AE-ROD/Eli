import { z } from "zod"
import { esEtiquetaReservada } from "./clientes-eliminados"
import { MENSAJE_DE_TELEFONO_ILEGIBLE, aE164Chile } from "./telefono"

/**
 * Los campos que comparten los esquemas de los endpoints del panel (citas,
 * clientes, servicios, horarios, equipo), con su tope y su mensaje en
 * español. Sin tope, un cuerpo podía guardar un texto de megas o un número
 * que la base no acepta (y eso era un 500, no un 400).
 *
 * Los mensajes son los que ve la persona: `respuestaDeDatosInvalidos`
 * (`lib/respuesta-de-validacion.ts`) devuelve el primero tal cual.
 */

const maximo = (campo: string, n: number) => `${campo} no puede tener más de ${n} caracteres`

/** Nombre de una persona o un servicio: 2 a 100, sin los espacios de las puntas. */
export const nombre = () =>
  z
    .string()
    .trim()
    .min(2, "El nombre tiene que tener al menos 2 caracteres")
    .max(100, maximo("El nombre", 100))

export const telefono = () => z.string().trim().max(30, maximo("El teléfono", 30))

/**
 * El teléfono de un cliente, ya en E.164 (`lib/telefono.ts`). Vacío es "sin
 * teléfono" y sale `null`; lo que no se puede leer como un número chileno es
 * un error con el formato esperado, no un dato que se guarda a medias.
 */
export const telefonoChileno = () =>
  telefono().transform((valor, contexto) => {
    if (valor === "") return null
    const e164 = aE164Chile(valor)
    if (!e164) {
      contexto.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_DE_TELEFONO_ILEGIBLE })
      return z.NEVER
    }
    return e164
  })

/**
 * Email de hasta 254 caracteres (el máximo que admite una casilla). Para un
 * campo que acepta "sin email", `emailOVacio`.
 */
export const email = () => z.string().trim().max(254, maximo("El email", 254)).email("El email no es válido")

/**
 * Email o vacío. Es un solo `string` con `refine` y no `email().or(literal(""))`:
 * con la unión, cualquier fallo de una rama (también el largo) se volvía un
 * "Invalid input" genérico, sin decir qué estaba mal.
 */
export const emailOVacio = () =>
  z
    .string()
    .trim()
    .max(254, maximo("El email", 254))
    .refine((valor) => valor === "" || z.string().email().safeParse(valor).success, "El email no es válido")

/** Notas: hasta 2000. */
export const notas = () => z.string().trim().max(2000, "Las notas no pueden tener más de 2000 caracteres")

/** Descripción de un servicio: hasta 2000. */
export const descripcion = () => z.string().trim().max(2000, maximo("La descripción", 2000))

export const titulo = () =>
  z
    .string()
    .trim()
    .min(2, "El título tiene que tener al menos 2 caracteres")
    .max(120, maximo("El título", 120))

/**
 * Hasta 20 etiquetas de hasta 30 caracteres cada una. La marca de cliente
 * eliminado (`lib/clientes-eliminados.ts`) no se acepta: la pone sólo el
 * borrado.
 */
export const etiquetas = () =>
  z
    .array(
      z
        .string()
        .trim()
        .max(30, "Cada etiqueta puede tener hasta 30 caracteres")
        .refine((etiqueta) => !esEtiquetaReservada(etiqueta), "Esa etiqueta está reservada")
    )
    .max(20, "No puede haber más de 20 etiquetas")

const PRECIO_MAXIMO = "El precio no puede ser mayor que 10.000.000"

/**
 * El precio de una cita, en unidades: mayor que 0 (así era antes) y hasta
 * 10.000.000. Una cita sin precio no manda el campo.
 */
export const precioDeCita = () =>
  z.number().positive("El precio tiene que ser mayor que 0").max(10_000_000, PRECIO_MAXIMO)

/**
 * El precio de un servicio: desde 0, porque un servicio gratis es válido
 * (así era antes), y hasta 10.000.000.
 */
export const precioDeServicio = () =>
  z.number().min(0, "El precio no puede ser negativo").max(10_000_000, PRECIO_MAXIMO)

/** Duración de un servicio, en minutos enteros: de 15 (el mínimo de antes) a 480 (ocho horas). */
export const duracion = () =>
  z
    .number()
    .int("La duración tiene que ser un número entero de minutos")
    .min(15, "La duración tiene que ser de al menos 15 minutos")
    .max(480, "La duración no puede pasar de 480 minutos")

/**
 * Los estados de una cita. "no-asistio" es "No vino": el cliente no llegó.
 * Como "cancelada", libera el horario (`lib/ocupacion.ts`); a diferencia de
 * ella, cuenta como inasistencia en la ficha del cliente.
 */
export const ESTADOS_DE_CITA = ["pendiente", "confirmada", "en-progreso", "completada", "cancelada", "no-asistio"] as const

export type EstadoDeCita = (typeof ESTADOS_DE_CITA)[number]

/**
 * Con qué estado puede nacer una cita creada desde el panel. Los demás son
 * consecuencias de lo que pasa después y tienen sus reglas al editar
 * (`app/api/citas/[id]`): "No vino" sólo desde una cita que esperaba y cuya
 * hora pasó, "en progreso" y "completada" vienen del Tablero, y "cancelada"
 * se marca sobre una cita que existía. Crear directo en ellos se saltaba esas
 * reglas (y, con "no-asistio", inflaba el contador de inasistencias).
 */
export const ESTADOS_AL_CREAR = ["pendiente", "confirmada"] as const

export const MENSAJE_DE_ESTADO_AL_CREAR =
  "Una cita nueva sólo puede quedar pendiente o confirmada: los demás estados se marcan después, sobre la cita"

/**
 * Desde qué estados se marca "No vino": una reserva que seguía esperando.
 * En progreso el cliente ya llegó; completada, cancelada o ya marcada, no.
 */
const ESTADOS_QUE_PUEDEN_NO_VENIR: readonly string[] = ["pendiente", "confirmada"]

export function puedeMarcarseNoVino(estado: string): boolean {
  return ESTADOS_QUE_PUEDEN_NO_VENIR.includes(estado)
}

export const MENSAJE_DE_HORARIO_INVERTIDO = "La cita tiene que terminar después de empezar"

/** Una cita de duración cero o negativa no ocupa la agenda y rompe el cálculo de horas libres. */
export const terminaDespuesDeEmpezar = (inicio: Date, fin: Date): boolean => fin.getTime() > inicio.getTime()

/** 0 es domingo, 6 es sábado, como `Date.getDay()`. Un 2.5 ya no llega a la base. */
export const diaDeLaSemana = () => {
  const mensaje = "El día de la semana tiene que ser un número entero del 0 al 6"
  return z.number().int(mensaje).min(0, mensaje).max(6, mensaje)
}
