import { conMayuscula, vocabularioDe } from "@/lib/vocabulario"

/**
 * Cómo se escribe cada rol del equipo en pantalla y en los correos. Es sólo la
 * etiqueta: qué puede hacer cada rol lo decide `lib/permisos.ts`, nunca esto.
 *
 * El dueño no pasa por acá: no es miembro del equipo. Cualquier otro valor que
 * no sea `"admin"` se lee como profesional, que es el rol con menos alcance.
 *
 * `rubro` (opcional) cambia la palabra del que atiende (`lib/vocabulario.ts`):
 * en una clínica dental es "Odontólogo". Sin rubro, o con cualquier otro, la
 * de siempre, "Profesional": así los usos que no lo pasan (los correos) no
 * cambian.
 */
export function nombreDelRol(rol: string | undefined, rubro?: string | null): string {
  return rol === "admin" ? "Encargado" : conMayuscula(vocabularioDe(rubro).profesional)
}
