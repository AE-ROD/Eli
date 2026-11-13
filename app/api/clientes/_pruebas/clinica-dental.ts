import { MARCA_DE_CLIENTE_ELIMINADO } from "@/lib/clientes-eliminados"

/**
 * La clínica de prueba de los endpoints de la ficha clínica y del plan de
 * tratamiento (`app/api/clientes/[id]/{ficha,odontograma,evoluciones,plan}`).
 *
 * Tres negocios: la Clínica Aurora (dental, la del test), otra clínica dental
 * con nombres que coinciden a propósito (sólo el `businessId` las distingue)
 * y un salón (no dental: para él nada clínico existe). Camila tiene de todo:
 * ficha, odontograma, evoluciones y un plan en su versión 2 con una etapa
 * aprobada y otra por aprobar. Beto es otro paciente de la misma clínica con
 * su propio plan (para "la etapa de otro paciente es 404"). Nadia no tiene
 * nada clínico.
 */

type Registro = Record<string, unknown>

export const CLINICA = "clinica-aurora"
export const OTRA_CLINICA = "clinica-dos"
export const SALON = "salon-uno"

const enLaClinica = (user: Registro) => ({ user: { businessName: "Clínica Aurora", ...user, rubro: "odontologia" } })

export const sesionesDentales = {
  dueña: enLaClinica({ id: "u-duena", role: "owner", businessId: CLINICA, memberId: null }),
  /** La recepción: ve la alerta de alergias y el plan (sólo lectura), nada más de la ficha. */
  encargado: enLaClinica({ id: "u-recepcion", role: "admin", businessId: CLINICA, memberId: "m-recepcion" }),
  perez: enLaClinica({ id: "u-perez", role: "worker", businessId: CLINICA, memberId: "m-perez" }),
  nunez: enLaClinica({ id: "u-nunez", role: "worker", businessId: CLINICA, memberId: "m-nunez" }),
  /** Dueña de la otra clínica dental: para ella, nada de la Clínica Aurora existe. */
  dueñaAjena: {
    user: { id: "u-ajena", role: "owner", businessId: OTRA_CLINICA, businessName: "Clínica Dos", memberId: null, rubro: "odontologia" },
  },
  /** La dueña de un salón: nada clínico existe, ni para sus propios clientes. */
  salon: { user: { id: "u-salon", role: "owner", businessId: SALON, businessName: "Salón Uno", memberId: null, rubro: "salon" } },
  /** Una sesión de antes del rubro: sin él, nada es dental (falla cerrado). */
  sinRubro: { user: { id: "u-duena", role: "owner", businessId: CLINICA, businessName: "Clínica Aurora", memberId: null } },
  /** Sesión válida pero sin id de usuario: no hay a quién firmar lo que se escribe. */
  sinUsuario: enLaClinica({ id: "", role: "owner", businessId: CLINICA, memberId: null }),
}

export const CREADO = new Date("2026-09-01T12:00:00.000Z")
export const APROBADA_EL = new Date("2026-10-28T15:00:00.000Z")
export const REALIZADA_EL = new Date("2026-10-28T16:00:00.000Z")

function cita(id: string, datos: Registro): Registro {
  return {
    id,
    businessId: CLINICA,
    title: "Control",
    status: "confirmada",
    startTime: new Date("2026-11-06T13:30:00.000Z"),
    endTime: new Date("2026-11-06T14:00:00.000Z"),
    ...datos,
  }
}

function prestacion(id: string, etapaId: string, datos: Registro): Registro {
  return { id, businessId: CLINICA, etapaId, createdAt: CREADO, ...datos }
}

/** Todo lo de arriba, para `base.reiniciar`. Cada test pisa lo que necesita. */
export function escenarioDental() {
  return {
    user: [
      { id: "u-duena", name: "Valentina Soto", email: "valentina@aurora.test" },
      { id: "u-recepcion", name: "Rosa Morales", email: "rosa@aurora.test" },
      { id: "u-perez", name: "Diego Pérez", email: "diego@aurora.test" },
      { id: "u-nunez", name: "Laura Núñez", email: "laura@aurora.test" },
      { id: "u-ajena", name: "Valentina Soto", email: "valentina@dos.test" },
      { id: "u-ajeno", name: "Diego Pérez", email: "diego@dos.test" },
      { id: "u-salon", name: "Ana Salón", email: "ana@salon.test" },
    ],
    business: [
      { id: CLINICA, name: "Clínica Aurora", slug: "aurora", userId: "u-duena", type: "odontologia" },
      { id: OTRA_CLINICA, name: "Clínica Dos", slug: "dos", userId: "u-ajena", type: "odontologia" },
      { id: SALON, name: "Salón Uno", slug: "salon-uno", userId: "u-salon", type: "salon" },
    ],
    businessMember: [
      { id: "m-recepcion", businessId: CLINICA, userId: "u-recepcion", role: "admin" },
      { id: "m-perez", businessId: CLINICA, userId: "u-perez", role: "worker" },
      { id: "m-nunez", businessId: CLINICA, userId: "u-nunez", role: "worker" },
      { id: "m-ajeno", businessId: OTRA_CLINICA, userId: "u-ajeno", role: "worker" },
    ],
    customer: [
      { id: "p-camila", businessId: CLINICA, name: "Camila", lastName: "Rojas" },
      { id: "p-beto", businessId: CLINICA, name: "Beto", lastName: "Fuentes" },
      { id: "p-nadia", businessId: CLINICA, name: "Nadia", lastName: "Paz" },
      { id: "p-eliminado", businessId: CLINICA, name: "Cliente eliminado", tags: [MARCA_DE_CLIENTE_ELIMINADO] },
      { id: "p-ajena", businessId: OTRA_CLINICA, name: "Camila", lastName: "Rojas" },
      { id: "p-salon", businessId: SALON, name: "Camila", lastName: "Rojas" },
    ],
    service: [
      { id: "s-resina", businessId: CLINICA, name: "Restauración resina compuesta", price: 48000 },
      { id: "s-exodoncia", businessId: CLINICA, name: "Exodoncia simple", price: 60000 },
      { id: "s-destartraje", businessId: CLINICA, name: "Destartraje y profilaxis", price: 35000 },
      { id: "s-sin-precio", businessId: CLINICA, name: "Evaluación", price: null },
      { id: "s-viejo", businessId: CLINICA, name: "Obturación amalgama", price: 20000, active: false },
      { id: "s-ajeno", businessId: OTRA_CLINICA, name: "Restauración resina compuesta", price: 50000 },
    ],
    appointment: [
      cita("cita-perez", { customerId: "p-camila", memberId: "m-perez" }),
      cita("cita-nunez", {
        customerId: "p-camila",
        memberId: "m-nunez",
        status: "pendiente",
        startTime: new Date("2026-11-12T13:00:00.000Z"),
        endTime: new Date("2026-11-12T13:30:00.000Z"),
      }),
      cita("cita-cancelada", { customerId: "p-camila", memberId: "m-perez", status: "cancelada" }),
      cita("cita-no-vino", { customerId: "p-camila", memberId: "m-perez", status: "no-asistio" }),
      cita("cita-beto", { customerId: "p-beto", memberId: "m-perez" }),
      cita("cita-ajena", { businessId: OTRA_CLINICA, customerId: "p-ajena", memberId: "m-ajeno" }),
    ],
    fichaClinica: [
      {
        id: "f-camila",
        businessId: CLINICA,
        customerId: "p-camila",
        fechaNacimiento: new Date("1992-03-15T00:00:00.000Z"),
        prevision: "isapre",
        alergias: "Penicilina",
        antecedentes: "Sin enfermedades crónicas declaradas",
        actualizadaPor: "Valentina Soto",
        odontogramaActualizadoEn: APROBADA_EL,
        odontogramaActualizadoPor: "Valentina Soto",
        createdAt: CREADO,
        updatedAt: APROBADA_EL,
      },
      {
        id: "f-ajena",
        businessId: OTRA_CLINICA,
        customerId: "p-ajena",
        alergias: "Látex",
        actualizadaPor: "Valentina Soto",
      },
    ],
    marcaDental: [
      { id: "mk-16o", businessId: CLINICA, customerId: "p-camila", pieza: 16, cara: "O", tipo: "caries" },
      { id: "mk-16m", businessId: CLINICA, customerId: "p-camila", pieza: 16, cara: "M", tipo: "caries" },
      { id: "mk-18", businessId: CLINICA, customerId: "p-camila", pieza: 18, cara: null, tipo: "extraccion" },
      { id: "mk-21", businessId: CLINICA, customerId: "p-camila", pieza: 21, cara: null, tipo: "corona" },
      { id: "mk-24", businessId: CLINICA, customerId: "p-camila", pieza: 24, cara: "O", tipo: "sellante" },
      { id: "mk-46", businessId: CLINICA, customerId: "p-camila", pieza: 46, cara: null, tipo: "ausente" },
      { id: "mk-ajena", businessId: OTRA_CLINICA, customerId: "p-ajena", pieza: 11, cara: "V", tipo: "caries" },
    ],
    evolucion: [
      {
        id: "ev-1",
        businessId: CLINICA,
        customerId: "p-camila",
        texto: "Evaluación inicial y registro del odontograma.",
        autorNombre: "Valentina Soto",
        autorUserId: "u-duena",
        createdAt: new Date("2026-09-12T14:00:00.000Z"),
      },
      {
        id: "ev-2",
        businessId: CLINICA,
        customerId: "p-camila",
        texto: "Destartraje y profilaxis de boca completa.",
        autorNombre: "Diego Pérez",
        autorUserId: "u-perez",
        memberId: "m-perez",
        appointmentId: "cita-perez",
        createdAt: new Date("2026-10-28T14:00:00.000Z"),
      },
      {
        id: "ev-ajena",
        businessId: OTRA_CLINICA,
        customerId: "p-ajena",
        texto: "Evolución de la otra clínica",
        autorNombre: "Valentina Soto",
        createdAt: new Date("2026-10-29T14:00:00.000Z"),
      },
    ],
    planDeTratamiento: [
      { id: "plan-v1", businessId: CLINICA, customerId: "p-camila", version: 1, vigente: false, creadoPorNombre: "Valentina Soto", createdAt: new Date("2026-09-12T15:00:00.000Z") },
      { id: "plan-v2", businessId: CLINICA, customerId: "p-camila", version: 2, vigente: true, creadoPorNombre: "Valentina Soto", createdAt: new Date("2026-10-28T15:00:00.000Z") },
      { id: "plan-beto", businessId: CLINICA, customerId: "p-beto", version: 1, vigente: true, creadoPorNombre: "Diego Pérez", createdAt: CREADO },
      { id: "plan-ajeno", businessId: OTRA_CLINICA, customerId: "p-ajena", version: 1, vigente: true, creadoPorNombre: "Valentina Soto", createdAt: CREADO },
    ],
    etapaDelPlan: [
      { id: "et-vieja", businessId: CLINICA, planId: "plan-v1", orden: 1, nombre: "Etapa de la versión 1", createdAt: CREADO },
      // A propósito fuera de orden en la tabla: la respuesta las ordena.
      { id: "et-rehabilitacion", businessId: CLINICA, planId: "plan-v2", orden: 2, nombre: "Rehabilitación", createdAt: CREADO },
      {
        id: "et-higiene",
        businessId: CLINICA,
        planId: "plan-v2",
        orden: 1,
        nombre: "Higiene y urgencia",
        estado: "aprobada",
        presentadaEn: new Date("2026-10-27T15:00:00.000Z"),
        aprobadaEn: APROBADA_EL,
        aprobadaPorNombre: "Valentina Soto",
        createdAt: CREADO,
      },
      { id: "et-beto", businessId: CLINICA, planId: "plan-beto", orden: 1, nombre: "Etapa de Beto", createdAt: CREADO },
      { id: "et-ajena", businessId: OTRA_CLINICA, planId: "plan-ajeno", orden: 1, nombre: "Etapa ajena", createdAt: CREADO },
    ],
    prestacionDelPlan: [
      prestacion("pr-16", "et-higiene", {
        orden: 2,
        pieza: 16,
        caras: ["O", "M"],
        serviceId: "s-resina",
        nombre: "Restauración resina compuesta",
        memberId: "m-perez",
        profesionalNombre: "Diego Pérez",
        estado: "agendada",
        appointmentId: "cita-perez",
        valorCents: 4_800_000,
      }),
      prestacion("pr-destartraje", "et-higiene", {
        orden: 1,
        nombre: "Destartraje y profilaxis",
        serviceId: "s-destartraje",
        profesionalNombre: "Valentina Soto",
        estado: "realizada",
        realizadaEn: REALIZADA_EL,
        valorCents: 3_500_000,
      }),
      prestacion("pr-46", "et-rehabilitacion", {
        orden: 1,
        pieza: 46,
        nombre: "Implante con corona",
        memberId: "m-perez",
        profesionalNombre: "Diego Pérez",
        valorCents: 89_000_000,
      }),
      prestacion("pr-27", "et-rehabilitacion", { orden: 2, pieza: 27, caras: ["O"], nombre: "Restauración resina compuesta", valorCents: 4_500_000 }),
      prestacion("pr-vieja", "et-vieja", { orden: 1, pieza: 16, caras: ["O"], nombre: "Restauración", valorCents: 4_000_000 }),
      prestacion("pr-beto", "et-beto", { orden: 1, pieza: 11, caras: ["M"], nombre: "Restauración", valorCents: 4_000_000 }),
      prestacion("pr-ajena", "et-ajena", { businessId: OTRA_CLINICA, orden: 1, pieza: 16, caras: ["O"], nombre: "Restauración", valorCents: 5_000_000 }),
    ],
  }
}

/** El segundo argumento de un handler de `app/api/clientes/[id]/…`. */
export const conParams = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) })
