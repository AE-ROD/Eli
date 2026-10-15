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

/**
 * Para el `setError` de la pantalla cuando se escribe o se elige en un campo:
 * borra el error si es el de ese campo y deja cualquier otro como está. Sin
 * esto, el campo seguía rojo y con `aria-invalid` hasta el envío siguiente, y
 * el lector de pantalla anunciaba la opción recién elegida junto con el error
 * que ya no valía. La validación no cambia: vuelve a correr al enviar.
 */
export function borrarSiEs(errorDelCampo: string) {
  return (errorActual: string) => (errorActual === errorDelCampo ? "" : errorActual)
}
