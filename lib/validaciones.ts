import { z } from "zod"

export const registroSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  contrasena: z.string().min(8),
  nombreNegocio: z.string().min(2),
  tipoNegocio: z.string().min(1),
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

export const olvidePasswordSchema = z.object({
  email: z.string().email(),
})

export const restablecerPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})
