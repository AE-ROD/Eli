/**
 * Los errores que las pantallas de acceso encuentran antes de llamar al
 * servidor. Son constantes y no texto suelto porque la pantalla los compara
 * para saber de qué campo son: el mensaje va debajo de ese campo, que queda
 * marcado como inválido (`aria-invalid` y `aria-describedby`). Los que llegan
 * del servidor no son de un campo y van arriba del botón.
 */

export const CONTRASENA_CORTA = "La contraseña debe tener al menos 8 caracteres"

export const CONTRASENAS_DISTINTAS = "Las contraseñas no coinciden"

export const FALTA_EL_TIPO_DE_NEGOCIO = "Selecciona el tipo de negocio"
