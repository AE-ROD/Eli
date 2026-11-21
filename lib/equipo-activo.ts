import type { Prisma } from "@prisma/client"

/**
 * Quién está en el equipo hoy. A una persona que sacaron del equipo no se le
 * borra la fila de `miembros_negocio`: se archiva (`archivadoEn`), porque sus
 * liquidaciones, adelantos, propinas y su historia clínica la referencian, y la
 * plata que le quedó pendiente se tiene que poder liquidar.
 *
 * La regla para cada consulta de integrantes:
 * - **"Quién trabaja hoy" filtra con `EN_EL_EQUIPO`:** la sesión (pierde el
 *   acceso), la reserva pública, la agenda y sus selectores, los bloqueos, los
 *   horarios, el tablero, la lista de espera, los tratantes y la ficha clínica
 *   para asignar, la página pública, invitar y el cambio de plan.
 * - **Historia y plata NO filtran:** liquidaciones, comisiones (para poder
 *   fijar el % de lo que dejó pendiente), adelantos y vales, Mi plata, reportes
 *   e historial. Ahí sale con su nombre y la marca "ya no está en el equipo".
 */
export const EN_EL_EQUIPO = { archivadoEn: null } as const

/** Lo que se muestra junto al nombre de alguien archivado, en historia y plata. */
export const YA_NO_ESTA_EN_EL_EQUIPO = "ya no está en el equipo"

/**
 * Para Liquidaciones y Comisiones: quien está en el equipo, más quien ya no
 * está pero todavía tiene algo sin liquidar (lo cobrado, propinas, adelantos,
 * vales o ajustes). Así se le puede fijar el % y pagar lo suyo, y quien ya
 * quedó al día no sigue apareciendo para siempre.
 */
export const EN_EL_EQUIPO_O_CON_PLATA_PENDIENTE: Prisma.BusinessMemberWhereInput = {
  OR: [
    EN_EL_EQUIPO,
    { visitServices: { some: { byOwner: false, liquidacionId: null, visit: { is: { status: "finalizada" } } } } },
    { propinas: { some: { liquidacionId: null, visit: { is: { status: "finalizada" } } } } },
    { movimientosDeLiquidacion: { some: { liquidacionId: null, anuladoAt: null } } },
  ],
}

/** El nombre para historia y plata: con la marca si ya no está en el equipo. */
export function nombreConMarca(nombre: string, archivadoEn: Date | null): string {
  return archivadoEn ? `${nombre} (${YA_NO_ESTA_EN_EL_EQUIPO})` : nombre
}
