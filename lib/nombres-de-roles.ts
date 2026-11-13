import { del } from "@/lib/concordancia"
import { conMayuscula, vocabularioDe } from "@/lib/vocabulario"

/**
 * Cómo se escribe cada rol del equipo en pantalla y en los correos. Es sólo la
 * etiqueta: qué puede hacer cada rol lo decide `lib/permisos.ts`, nunca esto.
 *
 * El dueño no pasa por acá: no es miembro del equipo. Cualquier otro valor que
 * no sea `"admin"` se lee como profesional, que es el rol con menos alcance.
 *
 * `rubro` (opcional) cambia la palabra del que atiende
 * (`vocabularioDe(rubro).palabras.profesional`, `lib/vocabulario.ts`): "Estilista"
 * en un salón, "Barbero" en una barbería, "Manicurista" en un salón de uñas y
 * "Odontólogo" en una clínica dental. Sin rubro, o con uno desconocido, la de
 * siempre, "Profesional": así los usos que no lo pasan (los correos) no
 * cambian.
 */
export function nombreDelRol(rol: string | undefined, rubro?: string | null): string {
  return rol === "admin" ? "Encargado" : conMayuscula(vocabularioDe(rubro).palabras.profesional.singular)
}

/**
 * El rol con su artículo, para frases como «Foto del barbero» o «Foto de la
 * estilista»: `nombreDelRol` en minúscula, concordado con el género de la
 * palabra del rubro (`lib/concordancia.ts`) en vez de pegarle un "del". El
 * encargado es "del encargado" en todos los rubros. Mismas reglas que
 * `nombreDelRol`: lo que no sea `"admin"` se lee como profesional.
 */
export function delRol(rol: string | undefined, rubro?: string | null): string {
  return rol === "admin" ? "del encargado" : del(vocabularioDe(rubro).palabras.profesional)
}
