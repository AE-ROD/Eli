import type { Prisma } from "@prisma/client"
import { sedeParaReservar, type SedeDelNegocio } from "@/lib/sedes"

/**
 * La sede de una reserva pública (etapa 9, plan Independiente): leerla del
 * pedido, revalidarla contra las sedes ACTIVAS del negocio del `slug` y
 * decidir con qué horario se mira la disponibilidad. Lo comparten
 * `disponibilidad`, `confirmar`, la lista de espera y la fila virtual.
 *
 * El navegador no es de fiar: el `sedeId` que llega se vuelve a comprobar acá,
 * siempre contra las sedes del negocio del `slug` (nunca las de otro), y el
 * servidor es quien estampa la sede en la cita.
 *
 * Es lógica pura, salvo `leerSedesDeLaReserva`, que recibe la base.
 */

/** El 400 de una sede que falta (con varias sedes hay que elegir) o que no es una sede activa del negocio. */
export const MENSAJE_SEDE_NO_VALIDA = "Elige la sede donde quieres reservar"

/** Un id (`cuid()`, 25 caracteres): el tope corta un texto arbitrario antes de la base. */
export const LARGO_MAXIMO_DE_ID_DE_SEDE = 64

/** Cuántas sedes se leen como mucho: la base no deja más de `MAX_SEDES` activas, esto es sólo un tope duro. */
const TOPE_DE_SEDES_LEIDAS = 20

/** Una sede activa del negocio, con lo que hace falta para reservar en ella. */
export type SedeDeLaReserva = Pick<SedeDelNegocio, "id" | "nombre" | "direccion" | "comuna" | "activo">

/** Dónde queda la cita, para los correos y las respuestas públicas: nada interno (ni id ni teléfono). */
export interface LugarDeLaReserva {
  nombre: string
  direccion: string
  comuna: string
}

/** El `select` de la sede de una cita, para leerla junto a la cita. */
export const SELECCION_DE_LA_SEDE_DE_LA_CITA = {
  nombre: true,
  direccion: true,
  comuna: true,
} satisfies Prisma.SedeSelect

/**
 * Las sedes ACTIVAS del negocio (`businessId` de la sesión o del `slug`), en el
 * orden de la lista. Un negocio sin sedes devuelve una lista vacía: la reserva
 * va sin sede, como siempre.
 */
export async function leerSedesDeLaReserva(
  db: Pick<Prisma.TransactionClient, "sede">,
  businessId: string
): Promise<SedeDeLaReserva[]> {
  return db.sede.findMany({
    where: { businessId, activo: true },
    select: { id: true, nombre: true, direccion: true, comuna: true, activo: true },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    take: TOPE_DE_SEDES_LEIDAS,
  })
}

/**
 * Un valor que no puede ser el id de ninguna sede: lo que se busca cuando el
 * navegador mandó un `sedeId` mal armado. Nunca coincide con una sede, así que
 * con sedes activas es un 400 y sin ellas se ignora, como cualquier otro id.
 */
const SEDE_QUE_NO_EXISTE = "?"

/**
 * Lo que mandó el navegador como `sedeId`: nada (o vacío) es `null`, "no eligió";
 * un texto razonable es el id tal cual (sin espacios en las puntas); y cualquier
 * otra cosa (un número, un objeto, un texto enorme) es un id que no existe.
 * Nunca lanza.
 */
export function leerSedeDelPedido(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null
  if (typeof valor !== "string" || valor.length > LARGO_MAXIMO_DE_ID_DE_SEDE) return SEDE_QUE_NO_EXISTE
  return valor.trim() || null
}

/** El `sedeId` del cuerpo JSON de un pedido (`leerSedeDelPedido`); un cuerpo que no es un objeto no trae sede. */
export function leerSedeDelCuerpo(cuerpo: unknown): string | null {
  const esObjeto = typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo)
  return leerSedeDelPedido(esObjeto ? (cuerpo as Record<string, unknown>).sedeId : undefined)
}

export type EleccionDeSede<S> =
  /**
   * `sede`: donde queda la reserva (`null` en un negocio sin sedes). `sedeDelHorario`:
   * con qué sede se mira el horario: la elegida cuando hay dos o más sedes
   * activas, y `null` en cualquier otro caso (sin sedes, o con una sola, que se
   * comporta como el negocio de siempre: el horario vigente).
   */
  | { tipo: "ok"; sede: S | null; sedeDelHorario: string | null }
  /** Con alguna sede activa, la elección falta o no es una sede activa de este negocio: 400. */
  | { tipo: "no-valida" }

/**
 * Revalida la elección del cliente (`sedeParaReservar`) contra las sedes del
 * negocio. Sin sedes activas, el id que llegue se ignora. Con una sola, se
 * estampa esa aunque no llegue nada. Con dos o más, hay que elegir una activa.
 */
export function resolverSedeDeLaReserva<S extends Pick<SedeDelNegocio, "id" | "activo">>(
  sedes: readonly S[],
  elegida: string | null | undefined
): EleccionDeSede<S> {
  const activas = sedes.filter((sede) => sede.activo === true)
  const sede = sedeParaReservar(activas, elegida)
  if (activas.length > 0 && !sede) return { tipo: "no-valida" }
  return { tipo: "ok", sede, sedeDelHorario: activas.length >= 2 && sede ? sede.id : null }
}

/** Si el negocio tiene dos o más sedes activas: se pregunta "¿Dónde?" y no se usa lo que sólo vale con una sola sede. */
export function hayVariasSedes(sedes: readonly Pick<SedeDelNegocio, "activo">[]): boolean {
  return sedes.filter((sede) => sede.activo === true).length >= 2
}

/** El lugar de la reserva, sólo con lo público de la sede. */
export function lugarDeLaSede(sede: Pick<SedeDelNegocio, "nombre" | "direccion" | "comuna">): LugarDeLaReserva {
  return { nombre: sede.nombre, direccion: sede.direccion, comuna: sede.comuna }
}
