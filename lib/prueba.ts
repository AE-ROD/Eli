import { randomBytes } from "node:crypto"
import { DIAS_DE_PRUEBA, DIAS_EXTRA_POR_REFERIDO } from "@/lib/precios"

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

/**
 * Patrón de un código de invitación aceptable: `LARGO_DEL_CODIGO` símbolos del
 * alfabeto. Los negocios que existían antes de los referidos recibieron 10
 * caracteres hexadecimales en la migración; como `0-9a-f` está dentro del
 * alfabeto, el mismo patrón los acepta sin un caso aparte.
 */
const PATRON_DEL_CODIGO = new RegExp(`^[${ALFABETO_DEL_CODIGO}]{${LARGO_DEL_CODIGO}}$`)

/**
 * El código de un enlace de invitación tal como se guarda, o `null` si no
 * puede ser uno: lo que no es texto, lo que no tiene el largo o usa símbolos
 * fuera del alfabeto. Ignora espacios alrededor y mayúsculas (quien lo copia a
 * mano puede escribirlo así). Que `null` no se distinga de un código bien
 * formado que no existe es a propósito: quien llama ignora los dos igual.
 */
export function normalizarCodigoInvitacion(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const codigo = valor.trim().toLowerCase()
  return PATRON_DEL_CODIGO.test(codigo) ? codigo : null
}

/**
 * El nuevo fin de la prueba de quien invita cuando un referido suyo recibe su
 * primera reserva pública: `DIAS_EXTRA_POR_REFERIDO` días más.
 *
 * Se cuentan desde el fin actual si la prueba sigue corriendo, para no
 * comerse los días que le quedaban. Si ya venció, desde `ahora`: sumarlos al
 * vencimiento viejo podría dejar la fecha todavía en el pasado y el premio no
 * le daría ni un día (decisión documentada en `docs/PRODUCTO.md`, sección 4).
 */
export function pruebaExtendidaPorReferido(pruebaTerminaEl: Date, ahora: Date): Date {
  const desde = Math.max(pruebaTerminaEl.getTime(), ahora.getTime())
  return new Date(desde + DIAS_EXTRA_POR_REFERIDO * UN_DIA_MS)
}
