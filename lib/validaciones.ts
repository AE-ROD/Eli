import { z } from "zod"
import { IDS_DE_RUBROS } from "@/lib/rubros"

/**
 * El rubro de un negocio nuevo: sólo ids del catálogo (`lib/rubros.ts`). Antes
 * valía cualquier texto, y así quedaron guardados `salud`, `fitness` y `otro`
 * en negocios de cuando Eli apuntaba a otros rubros. Esos negocios siguen
 * existiendo y se muestran bien (`nombreDeRubro`), pero ya no se puede crear
 * uno nuevo con un rubro que el catálogo no conoce.
 */
export const tipoNegocioSchema = z.enum(IDS_DE_RUBROS)

/**
 * Largos máximos de lo que llega de afuera (M10/F-06): sin tope, la página
 * pública y el registro guardaban textos de cualquier largo. El email, 254
 * (el máximo de una dirección); la contraseña, 72, porque bcrypt ignora lo
 * que sigue. Los mensajes van en español: los endpoints públicos responden
 * con el primero como `error`.
 */
const LARGO_MAXIMO_EMAIL = 254
const LARGO_MAXIMO_NOMBRE = 100

const emailSchema = z
  .string({ required_error: "Falta el email", invalid_type_error: "El email no es válido" })
  .trim()
  .max(LARGO_MAXIMO_EMAIL, `El email puede tener hasta ${LARGO_MAXIMO_EMAIL} caracteres`)
  .email("El email no es válido")

/**
 * El email de una cuenta (B4): sin espacios en las puntas y en minúsculas,
 * siempre, al guardarlo y al buscarlo. Para el servidor de correo `Ana@x.com`
 * y `ana@x.com` son la misma casilla; si acá fueran distintos, una persona
 * podía tener dos cuentas o no encontrar la suya al entrar. Sólo para cuentas:
 * el email del cliente de una reserva se guarda como lo escribió.
 */
export const normalizarEmail = (email: string): string => email.trim().toLowerCase()

/** `emailSchema` normalizado: para registro, recuperar la contraseña e invitar al equipo. */
const emailDeCuentaSchema = emailSchema.transform(normalizarEmail)

/** Un nombre o apellido: sin espacios alrededor, de 2 a 100 caracteres. */
const nombreSchema = (campo: string) =>
  z
    .string({ required_error: `Falta el ${campo}`, invalid_type_error: `El ${campo} no es válido` })
    .trim()
    .min(2, `El ${campo} tiene que tener al menos 2 caracteres`)
    .max(LARGO_MAXIMO_NOMBRE, `El ${campo} puede tener hasta ${LARGO_MAXIMO_NOMBRE} caracteres`)

/** Un texto opcional de hasta `maximo` caracteres. */
const opcionalHasta = (campo: string, maximo: number) =>
  z
    .string({ invalid_type_error: `${campo} no es válido` })
    .max(maximo, `${campo} puede tener hasta ${maximo} caracteres`)
    .optional()

export const registroSchema = z.object({
  nombre: nombreSchema("nombre"),
  email: emailDeCuentaSchema,
  contrasena: z
    .string({ required_error: "Falta la contraseña", invalid_type_error: "La contraseña no es válida" })
    .min(8, "La contraseña tiene que tener al menos 8 caracteres")
    .max(72, "La contraseña puede tener hasta 72 caracteres"),
  nombreNegocio: z
    .string({ required_error: "Falta el nombre del negocio", invalid_type_error: "El nombre del negocio no es válido" })
    .trim()
    .min(2, "El nombre del negocio tiene que tener al menos 2 caracteres")
    .max(80, "El nombre del negocio puede tener hasta 80 caracteres"),
  tipoNegocio: tipoNegocioSchema,
})

export const reservaSchema = z.object({
  servicioId: z
    .string({ required_error: "Falta el servicio", invalid_type_error: "El servicio no es válido" })
    .min(1, "Falta el servicio")
    .max(64, "El servicio no es válido"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida: tiene que tener el formato AAAA-MM-DD"),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "La hora no es válida: tiene que tener el formato HH:MM"),
  nombre: nombreSchema("nombre"),
  apellido: nombreSchema("apellido"),
  cedula: opcionalHasta("La cédula", 30),
  // Vacío es "sin email". No con `.or(z.literal(""))`: la unión fallida da
  // un "Invalid input" genérico en vez del mensaje del email.
  email: z.preprocess((valor) => (valor === "" ? undefined : valor), emailSchema.optional()),
  telefono: opcionalHasta("El teléfono", 30),
  comentarios: opcionalHasta("Los comentarios", 1000),
})

export const recuperarContrasenaSchema = z.object({
  email: emailDeCuentaSchema,
})

export const restablecerContrasenaSchema = z.object({
  token: z.string().min(1),
  contrasena: z.string().min(8),
})
