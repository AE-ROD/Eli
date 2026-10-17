/**
 * Cómo se escribe cada rol del equipo en pantalla y en los correos. Es sólo la
 * etiqueta: qué puede hacer cada rol lo decide `lib/permisos.ts`, nunca esto.
 *
 * El dueño no pasa por acá: no es miembro del equipo. Cualquier otro valor que
 * no sea `"admin"` se lee como profesional, que es el rol con menos alcance.
 */
export function nombreDelRol(rol: string | undefined): string {
  return rol === "admin" ? "Encargado" : "Profesional"
}
