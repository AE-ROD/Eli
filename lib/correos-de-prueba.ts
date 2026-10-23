import type { TipoCorreoDePrueba } from "@/lib/email"
import { diasEntre, fechaYMinutosEn, zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * Qué correo del ciclo de prueba le toca hoy a un negocio. Puro: sin base ni
 * envío; lo usa el cron `app/api/cron/correos-de-prueba`.
 *
 * Los días se cuentan en el calendario de la zona del negocio, no en horas:
 * "el día 3" es el tercer día calendario después del día en que se creó el
 * negocio, según su reloj, aunque haya pasado un cambio de horario.
 *
 * Cada tipo tiene una ventana y no un único día, salvo "termina-hoy": si un
 * envío falla, su fila de `CorreoDeCuenta` se borra y el cron lo reintenta al
 * día siguiente, mientras la ventana siga abierta.
 *
 * - "bienvenida": se manda al crear el negocio. El cron sólo la reintenta
 *   desde el día siguiente si aquel envío falló, y mientras falten más de 3
 *   días para el fin (después ya no tiene sentido darla).
 * - "consejo": desde el día 3 contado desde la creación, mientras falten más
 *   de 3 días para el fin (para no llegar junto con el aviso de fin).
 * - "quedan-3-dias": cuando faltan 3, 2 o 1 días para el último día de la
 *   prueba (el correo dice cuántos quedan de verdad).
 * - "termina-hoy": sólo el último día de la prueba, aunque a esa hora la
 *   prueba ya haya vencido.
 *
 * Una prueba extendida (un referido corre `pruebaTerminaEl`) mueve las
 * ventanas de los avisos de fin. Si "quedan-3-dias" ya se mandó antes de la
 * extensión no se repite: el candado es uno por negocio y tipo.
 *
 * Un día, un correo: si hay más de uno pendiente se manda el más urgente
 * ("termina-hoy" > "quedan-3-dias" > "bienvenida" > "consejo") y el resto
 * queda para el día siguiente, si su ventana sigue abierta.
 */

/** Desde qué día (contado desde la creación, 0 = el mismo día) va el consejo. */
export const DIA_DEL_CONSEJO = 3

/** Cuántos días antes del último día de la prueba se abre el aviso de fin. */
export const DIAS_DE_AVISO_DE_FIN = 3

export interface NegocioEnPrueba {
  createdAt: Date
  pruebaTerminaEl: Date
  /** `Business.timezone`; una zona inválida cae en el default. */
  timezone: string | null
}

export interface CorreoQueToca {
  tipo: TipoCorreoDePrueba
  /** Último día de la prueba, "AAAA-MM-DD" en la zona del negocio. */
  ultimoDia: string
  /** Días calendario de hoy al último día (0 = hoy es el último). */
  diasRestantes: number
}

/**
 * El correo que le toca hoy (`ahora`) al negocio, o `null` si ninguno. `enviados`
 * son los tipos que ya tienen fila en `CorreoDeCuenta`.
 */
export function correoQueTocaHoy(
  negocio: NegocioEnPrueba,
  enviados: ReadonlySet<string>,
  ahora: Date,
): CorreoQueToca | null {
  const zona = zonaDelNegocio(negocio.timezone)
  const hoy = fechaYMinutosEn(ahora, zona).fecha
  const diaDeCreacion = fechaYMinutosEn(negocio.createdAt, zona).fecha
  const ultimoDia = fechaYMinutosEn(negocio.pruebaTerminaEl, zona).fecha

  const diasDesdeCreacion = diasEntre(diaDeCreacion, hoy)
  const diasRestantes = diasEntre(hoy, ultimoDia)
  const vencida = ahora.getTime() >= negocio.pruebaTerminaEl.getTime()

  // Un reloj corrido o un negocio "del futuro": no se adivina nada.
  if (diasDesdeCreacion < 0 || diasRestantes < 0) return null

  const pendiente = (tipo: TipoCorreoDePrueba) => !enviados.has(tipo)
  const toca = (tipo: TipoCorreoDePrueba): CorreoQueToca => ({ tipo, ultimoDia, diasRestantes })

  if (diasRestantes === 0) {
    return pendiente("termina-hoy") ? toca("termina-hoy") : null
  }

  // De acá en adelante, sólo con la prueba vigente.
  if (vencida) return null

  if (diasRestantes <= DIAS_DE_AVISO_DE_FIN) {
    return pendiente("quedan-3-dias") ? toca("quedan-3-dias") : null
  }

  if (diasDesdeCreacion >= 1 && pendiente("bienvenida")) return toca("bienvenida")
  if (diasDesdeCreacion >= DIA_DEL_CONSEJO && pendiente("consejo")) return toca("consejo")
  return null
}
