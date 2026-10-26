import type { Prisma } from "@prisma/client"

/**
 * Borrar un cliente es anonimizarlo (decisión del dueño): se borran sus datos
 * personales, pero la fila queda para que sus citas y sus cobros sigan atados
 * a algo y los reportes no cambien.
 *
 * Sin columna nueva (no hay migración): un cliente eliminado se reconoce por
 * una etiqueta reservada, `MARCA_DE_CLIENTE_ELIMINADO`, que nadie puede poner
 * a mano (`esEtiquetaReservada` la rechaza al validar las etiquetas). Se usa
 * la etiqueta y no el nombre porque el nombre lo escribe cualquiera, también
 * quien reserva en la página pública: alguien llamado "Cliente eliminado"
 * desaparecería de la lista.
 */

/** Cómo se llama en la agenda y en el historial un cliente que se eliminó. */
export const NOMBRE_DE_CLIENTE_ELIMINADO = "Cliente eliminado"

/** La etiqueta que marca a un cliente eliminado. No es una etiqueta de la interfaz. */
export const MARCA_DE_CLIENTE_ELIMINADO = "eli:cliente-eliminado"

/** Si una etiqueta que llega en un pedido es la marca: nadie la pone a mano. */
export function esEtiquetaReservada(etiqueta: string): boolean {
  return etiqueta.trim().toLowerCase() === MARCA_DE_CLIENTE_ELIMINADO
}

/**
 * Lo que se escribe al eliminar: el nombre fijo, los datos personales en null
 * y, de etiquetas, sólo la marca. Las relaciones (citas y atenciones) no se
 * tocan.
 */
export function datosDeClienteEliminado() {
  return {
    name: NOMBRE_DE_CLIENTE_ELIMINADO,
    lastName: null,
    cedula: null,
    email: null,
    phone: null,
    notes: null,
    tags: [MARCA_DE_CLIENTE_ELIMINADO],
  } satisfies Prisma.CustomerUpdateInput
}

/**
 * Condición para el `where` de clientes: los que no se eliminaron. Va dentro
 * de `whereDeClientes`, que es el que acota al negocio.
 */
export const clienteNoEliminado: Prisma.CustomerWhereInput = {
  NOT: { tags: { has: MARCA_DE_CLIENTE_ELIMINADO } },
}
