import { randomBytes } from "node:crypto"

export function generarSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .substring(0, 50)
}

/**
 * El slug del negocio a partir de su nombre. Un nombre sin ningún carácter
 * que sirva en una URL ("!!!", emojis, otro alfabeto) daba un slug vacío o
 * de puros guiones: la página pública quedaba en `/reservar/`. En ese caso
 * va uno de respaldo con un sufijo al azar. Lo usan el registro con correo y
 * completar el perfil (Google), para que los dos caminos den lo mismo.
 */
export function slugDelNombre(nombre: string): string {
  const slug = generarSlug(nombre)
  if (/[a-z0-9]/.test(slug)) return slug
  return `negocio-${randomBytes(3).toString("hex")}`
}
