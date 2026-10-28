/**
 * Teléfonos chilenos. Se guardan en E.164 (`+56` y los 9 dígitos del número
 * nacional: `+56912345678`) para que un mismo número escrito de cinco formas
 * distintas sea uno solo, y se muestran con espacios (`+56 9 1234 5678`).
 *
 * Desde 2016 todo número chileno tiene 9 dígitos: los móviles empiezan con 9,
 * los fijos de Santiago con 2 y los de regiones con su código de área (32, 41,
 * 55...). Ninguno empieza con 0 ni con 1.
 *
 * Sólo lógica, sin servidor: la usan los endpoints del panel, la importación
 * de clientes y la pantalla.
 */

const CODIGO_DE_CHILE = "56"

/** Nueve dígitos que no empiezan con 0 ni con 1: un número nacional válido. */
const NACIONAL = /^[2-9]\d{8}$/

/** Lo que se tolera entre los dígitos: espacios, guiones, puntos y paréntesis. */
const SEPARADORES = /[\s\-.()]/g

/**
 * El teléfono en E.164 (`+569XXXXXXXX` o, si es fijo, `+56` y sus 9 dígitos),
 * o `null` si no se puede leer como un número chileno.
 *
 * Acepta "9 1234 5678", "+56 9 1234 5678", "56912345678", "912345678",
 * "(2) 2345 6789", "+56 2 2345 6789" y "0056 9 1234 5678". Rechaza letras,
 * números de otro país (un `+` que no sigue con 56), largos que no cuadran y
 * los de 8 dígitos de antes de 2016: "1234 5678" puede ser un móvil o un fijo
 * y no se adivina.
 */
export function aE164Chile(texto: string | null | undefined): string | null {
  const limpio = (texto ?? "").trim().replace(SEPARADORES, "")
  if (!limpio) return null

  let digitos: string
  if (limpio.startsWith("+")) {
    digitos = limpio.slice(1)
    if (!digitos.startsWith(CODIGO_DE_CHILE)) return null
  } else if (limpio.startsWith("00")) {
    digitos = limpio.slice(2)
    if (!digitos.startsWith(CODIGO_DE_CHILE)) return null
  } else {
    digitos = limpio
  }
  if (!/^\d+$/.test(digitos)) return null

  let nacional = digitos
  if (nacional.length === 11 && nacional.startsWith(CODIGO_DE_CHILE)) nacional = nacional.slice(2)
  // Un fijo escrito con el 0 de antes de la reforma: "02 2345 6789".
  else if (nacional.length === 10 && nacional.startsWith("0")) nacional = nacional.slice(1)

  return NACIONAL.test(nacional) ? `+${CODIGO_DE_CHILE}${nacional}` : null
}

/**
 * Cómo se muestra un teléfono: "+56 9 1234 5678" un móvil, "+56 2 2345 6789"
 * un fijo de Santiago y "+56 32 123 4567" uno de regiones. Lo que no se puede
 * leer como chileno (un dato viejo, uno extranjero) se muestra tal como está:
 * mostrarlo es mejor que esconderlo. Vacío o `null` devuelve "".
 */
export function mostrarTelefono(e164: string | null | undefined): string {
  const normalizado = aE164Chile(e164)
  if (!normalizado) return (e164 ?? "").trim()

  const nacional = normalizado.slice(3)
  if (nacional.startsWith("9") || nacional.startsWith("2")) {
    return `+56 ${nacional[0]} ${nacional.slice(1, 5)} ${nacional.slice(5)}`
  }
  return `+56 ${nacional.slice(0, 2)} ${nacional.slice(2, 5)} ${nacional.slice(5)}`
}

/** El aviso cuando un teléfono no se puede leer. Lo comparten el panel y la importación. */
export const MENSAJE_DE_TELEFONO_ILEGIBLE =
  "No pudimos leer el teléfono. Escríbelo como +56 9 1234 5678 (o un fijo con su código de área)"
