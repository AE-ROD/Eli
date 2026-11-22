import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { aCentavos, deCentavos, esMontoDePagoValido } from "@/lib/atenciones"
import {
  SESIONES_MAXIMAS,
  SESIONES_MINIMAS,
  VIGENCIA_MAXIMA_EN_MESES,
  ahorroDelPaquete,
  valorPorSesion,
} from "@/lib/paquetes"

/**
 * Lo que comparten los endpoints de los paquetes que ofrece el negocio
 * (`/api/configuracion/paquetes`) y la pantalla de Configuración que los
 * muestra al entrar: qué se valida y cómo viaja un paquete al navegador. Las
 * reglas del paquete están en `lib/paquetes.ts`.
 */

const sesiones = () =>
  z
    .number({ required_error: "Faltan las sesiones", invalid_type_error: "Las sesiones tienen que ser un número" })
    .int("Las sesiones tienen que ser un número entero")
    .min(SESIONES_MINIMAS, `Un paquete tiene al menos ${SESIONES_MINIMAS} sesiones`)
    .max(SESIONES_MAXIMAS, `Un paquete tiene como máximo ${SESIONES_MAXIMAS} sesiones`)

/** En unidades (pesos), como todo precio de la API; se guarda en centavos. Siempre mayor que cero. */
const precio = () =>
  z
    .number({ required_error: "Falta el precio", invalid_type_error: "El precio tiene que ser un número" })
    .refine(esMontoDePagoValido, "El precio tiene que ser mayor que cero, sin pasar del tope, con hasta dos decimales")

/** `null` es "no vence". */
const vigenciaMeses = () =>
  z
    .number({ invalid_type_error: "La vigencia tiene que ser un número de meses" })
    .int("La vigencia tiene que ser un número entero de meses")
    .min(1, "La vigencia tiene que ser de al menos 1 mes")
    .max(VIGENCIA_MAXIMA_EN_MESES, `La vigencia no puede pasar de ${VIGENCIA_MAXIMA_EN_MESES} meses`)
    .nullable()

export const paqueteNuevoSchema = z.object({
  servicioId: z.string({ required_error: "Falta el servicio" }).trim().min(1, "Falta el servicio").max(100),
  sesiones: sesiones(),
  precio: precio(),
  vigenciaMeses: vigenciaMeses().optional(),
})

/** El servicio de un paquete no se cambia: es otro paquete. */
export const edicionDePaqueteSchema = z
  .object({
    sesiones: sesiones().optional(),
    precio: precio().optional(),
    vigenciaMeses: vigenciaMeses().optional(),
    activo: z.boolean({ invalid_type_error: "Activo tiene que ser sí o no" }).optional(),
  })
  .refine((datos) => Object.values(datos).some((valor) => valor !== undefined), {
    message: "No hay nada que cambiar",
  })

export const MENSAJE_DE_SESION_SIN_VALOR = "El precio es muy bajo para esa cantidad de sesiones: cada sesión quedaría en $0."

/**
 * Cada sesión tiene que valer algo: el precio se reparte hacia abajo en
 * centavos enteros, y un paquete vendido no admite sesiones de $0.
 */
export function cadaSesionValeAlgo(priceCents: number, cuantas: number): boolean {
  return valorPorSesion(priceCents, cuantas) > 0
}

/** Lo que se lee de un paquete para mostrarlo: con el nombre y el precio suelto de su servicio. */
export const SELECCION_DE_PAQUETE = {
  id: true,
  serviceId: true,
  sesiones: true,
  priceCents: true,
  vigenciaMeses: true,
  active: true,
  service: { select: { name: true, price: true } },
} satisfies Prisma.PaqueteDeSesionesSelect

export type PaqueteLeido = Prisma.PaqueteDeSesionesGetPayload<{ select: typeof SELECCION_DE_PAQUETE }>

/** Un paquete como viaja al navegador: los montos en unidades (pesos), no en centavos. */
export interface PaqueteDelNegocio {
  id: string
  servicioId: string
  servicio: string
  sesiones: number
  precio: number
  vigenciaMeses: number | null
  activo: boolean
  /** Lo que vale cada sesión, en unidades. */
  valorPorSesion: number
  /** Cuánto se ahorra frente a pagar cada sesión suelta, en porcentaje entero; `null` si no hay ahorro o el servicio no tiene precio. */
  ahorro: number | null
}

export function formatearPaquete(paquete: PaqueteLeido): PaqueteDelNegocio {
  const precioSuelto = paquete.service.price
  return {
    id: paquete.id,
    servicioId: paquete.serviceId,
    servicio: paquete.service.name,
    sesiones: paquete.sesiones,
    precio: deCentavos(paquete.priceCents),
    vigenciaMeses: paquete.vigenciaMeses,
    activo: paquete.active,
    valorPorSesion: deCentavos(valorPorSesion(paquete.priceCents, paquete.sesiones)),
    ahorro: ahorroDelPaquete(paquete.priceCents, paquete.sesiones, precioSuelto == null ? null : aCentavos(precioSuelto)),
  }
}
