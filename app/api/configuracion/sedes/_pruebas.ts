import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"

/**
 * Datos de prueba compartidos por los tests de `/api/configuracion/sedes/**` y
 * `/api/configuracion/plan`: dos negocios Independiente (el 1 y el 2, con
 * nombres que coinciden a propósito), la dueña de cada uno y el resto de los
 * roles del negocio 1. Sin integrantes: un negocio Independiente no los tiene.
 *
 * Las sesiones traen el `plan` que lleva el token (`lib/permisos.ts`); la base
 * dice el suyo (`business.plan`), y un test puede hacerlos distintos.
 */

export { NEGOCIO, OTRO_NEGOCIO }

const sesion = (id: string, role: string, businessId: string, plan: string | null, memberId: string | null = null) => ({
  user: { id, role, businessId, businessName: "Salón", memberId, plan },
})

export const sesionesDeSedes = {
  dueña: sesion("u-duena", "owner", NEGOCIO, "independiente"),
  /** La dueña con un token que dice Equipo (el plan se lee de la sesión en `puedeGestionarSedes`). */
  dueñaEquipo: sesion("u-duena", "owner", NEGOCIO, "equipo"),
  /** Una sesión de antes del campo: sin plan. */
  dueñaSinPlan: sesion("u-duena", "owner", NEGOCIO, null),
  encargado: sesion("u-encargado", "admin", NEGOCIO, "independiente", "m-encargado"),
  profesional: sesion("u-carla", "worker", NEGOCIO, "independiente", "m-carla"),
  dueñaAjena: sesion("u-otro", "owner", OTRO_NEGOCIO, "independiente"),
}

type Registro = Record<string, unknown>

export const sede = (id: string, businessId: string, nombre: string, extra: Registro = {}): Registro => ({
  id,
  businessId,
  nombre,
  direccion: `Calle ${nombre} 1`,
  comuna: "Ñuñoa",
  ...extra,
})

export const franja = (
  id: string,
  businessId: string,
  sedeId: string | null,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  extra: Registro = {}
): Registro => ({ id, businessId, sedeId, dayOfWeek, startTime, endTime, ...extra })

/** Una cita del negocio. `inicio` es una fecha ISO; dura una hora. */
export const cita = (id: string, businessId: string, sedeId: string | null, inicio: string, extra: Registro = {}): Registro => ({
  id,
  businessId,
  title: "Corte",
  startTime: new Date(inicio),
  endTime: new Date(new Date(inicio).getTime() + 60 * 60 * 1000),
  sedeId,
  ...extra,
})

export const inscripcion = (id: string, businessId: string, serviceId: string, sedeId: string | null, extra: Registro = {}): Registro => ({
  id,
  businessId,
  serviceId,
  sedeId,
  fecha: "2026-11-20",
  nombre: "Ana",
  apellido: "Pérez",
  email: `${id}@test`,
  tokenHash: `hash-${id}`,
  ...extra,
})

/** "Ahora" de los tests: jueves 12 de noviembre de 2026, a mediodía. */
export const AHORA = new Date("2026-11-12T15:00:00.000Z")
export const FUTURO = "2026-11-20T14:00:00.000Z"
export const PASADO = "2026-11-02T14:00:00.000Z"

/** Los dos negocios Independiente, sin sedes ni horarios, más lo que `datosBase` trae (servicios, clientes). */
export function datosDeSedes(extra: Record<string, Registro[]> = {}) {
  const base = datosBase()
  return {
    user: base.user,
    business: [
      { id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena", plan: "independiente", address: "Av. Siempre Viva 123", comuna: "Providencia" },
      { id: OTRO_NEGOCIO, name: "Salón Dos", slug: "salon-dos", userId: "u-otro", plan: "independiente", address: "Otra calle 9", comuna: "Maipú" },
    ],
    service: base.service,
    customer: base.customer,
    ...extra,
  }
}
