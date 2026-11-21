/**
 * Contactos sueltos (los que se eligen de la agenda del teléfono o los que se
 * escriben o pegan a mano) a un CSV que la importación de clientes ya sabe
 * leer. Igual que con un .vcf (`lib/vcard.ts`), todo pasa después por lo mismo
 * que cualquier planilla: la vista previa, la detección de repetidos, los topes
 * y la validación del servidor, sin una ruta nueva.
 *
 * Es lógica pura, sin pantalla: se llama en el navegador.
 */

export interface Contacto {
  nombre: string
  telefono: string
  correo: string
}

export interface ContactosLeidos {
  /** El CSV listo para la importación: cabecera `Nombre;Teléfono;Correo` y una fila por contacto. */
  csv: string
  /** Cuántos contactos entraron al CSV. */
  contactos: number
  /** Cuántos se dejaron fuera por no tener nombre. */
  sinNombre: number
}

/**
 * La celda con comillas si lleva el separador, comillas o un salto de línea.
 * Sin la protección de fórmulas de `celdaSegura` (`lib/csv.ts`): este CSV no se
 * abre en una planilla, sólo lo lee la importación, y la comilla de protección
 * se vería delante de cada teléfono que empieza con `+`.
 */
function celda(valor: string): string {
  return /[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

/**
 * Los contactos como CSV de importación. Un contacto sin nombre no entra: sólo
 * con un número no hay a quién llamar, y el cliente quedaría con un teléfono
 * como nombre.
 */
export function contactosACsv(contactos: readonly Contacto[]): ContactosLeidos {
  const filas: string[][] = []
  let sinNombre = 0
  for (const { nombre, telefono, correo } of contactos) {
    const limpio = nombre.replace(/\s+/g, " ").trim()
    if (limpio) filas.push([limpio, telefono.trim(), correo.trim()])
    else sinNombre++
  }
  return {
    csv: [["Nombre", "Teléfono", "Correo"], ...filas].map((fila) => fila.map(celda).join(";")).join("\r\n") + "\r\n",
    contactos: filas.length,
    sinNombre,
  }
}

/** Lo que devuelve `navigator.contacts.select(["name", "tel", "email"], { multiple: true })`. */
export interface ContactoDelSelector {
  name?: readonly string[]
  tel?: readonly string[]
  email?: readonly string[]
}

/** El primer valor con algo escrito, o vacío. */
function primero(valores: readonly string[] | undefined): string {
  return valores?.map((valor) => valor.trim()).find(Boolean) ?? ""
}

/** Los contactos elegidos en la agenda del teléfono: un nombre, un teléfono y un correo de cada uno. */
export function contactosDelSelector(elegidos: readonly ContactoDelSelector[]): Contacto[] {
  return elegidos.map((elegido) => ({
    nombre: primero(elegido.name),
    telefono: primero(elegido.tel),
    correo: primero(elegido.email),
  }))
}

const CORREO = /[^\s,;<>()"']+@[^\s,;<>()"']+\.[^\s,;<>()"']+/
/** Un teléfono: dígitos con espacios, guiones, puntos o paréntesis entre medio, y un + opcional al inicio. */
const TELEFONO = /\+?\d[\d\s().-]*\d/g

/**
 * Una lista escrita o pegada (de una nota, de WhatsApp, de una planilla), un
 * contacto por línea, con el nombre, el teléfono y el correo en cualquier
 * orden: "Camila Rojas 9 1234 5678", "Ana, +56912345678, ana@correo.cl" o
 * columnas de Excel separadas por tabulación. Se reconoce como teléfono la
 * secuencia de al menos 8 dígitos; lo que sobra (sin los separadores) es el
 * nombre. Las líneas vacías no cuentan.
 */
export function leerListaEscrita(texto: string): Contacto[] {
  const contactos: Contacto[] = []
  for (const linea of texto.replace(/\r\n?/g, "\n").split("\n")) {
    if (!linea.trim()) continue
    let resto = linea

    const correo = resto.match(CORREO)?.[0] ?? ""
    if (correo) resto = resto.replace(correo, " ")

    let telefono = ""
    for (const candidato of resto.match(TELEFONO) ?? []) {
      if (candidato.replace(/\D/g, "").length >= 8) {
        telefono = candidato.trim()
        resto = resto.replace(candidato, " ")
        break
      }
    }

    const nombre = resto
      .replace(/[\t,;|:]+/g, " ")
      .replace(/^[\s\-–—•*·.]+|[\s\-–—•*·.]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
    contactos.push({ nombre, telefono, correo })
  }
  return contactos
}

/** El selector de contactos del navegador (Chrome en Android). Safari en iPhone no lo trae. */
export interface SelectorDeContactos {
  select: (propiedades: string[], opciones: { multiple: boolean }) => Promise<ContactoDelSelector[]>
}

export function selectorDeContactos(): SelectorDeContactos | null {
  if (typeof navigator === "undefined") return null
  const contactos = (navigator as Navigator & { contacts?: SelectorDeContactos }).contacts
  return contactos && typeof contactos.select === "function" ? contactos : null
}
