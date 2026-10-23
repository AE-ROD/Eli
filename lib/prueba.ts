import { randomBytes } from "node:crypto"
import { DIAS_DE_PRUEBA } from "@/lib/precios"

/**
 * La prueba gratis y el código de invitación de un negocio nuevo. Los dos se
 * fijan al crear el negocio (registro y completar perfil) y se guardan: el fin
 * de la prueba ya no se recalcula desde `createdAt`, porque un referido lo corre.
 */

const UN_DIA_MS = 24 * 60 * 60 * 1000

/** Cuándo termina la prueba de un negocio creado en `desde`: `DIAS_DE_PRUEBA` días después. */
export function finDeLaPrueba(desde: Date): Date {
  return new Date(desde.getTime() + DIAS_DE_PRUEBA * UN_DIA_MS)
}

/**
 * Base32 de Crockford en minúscula: sin i, l, o ni u, para que el código se
 * pueda dictar o copiar a mano sin confundir letras con números. 32 símbolos
 * exactos, así que tomar 5 bits de cada byte no sesga ninguno.
 */
export const ALFABETO_DEL_CODIGO = "0123456789abcdefghjkmnpqrstvwxyz"

/** 10 símbolos de 5 bits: 50 bits de azar, imposible de adivinar o recorrer. */
export const LARGO_DEL_CODIGO = 10

/**
 * Un código de invitación nuevo, aleatorio (`node:crypto`) y sin relación con
 * el slug ni con el nombre del negocio. La unicidad final la garantiza el
 * `@unique` de `Business.codigoInvitacion`.
 */
export function generarCodigoInvitacion(): string {
  const bytes = randomBytes(LARGO_DEL_CODIGO)
  let codigo = ""
  for (const byte of bytes) codigo += ALFABETO_DEL_CODIGO[byte & 31]
  return codigo
}
