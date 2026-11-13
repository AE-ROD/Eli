/**
 * Los planes de Eli (docs/PRODUCTO.md, sección 4). Se elige uno al crear la
 * cuenta y se guarda en el negocio (`Business.plan`).
 *
 * - **independiente**: atiende sólo el dueño. Puede tener hasta
 *   `MAX_SEDES` sedes, cada una con su horario por día (`lib/sedes.ts`), y NO
 *   puede invitar a nadie.
 * - **equipo**: la clínica o el negocio con equipo. Puede invitar a otras
 *   personas y tiene una sola sede: la dirección del negocio, porque es un solo
 *   lugar físico.
 *
 * La lista de ids tiene que coincidir con el CHECK `negocios_plan_check` de la
 * migración `20261112120000_etapa_9_planes_y_sedes` (un test lo comprueba).
 * Una misma persona puede estar en una clínica (otro negocio, otro contexto,
 * `lib/contextos.ts`) y tener además su propio negocio Independiente.
 */
export const PLANES = ["independiente", "equipo"] as const

export type PlanId = (typeof PLANES)[number]

/**
 * El plan de un negocio que no dice cuál tiene: lo que dice la base para todo
 * negocio creado sin elegir (el default de la columna). Los permisos NO usan
 * esto: un plan que falta o que no se conoce no habilita nada que dependa de
 * él (falla cerrado).
 */
export const PLAN_POR_DEFECTO: PlanId = "equipo"

/** Si el valor es el id de un plan. Un id desconocido, vacío o que no es texto, no. */
export function esPlanValido(valor: unknown): valor is PlanId {
  return typeof valor === "string" && (PLANES as readonly string[]).includes(valor)
}

/**
 * El plan que dice un valor de afuera (la base, el token, la sesión), o `null`
 * si no es un plan conocido: ausente, vacío, con otra letra o de otro tipo. Es
 * lo que viaja por el contexto, el token, la sesión y el actor
 * (`lib/contextos.ts`, `lib/auth.ts`, `lib/permisos.ts`): `null` no habilita
 * nada que dependa del plan.
 */
export function planConocido(valor: unknown): PlanId | null {
  return esPlanValido(valor) ? valor : null
}

/** Cómo se llama el plan en pantalla. */
export function nombreDePlan(plan: PlanId): string {
  return plan === "independiente" ? "Independiente" : "Equipo"
}

/** Una frase corta para la pantalla de elegir el plan, a quien le habla: "tú". */
export function descripcionDePlan(plan: PlanId): string {
  return plan === "independiente" ? "Trabajas por tu cuenta" : "Tienes una clínica o un equipo"
}

/**
 * Cuántas personas atienden en un negocio recién creado (`Business.teamSize`).
 * En Independiente es una sola, la dueña: no se pregunta, y lo que llegue de
 * afuera no cuenta. En Equipo es lo que se pidió, o una si no se pidió nada
 * (lo de siempre). Una sola regla para el registro y para completar el perfil.
 */
export function personasAlCrearElNegocio(plan: PlanId, pedidas?: number): number {
  return plan === "independiente" ? 1 : (pedidas ?? 1)
}
