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

export const registroSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  contrasena: z.string().min(8),
  nombreNegocio: z.string().min(2),
  tipoNegocio: tipoNegocioSchema,
})

export const reservaSchema = z.object({
  servicioId: z.string(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  nombre: z.string().min(2),
  apellido: z.string().min(2),
  cedula: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefono: z.string().optional(),
  comentarios: z.string().optional(),
})

export const recuperarContrasenaSchema = z.object({
  email: z.string().email(),
})

export const restablecerContrasenaSchema = z.object({
  token: z.string().min(1),
  contrasena: z.string().min(8),
})
