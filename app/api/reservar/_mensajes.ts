/**
 * Los mensajes de error de la API pública de reservas (`/api/reservar/**`):
 * los lee quien reserva, se anota en la lista de espera o en la fila, que no
 * sabe qué es un JSON ni un servidor. Cada uno dice qué pasó en palabras
 * simples y qué hacer. Los códigos HTTP no cambian.
 */

/** 429: el límite de pedidos por IP, por negocio o por enlace. */
export const MENSAJE_DEMASIADAS_SOLICITUDES = "Hiciste muchos intentos seguidos. Espera un minuto y vuelve a intentarlo."

/** 400 sin un mensaje propio de la validación. */
export const MENSAJE_DATOS_INVALIDOS = "Revisa los datos que escribiste y vuelve a intentarlo."

/** 400: el cuerpo no se pudo leer (no es JSON). Lo normal es una página vieja o cortada. */
export const MENSAJE_PEDIDO_ILEGIBLE = "No pudimos leer lo que enviaste. Recarga la página y vuelve a intentarlo."

/** 413: el cuerpo pasa del tope. */
export const MENSAJE_DEMASIADO_LARGO = "Lo que escribiste es demasiado largo. Acórtalo y vuelve a intentarlo."

/** 500: algo falló de nuestro lado. */
export const MENSAJE_ERROR_INTERNO = "Algo falló de nuestro lado. Espera un momento y vuelve a intentarlo."
