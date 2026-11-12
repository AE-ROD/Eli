import type { Prisma } from "@prisma/client"
import { puedeConfigurarRepartoDeProtesis, whereDeCambiosDeReparto, type Actor } from "@/lib/permisos"
import { prisma } from "@/lib/prisma"

/**
 * (servidor) El historial de cambios de reparto de las prótesis (docs/PRODUCTO.md
 * §3.11): quién, cuándo y de cuánto a cuánto cambió la regla de un material o
 * la excepción de un odontólogo. Lo escribe `lib/protesis-servidor.ts` al
 * crear o cambiar un material y al crear, cambiar o quitar una excepción; esto
 * sólo lo lee, para la sección "Historial de cambios" de Comisiones › Reparto
 * de prótesis.
 *
 * Es dinero: sólo lo ve quien configura el reparto (la dueña de una clínica
 * dental, `puedeConfigurarRepartoDeProtesis`). Cualquier otro recibe la lista
 * vacía sin tocar la base, y la consulta además va por `whereDeCambiosDeReparto`,
 * que acota al negocio de la sesión y falla cerrado: nunca hay un filtro por un
 * `businessId` que venga de afuera.
 *
 * Los registros no tienen llaves foráneas a propósito: el material, el
 * odontólogo y quien hizo el cambio quedan con el nombre que tenían, así que
 * una fila sigue leyéndose aunque ya no existan.
 */

/** Cuántos cambios se muestran de entrada, y cuántos más trae cada "Ver más". */
export const CAMBIOS_POR_PAGINA = 50

/** Lo más que se muestra en una pantalla. Más viejo que eso se consulta por soporte, no se arrastra en el navegador. */
export const CAMBIOS_MAXIMOS = 500

/**
 * Las tres partes de un reparto en puntos base (10.000 = 100 %), cada una
 * `null` si el registro no la trae.
 */
export interface PartesDelCambio {
  pbOdontologo: number | null
  pbClinica: number | null
  pbTecnico: number | null
}

export interface CambioDeReparto {
  id: string
  /** El instante del cambio (ISO). Se lee en la zona del negocio al mostrarlo. */
  cuando: string
  /** La regla de un material, o la excepción de un odontólogo en ese material. */
  alcance: "material" | "excepcion"
  /** El nombre que tenía el material al cambiarse. */
  material: string
  /** El odontólogo de una excepción, con el nombre que tenía; `null` en el cambio de un material. */
  profesional: string | null
  /** Quien hizo el cambio, con el nombre que tenía (la base no admite uno vacío). */
  quien: string
  /** La regla de antes; `null` si no existía (se creó). */
  antes: PartesDelCambio | null
  /** La regla de después; `null` si se quitó (sólo una excepción). */
  despues: PartesDelCambio | null
}

export interface HistorialDeReparto {
  cambios: CambioDeReparto[]
  /** Hay cambios más viejos que los que se traen. */
  hayMas: boolean
}

const SIN_CAMBIOS: HistorialDeReparto = { cambios: [], hayMas: false }

/**
 * Cuántos cambios pide la pantalla (`?hasta=`): un entero entre
 * `CAMBIOS_POR_PAGINA` y `CAMBIOS_MAXIMOS`. Lo que falta, lo que no es un
 * número entero y lo que está fuera de rango (negativo, cero, enorme) no
 * rompe ni agranda la consulta: vuelve a los de siempre o se corta al tope.
 */
export function limiteDeCambios(pedido: string | string[] | undefined): number {
  const texto = Array.isArray(pedido) ? pedido[0] : pedido
  if (typeof texto !== "string" || !/^\d{1,6}$/.test(texto)) return CAMBIOS_POR_PAGINA
  return Math.min(Math.max(Number(texto), CAMBIOS_POR_PAGINA), CAMBIOS_MAXIMOS)
}

const SELECCION = {
  id: true,
  scope: true,
  materialNombre: true,
  memberName: true,
  anteriorPbOdontologo: true,
  anteriorPbClinica: true,
  anteriorPbTecnico: true,
  nuevoPbOdontologo: true,
  nuevoPbClinica: true,
  nuevoPbTecnico: true,
  changedByName: true,
  createdAt: true,
} satisfies Prisma.CambioDeRepartoDeProtesisSelect

type CambioLeido = Prisma.CambioDeRepartoDeProtesisGetPayload<{ select: typeof SELECCION }>

/** Las tres partes, o `null` si el registro no trae ninguna (no existía / se quitó). */
function partes(odontologo: number | null, clinica: number | null, tecnico: number | null): PartesDelCambio | null {
  if (odontologo === null && clinica === null && tecnico === null) return null
  return { pbOdontologo: odontologo, pbClinica: clinica, pbTecnico: tecnico }
}

function formatear(fila: CambioLeido): CambioDeReparto {
  return {
    id: fila.id,
    cuando: fila.createdAt.toISOString(),
    alcance: fila.scope === "excepcion" ? "excepcion" : "material",
    material: fila.materialNombre,
    profesional: fila.scope === "excepcion" ? fila.memberName : null,
    quien: fila.changedByName.trim(),
    antes: partes(fila.anteriorPbOdontologo, fila.anteriorPbClinica, fila.anteriorPbTecnico),
    despues: partes(fila.nuevoPbOdontologo, fila.nuevoPbClinica, fila.nuevoPbTecnico),
  }
}

/**
 * Los últimos `limite` cambios de reparto del negocio del actor, del más nuevo
 * al más viejo (a igual instante, el último creado primero, para que el orden
 * no cambie entre una lectura y la siguiente). Trae uno de más para saber si
 * hay más sin contar toda la tabla.
 */
export async function leerCambiosDeReparto(actor: Actor | null, limite: number = CAMBIOS_POR_PAGINA): Promise<HistorialDeReparto> {
  if (!puedeConfigurarRepartoDeProtesis(actor)) return SIN_CAMBIOS
  const pedido = Math.trunc(limite)
  const tope = pedido >= 1 ? Math.min(pedido, CAMBIOS_MAXIMOS) : CAMBIOS_POR_PAGINA

  const filas = await prisma.cambioDeRepartoDeProtesis.findMany({
    where: whereDeCambiosDeReparto(actor),
    select: SELECCION,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: tope + 1,
  })
  return { cambios: filas.slice(0, tope).map(formatear), hayMas: filas.length > tope }
}
