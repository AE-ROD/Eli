import type { NextRequest } from "next/server"

/**
 * El negocio de prueba de los tests del tablero y de los reportes: dueña,
 * encargado, dos profesionales, y un segundo negocio con nombres que
 * coinciden a propósito, para que sólo el `businessId` los distinga.
 */

export const NEGOCIO = "negocio-1"
export const OTRO_NEGOCIO = "negocio-2"

export const sesiones = {
  dueña: { user: { id: "u-duena", role: "owner", businessId: NEGOCIO, businessName: "Salón Uno", memberId: null } },
  encargado: {
    user: { id: "u-encargado", role: "admin", businessId: NEGOCIO, businessName: "Salón Uno", memberId: "m-encargado" },
  },
  carla: { user: { id: "u-carla", role: "worker", businessId: NEGOCIO, businessName: "Salón Uno", memberId: "m-carla" } },
  pedro: { user: { id: "u-pedro", role: "worker", businessId: NEGOCIO, businessName: "Salón Uno", memberId: "m-pedro" } },
  /** Profesional legítimo del negocio, pero sin `memberId`: todo le tiene que fallar cerrado. */
  sinMiembro: { user: { id: "u-suelto", role: "worker", businessId: NEGOCIO, businessName: "Salón Uno" } },
  /** Dueño del otro negocio: para él, nada del negocio 1 existe. */
  dueñoAjeno: { user: { id: "u-otro", role: "owner", businessId: OTRO_NEGOCIO, businessName: "Salón Dos", memberId: null } },
}

type Registro = Record<string, unknown>

/**
 * Un monto escrito en unidades, como se lee (`centavos(25000)`), en los
 * centavos enteros que guarda la base. Es aparte de `aCentavos` a propósito:
 * si la conversión de producción tuviera un error, los escenarios no lo
 * heredarían.
 */
export const centavos = (unidades: number) => Math.round(unidades * 100)

/** Una atención del negocio 1, en espera, de María, salvo lo que se pise. */
export function atencion(id: string, datos: Registro = {}): Registro {
  return {
    id,
    businessId: NEGOCIO,
    customerId: "c-maria",
    customerName: "María González",
    status: "en-espera",
    arrivedAt: new Date("2026-10-06T12:00:00.000Z"),
    ...datos,
  }
}

/** Una línea: un Corte de Carla a 8.000, salvo lo que se pise. El precio va en centavos, como en la base. */
export function linea(id: string, visitId: string, datos: Registro = {}): Registro {
  return {
    id,
    visitId,
    serviceId: "s-corte",
    serviceName: "Corte",
    memberId: "m-carla",
    byOwner: false,
    professionalName: "Carla Profesional",
    priceCents: centavos(8000),
    ...datos,
  }
}

/** Una línea hecha por la dueña: `byOwner`, sin `memberId`. */
export function lineaDeLaDueña(id: string, visitId: string, datos: Registro = {}): Registro {
  return linea(id, visitId, { memberId: null, byOwner: true, professionalName: "Ana Dueña", ...datos })
}

/** Un pago de `monto` en unidades; la base lo guarda en centavos. */
export function pago(id: string, visitId: string, method: string, monto: number): Registro {
  return { id, visitId, method, amountCents: centavos(monto), createdAt: new Date("2026-10-06T15:00:00.000Z") }
}

/** Lo que tiene todo escenario: personas, negocios, servicios y clientes. */
export function datosBase() {
  return {
    user: [
      { id: "u-duena", name: "Ana Dueña", email: "duena@uno.test" },
      { id: "u-encargado", name: "Bruno Encargado", email: "encargado@uno.test" },
      { id: "u-carla", name: "Carla Profesional", email: "carla@uno.test" },
      { id: "u-pedro", name: "Pedro Profesional", email: "pedro@uno.test" },
      { id: "u-otro", name: "Otro Dueño", email: "dueno@dos.test" },
      { id: "u-ajeno", name: "Carla Profesional", email: "carla@dos.test" },
    ],
    business: [
      { id: NEGOCIO, name: "Salón Uno", slug: "salon-uno", userId: "u-duena" },
      { id: OTRO_NEGOCIO, name: "Salón Dos", slug: "salon-dos", userId: "u-otro" },
    ],
    businessMember: [
      { id: "m-encargado", businessId: NEGOCIO, userId: "u-encargado", role: "admin", createdAt: new Date("2026-01-01") },
      { id: "m-carla", businessId: NEGOCIO, userId: "u-carla", role: "worker", createdAt: new Date("2026-01-02") },
      { id: "m-pedro", businessId: NEGOCIO, userId: "u-pedro", role: "worker", createdAt: new Date("2026-01-03") },
      { id: "m-ajeno", businessId: OTRO_NEGOCIO, userId: "u-ajeno", role: "worker", createdAt: new Date("2026-01-01") },
    ],
    service: [
      { id: "s-corte", businessId: NEGOCIO, name: "Corte", price: 8000 },
      { id: "s-color", businessId: NEGOCIO, name: "Color", price: 25000 },
      { id: "s-peinado", businessId: NEGOCIO, name: "Peinado", price: null },
      { id: "s-viejo", businessId: NEGOCIO, name: "Alisado", price: 30000, active: false },
      { id: "s-ajeno", businessId: OTRO_NEGOCIO, name: "Corte", price: 9000 },
    ],
    customer: [
      { id: "c-maria", businessId: NEGOCIO, name: "María", lastName: "González" },
      { id: "c-beto", businessId: NEGOCIO, name: "Beto", lastName: null },
      { id: "c-ajeno", businessId: OTRO_NEGOCIO, name: "María", lastName: "González" },
    ],
  }
}

/** Un pedido con lo que leen estos endpoints: la URL y, si hay, el cuerpo JSON. */
export function pedido(url: string, cuerpo?: unknown): NextRequest {
  return {
    url,
    json: () => (cuerpo === undefined ? Promise.reject(new SyntaxError("Unexpected end of JSON input")) : Promise.resolve(cuerpo)),
  } as unknown as NextRequest
}

export const conId = (id: string) => ({ params: Promise.resolve({ id }) })
