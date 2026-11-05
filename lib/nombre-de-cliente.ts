/**
 * El nombre de un cliente como se muestra en todo el panel: `name` y, si
 * existe, `lastName`. Los clientes de la reserva pública creados antes del
 * N2 tienen el apellido aparte; los demás (panel, "Anotar sin reserva",
 * reservas nuevas) lo tienen dentro de `name` y `lastName` en null.
 *
 * Sin dependencias del servidor: lo usan tanto los endpoints como las vistas.
 */
export function nombreCompletoDeCliente(cliente: { name: string; lastName?: string | null }): string {
  return [cliente.name, cliente.lastName]
    .map((parte) => parte?.trim())
    .filter(Boolean)
    .join(" ")
}
