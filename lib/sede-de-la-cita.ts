import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { whereDeSedes, type Actor } from "@/lib/permisos"
import { planConocido } from "@/lib/planes"
import { MAX_SEDES, modoDeSedes, sedeParaReservar, type ModoDeSedes, type SedeDelNegocio } from "@/lib/sedes"

/**
 * La sede de una cita que se agenda desde el panel (etapa 9, plan
 * Independiente). El navegador no es de fiar: la sede que llega se vuelve a
 * comprobar acá, siempre contra las sedes del negocio de la SESIÓN (nunca las
 * de otro), y es el servidor quien la estampa en la cita.
 *
 * Reglas
 * ──────
 * - **Varias sedes activas** (`modoDeSedes`: plan Independiente con dos o más):
 *   cada hora agendada lleva su sede. Falta, o no vale: 400. Una sede que no
 *   es del negocio (o no existe): 404, sin distinguir cuál de las dos. Una del
 *   negocio pero desactivada: 400.
 * - **Una sola sede activa:** toda cita nueva lleva esa (aunque no se pida),
 *   y el negocio se comporta como siempre: ni la agenda ni los horarios
 *   cambian (el horario que cuenta es el vigente, no el de la sede).
 * - **Sin sedes** (todo negocio de hoy y todo plan Equipo): la cita va sin
 *   sede (`null`), como siempre, y el id que llegue se ignora.
 *
 * Mover o reagendar desde el panel NO cambia la sede: para eso se cancela y se
 * crea otra. La disponibilidad (el horario de atención) es la de la sede de la
 * cita; quién está libre sigue siendo del negocio entero, porque la persona
 * está en un solo lugar a la vez (`lib/agenda-publica.ts`).
 */

export const MENSAJE_SEDE_NO_ENCONTRADA = "Sede no encontrada"
export const MENSAJE_SEDE_DESACTIVADA = "Esa sede está desactivada: elige otra"
export const MENSAJE_ELEGIR_LA_SEDE = "Elige la sede donde se atiende"

/** Un id (`cuid()`, 25 caracteres): el tope corta un texto arbitrario antes de la base. */
const LARGO_MAXIMO_DE_ID_DE_SEDE = 64

/**
 * La sede de la cita en el cuerpo del pedido: un id, o `null`/vacío si no
 * eligió ninguna (como `memberId` y `sillonId`). Si la clave falta, tampoco.
 */
export const sedeDeLaCita = () =>
  z
    .string({ invalid_type_error: "La sede no es válida" })
    .max(LARGO_MAXIMO_DE_ID_DE_SEDE, "La sede no es válida")
    .nullable()
    .transform((valor) => valor?.trim() || null)

/**
 * Lo que el panel recibe de la sede de una cita: `sede: { id, nombre }`, o
 * `null` si no tiene (ni la dirección ni el teléfono).
 */
export const SELECCION_DE_LA_SEDE_DE_LA_CITA = {
  sede: { select: { id: true, nombre: true } },
} satisfies Prisma.AppointmentSelect

/** Una sede del negocio, con lo mínimo para decidir. */
export type SedeParaAgendar = Pick<SedeDelNegocio, "id" | "nombre" | "activo">

/** Las sedes del negocio de la sesión y el modo en que está (`una` o `varias`). */
export interface SedesParaAgendar {
  modo: ModoDeSedes
  /** TODAS las sedes del negocio, activas o no: así se distingue "desactivada" de "no existe". */
  sedes: SedeParaAgendar[]
}

/**
 * Las sedes del negocio de la sesión y su modo, leídos de la BASE (no del
 * token, que puede ir un paso atrás de un cambio de plan). Todo sale del
 * `businessId` de la sesión. Falla cerrado: con un plan que no es Independiente
 * (o que no se conoce) no hay sedes, aunque la base trajera alguna.
 */
export async function leerSedesParaAgendar(
  db: Pick<Prisma.TransactionClient, "business">,
  actor: Actor
): Promise<SedesParaAgendar> {
  const negocio = await db.business.findUnique({
    where: { id: actor.businessId },
    select: {
      plan: true,
      sedes: {
        where: whereDeSedes(actor),
        select: { id: true, nombre: true, activo: true },
        // Una sede no se borra, se desactiva: con el tiempo hay más que `MAX_SEDES`.
        take: MAX_SEDES * 10,
      },
    },
  })
  const sedes = planConocido(negocio?.plan) === "independiente" ? (negocio?.sedes ?? []) : []
  return { modo: modoDeSedes(negocio?.plan, sedes), sedes }
}

export type DecisionDeSede =
  | {
      tipo: "ok"
      /** La sede que se estampa en la cita: `null` en un negocio sin sedes. */
      sedeId: string | null
      /**
       * Con qué sede se mira el horario: la de la cita sólo con varias sedes
       * activas; con una sola (o ninguna), `null`, y vale el horario vigente
       * del negocio, como siempre.
       */
      sedeDelHorario: string | null
    }
  /** La sede que llegó no es del negocio o no existe (404). */
  | { tipo: "no-encontrada" }
  /** Es del negocio pero está desactivada (400). */
  | { tipo: "desactivada" }
  /** Con varias sedes activas, no eligió ninguna (400). */
  | { tipo: "falta" }

/**
 * Decide la sede de una cita nueva (`sedeParaReservar` de `lib/sedes.ts`) con
 * las sedes del negocio de la sesión y la que mandó el navegador.
 */
export function decidirSedeDeLaCita(lectura: SedesParaAgendar, elegida: string | null | undefined): DecisionDeSede {
  const activas = lectura.sedes.filter((sede) => sede.activo === true)
  // Sin sedes activas la cita va sin sede, y lo que llegue se ignora.
  if (activas.length === 0) return { tipo: "ok", sedeId: null, sedeDelHorario: null }

  const pedida = elegida?.trim() || null
  if (pedida) {
    const delNegocio = lectura.sedes.find((sede) => sede.id === pedida)
    if (!delNegocio) return { tipo: "no-encontrada" }
    if (!delNegocio.activo) return { tipo: "desactivada" }
  }

  const sede = sedeParaReservar(activas, pedida)
  if (!sede) return { tipo: "falta" }
  return { tipo: "ok", sedeId: sede.id, sedeDelHorario: lectura.modo === "varias" ? sede.id : null }
}

/** La respuesta de un rechazo de `decidirSedeDeLaCita`: el estado y el mensaje. */
export function rechazoDeSede(decision: Exclude<DecisionDeSede, { tipo: "ok" }>): { status: 400 | 404; error: string } {
  switch (decision.tipo) {
    case "no-encontrada":
      return { status: 404, error: MENSAJE_SEDE_NO_ENCONTRADA }
    case "desactivada":
      return { status: 400, error: MENSAJE_SEDE_DESACTIVADA }
    case "falta":
      return { status: 400, error: MENSAJE_ELEGIR_LA_SEDE }
  }
}

/**
 * Con qué sede se mira el horario de una cita que YA existe (al moverla o
 * reactivarla): la suya, sólo si el negocio está en modo `varias` y la cita
 * lleva sede. Si no, `null` (el horario vigente de siempre). No cambia la sede
 * de la cita.
 */
export async function sedeDelHorarioDeLaCita(
  db: Pick<Prisma.TransactionClient, "business">,
  actor: Actor,
  cita: { sedeId?: string | null }
): Promise<string | null> {
  if (!cita.sedeId) return null
  const { modo } = await leerSedesParaAgendar(db, actor)
  return modo === "varias" ? cita.sedeId : null
}
