import { NEGOCIO, OTRO_NEGOCIO, datosBase, sesiones } from "./datos"

/**
 * El negocio de prueba de `datos.ts` como clínica dental, para los tests de
 * sillones, citas con sillón y el inicio de la clínica. Mismas personas y los
 * mismos ids: la dueña, el encargado (recepción) y Carla y Pedro, que acá son
 * odontólogos. El otro negocio también es una clínica, con un sillón que se
 * llama igual a propósito, para que sólo el `businessId` los distinga.
 */

const conRubro = <T extends { user: Record<string, unknown> }>(sesion: T) => ({
  user: { ...sesion.user, rubro: "odontologia" },
})

export const sesionesDentales = {
  dueña: conRubro(sesiones.dueña),
  encargado: conRubro(sesiones.encargado),
  carla: conRubro(sesiones.carla),
  pedro: conRubro(sesiones.pedro),
  sinMiembro: conRubro(sesiones.sinMiembro),
  dueñoAjeno: conRubro(sesiones.dueñoAjeno),
}

/** Santiago en octubre de 2026 está en UTC-3. El 20 de octubre de 2026 es martes. */
export const santiago = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`)

/** Una cita del negocio 1, de María con Carla, pendiente, salvo lo que se pise. */
export function citaDental(id: string, fecha: string, inicio: string, fin: string, datos: Record<string, unknown> = {}) {
  return {
    id,
    businessId: NEGOCIO,
    customerId: "c-maria",
    memberId: "m-carla",
    title: "Control",
    status: "pendiente",
    startTime: santiago(fecha, inicio),
    endTime: santiago(fecha, fin),
    ...datos,
  }
}

/**
 * Lo de `datosBase` con los dos negocios como clínicas y sus sillones: dos
 * activos y uno desactivado en el negocio 1, y uno ajeno. Sin horarios de
 * atención: así crear o mover no trae advertencias de horario.
 */
export function datosDeLaClinica() {
  const base = datosBase()
  return {
    ...base,
    business: base.business.map((negocio) => ({ ...negocio, type: "odontologia" })),
    sillon: [
      { id: "sl-1", businessId: NEGOCIO, nombre: "Sillón 1", orden: 1 },
      { id: "sl-2", businessId: NEGOCIO, nombre: "Sillón 2", orden: 2 },
      { id: "sl-viejo", businessId: NEGOCIO, nombre: "Sillón 3", orden: 3, activo: false },
      { id: "sl-ajeno", businessId: OTRO_NEGOCIO, nombre: "Sillón 1", orden: 1 },
    ],
  }
}
