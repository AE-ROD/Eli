/**
 * Las piezas del campo de hora del panel (`components/panel/campo-hora.tsx`,
 * #161): una hora "HH:MM" en 24 h elegida con dos listas, horas de 00 a 23 y
 * minutos, sin `<input type="time">`. Ese campo lo dibuja el navegador según
 * su idioma y en algunos salía "a. m./p. m.", aunque Eli muestra las horas
 * en 24 h (`HORA_24` en `lib/fechas.ts`).
 */

/** Cada cuántos minutos se ofrece uno en la lista. */
export const PASO_DE_MINUTOS = 5

const dosCifras = (numero: number) => String(numero).padStart(2, "0")

/** "00" a "23". */
export const HORAS_DEL_DIA = Array.from({ length: 24 }, (_, hora) => dosCifras(hora))

const FORMA_DE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/** La hora y los minutos de un "HH:MM" válido; con otra cosa, los dos vacíos. */
export function partesDeHora(valor: string): { hora: string; minuto: string } {
  const partes = FORMA_DE_HORA.exec(valor)
  return partes ? { hora: partes[1], minuto: partes[2] } : { hora: "", minuto: "" }
}

/**
 * Los minutos que se ofrecen: cada `PASO_DE_MINUTOS`, y además el que ya
 * tiene el valor si no cae en el paso (un horario guardado a las 09:07 se
 * sigue viendo y no cambia solo).
 */
export function minutosDeLaLista(actual: string): string[] {
  const minutos = Array.from({ length: 60 / PASO_DE_MINUTOS }, (_, i) => dosCifras(i * PASO_DE_MINUTOS))
  if (/^[0-5]\d$/.test(actual) && !minutos.includes(actual)) minutos.push(actual)
  return minutos.sort()
}

/**
 * El valor nuevo al cambiar una de las dos listas. Si la otra estaba vacía
 * (un valor que no se pudo leer), toma "00": así nunca sale una hora a medias.
 */
export function juntarHora(hora: string, minuto: string): string {
  return `${hora || "00"}:${minuto || "00"}`
}
